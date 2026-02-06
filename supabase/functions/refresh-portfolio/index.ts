import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { unzipSync } from "https://esm.sh/fflate@0.8.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const DART_API_KEY = Deno.env.get("DART_API_KEY") ?? "";
const FIGI_API_KEY = Deno.env.get("FIGI_API_KEY") ?? "";
const SEC_USER_AGENT =
  Deno.env.get("SEC_USER_AGENT") ?? "InstitutionalPortfolio/0.1 (contact: admin@example.com)";
const SEC_13F_DOWNLOAD = Deno.env.get("SEC_13F_DOWNLOAD") === "1";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type EtlResult = {
  status: "ok" | "error";
  message: string;
};

serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: "Supabase env vars missing" });
  }

  const startedAt = new Date().toISOString();

  const { data: runRow, error: runErr } = await supabase
    .from("etl_runs")
    .insert({ status: "running", message: "started" })
    .select("id")
    .single();

  if (runErr || !runRow) {
    return jsonResponse(500, { error: "failed to create etl run", detail: runErr?.message });
  }

  let result: EtlResult = { status: "ok", message: "completed" };

  try {
    await refreshDomestic(DART_API_KEY);
    await refreshSec13F();
    await upsertState("last_successful_run_at", new Date().toISOString());
  } catch (err) {
    result = { status: "error", message: err instanceof Error ? err.message : "unknown error" };
  }

  await supabase
    .from("etl_runs")
    .update({
      status: result.status,
      message: result.message,
      finished_at: new Date().toISOString(),
    })
    .eq("id", runRow.id);

  return jsonResponse(200, {
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    result,
  });
});

async function refreshDomestic(dartApiKey: string): Promise<void> {
  if (!dartApiKey) {
    throw new Error("DART_API_KEY is not set");
  }

  const lastRun = await getState("last_domestic_run_at");
  const { bgnDe, endDe } = getDateRangeKst(lastRun);

  const filings = await fetchDartFilings(dartApiKey, bgnDe, endDe);
  if (filings.length === 0) {
    await upsertState("last_domestic_run_at", new Date().toISOString());
    return;
  }

  const institutionMap = await loadInstitutionMap();

  for (const filing of filings) {
    const filingId = await upsertFiling(filing);
    if (!filingId) continue;

    if (filing.kind === "shareholding") {
      const major = await fetchMajorStock(dartApiKey, filing.corp_code);
      const exec = await fetchExecStock(dartApiKey, filing.corp_code);

      await insertRawPayload(filingId, { major, exec });
      await normalizeShareholding(
        filingId,
        filing,
        { major, exec },
        institutionMap,
      );
    } else {
      await insertRawPayload(filingId, { filing });
    }
  }

  await upsertState("last_domestic_run_at", new Date().toISOString());
}

async function refreshSec13F(): Promise<void> {
  const latest = await findLatestSec13fDataset();
  if (!latest) return;

  const lastUrl = await getState("last_sec_13f_url");
  if (lastUrl && lastUrl === latest.url) return;

  await upsertState("last_sec_13f_url", latest.url);
  await upsertState("last_sec_13f_label", latest.label);

  if (!SEC_13F_DOWNLOAD) return;

  // NOTE: Downloading and parsing the full dataset can exceed free plan limits.
  const zipBytes = await downloadSec13fZip(latest.url);
  await parseSec13fZip(zipBytes, latest.label);
}

async function upsertState(key: string, value: string): Promise<void> {
  await supabase
    .from("etl_state")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
}

async function getState(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("etl_state")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error || !data) return null;
  return data.value ?? null;
}

function normalizeName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/\\(.*?\\)|\\[.*?\\]|\\{.*?\\}/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9가-힣]+/g, "");
  const stripped = cleaned
    .replace(/(inc|corp|co|ltd|llc|lp|plc|company|holdings|management|asset|advisors|advisor)s?$/g, "")
    .replace(/(주식회사|유한회사|재단|재단법인|기금|공단|운용|운용본부)$/g, "");
  return stripped;
}

function getDateRangeKst(lastRunIso: string | null): { bgnDe: string; endDe: string } {
  const now = new Date();
  const endKst = shiftToKst(now);
  const startKst = lastRunIso ? shiftToKst(new Date(lastRunIso)) : shiftToKst(new Date(now));
  if (!lastRunIso) {
    startKst.setDate(startKst.getDate() - 3);
  }
  return {
    bgnDe: formatYmd(startKst),
    endDe: formatYmd(endKst),
  };
}

function shiftToKst(date: Date): Date {
  const kst = new Date(date.getTime());
  const offsetMinutes = 9 * 60;
  const utc = kst.getTime() + kst.getTimezoneOffset() * 60000;
  kst.setTime(utc + offsetMinutes * 60000);
  return kst;
}

function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

type DartFiling = {
  corp_code: string;
  corp_name: string;
  report_nm: string;
  rcept_no: string;
  rcept_dt: string;
  kind: "shareholding" | "periodic";
};

async function fetchDartFilings(
  dartApiKey: string,
  bgnDe: string,
  endDe: string,
): Promise<DartFiling[]> {
  const filings: DartFiling[] = [];

  const configs = [
    { kind: "shareholding" as const, pblntf_ty: "D", detail: "D001" },
    { kind: "shareholding" as const, pblntf_ty: "D", detail: "D002" },
    { kind: "periodic" as const, pblntf_ty: "A", detail: "A001" },
    { kind: "periodic" as const, pblntf_ty: "A", detail: "A002" },
    { kind: "periodic" as const, pblntf_ty: "A", detail: "A003" },
  ];

  for (const config of configs) {
    let page = 1;
    const pageCount = 100;
    while (true) {
      const url = new URL("https://opendart.fss.or.kr/api/list.json");
      url.searchParams.set("crtfc_key", dartApiKey);
      url.searchParams.set("bgn_de", bgnDe);
      url.searchParams.set("end_de", endDe);
      url.searchParams.set("page_no", String(page));
      url.searchParams.set("page_count", String(pageCount));
      url.searchParams.set("pblntf_ty", config.pblntf_ty);
      url.searchParams.set("pblntf_detail_ty", config.detail);

      const data = await fetchJson(url.toString());
      if (!data || data.status !== "000") break;

      const list = Array.isArray(data.list) ? data.list : [];
      for (const item of list) {
        filings.push({
          corp_code: String(item.corp_code ?? ""),
          corp_name: String(item.corp_name ?? ""),
          report_nm: String(item.report_nm ?? ""),
          rcept_no: String(item.rcept_no ?? ""),
          rcept_dt: String(item.rcept_dt ?? ""),
          kind: config.kind,
        });
      }

      if (list.length < pageCount) break;
      page += 1;
    }
  }

  return filings;
}

async function loadInstitutionMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const { data: institutions, error } = await supabase
    .from("institutions")
    .select("id,name")
    .eq("active", true);
  if (!error && institutions) {
    for (const inst of institutions as Array<{ id: number; name: string }>) {
      map.set(normalizeName(inst.name), inst.id);
    }
  }

  const { data: aliases, error: aliasErr } = await supabase
    .from("institutions_aliases")
    .select("institution_id,alias");
  if (!aliasErr && aliases) {
    for (const alias of aliases as Array<{ institution_id: number; alias: string }>) {
      map.set(normalizeName(alias.alias), alias.institution_id);
    }
  }

  return map;
}

async function upsertFiling(filing: DartFiling): Promise<number | null> {
  const { data, error } = await supabase
    .from("filings")
    .upsert(
      {
        source: "DART",
        filing_type: filing.kind === "shareholding" ? "DART_SHAREHOLDING" : "DART_PERIODIC",
        filing_date: parseDartDate(filing.rcept_dt),
        report_period: parseDartDate(filing.rcept_dt),
        external_id: filing.rcept_no,
        raw_url: `https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${filing.rcept_no}`,
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as number;
}

function parseDartDate(value: string): string {
  if (!value || value.length !== 8) return new Date().toISOString().slice(0, 10);
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

async function fetchMajorStock(dartApiKey: string, corpCode: string): Promise<unknown> {
  const url = new URL("https://opendart.fss.or.kr/api/majorstock.json");
  url.searchParams.set("crtfc_key", dartApiKey);
  url.searchParams.set("corp_code", corpCode);
  return await fetchJson(url.toString());
}

async function fetchExecStock(dartApiKey: string, corpCode: string): Promise<unknown> {
  const url = new URL("https://opendart.fss.or.kr/api/elestock.json");
  url.searchParams.set("crtfc_key", dartApiKey);
  url.searchParams.set("corp_code", corpCode);
  return await fetchJson(url.toString());
}

async function insertRawPayload(filingId: number, payload: Record<string, unknown>): Promise<void> {
  await supabase.from("holdings_raw").insert({ filing_id: filingId, payload });
}

async function normalizeShareholding(
  filingId: number,
  filing: DartFiling,
  payloads: { major: any; exec: any },
  institutionMap: Map<string, number>,
): Promise<void> {
  const entries = extractShareholdingRows(payloads);
  if (entries.length === 0) return;

  await supabase.from("holdings_normalized").delete().eq("filing_id", filingId);

  const rows = [];
  for (const item of entries) {
    const reporter = String(item.reporter ?? item.repror ?? item.rpt_nm ?? "").trim();
    const normalized = normalizeName(reporter);
    const instId = institutionMap.get(normalized);
    if (!instId) continue;

    rows.push({
      filing_id: filingId,
      institution_id: instId,
      security_id: null,
      target_corp_code: filing.corp_code,
      target_corp_name: filing.corp_name,
      reporter_name: reporter,
      report_type: item._report === "major" ? "MAJOR_STOCK" : "EXEC_STOCK",
      reported_currency: "KRW",
      value: safeNumber(item.value),
      shares: safeNumber(item.shares),
      weight: safeNumber(item.weight),
      rank: null,
      as_of_date: parseDartDate(filing.rcept_dt),
    });
  }

  if (rows.length > 0) {
    await supabase.from("holdings_normalized").insert(rows);
  }
}

function extractShareholdingRows(payloads: { major: any; exec: any }): Array<Record<string, unknown>> {
  const entries: any[] = [];
  if (payloads.major?.status === "000" && Array.isArray(payloads.major?.list)) {
    for (const item of payloads.major.list) {
      entries.push({
        _report: "major",
        reporter: item.repror,
        shares: item.stkqy,
        weight: item.stkrt,
        value: null,
      });
    }
  }
  if (payloads.exec?.status === "000" && Array.isArray(payloads.exec?.list)) {
    for (const item of payloads.exec.list) {
      entries.push({
        _report: "exec",
        reporter: item.repror,
        shares: item.sp_stock_lmp_cnt,
        weight: item.sp_stock_lmp_rate,
        value: null,
      });
    }
  }
  return entries;
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(num) ? num : null;
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return await res.json();
}

async function findLatestSec13fDataset(): Promise<{ url: string; label: string } | null> {
  const res = await fetch("https://www.sec.gov/data-research/sec-markets-data/form-13f-data-sets", {
    headers: { "User-Agent": SEC_USER_AGENT },
  });
  if (!res.ok) return null;
  const html = await res.text();

  const linkRegex = /href="([^"]+\\.zip)"/gi;
  const matches = [];
  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    const href = match[1];
    if (href.includes("13f") || href.includes("13F")) {
      matches.push(href);
    }
  }
  if (matches.length === 0) return null;

  const first = matches[0];
  const url = first.startsWith("http") ? first : `https://www.sec.gov${first}`;
  return { url, label: first };
}

async function downloadSec13fZip(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!res.ok) throw new Error(`SEC download failed: ${res.status}`);
  const data = new Uint8Array(await res.arrayBuffer());

  const path = `sec/13f/${new Date().toISOString().slice(0, 10)}.zip`;
  await supabase.storage.from("raw-filings").upload(path, data, { upsert: true });
  return data;
}

async function parseSec13fZip(zipBytes: Uint8Array, label: string): Promise<void> {
  const files = unzipSync(zipBytes);
  const fileNames = Object.keys(files);
  const infoName = fileNames.find((name) => name.toUpperCase().endsWith("INFOTABLE.TSV"));
  const subName = fileNames.find((name) => name.toUpperCase().endsWith("SUBMISSION.TSV"));
  const coverName = fileNames.find((name) => name.toUpperCase().endsWith("COVERPAGE.TSV"));

  if (!infoName || !subName || !coverName) return;

  const infoRows = parseTsv(files[infoName]);
  const submissionRows = parseTsv(files[subName]);
  const coverRows = parseTsv(files[coverName]);

  const submissionMap = new Map<string, Record<string, string>>();
  for (const row of submissionRows) {
    const accession = row.ACCESSION_NUMBER;
    if (accession) submissionMap.set(accession, row);
  }

  const coverMap = new Map<string, Record<string, string>>();
  for (const row of coverRows) {
    const accession = row.ACCESSION_NUMBER;
    if (accession) coverMap.set(accession, row);
  }

  const instCache = new Map<string, number>();
  for (const [accession, cover] of coverMap.entries()) {
    const submission = submissionMap.get(accession);
    if (!submission) continue;
    const cik = submission.CIK ?? "";
    const name = cover.FILINGMANAGER_NAME ?? "Unknown";
    const instId = await upsertInstitution(name, cik);
    instCache.set(accession, instId);
  }

  const filingIdMap = new Map<string, number>();
  for (const [accession, submission] of submissionMap.entries()) {
    const instId = instCache.get(accession) ?? null;
    const filingId = await upsertSecFiling(accession, submission, instId);
    if (filingId) filingIdMap.set(accession, filingId);
  }

  const valueMultiplier = inferSecValueMultiplier(label);
  const batch: Record<string, unknown>[] = [];
  for (const row of infoRows) {
    const accession = row.ACCESSION_NUMBER;
    if (!accession) continue;
    const filingId = filingIdMap.get(accession);
    const instId = instCache.get(accession);
    if (!filingId || !instId) continue;

    batch.push({
      filing_id: filingId,
      institution_id: instId,
      security_id: null,
      issuer_name: row.NAMEOFISSUER ?? null,
      title_of_class: row.TITLEOFCLASS ?? null,
      cusip: row.CUSIP ?? null,
      put_call: row.PUTCALL ?? null,
      investment_discretion: row.INVESTMENTDISCRETION ?? null,
      voting_auth_sole: safeNumber(row.VOTING_AUTH_SOLE),
      voting_auth_shared: safeNumber(row.VOTING_AUTH_SHARED),
      voting_auth_none: safeNumber(row.VOTING_AUTH_NONE),
      reported_currency: "USD",
      value: safeNumber(row.VALUE) ? safeNumber(row.VALUE)! * valueMultiplier : null,
      shares: safeNumber(row.SSHPRNAMT),
      weight: null,
      rank: null,
      as_of_date: parseSecDate(submissionMap.get(accession)?.PERIODOFREPORT),
    });

    if (batch.length >= 500) {
      await supabase.from("holdings_normalized").insert(batch);
      batch.length = 0;
    }
  }

  if (batch.length > 0) {
    await supabase.from("holdings_normalized").insert(batch);
  }
}

function parseTsv(bytes: Uint8Array): Array<Record<string, string>> {
  const text = new TextDecoder("utf-8").decode(bytes);
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split("\t").map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const parts = lines[i].split("\t");
    const row: Record<string, string> = {};
    headers.forEach((key, idx) => {
      row[key] = parts[idx] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function inferSecValueMultiplier(label: string): number {
  const yearMatch = label.match(/20\\d{2}/);
  if (!yearMatch) return 1;
  const year = Number(yearMatch[0]);
  return year <= 2022 ? 1000 : 1;
}

function parseSecDate(value?: string): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const trimmed = value.trim();
  const m = trimmed.match(/(\\d{1,2})-(\\w{3})-(\\d{4})/i);
  if (!m) return new Date().toISOString().slice(0, 10);
  const day = m[1].padStart(2, "0");
  const mon = m[2].toLowerCase();
  const year = m[3];
  const map: Record<string, string> = {
    jan: "01",
    feb: "02",
    mar: "03",
    apr: "04",
    may: "05",
    jun: "06",
    jul: "07",
    aug: "08",
    sep: "09",
    oct: "10",
    nov: "11",
    dec: "12",
  };
  const month = map[mon] ?? "01";
  return `${year}-${month}-${day}`;
}

async function upsertInstitution(name: string, cik: string): Promise<number> {
  const { data, error } = await supabase
    .from("institutions")
    .upsert(
      {
        name,
        country_code: "US",
        institution_type: "asset_manager",
        source: "SEC_13F",
        external_id: cik || null,
        active: true,
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .single();
  if (error || !data) {
    const { data: fallback } = await supabase
      .from("institutions")
      .select("id")
      .eq("source", "SEC_13F")
      .eq("name", name)
      .maybeSingle();
    if (fallback?.id) return fallback.id as number;
    throw new Error(`Failed to upsert institution: ${name}`);
  }
  return data.id as number;
}

async function upsertSecFiling(
  accession: string,
  submission: Record<string, string>,
  institutionId: number | null,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("filings")
    .upsert(
      {
        institution_id: institutionId,
        source: "SEC_13F",
        filing_type: "SEC_13F",
        filing_date: parseSecDate(submission.FILING_DATE),
        report_period: parseSecDate(submission.PERIODOFREPORT),
        external_id: accession,
        raw_url: null,
      },
      { onConflict: "source,external_id" },
    )
    .select("id")
    .single();
  if (error || !data) return null;
  return data.id as number;
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
