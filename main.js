const SUPABASE_URL = "https://sqtoenwoxwyhjaqsdyyp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JbFnEmztUuyCesUdg5jqvw_6baRRda3";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const companyInput = document.getElementById("company-search");
const companyResults = document.getElementById("company-results");
const companyTitle = document.getElementById("company-title");
const institutionsBody = document.getElementById("institutions-body");
const institutionsMeta = document.getElementById("institutions-meta");
const sortSelect = document.getElementById("sort-select");

const institutionTitle = document.getElementById("institution-title");
const holdingsBody = document.getElementById("holdings-body");
const holdingsMeta = document.getElementById("holdings-meta");

let selectedCompany = null;
let selectedInstitution = null;
let currentInstitutions = [];
let currentHoldings = [];
let debounceTimer = null;

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR");
}

function formatPercent(value) {
  if (value === null || value === undefined) return "-";
  return `${Number(value).toFixed(2)}%`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function searchCompanies(term) {
  if (!term) {
    companyResults.innerHTML = "";
    return;
  }

  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("securities")
    .select("id,name,symbol,sec_cusip,market")
    .or(`name.ilike.${pattern},symbol.ilike.${pattern},sec_cusip.ilike.${pattern}`)
    .limit(20);

  if (error) {
    companyResults.innerHTML = `<li class="muted">검색 실패: ${escapeHtml(error.message)}</li>`;
    return;
  }

  if (!data || data.length === 0) {
    companyResults.innerHTML = `<li class="muted">검색 결과 없음</li>`;
    return;
  }

  companyResults.innerHTML = data
    .map(
      (row) => `
        <li>
          <button class="result-btn" data-id="${row.id}" data-name="${escapeHtml(row.name || "-")}">
            <span class="result-title">${escapeHtml(row.name || "-")}</span>
            <span class="result-meta">${escapeHtml(row.symbol || row.sec_cusip || "-")} · ${escapeHtml(row.market || "-")}</span>
          </button>
        </li>
      `,
    )
    .join("");

  companyResults.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!id) return;
      selectCompany({ id, name });
    });
  });
}

async function selectCompany(company) {
  selectedCompany = company;
  selectedInstitution = null;
  companyTitle.textContent = company.name;
  institutionTitle.textContent = "기관 선택";
  holdingsBody.innerHTML = "";
  holdingsMeta.textContent = "";

  const { data, error } = await supabase
    .from("holdings")
    .select("percent,as_of_date,institution:institutions(id,name)")
    .eq("source", "DART")
    .eq("security_id", company.id)
    .gte("percent", 5);

  if (error) {
    institutionsBody.innerHTML = `<tr><td colspan="3" class="muted">조회 실패: ${escapeHtml(
      error.message,
    )}</td></tr>`;
    institutionsMeta.textContent = "";
    return;
  }

  currentInstitutions = data || [];
  renderInstitutions();
}

function renderInstitutions() {
  const sorted = [...currentInstitutions];
  const sortMode = sortSelect.value;
  if (sortMode === "percent_desc") {
    sorted.sort((a, b) => (b.percent || 0) - (a.percent || 0));
  } else if (sortMode === "date_desc") {
    sorted.sort((a, b) => new Date(b.as_of_date || 0) - new Date(a.as_of_date || 0));
  }

  institutionsMeta.textContent = `${sorted.length}개 기관`;

  if (sorted.length === 0) {
    institutionsBody.innerHTML = `<tr><td colspan="3" class="muted">5% 이상 보유 기관 없음</td></tr>`;
    return;
  }

  institutionsBody.innerHTML = sorted
    .map((row) => {
      const inst = row.institution || {};
      return `
        <tr>
          <td><button class="link-btn" data-id="${inst.id}" data-name="${escapeHtml(inst.name || "-")}">${escapeHtml(
            inst.name || "-",
          )}</button></td>
          <td>${formatPercent(row.percent)}</td>
          <td>${formatDate(row.as_of_date)}</td>
        </tr>
      `;
    })
    .join("");

  institutionsBody.querySelectorAll(".link-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!id) return;
      selectInstitution({ id, name });
    });
  });
}

async function selectInstitution(institution) {
  selectedInstitution = institution;
  institutionTitle.textContent = institution.name;

  const { data, error } = await supabase
    .from("holdings")
    .select("percent,as_of_date,security:securities(name,symbol,sec_cusip)")
    .eq("source", "DART")
    .eq("institution_id", institution.id)
    .order("percent", { ascending: false })
    .limit(200);

  if (error) {
    holdingsBody.innerHTML = `<tr><td colspan="3" class="muted">조회 실패: ${escapeHtml(
      error.message,
    )}</td></tr>`;
    holdingsMeta.textContent = "";
    return;
  }

  currentHoldings = (data || []).filter((row) => String(row.security?.name || "") !== String(selectedCompany?.name || ""));
  renderHoldings();
}

function renderHoldings() {
  holdingsMeta.textContent = `${currentHoldings.length}개 종목`;
  if (currentHoldings.length === 0) {
    holdingsBody.innerHTML = `<tr><td colspan="3" class="muted">보유 종목 없음</td></tr>`;
    return;
  }

  holdingsBody.innerHTML = currentHoldings
    .map((row) => {
      const sec = row.security || {};
      const name = sec.name || "-";
      const ticker = sec.symbol || sec.sec_cusip || "-";
      return `
        <tr>
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(ticker)}</td>
          <td>${formatPercent(row.percent)}</td>
        </tr>
      `;
    })
    .join("");
}

companyInput.addEventListener("input", () => {
  const term = companyInput.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchCompanies(term), 250);
});

sortSelect.addEventListener("change", () => {
  if (!selectedCompany) return;
  renderInstitutions();
});
