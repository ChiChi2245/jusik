document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const searchInput = document.getElementById('institution-search');
    const institutionGrid = document.getElementById('institution-grid');
    const portfolioDisplay = document.getElementById('portfolio-display');
    const portfolioTitle = document.getElementById('portfolio-title');
    const portfolioTableBody = document.querySelector('#portfolio-table tbody');
    const backBtn = document.getElementById('back-btn');
    const mainGridView = document.getElementById('main-grid-view');
    const filterButtons = document.getElementById('filter-buttons');
    const portfolioChartCanvas = document.getElementById('portfolio-chart');
    const assetAllocationChartCanvas = document.getElementById('asset-allocation-chart');
    const totalValueEl = document.getElementById('total-value');
    const stockCountEl = document.getElementById('stock-count');
    const topHoldingEl = document.getElementById('top-holding');
    const stockDetailDisplay = document.getElementById('stock-detail-display');
    const themeToggle = document.getElementById('theme-toggle');
    const themeLabel = document.querySelector('.theme-label');
    const currencyKrwBtn = document.getElementById('currency-krw');
    const currencyUsdBtn = document.getElementById('currency-usd');

    let portfolioChart = null;
    let assetAllocationChart = null;
    if (window.ChartDataLabels) {
        Chart.register(window.ChartDataLabels);
    }

    // --- State Management ---
    let displayCurrency = 'KRW';
    const exchangeRate = 1300; // 1 USD = 1300 KRW
    let currentInstitutionName = null;

    // --- Data ---
    const institutionalData = {
        "국민연금공단": { type: "국내 기관", country: "kr", logoUrl: 'https://www.nps.or.kr/images/common/logo_nps.png', asset_allocation: { domestic_stock: 45, international_stock: 35, bond: 15, alternative: 5 }, domestic_stocks: [ { name: "삼성전자", symbol: "005930", currency: "KRW", price: 83000, transactions: [{ date: "2023-11-15", shares_bought: 200000000, purchasePrice: 70000 }, { date: "2024-03-20", shares_bought: 320183321, purchasePrice: 75000 }] }, { name: "SK하이닉스", symbol: "000660", currency: "KRW", price: 230000, transactions: [{ date: "2023-10-05", shares_bought: 58832911, purchasePrice: 180000 }] } ], international_stocks: [] },
        "한국투자공사 (KIC)": { type: "국내 기관", country: "kr", logoUrl: 'https://www.kic.kr/images/common/logo.png', asset_allocation: { domestic_stock: 15, international_stock: 55, bond: 20, alternative: 10 }, domestic_stocks: [], international_stocks: [ { name: "Apple Inc.", symbol: "AAPL", currency: "USD", price: 214, transactions: [{ date: "2023-09-01", shares_bought: 15000000, purchasePrice: 180 }, { date: "2024-02-15", shares_bought: 5000000, purchasePrice: 190 }] }, { name: "NVIDIA Corp.", symbol: "NVDA", currency: "USD", price: 120, transactions: [{ date: "2023-05-20", shares_bought: 8000000, purchasePrice: 80 }] } ] },
        "사학연금": { type: "국내 기관", country: "kr", logoUrl: 'https://www.tp.or.kr/hp/2021_renew/img/common/logo.png', asset_allocation: { domestic_stock: 50, international_stock: 20, bond: 25, alternative: 5 }, domestic_stocks: [ { name: "POSCO홀딩스", symbol: "005490", currency: "KRW", price: 380000, transactions: [{ date: "2023-12-01", shares_bought: 1500000, purchasePrice: 420000 }] }, { name: "LG에너지솔루션", symbol: "373220", currency: "KRW", price: 350000, transactions: [{ date: "2024-01-20", shares_bought: 1000000, purchasePrice: 380000 }] } ], international_stocks: [] },
        "공무원연금공단": { type: "국내 기관", country: "kr", logoUrl: 'https://www.geps.or.kr/g/img/com/logo_c.png', asset_allocation: { domestic_stock: 30, international_stock: 15, bond: 50, alternative: 5 }, domestic_stocks: [ { name: "SK텔레콤", symbol: "017670", currency: "KRW", price: 52000, transactions: [{ date: "2023-11-01", shares_bought: 10000000, purchasePrice: 48000 }] }, { name: "KT&G", symbol: "033780", currency: "KRW", price: 90000, transactions: [{ date: "2023-09-15", shares_bought: 5000000, purchasePrice: 95000 }] } ], international_stocks: [] },
        "BlackRock Inc.": { type: "해외 기관", country: "us", logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/BlackRock_logo.svg/1000px-BlackRock_logo.svg.png', asset_allocation: { domestic_stock: 5, international_stock: 65, bond: 20, alternative: 10 }, domestic_stocks: [], international_stocks: [ { name: "Microsoft Corp.", symbol: "MSFT", currency: "USD", price: 449, transactions: [{ date: "2023-08-22", shares_bought: 983102931, purchasePrice: 380 }] }, { name: "Amazon.com, Inc.", symbol: "AMZN", currency: "USD", price: 185, transactions: [{ date: "2024-01-05", shares_bought: 450192010, purchasePrice: 150 }] } ] },
        "The Vanguard Group": { type: "해외 기관", country: "us", logoUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/Vanguard_Group_logo.svg/1000px-Vanguard_Group_logo.svg.png', asset_allocation: { domestic_stock: 5, international_stock: 60, bond: 30, alternative: 5 }, domestic_stocks: [], international_stocks: [ { name: "Johnson & Johnson", symbol: "JNJ", currency: "USD", price: 148, transactions: [{ date: "2023-07-15", shares_bought: 800000000, purchasePrice: 155 }] }, { name: "Procter & Gamble Co.", symbol: "PG", currency: "USD", price: 168, transactions: [{ date: "2023-09-10", shares_bought: 750000000, purchasePrice: 160 }] } ] },
    };

    // --- Helper Functions ---
    function formatCurrency(value, valueCurrency) {
        let convertedValue = value;
        if (displayCurrency === 'USD' && valueCurrency === 'KRW') {
            convertedValue = value / exchangeRate;
        } else if (displayCurrency === 'KRW' && valueCurrency === 'USD') {
            convertedValue = value * exchangeRate;
        }

        const options = {
            style: 'currency',
            currency: displayCurrency,
            minimumFractionDigits: displayCurrency === 'KRW' ? 0 : 2,
            maximumFractionDigits: displayCurrency === 'KRW' ? 0 : 2,
        };
        
        if (convertedValue >= 1e12) {
            return `${displayCurrency === 'KRW' ? '₩' : '$'}${(convertedValue / 1e12).toFixed(2)}T`;
        } else if (convertedValue >= 1e9) {
            return `${displayCurrency === 'KRW' ? '₩' : '$'}${(convertedValue / 1e9).toFixed(2)}B`;
        }

        return convertedValue.toLocaleString(displayCurrency === 'KRW' ? 'ko-KR' : 'en-US', options);
    }

    function getDomainFromStockName(name) { return name.toLowerCase().replace(/ inc\.| corp\.|, inc| co\.| ltd\.|, /g, '').replace(/[ .]/g, '') + '.com'; }
    function getAllHoldings(institution) {
        const domestic = institution.domestic_stocks || [];
        const international = institution.international_stocks || [];
        return [...domestic, ...international];
    }

    // --- Theme Logic ---
    function setTheme(theme) {
        document.body.classList.toggle('light-mode', theme === 'light');
        themeLabel.textContent = theme === 'light' ? '라이트 모드' : '다크 모드';
        localStorage.setItem('theme', theme);
        if (portfolioChart) portfolioChart.destroy();
        if (assetAllocationChart) assetAllocationChart.destroy();
        if (currentInstitutionName) {
             const institution = institutionalData[currentInstitutionName];
            const allHoldings = getAllHoldings(institution);
            const totalValue = allHoldings.reduce((acc, s) => acc + (s.totalShares * s.price * (s.currency === 'USD' ? exchangeRate : 1)), 0);
            renderPortfolioDonutChart(allHoldings, totalValue);
            if (institution.asset_allocation) renderAssetAllocationChart(institution.asset_allocation);
        }
    }

    // --- Main Logic ---
    function renderInstitutionCards(filter = 'all') {
        institutionGrid.innerHTML = '';
        Object.keys(institutionalData).sort().forEach(name => {
            const institution = institutionalData[name];
            if (filter === 'all' || institution.type === filter) {
                const card = createCard(name, institution);
                card.addEventListener('click', () => showPortfolio(name));
                institutionGrid.appendChild(card);
            }
        });
        filterInstitutions();
    }

    function createCard(name, institution) {
        const card = document.createElement('div');
        card.className = 'institution-card';
        card.dataset.name = name;
        card.innerHTML = `<div class="card-logo-container"><img src="${institution.logoUrl}" alt="${name} Logo" class="card-logo" onerror="this.style.display='none';"></div><div class="card-info"><h3>${name}</h3><p>${institution.type}</p></div><img src="https://flagcdn.com/w40/${institution.country.toLowerCase()}.png" alt="${institution.country} flag" class="card-flag">`;
        return card;
    }

    function filterInstitutions() {
        const query = searchInput.value.toLowerCase().trim();
        document.querySelectorAll('#institution-grid .institution-card').forEach(card => {
            card.style.display = card.dataset.name.toLowerCase().includes(query) ? 'flex' : 'none';
        });
    }

    function showPortfolio(name) {
        currentInstitutionName = name;
        hideStockDetail();
        mainGridView.classList.add('hidden');
        portfolioDisplay.classList.remove('hidden');
        
        const institution = institutionalData[name];
        portfolioTitle.textContent = `${name} 포트폴리오 분석`;
        
        const allHoldings = getAllHoldings(institution)
            .map(s => ({ ...s, totalShares: s.transactions.reduce((acc, t) => acc + t.shares_bought, 0) }))
            .sort((a, b) => (b.totalShares * b.price * (b.currency === 'USD' ? exchangeRate : 1)) - (a.totalShares * a.price * (a.currency === 'USD' ? exchangeRate : 1)));

        const totalValueInKRW = allHoldings.reduce((acc, s) => acc + (s.totalShares * s.price * (s.currency === 'USD' ? exchangeRate : 1)), 0);

        totalValueEl.textContent = formatCurrency(totalValueInKRW, 'KRW');
        stockCountEl.textContent = allHoldings.length;
        topHoldingEl.textContent = allHoldings.length > 0 ? allHoldings[0].name : '-';
        
        renderPortfolioTable(allHoldings, totalValueInKRW);
        renderPortfolioDonutChart(allHoldings, totalValueInKRW);
        if (institution.asset_allocation) {
            renderAssetAllocationChart(institution.asset_allocation);
        }
    }

    function renderPortfolioTable(holdings, totalValueInKRW) {
        portfolioTableBody.innerHTML = '';
        holdings.forEach((stock, index) => {
            const stockValueInKRW = stock.totalShares * stock.price * (stock.currency === 'USD' ? exchangeRate : 1);
            const percentage = totalValueInKRW > 0 ? (stockValueInKRW / totalValueInKRW * 100).toFixed(2) : 0;
            const row = document.createElement('tr');
            row.style.cursor = 'pointer';
            row.innerHTML = `<td><div class="stock-info"><img src="https://logo.clearbit.com/${getDomainFromStockName(stock.name)}" class="stock-logo" onerror="this.style.visibility='hidden';"><span>${stock.name} (${stock.symbol})</span></div></td><td>${stock.totalShares.toLocaleString()} 주</td><td><div class="weight-cell"><span>${percentage}%</span><div class="weight-bar-bg"><div class="weight-bar" style="width: ${percentage}%;"></div></div></div></td>`;
            row.addEventListener('mouseover', () => highlightChartSegment(index, true));
            row.addEventListener('mouseout', () => highlightChartSegment(index, false));
            row.addEventListener('click', () => showStockDetail(stock, row));
            portfolioTableBody.appendChild(row);
        });
    }

    function showStockDetail(stock, clickedRow) {
        document.querySelectorAll('#portfolio-table tbody tr').forEach(r => r.classList.remove('active'));
        clickedRow.classList.add('active');
        stockDetailDisplay.classList.remove('hidden');

        const totalShares = stock.transactions.reduce((acc, t) => acc + t.shares_bought, 0);
        const totalCost = stock.transactions.reduce((acc, t) => acc + (t.shares_bought * t.purchasePrice), 0);
        const avgPurchasePrice = totalShares > 0 ? totalCost / totalShares : 0;
        const currentValue = totalShares * stock.price;
        const totalReturnPercentage = totalCost > 0 ? (currentValue - totalCost) / totalCost * 100 : 0;

        let timelineHTML = stock.transactions.sort((a, b) => new Date(b.date) - new Date(a.date)).map(t => {
            const returnOnTx = (stock.price - t.purchasePrice) / t.purchasePrice * 100;
            const returnClass = returnOnTx >= 0 ? 'positive' : 'negative';
            return `<li class="transaction-item"><div class="transaction-date">${t.date}</div><div class="transaction-details"><span>매수: ${t.shares_bought.toLocaleString()} 주</span><span class="transaction-price">@ ${formatCurrency(t.purchasePrice, stock.currency)}</span></div><div class="transaction-return ${returnClass}">${returnOnTx.toFixed(2)}%</div></li>`;
        }).join('');

        const returnClass = totalReturnPercentage >= 0 ? 'positive' : 'negative';
        stockDetailDisplay.innerHTML = `
            <div class="stock-detail-header">
                <div class="stock-title-info"><img src="https://logo.clearbit.com/${getDomainFromStockName(stock.name)}" class="stock-logo-large" onerror="this.style.visibility='hidden';"><h3>${stock.name} 상세</h3></div>
                <button id="close-detail-btn">×</button>
            </div>
            <div class="stock-summary-cards">
                <div class="summary-card"><span class="summary-label">총 수익률</span><h3 class="${returnClass}">${totalReturnPercentage.toFixed(2)}%</h3></div>
                <div class="summary-card"><span class="summary-label">평균 매수가</span><h3>${formatCurrency(avgPurchasePrice, stock.currency)}</h3></div>
            </div>
            <div class="transaction-timeline"><h4>매매 이력</h4><ul>${timelineHTML}</ul></div>
        `;

        document.getElementById('close-detail-btn').addEventListener('click', hideStockDetail);
    }

    function hideStockDetail() {
        stockDetailDisplay.classList.add('hidden');
        document.querySelectorAll('#portfolio-table tbody tr').forEach(r => r.classList.remove('active'));
    }

    function highlightChartSegment(index, isHighlight) { if (portfolioChart) { portfolioChart.setActiveElements(isHighlight ? [{ datasetIndex: 0, index: index }] : []); portfolioChart.update(); } }

    function renderPortfolioDonutChart(holdings, totalValueInKRW) {
        if (portfolioChart) portfolioChart.destroy();
        const isLightMode = document.body.classList.contains('light-mode');
        const chartTextColor = isLightMode ? '#333' : '#fff';
        const chartBorderColor = isLightMode ? '#f4f7fa' : '#2c2c2f';

        portfolioChart = new Chart(portfolioChartCanvas.getContext('2d'), { 
            type: 'doughnut', 
            data: { 
                labels: holdings.map(s => s.name), 
                datasets: [{ data: holdings.map(s => s.totalShares * s.price * (s.currency === 'USD' ? exchangeRate : 1)), backgroundColor: ['#3498db','#e74c3c','#2ecc71','#9b59b6','#f1c40f','#1abc9c', '#34495e', '#e67e22', '#7f8c8d', '#27ae60'], borderColor: chartBorderColor, borderWidth: 5, hoverOffset: 15 }] 
            }, 
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '65%', 
                onHover: (e, el) => e.native.target.style.cursor = el[0] ? 'pointer' : 'default',
                plugins: { 
                    legend: { display: false }, 
                    title: { display: true, text: '보유 주식 비중', color: chartTextColor, font: { size: 16 } },
                    datalabels: { color: '#fff', textAlign: 'center', font: { family: 'Noto Sans KR', weight: 'bold', size: 12 }, formatter: (v, ctx) => { const p = (v / totalValueInKRW * 100); if (p < 5) return ''; return `${ctx.chart.data.labels[ctx.dataIndex]}\n${p.toFixed(1)}%`; }, textStrokeColor: '#000', textStrokeWidth: 2, anchor: 'center', align: 'center' } 
                } 
            } 
        });
    }

    function renderAssetAllocationChart(allocationData) {
        if (assetAllocationChart) assetAllocationChart.destroy();
        const isLightMode = document.body.classList.contains('light-mode');
        const chartTextColor = isLightMode ? '#333' : '#fff';
        const chartBorderColor = isLightMode ? '#f4f7fa' : '#2c2c2f';
        
        const total = Object.values(allocationData).reduce((a, b) => a + b, 0);
        assetAllocationChart = new Chart(assetAllocationChartCanvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['국내 주식', '해외 주식', '채권', '대체투자'],
                datasets: [{ data: Object.values(allocationData), backgroundColor: ['#007bff', '#28a745', '#ffc107', '#6f42c1'], borderColor: chartBorderColor, borderWidth: 5, hoverOffset: 15 }]
            },
            options: {
                responsive: true, maintainAspectRatio: false, cutout: '65%',
                plugins: {
                    legend: { display: false },
                    title: { display: true, text: '자산 배분', color: chartTextColor, font: { size: 16 } },
                    datalabels: { color: '#fff', textAlign: 'center', font: { family: 'Noto Sans KR', weight: 'bold', size: 12 }, formatter: (v, ctx) => { if (v < 5) return ''; return `${ctx.chart.data.labels[ctx.dataIndex]}\n${v}%`; }, textStrokeColor: '#000', textStrokeWidth: 2, anchor: 'center', align: 'center' }
                }
            }
        });
    }

    function showGrid() {
        if (portfolioChart) { portfolioChart.destroy(); portfolioChart = null; }
        if (assetAllocationChart) { assetAllocationChart.destroy(); assetAllocationChart = null; }
        portfolioDisplay.classList.add('hidden');
        mainGridView.classList.remove('hidden');
        hideStockDetail();
        currentInstitutionName = null;
    }

    // --- Event Listeners ---
    searchInput.addEventListener('input', filterInstitutions);
    backBtn.addEventListener('click', showGrid);
    filterButtons.addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            document.querySelector('.filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            renderInstitutionCards(e.target.dataset.filter);
        }
    });
    themeToggle.addEventListener('change', () => {
        setTheme(themeToggle.checked ? 'light' : 'dark');
    });
    currencyKrwBtn.addEventListener('click', () => {
        displayCurrency = 'KRW';
        currencyKrwBtn.classList.add('active');
        currencyUsdBtn.classList.remove('active');
        if (currentInstitutionName) showPortfolio(currentInstitutionName);
    });
    currencyUsdBtn.addEventListener('click', () => {
        displayCurrency = 'USD';
        currencyUsdBtn.classList.add('active');
        currencyKrwBtn.classList.remove('active');
        if (currentInstitutionName) showPortfolio(currentInstitutionName);
    });

    // --- Initial Render ---
    const savedTheme = localStorage.getItem('theme') || 'dark';
    themeToggle.checked = savedTheme === 'light';
    setTheme(savedTheme);
    renderInstitutionCards();
});
