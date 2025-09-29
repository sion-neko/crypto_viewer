// ===================================================================
// CHARTS.JS - Chart rendering and historical data functions
// ===================================================================

// Global variables for chart data
let historicalData = {};
let profitChartInstance = null;

// ===================================================================
// PRICE HISTORY FUNCTIONS
// ===================================================================

// ETHの過去1か月の価格履歴を取得
async function fetchETHPriceHistory() {
    const cacheKey = 'eth_price_history_30d';
    
    // キャッシュチェック（1時間有効）
    const cachedData = getCachedData(cacheKey, 60 * 60 * 1000);
    if (cachedData) {
        console.log('ETH価格履歴をキャッシュから取得');
        return cachedData;
    }

    try {
        // CoinGecko APIで過去30日の価格データを取得
        const url = 'https://api.coingecko.com/api/v3/coins/ethereum/market_chart?vs_currency=jpy&days=30&interval=daily';
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.prices || data.prices.length === 0) {
            throw new Error('価格データが空です');
        }

        // データを整形
        const priceHistory = data.prices.map(([timestamp, price]) => ({
            date: new Date(timestamp),
            price: price
        }));

        // キャッシュに保存
        setCachedData(cacheKey, priceHistory, 60 * 60 * 1000);
        
        console.log(`ETH価格履歴を取得: ${priceHistory.length}日分`);
        return priceHistory;

    } catch (error) {
        console.error('ETH価格履歴取得エラー:', error);
        throw error;
    }
}

// キャッシュ機能（charts.js用）
function getCachedData(key, duration) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < duration) {
                return data.value;
            }
            localStorage.removeItem(key);
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
    }
    return null;
}

function setCachedData(key, value, duration) {
    try {
        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration
        };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('キャッシュ保存エラー:', error);
    }
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================

// ETH損益推移チャートを描画
async function renderETHProfitChart() {
    // portfolio.jsのcurrentPortfolioDataを参照
    const portfolioData = window.currentPortfolioData || currentPortfolioData;
    if (!portfolioData) {
        console.log('Portfolio data not available');
        return;
    }

    // ETHの取引データを取得
    const ethData = portfolioData.symbols['ETH'];
    if (!ethData || !ethData.allTransactions || ethData.allTransactions.length === 0) {
        console.log('ETH transaction data not found');
        return;
    }

    // ローディング表示
    showLoadingMessage('eth-profit-chart', 'ETHの価格履歴を取得中...');

    try {
        // 過去1か月のETH価格履歴を取得
        const priceHistory = await fetchETHPriceHistory();
        
        if (!priceHistory || priceHistory.length === 0) {
            throw new Error('価格履歴データを取得できませんでした');
        }

        // 時系列総合損益データを生成
        const profitData = generateHistoricalProfitTimeSeries('ETH', ethData.allTransactions, priceHistory);
        
        // チャートを描画
        displayProfitChart('eth-profit-chart', profitData, 'ETH総合損益推移（過去1か月・日次）');
        
    } catch (error) {
        console.error('ETH損益チャート描画エラー:', error);
        showErrorMessage('ETH価格履歴の取得に失敗しました: ' + error.message);
        
        // フォールバック: 現在価格のみでチャートを描画
        const ethSummary = portfolioData.summary.find(item => item.symbol === 'ETH');
        const currentPrice = ethSummary ? ethSummary.currentPrice : 0;
        const profitData = generateTotalProfitTimeSeries('ETH', ethData.allTransactions, currentPrice);
        displayProfitChart('eth-profit-chart', profitData, 'ETH総合損益推移（現在価格ベース）');
    }
}

// 価格履歴を使った日次総合損益データを生成
function generateHistoricalProfitTimeSeries(symbol, transactions, priceHistory) {
    // 取引を日付順にソート
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // 各日付での保有状況を計算
    const dailyProfitData = [];
    
    priceHistory.forEach(pricePoint => {
        const targetDate = pricePoint.date;
        const price = pricePoint.price;
        
        // この日付までの取引を集計
        let realizedProfit = 0;
        let totalQuantity = 0;
        let weightedAvgPrice = 0;
        let totalBought = 0;
        let totalSold = 0;
        
        sortedTransactions.forEach(tx => {
            const txDate = new Date(tx.date);
            
            // この日付以前の取引のみを考慮
            if (txDate <= targetDate) {
                if (tx.type === '買') {
                    // 加重平均価格を更新
                    const newTotalValue = (totalQuantity * weightedAvgPrice) + (tx.quantity * tx.rate);
                    totalQuantity += tx.quantity;
                    weightedAvgPrice = totalQuantity > 0 ? newTotalValue / totalQuantity : 0;
                    totalBought += tx.amount;
                } else if (tx.type === '売') {
                    // 売却時の実現損益を計算
                    const sellProfit = tx.amount - (tx.quantity * weightedAvgPrice);
                    realizedProfit += sellProfit;
                    totalQuantity -= tx.quantity;
                    totalSold += tx.amount;
                }
            }
        });
        
        // 含み損益を計算
        let unrealizedProfit = 0;
        if (price > 0 && totalQuantity > 0 && weightedAvgPrice > 0) {
            const currentValue = totalQuantity * price;
            const holdingCost = totalQuantity * weightedAvgPrice;
            unrealizedProfit = currentValue - holdingCost;
        }
        
        // 総合損益 = 実現損益 + 含み損益
        const totalProfit = realizedProfit + unrealizedProfit;
        
        dailyProfitData.push({
            date: targetDate,
            realizedProfit: realizedProfit,
            unrealizedProfit: unrealizedProfit,
            totalProfit: totalProfit,
            totalBought: totalBought,
            totalSold: totalSold,
            holdingQuantity: totalQuantity,
            avgPrice: weightedAvgPrice,
            currentPrice: price
        });
    });
    
    return dailyProfitData;
}

// 総合損益推移の時系列データを生成（実現損益 + 含み損益）- 旧版
function generateTotalProfitTimeSeries(symbol, transactions, currentPrice) {
    // 取引を日付順にソート
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
    
    const profitData = [];
    let realizedProfit = 0; // 実現損益
    let totalBought = 0;
    let totalSold = 0;
    let weightedAvgPrice = 0;
    let totalQuantity = 0;
    
    sortedTransactions.forEach(tx => {
        const date = new Date(tx.date);
        
        if (tx.type === '買') {
            // 加重平均価格を更新
            const newTotalValue = (totalQuantity * weightedAvgPrice) + (tx.quantity * tx.rate);
            totalQuantity += tx.quantity;
            weightedAvgPrice = totalQuantity > 0 ? newTotalValue / totalQuantity : 0;
            totalBought += tx.amount;
        } else if (tx.type === '売') {
            // 売却時の実現損益を計算
            const sellProfit = tx.amount - (tx.quantity * weightedAvgPrice);
            realizedProfit += sellProfit;
            totalQuantity -= tx.quantity;
            totalSold += tx.amount;
        }
        
        // 含み損益を計算（現在価格が利用可能な場合）
        let unrealizedProfit = 0;
        if (currentPrice > 0 && totalQuantity > 0 && weightedAvgPrice > 0) {
            const currentValue = totalQuantity * currentPrice;
            const holdingCost = totalQuantity * weightedAvgPrice;
            unrealizedProfit = currentValue - holdingCost;
        }
        
        // 総合損益 = 実現損益 + 含み損益
        const totalProfit = realizedProfit + unrealizedProfit;
        
        profitData.push({
            date: date,
            realizedProfit: realizedProfit,
            unrealizedProfit: unrealizedProfit,
            totalProfit: totalProfit,
            totalBought: totalBought,
            totalSold: totalSold,
            holdingQuantity: totalQuantity,
            avgPrice: weightedAvgPrice,
            currentPrice: currentPrice
        });
    });
    
    return profitData;
}

// 旧関数（後方互換性のため残す）
function generateProfitTimeSeries(symbol, transactions) {
    return generateTotalProfitTimeSeries(symbol, transactions, 0);
}

// ローディング表示
function showLoadingMessage(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// 損益チャートを描画
function displayProfitChart(canvasId, profitData, title) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.log(`Canvas ${canvasId} not found`);
        return;
    }

    const ctx = canvas.getContext('2d');

    // 既存のチャートを削除
    if (profitChartInstance) {
        profitChartInstance.destroy();
    }

    // データが空の場合
    if (!profitData || profitData.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#666';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('取引データがありません', canvas.width / 2, canvas.height / 2);
        return;
    }

    // Chart.jsでチャートを作成
    profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: profitData.map(d => d.date.toLocaleDateString('ja-JP')),
            datasets: [
                {
                    label: '総合損益 (¥)',
                    data: profitData.map(d => Math.round(d.totalProfit || d.profit || 0)),
                    borderColor: profitData[profitData.length - 1].totalProfit >= 0 ? '#28a745' : '#dc3545',
                    backgroundColor: profitData[profitData.length - 1].totalProfit >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                    borderWidth: 3,
                    fill: true,
                    tension: 0.1
                },
                {
                    label: '実現損益 (¥)',
                    data: profitData.map(d => Math.round(d.realizedProfit || d.profit || 0)),
                    borderColor: '#17a2b8',
                    backgroundColor: 'rgba(23, 162, 184, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    borderDash: [5, 5]
                },
                {
                    label: '含み損益 (¥)',
                    data: profitData.map(d => Math.round(d.unrealizedProfit || 0)),
                    borderColor: '#ffc107',
                    backgroundColor: 'rgba(255, 193, 7, 0.1)',
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1,
                    borderDash: [2, 2]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    display: true,
                    position: 'top'
                }
            },
            scales: {
                x: {
                    display: true,
                    title: {
                        display: true,
                        text: '日付'
                    }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: '損益 (¥)'
                    },
                    ticks: {
                        callback: function(value) {
                            return '¥' + value.toLocaleString();
                        }
                    }
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const dataPoint = profitData[context.dataIndex];
                            const datasetLabel = context.dataset.label;
                            
                            if (datasetLabel === '総合損益 (¥)') {
                                return [
                                    `📅 ${dataPoint.date.toLocaleDateString('ja-JP')}`,
                                    `💰 総合損益: ¥${Math.round(dataPoint.totalProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　├ 実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　└ 含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`,
                                    `📊 保有量: ${dataPoint.holdingQuantity.toFixed(6)} ETH`,
                                    `📈 平均価格: ¥${Math.round(dataPoint.avgPrice).toLocaleString()}`,
                                    `💹 その日の価格: ¥${Math.round(dataPoint.currentPrice || 0).toLocaleString()}`
                                ];
                            } else if (datasetLabel === '実現損益 (¥)') {
                                return `実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`;
                            } else if (datasetLabel === '含み損益 (¥)') {
                                return `含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`;
                            }
                            
                            return `${datasetLabel}: ¥${context.parsed.y.toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });
}

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