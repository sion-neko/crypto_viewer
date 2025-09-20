// ===================================================================
// CHARTS.JS - Chart rendering and historical data functions
// ===================================================================

// Global variables for chart data
let historicalData = {};

// ===================================================================
// SYMBOL CHART FUNCTIONS
// ===================================================================

// 銘柄別チャート描画
function displaySymbolChart(symbol) {
    const canvas = document.getElementById(`${symbol.toLowerCase()}-chart-canvas`);
    if (!canvas) {
        return;
    }

    const ctx = canvas.getContext('2d');

    // 既存のチャートを削除
    const chartKey = `${symbol.toLowerCase()}TabChart`;
    if (window[chartKey]) {
        window[chartKey].destroy();
    }

    // データ準備 - 実データがある場合のみチャートを描画
    let chartData = [];
    if (historicalData[symbol] && Array.isArray(historicalData[symbol]) && historicalData[symbol].length > 0) {
        chartData = historicalData[symbol];
    } else {
        // 実データがない場合はローディング表示してから取得を試行

        // ローディング表示
        const container = canvas.parentElement;
        if (container && !container.querySelector('.loading-message')) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-message';
            loadingDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-size: 14px;
                z-index: 10;
            `;
            loadingDiv.innerHTML = `📊 ${symbol}の価格データを取得中...`;
            container.appendChild(loadingDiv);
        }

        fetchSymbolHistoricalData(symbol);
        return; // ここで終了し、データ取得完了後に再度この関数が呼ばれる
    }

    // 銘柄別の色設定
    const colors = {
        'BTC': { border: '#F7931A', bg: 'rgba(247, 147, 26, 0.1)' },
        'ETH': { border: '#627EEA', bg: 'rgba(98, 126, 234, 0.1)' },
        'SOL': { border: '#9945FF', bg: 'rgba(153, 69, 255, 0.1)' },
        'XRP': { border: '#23292F', bg: 'rgba(35, 41, 47, 0.1)' },
        'ADA': { border: '#0033AD', bg: 'rgba(0, 51, 173, 0.1)' },
        'DOGE': { border: '#C2A633', bg: 'rgba(194, 166, 51, 0.1)' },
        'ASTR': { border: '#0070F3', bg: 'rgba(0, 112, 243, 0.1)' },
        'XTZ': { border: '#2C7DF7', bg: 'rgba(44, 125, 247, 0.1)' },
        'XLM': { border: '#14B6E7', bg: 'rgba(20, 182, 231, 0.1)' },
        'SHIB': { border: '#FFA409', bg: 'rgba(255, 164, 9, 0.1)' },
        'PEPE': { border: '#00D924', bg: 'rgba(0, 217, 36, 0.1)' },
        'SUI': { border: '#4DA2FF', bg: 'rgba(77, 162, 255, 0.1)' },
        'DAI': { border: '#FBCC5F', bg: 'rgba(251, 204, 95, 0.1)' }
    };

    const color = colors[symbol] || { border: '#3498db', bg: 'rgba(52, 152, 219, 0.1)' };

    // ローディング表示を削除
    const container = canvas.parentElement;
    const loadingDiv = container?.querySelector('.loading-message');
    if (loadingDiv) {
        loadingDiv.remove();
    }

    // チャート作成
    window[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: `${symbol} 価格 (JPY)`,
                data: chartData,
                borderColor: color.border,
                backgroundColor: color.bg,
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: {
                            day: 'MM/dd'
                        }
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function(value) {
                            // SHIBとPEPEの場合は小数点以下の表示を調整
                            if (symbol === 'SHIB' || symbol === 'PEPE') {
                                if (value < 0.001) {
                                    return '¥' + value.toFixed(6);
                                } else if (value < 0.01) {
                                    return '¥' + value.toFixed(4);
                                } else if (value < 1) {
                                    return '¥' + value.toFixed(3);
                                } else {
                                    return '¥' + value.toFixed(2);
                                }
                            }
                            return '¥' + value.toLocaleString();
                        }
                    }
                }
            }
        }
    });

    // 履歴データを取得（まだない場合）
    if (!historicalData[symbol]) {
        fetchSymbolHistoricalData(symbol);
    }
}

// 銘柄別履歴データ取得
async function fetchSymbolHistoricalData(symbol) {
    const coingeckoId = SYMBOL_MAPPING[symbol];
    if (!coingeckoId) {
        return;
    }

    // キャッシュキーを生成
    const cacheKey = `chart_${symbol}_30days`;

    // キャッシュチェック
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        historicalData[symbol] = cachedData;
        displaySymbolChart(symbol);
        return;
    }

    try {
        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=30`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.prices) {
            const chartData = data.prices.map(([timestamp, price]) => ({
                x: new Date(timestamp),
                y: price  // Math.round()を削除して元の価格を保持
            }));

            // キャッシュに保存
            setCachedData(cacheKey, chartData, CACHE_DURATION_CHART);

            historicalData[symbol] = chartData;

            // チャートを再描画
            displaySymbolChart(symbol);
        }
    } catch (error) {
        console.error(`${symbol}履歴データ取得エラー:`, error);
    }
}