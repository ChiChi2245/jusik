const SUPABASE_URL = "https://sqtoenwoxwyhjaqsdyyp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JbFnEmztUuyCesUdg5jqvw_6baRRda3";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const institutionInput = document.getElementById("institution-search");
const institutionResults = document.getElementById("institution-results");
const institutionTitle = document.getElementById("institution-title");
const institutionHoldingsBody = document.getElementById("institution-holdings-body");
const institutionHoldingsMeta = document.getElementById("institution-holdings-meta");

const securityInput = document.getElementById("security-search");
const securityResults = document.getElementById("security-results");
const securityTitle = document.getElementById("security-title");
const securityHoldersBody = document.getElementById("security-holders-body");
const securityHoldersMeta = document.getElementById("security-holders-meta");
const securitySortSelect = document.getElementById("security-sort-select");

let selectedInstitution = null;
let selectedSecurity = null;
let currentInstitutionHoldings = [];
let currentSecurityHolders = [];
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

async function searchInstitutions(term) {
  if (!term) {
    institutionResults.innerHTML = "";
    return;
  }
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("institutions")
    .select("id,name")
    .ilike("name", pattern)
    .limit(20);

  if (error) {
    institutionResults.innerHTML = `<li class="muted">검색 실패: ${escapeHtml(error.message)}</li>`;
    return;
  }

  if (!data || data.length === 0) {
    institutionResults.innerHTML = `<li class="muted">검색 결과 없음</li>`;
    return;
  }

  institutionResults.innerHTML = data
    .map(
      (row) => `
        <li>
          <button class="result-btn" data-id="${row.id}" data-name="${escapeHtml(row.name || "-")}">
            <span class="result-title">${escapeHtml(row.name || "-")}</span>
          </button>
        </li>
      `,
    )
    .join("");

  institutionResults.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!id) return;
      selectInstitution({ id, name });
    });
  });
}

async function searchSecurities(term) {
  if (!term) {
    securityResults.innerHTML = "";
    return;
  }
  const pattern = `%${term}%`;
  const { data, error } = await supabase
    .from("securities")
    .select("id,name")
    .ilike("name", pattern)
    .limit(20);

  if (error) {
    securityResults.innerHTML = `<li class="muted">검색 실패: ${escapeHtml(error.message)}</li>`;
    return;
  }

  if (!data || data.length === 0) {
    securityResults.innerHTML = `<li class="muted">검색 결과 없음</li>`;
    return;
  }

  securityResults.innerHTML = data
    .map(
      (row) => `
        <li>
          <button class="result-btn" data-id="${row.id}" data-name="${escapeHtml(row.name || "-")}">
            <span class="result-title">${escapeHtml(row.name || "-")}</span>
          </button>
        </li>
      `,
    )
    .join("");

  securityResults.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      const name = btn.dataset.name;
      if (!id) return;
      selectSecurity({ id, name });
    });
  });
}

async function selectInstitution(institution) {
  selectedInstitution = institution;
  institutionTitle.textContent = institution.name;
  institutionHoldingsBody.innerHTML = "";
  institutionHoldingsMeta.textContent = "";

  const { data, error } = await supabase
    .from("holdings")
    .select("percent,as_of_date,security:securities(name)")
    .eq("source", "DART")
    .eq("institution_id", institution.id)
    .order("percent", { ascending: false })
    .limit(200);

  if (error) {
    institutionHoldingsBody.innerHTML = `<tr><td colspan="3" class="muted">조회 실패: ${escapeHtml(
      error.message,
    )}</td></tr>`;
    return;
  }

  currentInstitutionHoldings = data || [];
  renderInstitutionHoldings();
}

function renderInstitutionHoldings() {
  institutionHoldingsMeta.textContent = `${currentInstitutionHoldings.length}개 종목`;
  if (currentInstitutionHoldings.length === 0) {
    institutionHoldingsBody.innerHTML = `<tr><td colspan="3" class="muted">보유 종목 없음</td></tr>`;
    return;
  }

  institutionHoldingsBody.innerHTML = currentInstitutionHoldings
    .map((row) => {
      const sec = row.security || {};
      return `
        <tr>
          <td>${escapeHtml(sec.name || "-")}</td>
          <td>${formatPercent(row.percent)}</td>
          <td>${formatDate(row.as_of_date)}</td>
        </tr>
      `;
    })
    .join("");
}

async function selectSecurity(security) {
  selectedSecurity = security;
  securityTitle.textContent = security.name;
  securityHoldersBody.innerHTML = "";
  securityHoldersMeta.textContent = "";

  const { data, error } = await supabase
    .from("holdings")
    .select("percent,as_of_date,institution:institutions(name)")
    .eq("source", "DART")
    .eq("security_id", security.id)
    .gte("percent", 5);

  if (error) {
    securityHoldersBody.innerHTML = `<tr><td colspan="3" class="muted">조회 실패: ${escapeHtml(
      error.message,
    )}</td></tr>`;
    return;
  }

  currentSecurityHolders = data || [];
  renderSecurityHolders();
}

function renderSecurityHolders() {
  const sorted = [...currentSecurityHolders];
  const sortMode = securitySortSelect.value;
  if (sortMode === "percent_desc") {
    sorted.sort((a, b) => (b.percent || 0) - (a.percent || 0));
  } else if (sortMode === "date_desc") {
    sorted.sort((a, b) => new Date(b.as_of_date || 0) - new Date(a.as_of_date || 0));
  }

  securityHoldersMeta.textContent = `${sorted.length}개 기관`;
  if (sorted.length === 0) {
    securityHoldersBody.innerHTML = `<tr><td colspan="3" class="muted">5% 이상 보유 기관 없음</td></tr>`;
    return;
  }

  securityHoldersBody.innerHTML = sorted
    .map((row) => {
      const inst = row.institution || {};
      return `
        <tr>
          <td>${escapeHtml(inst.name || "-")}</td>
          <td>${formatPercent(row.percent)}</td>
          <td>${formatDate(row.as_of_date)}</td>
        </tr>
      `;
    })
    .join("");
}

institutionInput.addEventListener("input", () => {
  const term = institutionInput.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchInstitutions(term), 250);
});

securityInput.addEventListener("input", () => {
  const term = securityInput.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchSecurities(term), 250);
});

securitySortSelect.addEventListener("change", () => {
  if (!selectedSecurity) return;
  renderSecurityHolders();
});
