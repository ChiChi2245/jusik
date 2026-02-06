
document.addEventListener('DOMContentLoaded', () => {
    const SUPABASE = {
        url: 'https://sqtoenwoxwyhjaqsdyyp.supabase.co',
        anonKey: 'sb_publishable_JbFnEmztUuyCesUdg5jqvw_6baRRda3',
    };

    const useLiveData = SUPABASE.url && SUPABASE.anonKey;

    const fallbackData = {
        nps: { name: "국민연금공단", type: "domestic", description: "대한민국의 대표적인 연기금.", totalAssets: 1000000000000000, assetAllocation: { '국내주식': 40, '해외주식': 30, '채권': 20, '대체투자': 10 }, holdings: [
            { rank: 1, name: "삼성전자", ticker: "005930", weight: 5.5, value: 55000000000000, quantity: 700000000, details: { marketCap: "450조", transactions: [{date: '2023-10-26', action: 'buy', amount: 100000}], news: [{title: '삼성전자, 4분기 실적 호조', url: '#'}]} },
            { rank: 2, name: "LG에너지솔루션", ticker: "373220", weight: 3.2, value: 32000000000000, quantity: 80000000, details: { marketCap: "100조", transactions: [], news: []} },
        ]},
        berkshire: { name: "Berkshire Hathaway", type: "foreign", description: "워렌 버핏이 이끄는 가치 투자의 대명사.", totalAssets: 900000000000, assetAllocation: { '주식': 80, '채권': 10, '현금': 10 }, holdings: [
            { rank: 1, name: "Apple Inc.", ticker: "AAPL", weight: 45.0, value: 405000000000, quantity: 2300000000, details: { marketCap: "2.5조 USD", transactions: [{date: '2023-09-30', action: 'sell', amount: 10000}], news: [{title: 'Apple, Vision Pro 출시 예정', url: '#'}]} },
        ]},
        ark: { name: "ARK Invest", type: "foreign", description: "파괴적 혁신 기술 전문 투자사.", totalAssets: 30000000000, assetAllocation: { '주식': 98, '현금': 2 }, holdings: [
            { rank: 1, name: "Tesla, Inc.", ticker: "TSLA", weight: 9.8, value: 2940000000, quantity: 12000000, details: { marketCap: "8000억 USD", transactions: [], news: []} },
        ]},
    };

    let liveInstitutions = [];
    let liveHoldings = [];
    let liveSectors = [];
    let liveSummary = null;

    let assetAllocationChart, holdingsPieChart, currentInstitutionId;
    let displayCurrency = 'KRW';
    let currentBaseCurrency = 'KRW';
    let currentTheme = 'dark';
    let fxUsdToKrw = 1300;
    const FX_CONFIG = {
        endpoint: 'https://api.exchangerate.host/latest?base=USD&symbols=KRW',
        refreshMs: 60 * 60 * 1000,
    };

    const institutionNav = document.getElementById('institution-selector-nav');
    const dashboardNav = document.getElementById('dashboard-nav');
    const institutionCardsContainer = document.getElementById('institution-cards');
    const dashboardContainer = document.getElementById('dashboard');
    const panelOverlay = document.getElementById('detail-panel-overlay');
    const panel = document.getElementById('detail-panel');
    const topTitle = document.getElementById('top-title');
    const topSubtitle = document.getElementById('top-subtitle');
    const fxRateEl = document.getElementById('fx-rate');
    const fxUpdatedEl = document.getElementById('fx-updated');
    const sqlToggleBtn = document.getElementById('sql-toggle-btn');
    const sqlEditor = document.getElementById('sql-editor');
    const sqlCloseBtn = document.getElementById('sql-close-btn');
    const sqlInput = document.getElementById('sql-input');
    const sqlRunBtn = document.getElementById('sql-run-btn');
    const sqlStatus = document.getElementById('sql-status');
    const sqlError = document.getElementById('sql-error');
    const sqlResults = document.getElementById('sql-results');
    const sqlResultsMeta = document.getElementById('sql-results-meta');
    const sqlResultsTable = document.getElementById('sql-results-table');
    const sqlAdminToken = document.getElementById('sql-admin-token');
    const sqlMaxRows = document.getElementById('sql-max-rows');
    const sqlEditorMonaco = document.getElementById('sql-editor-monaco');
    const sqlSchemaRefresh = document.getElementById('sql-schema-refresh');
    const sqlSchemaList = document.getElementById('sql-schema-list');
    let monacoEditor = null;

    const getCssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

    const convertValue = (value, baseCurrency, targetCurrency) => {
        if (value === null || value === undefined) return null;
        if (baseCurrency === targetCurrency) return value;
        if (baseCurrency === 'USD' && targetCurrency === 'KRW') return value * fxUsdToKrw;
        if (baseCurrency === 'KRW' && targetCurrency === 'USD') return value / fxUsdToKrw;
        return value;
    };

    const formatCurrency = (value, baseCurrency = currentBaseCurrency) => {
        if (value === null || value === undefined) return '-';
        const converted = convertValue(value, baseCurrency, displayCurrency);
        const locale = displayCurrency === 'KRW' ? 'ko-KR' : 'en-US';
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: displayCurrency,
            notation: 'compact',
            maximumFractionDigits: 1,
        }).format(converted);
    };

    function renderInstitutionCards(filter = 'all', searchTerm = '') {
        institutionCardsContainer.innerHTML = '';
        const data = useLiveData ? liveInstitutions : Object.keys(fallbackData).map(id => ({ id, ...fallbackData[id] }));
        data.filter(inst => (filter === 'all' || inst.type === filter) && inst.name.toLowerCase().includes(searchTerm.toLowerCase())).forEach(inst => {
            const card = document.createElement('div');
            card.className = 'institution-card';
            card.innerHTML = `<h3>${inst.name}</h3><p>${inst.description}</p>`;
            card.addEventListener('click', () => showDashboard(inst.id));
            institutionCardsContainer.appendChild(card);
        });
    }

    function renderDashboard(id) {
        currentInstitutionId = id;
        const inst = useLiveData
            ? liveInstitutions.find(item => item.id === id)
            : fallbackData[id];
        currentBaseCurrency = useLiveData ? 'USD' : (inst.type === 'domestic' ? 'KRW' : 'USD');
        setTopTitle(inst.name, '대시보드');

        const totalValue = useLiveData ? (liveSummary?.total_value_usd ?? null) : inst.totalAssets;
        const positions = useLiveData ? (liveSummary?.positions ?? 0) : inst.holdings.length;

        dashboardContainer.innerHTML = `
            <section id="key-metrics" class="dashboard-section"><h3>핵심 지표</h3><div id="key-metrics-content" style="display:flex; gap: 20px;"><div class="metric"><p>총 평가액</p><span>${formatCurrency(totalValue, currentBaseCurrency)}</span></div><div class="metric"><p>보유 종목 수</p><span>${positions} 개</span></div></div></section>
            <div class="dashboard-row">
                <section id="asset-allocation" class="dashboard-section dashboard-half"><h3>자산 배분</h3><div class="chart-wrap"><canvas id="asset-allocation-chart"></canvas></div><div id="asset-allocation-labels" class="chart-labels"></div></section>
                <section id="holdings-pie" class="dashboard-section dashboard-half"><h3>보유 주식 비중</h3><div class="chart-wrap"><canvas id="holdings-pie-chart"></canvas></div><div id="holdings-pie-labels" class="chart-labels"></div></section>
            </div>
            <section id="holdings-table-section" class="dashboard-section"><h3>보유 종목</h3><div class="table-container"><table><thead><tr><th>순위</th><th>종목명</th><th>티커</th><th>비중(%)</th><th>평가액</th><th>수량</th></tr></thead><tbody id="holdings-table-body"></tbody></table></div></section>
        `;
        if (useLiveData) {
            renderHoldingsTable(liveHoldings);
            renderAssetAllocationChart(liveSectors);
            renderHoldingsPieChart(liveHoldings);
        } else {
            renderHoldingsTable(inst.holdings);
            renderAssetAllocationChart(inst.assetAllocation);
            renderHoldingsPieChart(inst.holdings);
        }
    }

    function renderHoldingsTable(data) {
        const tableBody = document.getElementById('holdings-table-body');
        tableBody.innerHTML = '';
        data.forEach((h, idx) => {
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            const name = h.name || h.display_name || h.issuer_name || h.target_corp_name;
            row.innerHTML = `<td>${h.rank ?? (idx + 1)}</td><td>${name ?? '-'}</td><td>${h.ticker ?? h.cusip ?? '-'}</td><td>${h.weight ? h.weight.toFixed(2) : '-'}</td><td>${formatCurrency(h.value, currentBaseCurrency)}</td><td>${h.shares ? h.shares.toLocaleString() : '-'}</td>`;
            row.addEventListener('click', () => openPanel(currentInstitutionId, h.cusip || h.ticker || name));
            tableBody.appendChild(row);
        });
    }
    
    function renderPanelContent(instId, ticker) {
        if (!useLiveData) {
            const holding = fallbackData[instId].holdings.find(h => h.ticker === ticker);
            document.getElementById('panel-title').innerText = `${holding.name} (${holding.ticker})`;
            document.getElementById('panel-content').innerHTML = `<div class="panel-section"><h4>기본 정보</h4><p>시가총액: ${holding.details.marketCap}</p></div> ...`;
            return;
        }
        const holding = liveHoldings.find(h => h.cusip === ticker || h.ticker === ticker || h.display_name === ticker);
        if (!holding) return;
        const title = holding.display_name || holding.issuer_name || holding.target_corp_name;
        const sub = holding.ticker || holding.cusip || '';
        document.getElementById('panel-title').innerText = `${title} ${sub ? `(${sub})` : ''}`;
        document.getElementById('panel-content').innerHTML = `
            <div class="panel-section"><h4>보유 정보</h4>
                <p>평가액: ${formatCurrency(holding.value, currentBaseCurrency)}</p>
                <p>수량: ${holding.shares ? holding.shares.toLocaleString() : '-'}</p>
                <p>섹터: ${holding.sector ?? '-'}</p>
            </div>
        `;
    }

    function chartOptionsBase(valueFormatter, sliceFormatter) {
        const textColor = getCssVar('--text-primary');
        const formatter = valueFormatter || ((val) => formatCurrency(val, currentBaseCurrency));
        const legendPosition = window.innerWidth < 900 ? 'bottom' : 'right';
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: legendPosition,
                    labels: {
                        color: textColor,
                        usePointStyle: true,
                        pointStyle: 'circle',
                        boxWidth: 8,
                        boxHeight: 8,
                        padding: 12,
                        font: { size: 12 },
                    },
                },
                sliceLabels: {
                    formatter: sliceFormatter,
                    color: textColor,
                    minPercent: 6,
                },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const val = ctx.raw ?? 0;
                            return `${ctx.label}: ${formatter(val)}`;
                        },
                    },
                },
            },
        };
    }

    Chart.register({
        id: 'sliceLabels',
        afterDatasetsDraw(chart, args, pluginOptions) {
            const { ctx } = chart;
            const dataset = chart.data.datasets?.[0];
            if (!dataset) return;
            const meta = chart.getDatasetMeta(0);
            const total = dataset.data.reduce((sum, v) => sum + (Number(v) || 0), 0) || 1;
            const formatter = pluginOptions?.formatter;
            const color = pluginOptions?.color || '#fff';
            const minPercent = pluginOptions?.minPercent ?? 6;

            ctx.save();
            ctx.font = '11px Pretendard, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = color;

            meta.data.forEach((arc, idx) => {
                const val = Number(dataset.data[idx]) || 0;
                const pct = (val / total) * 100;
                if (pct < minPercent) return;
                const label = formatter ? formatter(val, idx, pct, chart) : `${pct.toFixed(1)}%`;
                if (!label) return;
                const point = arc.tooltipPosition();
                const lines = String(label).split('\n');
                const lineHeight = 12;
                lines.forEach((line, i) => {
                    ctx.fillText(line, point.x, point.y + (i - (lines.length - 1) / 2) * lineHeight);
                });
            });

            ctx.restore();
        },
    });

    function renderAssetAllocationChart(data) {
        if (assetAllocationChart) assetAllocationChart.destroy();
        const labelsEl = document.getElementById('asset-allocation-labels');
        if (labelsEl) labelsEl.innerHTML = '';
        if (useLiveData) {
            const labels = data.map(item => item.sector);
            const values = data.map(item => convertValue(Number(item.total_value) || 0, currentBaseCurrency, displayCurrency));
            const sliceFormatter = (val, idx, pct, chart) => `${chart.data.labels[idx]}\n${pct.toFixed(1)}%`;
            const options = chartOptionsBase(undefined, sliceFormatter);
            assetAllocationChart = new Chart(document.getElementById('asset-allocation-chart').getContext('2d'), { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A'] }] }, options });
            if (labelsEl) {
                const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0) || 1;
                labelsEl.innerHTML = labels.map((label, idx) => {
                    const pct = (values[idx] / total) * 100;
                    const color = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A'][idx] || '#888';
                    return `<div class="label-item"><span class="label-dot" style="background:${color}"></span><span class="label-name">${label}</span><span class="label-pct">${pct.toFixed(1)}%</span></div>`;
                }).join('');
            }
        } else {
            const percentFormatter = (val) => `${Number(val).toFixed(1)}%`;
            const sliceFormatter = (val, idx, pct, chart) => `${chart.data.labels[idx]}\n${Number(val).toFixed(1)}%`;
            const percentOptions = chartOptionsBase(percentFormatter, sliceFormatter);
            const labels = Object.keys(data);
            const values = Object.values(data);
            assetAllocationChart = new Chart(document.getElementById('asset-allocation-chart').getContext('2d'), { type: 'doughnut', data: { labels, datasets: [{ data: values, backgroundColor: ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2'] }] }, options: percentOptions });
            if (labelsEl) {
                labelsEl.innerHTML = labels.map((label, idx) => {
                    const color = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2'][idx] || '#888';
                    return `<div class="label-item"><span class="label-dot" style="background:${color}"></span><span class="label-name">${label}</span><span class="label-pct">${Number(values[idx]).toFixed(1)}%</span></div>`;
                }).join('');
            }
        }
    }

    function renderHoldingsPieChart(data) {
        if (holdingsPieChart) holdingsPieChart.destroy();
        const labelsEl = document.getElementById('holdings-pie-labels');
        if (labelsEl) labelsEl.innerHTML = '';
        if (useLiveData) {
            const sorted = [...data].sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 10);
            const labels = sorted.map(h => h.display_name);
            const values = sorted.map(h => convertValue(h.value || 0, currentBaseCurrency, displayCurrency));
            const sliceFormatter = (val, idx, pct, chart) => `${chart.data.labels[idx]}\n${pct.toFixed(1)}%`;
            const options = chartOptionsBase(undefined, sliceFormatter);
            holdingsPieChart = new Chart(document.getElementById('holdings-pie-chart').getContext('2d'), { type: 'pie', data: { labels, datasets: [{ data: values, backgroundColor: ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A', '#34C759'].slice(0, sorted.length) }] }, options });
            if (labelsEl) {
                const total = values.reduce((sum, v) => sum + (Number(v) || 0), 0) || 1;
                labelsEl.innerHTML = sorted.map((h, idx) => {
                    const pct = (values[idx] / total) * 100;
                    const color = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A', '#34C759'][idx] || '#888';
                    return `<div class="label-item"><span class="label-dot" style="background:${color}"></span><span class="label-name">${h.display_name}</span><span class="label-pct">${pct.toFixed(1)}%</span></div>`;
                }).join('');
            }
        } else {
            const percentFormatter = (val) => `${Number(val).toFixed(1)}%`;
            const sliceFormatter = (val, idx, pct, chart) => `${chart.data.labels[idx]}\n${Number(val).toFixed(1)}%`;
            const percentOptions = chartOptionsBase(percentFormatter, sliceFormatter);
            const sliced = data.slice(0, 10);
            holdingsPieChart = new Chart(document.getElementById('holdings-pie-chart').getContext('2d'), { type: 'pie', data: { labels: sliced.map(h => h.name), datasets: [{ data: sliced.map(h => h.weight), backgroundColor: ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A', '#34C759'].slice(0, sliced.length) }] }, options: percentOptions });
            if (labelsEl) {
                labelsEl.innerHTML = sliced.map((h, idx) => {
                    const color = ['#0A84FF', '#30D158', '#FF9F0A', '#FF453A', '#BF5AF2', '#5E5CE6', '#64D2FF', '#FFD60A', '#FF9F0A', '#34C759'][idx] || '#888';
                    return `<div class="label-item"><span class="label-dot" style="background:${color}"></span><span class="label-name">${h.name}</span><span class="label-pct">${Number(h.weight).toFixed(1)}%</span></div>`;
                }).join('');
            }
        }
    }

    async function showDashboard(id) {
        institutionNav.style.display = 'none';
        dashboardNav.classList.remove('dashboard-nav-hidden');
        const name = useLiveData
            ? (liveInstitutions.find(item => item.id === id)?.name ?? '')
            : fallbackData[id].name;
        document.getElementById('dashboard-nav-title').innerText = name;
        institutionCardsContainer.style.display = 'none';
        dashboardContainer.classList.remove('dashboard-hidden');
        if (useLiveData) {
            await loadInstitutionData(id);
        }
        renderDashboard(id);
    }

    function showSelector() {
        dashboardNav.classList.add('dashboard-nav-hidden');
        institutionNav.style.display = 'flex';
        dashboardContainer.classList.add('dashboard-hidden');
        institutionCardsContainer.style.display = 'grid';
        currentInstitutionId = null;
        setTopTitle('기관 투자 포트폴리오', '기관 선택');
        renderInstitutionCards();
    }

    function openPanel(instId, ticker) {
        renderPanelContent(instId, ticker);
        panelOverlay.classList.remove('hidden');
        document.body.classList.add('panel-open');
    }

    function closePanel() {
        document.body.classList.remove('panel-open');
        panelOverlay.classList.add('hidden');
    }

    async function init() {
        applyTheme('dark');
        if (useLiveData) {
            await loadInstitutions();
        }
        refreshFxRate();
        setInterval(refreshFxRate, FX_CONFIG.refreshMs);
        setTopTitle('기관 투자 포트폴리오', '기관 선택');
        updateFxDisplay();
        renderInstitutionCards();
        document.getElementById('back-to-list-btn').addEventListener('click', showSelector);
        document.getElementById('panel-close-btn').addEventListener('click', closePanel);
        panelOverlay.addEventListener('click', closePanel);
        document.getElementById('search-input').addEventListener('input', (e) => renderInstitutionCards(document.querySelector('.filter-btn.active').dataset.filter, e.target.value));
        document.querySelectorAll('.filter-btn').forEach(btn => btn.addEventListener('click', (e) => { document.querySelector('.filter-btn.active').classList.remove('active'); e.target.classList.add('active'); renderInstitutionCards(e.target.dataset.filter, document.getElementById('search-input').value); }));
        document.querySelectorAll('[data-theme]').forEach(btn => btn.addEventListener('click', () => applyTheme(btn.dataset.theme)));
        document.querySelectorAll('[data-currency]').forEach(btn => btn.addEventListener('click', () => setCurrency(btn.dataset.currency)));
        if (sqlToggleBtn && sqlEditor) {
            sqlToggleBtn.addEventListener('click', () => {
                sqlEditor.classList.toggle('hidden');
                if (!sqlEditor.classList.contains('hidden')) {
                    loadSchema();
                }
            });
        }
        if (sqlCloseBtn && sqlEditor) {
            sqlCloseBtn.addEventListener('click', () => sqlEditor.classList.add('hidden'));
        }
        if (sqlAdminToken) {
            const saved = localStorage.getItem('sql_admin_token');
            if (saved) sqlAdminToken.value = saved;
            sqlAdminToken.addEventListener('input', () => localStorage.setItem('sql_admin_token', sqlAdminToken.value));
        }
        if (sqlRunBtn) {
            sqlRunBtn.addEventListener('click', runSqlQuery);
        }
        if (sqlInput) {
            sqlInput.addEventListener('keydown', (e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                    e.preventDefault();
                    runSqlQuery();
                }
            });
        }
        if (sqlSchemaRefresh) {
            sqlSchemaRefresh.addEventListener('click', loadSchema);
        }
        initMonacoEditor();
    }

    init();

    function setTopTitle(title, subtitle) {
        if (topTitle) topTitle.textContent = title || '기관 투자 포트폴리오';
        if (topSubtitle) topSubtitle.textContent = subtitle || '';
    }

    async function refreshFxRate() {
        try {
            const res = await fetch(FX_CONFIG.endpoint);
            if (!res.ok) return;
            const data = await res.json();
            const rate = data?.rates?.KRW;
            if (typeof rate === 'number' && isFinite(rate) && rate > 0) {
                fxUsdToKrw = rate;
                updateFxDisplay();
                if (currentInstitutionId) {
                    renderDashboard(currentInstitutionId);
                }
            }
        } catch (err) {
            // Keep fallback rate on failure.
        }
    }

    async function runSqlQuery() {
        if (!sqlInput || !sqlRunBtn) return;
        const sql = getSqlText();
        if (!sql) return;

        const maxRows = Math.min(Math.max(Number(sqlMaxRows?.value || 200), 1), 1000);

        sqlRunBtn.disabled = true;
        if (sqlStatus) sqlStatus.textContent = '실행 중...';
        if (sqlError) sqlError.classList.add('hidden');
        if (sqlResults) sqlResults.classList.add('hidden');

        try {
            const headers = {
                'Content-Type': 'application/json',
                apikey: SUPABASE.anonKey,
            };
            const token = sqlAdminToken?.value?.trim();
            if (token) {
                headers['x-admin-token'] = token;
            }
            const res = await fetch(`${SUPABASE.url}/functions/v1/sql-editor`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ sql, maxRows }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || '쿼리 실행 실패');
            }
            renderSqlResults(data.rows || [], data.duration_ms);
            if (sqlStatus) sqlStatus.textContent = '완료';
        } catch (err) {
            if (sqlStatus) sqlStatus.textContent = '실패';
            if (sqlError) {
                sqlError.textContent = err instanceof Error ? err.message : '알 수 없는 오류';
                sqlError.classList.remove('hidden');
            }
        } finally {
            sqlRunBtn.disabled = false;
        }
    }

    function renderSqlResults(rows, durationMs) {
        if (!sqlResults || !sqlResultsMeta || !sqlResultsTable) return;
        if (!rows || rows.length === 0) {
            sqlResultsMeta.textContent = durationMs ? `결과 없음 · ${durationMs}ms` : '결과 없음';
            sqlResultsTable.innerHTML = '';
            sqlResults.classList.remove('hidden');
            return;
        }
        const columns = Object.keys(rows[0]);
        const thead = `<thead><tr>${columns.map(col => `<th>${col}</th>`).join('')}</tr></thead>`;
        const tbody = `<tbody>${rows.map(row => `<tr>${columns.map(col => `<td>${row[col] ?? ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
        sqlResultsTable.innerHTML = `<table>${thead}${tbody}</table>`;
        const meta = `${rows.length} rows`;
        sqlResultsMeta.textContent = durationMs ? `${meta} · ${durationMs}ms` : meta;
        sqlResults.classList.remove('hidden');
    }

    async function loadSchema() {
        if (!sqlSchemaList) return;
        sqlSchemaList.textContent = '로딩 중...';
        try {
            const headers = {
                'Content-Type': 'application/json',
                apikey: SUPABASE.anonKey,
            };
            const token = sqlAdminToken?.value?.trim();
            if (token) {
                headers['x-admin-token'] = token;
            }
            const schemaSql = `
                select table_name, column_name, data_type
                from information_schema.columns
                where table_schema = 'public'
                order by table_name, ordinal_position
            `;
            const res = await fetch(`${SUPABASE.url}/functions/v1/sql-editor`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ sql: schemaSql, maxRows: 1000 }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                throw new Error(data.error || '스키마 로드 실패');
            }
            renderSchemaList(data.rows || []);
        } catch (err) {
            sqlSchemaList.textContent = err instanceof Error ? err.message : '스키마 로드 실패';
        }
    }

    function renderSchemaList(rows) {
        if (!sqlSchemaList) return;
        sqlSchemaList.innerHTML = '';
        if (!rows || rows.length === 0) {
            sqlSchemaList.textContent = '스키마 없음';
            return;
        }
        const grouped = {};
        rows.forEach((row) => {
            const table = row.table_name;
            if (!grouped[table]) grouped[table] = [];
            grouped[table].push({ name: row.column_name, type: row.data_type });
        });
        const tables = Object.keys(grouped);
        tables.forEach((table, idx) => {
            const details = document.createElement('details');
            if (idx < 2) details.open = true;
            const summary = document.createElement('summary');
            summary.textContent = table;
            const cols = document.createElement('div');
            cols.className = 'sql-schema-columns';
            grouped[table].forEach((col) => {
                const name = document.createElement('span');
                name.textContent = col.name;
                const type = document.createElement('span');
                type.textContent = col.type;
                cols.appendChild(name);
                cols.appendChild(type);
            });
            details.appendChild(summary);
            details.appendChild(cols);
            sqlSchemaList.appendChild(details);
        });
    }

    function getSqlText() {
        if (monacoEditor) {
            return monacoEditor.getValue().trim();
        }
        return sqlInput ? sqlInput.value.trim() : '';
    }

    function setSqlText(value) {
        if (monacoEditor) {
            monacoEditor.setValue(value);
            return;
        }
        if (sqlInput) sqlInput.value = value;
    }

    function initMonacoEditor() {
        if (!sqlEditorMonaco || !window.require) {
            if (sqlInput) sqlInput.classList.remove('hidden');
            return;
        }
        window.require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs' } });
        window.require(['vs/editor/editor.main'], () => {
            monacoEditor = monaco.editor.create(sqlEditorMonaco, {
                value: 'select * from v_institutions limit 50',
                language: 'sql',
                theme: currentTheme === 'light' ? 'vs' : 'vs-dark',
                minimap: { enabled: false },
                fontSize: 13,
                automaticLayout: true,
            });
            if (sqlInput) sqlInput.classList.add('hidden');
        });
    }

    function updateFxDisplay() {
        if (fxRateEl) {
            const formatted = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(fxUsdToKrw);
            fxRateEl.textContent = `USD/KRW ${formatted}`;
        }
        if (fxUpdatedEl) {
            const now = new Date();
            const time = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit' }).format(now);
            fxUpdatedEl.textContent = `${time} 기준`;
        }
    }

    function applyTheme(theme) {
        currentTheme = theme;
        document.body.dataset.theme = theme;
        document.querySelectorAll('[data-theme]').forEach(btn => btn.classList.toggle('active', btn.dataset.theme === theme));
        Chart.defaults.color = getCssVar('--text-primary');
        Chart.defaults.borderColor = getCssVar('--border-color');
        if (monacoEditor && window.monaco) {
            monaco.editor.setTheme(theme === 'light' ? 'vs' : 'vs-dark');
        }
        if (currentInstitutionId) {
            renderDashboard(currentInstitutionId);
        }
    }

    function setCurrency(currency) {
        displayCurrency = currency;
        document.querySelectorAll('[data-currency]').forEach(btn => btn.classList.toggle('active', btn.dataset.currency === currency));
        if (currentInstitutionId) {
            renderDashboard(currentInstitutionId);
        }
    }

    async function loadInstitutions() {
        const url = `${SUPABASE.url}/rest/v1/v_institutions?select=id,name,country_code,source`;
        const data = await supaFetch(url);
        liveInstitutions = (data || []).map(item => ({
            id: item.id,
            name: item.name,
            type: item.country_code === 'KR' ? 'domestic' : 'foreign',
            description: item.source === 'DART' ? '국내 공시 기반' : 'SEC 13F 기반',
        }));
    }

    async function loadInstitutionData(id) {
        const summaryUrl = `${SUPABASE.url}/rest/v1/v_institution_summary?institution_id=eq.${id}`;
        const holdingsUrl = `${SUPABASE.url}/rest/v1/v_institution_holdings_latest_enriched?institution_id=eq.${id}&order=value.desc&limit=2000`;
        const sectorsUrl = `${SUPABASE.url}/rest/v1/v_institution_sector_latest?institution_id=eq.${id}`;

        const [summary, holdings, sectors] = await Promise.all([
            supaFetch(summaryUrl),
            supaFetch(holdingsUrl),
            supaFetch(sectorsUrl),
        ]);

        liveSummary = summary && summary.length > 0 ? summary[0] : null;
        liveHoldings = holdings || [];
        liveSectors = sectors || [];
    }

    async function supaFetch(url) {
        if (!SUPABASE.url || !SUPABASE.anonKey) {
            return null;
        }
        const res = await fetch(url, {
            headers: {
                apikey: SUPABASE.anonKey,
                Authorization: `Bearer ${SUPABASE.anonKey}`,
            },
        });
        if (!res.ok) return null;
        return await res.json();
    }
});
