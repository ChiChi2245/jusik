const SUPABASE_URL = "https://sqtoenwoxwyhjaqsdyyp.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JbFnEmztUuyCesUdg5jqvw_6baRRda3";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const institutionInput = document.getElementById("institution-search");
const institutionResults = document.getElementById("institution-results");
const listView = document.getElementById("list-view");
const detailView = document.getElementById("detail-view");
const backBtn = document.getElementById("back-btn");

const institutionName = document.getElementById("institution-name");
const institutionMeta = document.getElementById("institution-meta");
const metricCount = document.getElementById("metric-count");
const metricPercent = document.getElementById("metric-percent");
const metricDate = document.getElementById("metric-date");
const holdingsBody = document.getElementById("holdings-body");

let debounceTimer = null;
let top10Chart = null;
let marketChart = null;

// Redirect direct path access to hash routing to avoid 404 on static hosting.
if (window.location.pathname.startsWith("/institution/")) {
  const id = window.location.pathname.split("/")[2];
  window.location.replace(`/#/institution/${id}`);
}

init();

async function init() {
  await loadInitialInstitutions();
  handleRoute();
  window.addEventListener("hashchange", handleRoute);
}

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

async function loadInitialInstitutions() {
  const { data, error } = await supabaseClient
    .from("institutions")
    .select("id,name")
    .order("name")
    .limit(50);

  if (error) {
    institutionResults.innerHTML = `<li class="muted">기관 목록 로드 실패: ${escapeHtml(
      error.message,
    )}</li>`;
    return;
  }

  if (!data || data.length === 0) {
    institutionResults.innerHTML = `<li class="muted">기관 데이터가 없습니다.</li>`;
    return;
  }

  renderInstitutionResults(data);
}

async function searchInstitutions(term) {
  if (!term) {
    await loadInitialInstitutions();
    return;
  }

  const pattern = `%${term}%`;
  const { data, error } = await supabaseClient
    .from("institutions")
    .select("id,name")
    .ilike("name", pattern)
    .limit(50);

  if (error) {
    institutionResults.innerHTML = `<li class="muted">검색 실패: ${escapeHtml(error.message)}</li>`;
    return;
  }

  if (!data || data.length === 0) {
    institutionResults.innerHTML = `<li class="muted">검색 결과 없음</li>`;
    return;
  }

  renderInstitutionResults(data);
}

function renderInstitutionResults(data) {
  institutionResults.innerHTML = data
    .map(
      (row) => `
        <li>
          <button class="result-btn" data-id="${row.id}">
            <span class="result-title">${escapeHtml(row.name || "-")}</span>
          </button>
        </li>
      `,
    )
    .join("");

  institutionResults.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.id;
      if (!id) return;
      navigateToInstitution(id);
    });
  });
}

institutionInput.addEventListener("input", () => {
  const term = institutionInput.value.trim();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => searchInstitutions(term), 250);
});

function navigateToInstitution(id) {
  window.location.hash = `#/institution/${id}`;
}

function handleRoute() {
  const match = window.location.hash.match(/^#\/institution\/(\d+)/);
  if (match) {
    const id = match[1];
    listView.classList.add("hidden");
    detailView.classList.remove("hidden");
    selectInstitution(id);
  } else {
    listView.classList.remove("hidden");
    detailView.classList.add("hidden");
  }
}

backBtn.addEventListener("click", () => {
  window.location.hash = "#/";
});

async function selectInstitution(institutionId) {
  const { data: instData, error: instErr } = await supabaseClient
    .from("institutions")
    .select("id,name")
    .eq("id", institutionId)
    .maybeSingle();

  if (instErr || !instData) {
    institutionName.textContent = "기관 정보 없음";
    institutionMeta.textContent = "-";
    return;
  }

  institutionName.textContent = instData.name || "기관";
  institutionMeta.textContent = "- · -";

  const { data: holdingsData, error: holdingsErr } = await supabaseClient
    .from("holdings")
    .select("percent,as_of_date,source,meta,security:securities(name)")
    .eq("institution_id", institutionId)
    .order("percent", { ascending: false })
    .limit(50);

  if (holdingsErr) {
    holdingsBody.innerHTML = `<tr><td colspan="5" class="muted">조회 실패: ${escapeHtml(
      holdingsErr.message,
    )}</td></tr>`;
    return;
  }

  const rows = holdingsData || [];
  renderMetrics(rows);
  renderCharts(rows);
  renderHoldingsTable(rows);
}

function renderMetrics(rows) {
  metricCount.textContent = rows.length.toLocaleString("ko-KR");
  const percentSum = rows.reduce((sum, row) => sum + (Number(row.percent) || 0), 0);
  metricPercent.textContent = `${percentSum.toFixed(2)}%`;
  const maxDate = rows.reduce((max, row) => {
    if (!row.as_of_date) return max;
    const current = new Date(row.as_of_date).getTime();
    return current > max ? current : max;
  }, 0);
  metricDate.textContent = maxDate ? new Date(maxDate).toLocaleDateString("ko-KR") : "-";
}

function renderCharts(rows) {
  const top10 = [...rows]
    .sort((a, b) => (b.percent || 0) - (a.percent || 0))
    .slice(0, 10);

  const topLabels = top10.map((row) => row.security?.name || "-");
  const topValues = top10.map((row) => Number(row.percent) || 0);

  if (top10Chart) top10Chart.destroy();
  top10Chart = new Chart(document.getElementById("chart-top10"), {
    type: "doughnut",
    data: { labels: topLabels, datasets: [{ data: topValues }] },
    options: { plugins: { legend: { position: "bottom", labels: { color: "#f5f7fb" } } } },
  });

  const marketTotals = rows.reduce(
    (acc, row) => {
      const market = String(row.source || "").toLowerCase() === "dart" ? "KR" : "US";
      acc[market] = (acc[market] || 0) + (Number(row.percent) || 0);
      return acc;
    },
    {},
  );

  if (marketChart) marketChart.destroy();
  marketChart = new Chart(document.getElementById("chart-market"), {
    type: "pie",
    data: { labels: Object.keys(marketTotals), datasets: [{ data: Object.values(marketTotals) }] },
    options: { plugins: { legend: { position: "bottom", labels: { color: "#f5f7fb" } } } },
  });
}

function renderHoldingsTable(rows) {
  if (!rows || rows.length === 0) {
    holdingsBody.innerHTML = `<tr><td colspan="5" class="muted">데이터 없음</td></tr>`;
    return;
  }
  holdingsBody.innerHTML = rows
    .map((row, idx) => {
      const sec = row.security || {};
      const meta = row.meta && typeof row.meta === "object" ? row.meta : {};
      const code = meta.ticker || meta.dart_corp_code || "-";
      return `
        <tr>
          <td>${idx + 1}</td>
          <td>${escapeHtml(sec.name || "-")}</td>
          <td>${escapeHtml(code)}</td>
          <td>${formatPercent(row.percent)}</td>
          <td>${formatDate(row.as_of_date)}</td>
        </tr>
      `;
    })
    .join("");
}
