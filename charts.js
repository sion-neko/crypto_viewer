// ===================================================================
// CHARTS.JS - Chart rendering and historical data functions
// ===================================================================

// Note: All cache management is handled by CacheService in storage-utils.js (window.cache)
// Note: Chart instances are managed by window.chartInstances

// ===================================================================
// CONFIGURATION (from AppConfig)
// ===================================================================

// キャッシュ設定を AppConfig から取得
const PRICE_CACHE_CONFIG = AppConfig.cacheDurations;

// 銘柄別の色設定を AppConfig から取得
const COIN_NAME_COLORS = AppConfig.coinColors;

// デフォルトの色を AppConfig から取得
const DEFAULT_COIN_NAME_COLOR = AppConfig.defaultCoinColor;

// ===================================================================
// DOM ELEMENT ID MANAGEMENT
// ===================================================================

/**
 * チャート関連のDOM要素IDを管理するクラス
 * デバイス（モバイル/デスクトップ）に応じて適切なIDを返す
 */
class ChartElementIds {
    /**
     * チャートモード切替ボタンのIDを取得
     * @returns {string} 要素ID
     */
    static getToggleButton() {
        return isMobile() ? 'mobile-chart-mode-toggle' : 'chart-mode-toggle';
    }

    /**
     * チャートタイトル要素のIDを取得
     * @returns {string} 要素ID
     */
    static getTitle() {
        return isMobile() ? 'mobile-chart-title' : 'chart-title';
    }

    /**
     * チャートキャンバス要素のIDを取得
     * @returns {string} 要素ID
     */
    static getCanvas() {
        return isMobile() ? 'mobile-all-coinNames-profit-chart' : 'all-coinNames-profit-chart';
    }
}

// ===================================================================
// PRICE HISTORY FUNCTIONS
// ===================================================================

// 銘柄の過去1か月の価格履歴を取得
async function fetchCoinNamePriceHistory(coinName) {
    const coingeckoId = AppConfig.coinGeckoMapping[coinName];
    // TODO: サポートしていない銘柄を自動でサポートするようにする
    if (!coingeckoId) {
        showWarningMessage(`${coinName}はサポートされていない銘柄です`);
        throw new Error(`${coinName}はサポートされていません`);
    }

    // キャッシュから取得
    const cacheKey = cacheKeys.priceHistory(coinName);
    const cachedData = cache.get(cacheKey);

    // キャッシュがあれば返す
    if (cachedData) {
        return cachedData;
    }

    // キャッシュがない場合はAPIを実行してデータを取得
    // CoinGecko APIで過去30日の価格データを取得（API実行は共通関数に委譲）
    const data = await executePriceHistoryApi(coingeckoId, {
        vsCurrency: 'jpy',
        days: 30,
        interval: 'daily',
        timeoutMs: 10000
    });

    if (!data.prices || data.prices.length === 0) {
        showErrorMessage(`${coinName}の価格データを取得できませんでした`);
        throw new Error('価格データが空です');
    }

    // データを整形
    const priceHistory = data.prices.map(([timestamp, price]) => ({
        date: new Date(timestamp),
        price: price
    }));

    // 永続キャッシュに保存
    cache.set(cacheKey, priceHistory, PRICE_CACHE_CONFIG.PRICE_HISTORY);

    return priceHistory;    
}

// ===================================================================
// CHART FORMATTING AND CONFIGURATION HELPERS
// ===================================================================

/**
 * 銘柄に応じた価格フォーマット関数
 * @param {number} value - フォーマット対象の価格値
 * @returns {string} フォーマットされた価格文字列
 */
function formatPriceValue(value) {
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

/**
 * 損益値のフォーマット関数（大きな値を簡略表示）
 * @param {number} value - フォーマット対象の損益値
 * @returns {string} フォーマットされた損益文字列
 */
function formatProfitValue(value) {
    if (Math.abs(value) >= 1000000) {
        return '¥' + (value / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(value) >= 1000) {
        return '¥' + (value / 1000).toFixed(0) + 'K';
    } else {
        return '¥' + value.toLocaleString();
    }
}

/**
 * 損益値の符号付きフォーマット関数
 * @param {number} value - フォーマット対象の損益値
 * @returns {string} 符号付きでフォーマットされた損益文字列
 */
function formatSignedProfitValue(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}¥${Math.round(value).toLocaleString()}`;
}

/**
 * 銘柄別価格チャートのオプションを生成
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createCoinNamePriceChartOptions() {
    return {
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
                    callback: function (value) {
                        return formatPriceValue(value);
                    }
                }
            }
        }
    };
}

/**
 * 単一銘柄の損益推移チャートのオプションを生成
 * @param {string} title - チャートタイトル
 * @param {Array} profitData - 損益データ配列
 * @param {string} canvasId - キャンバス要素のID（オプション）
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createProfitChartOptions(title, profitData, canvasId = '') {
    // 銘柄名を取得（canvasIdが提供されている場合）
    const coinNameMatch = canvasId ? canvasId.match(/^([a-z]+)-profit-chart$/) : null;
    const coinName = coinNameMatch ? coinNameMatch[1].toUpperCase() : 'COIN_NAME';

    return {
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
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const dataPoint = profitData[context.dataIndex];
                        const datasetLabel = context.dataset.label;

                        if (datasetLabel === '総合損益 (¥)') {
                            // 詳細情報を含むツールチップ
                            if (dataPoint.holdingQuantity !== undefined && dataPoint.avgPrice !== undefined) {
                                return [
                                    `📅 ${(dataPoint.date instanceof Date ? dataPoint.date : new Date(dataPoint.date)).toLocaleDateString('ja-JP')}`,
                                    `💰 総合損益: ¥${Math.round(dataPoint.totalProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　├ 実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　└ 含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`,
                                    `📊 保有量: ${dataPoint.holdingQuantity.toFixed(6)} ${coinName}`,
                                    `📈 平均価格: ¥${Math.round(dataPoint.avgPrice).toLocaleString()}`,
                                    `💹 その日の価格: ¥${Math.round(dataPoint.currentPrice || 0).toLocaleString()}`
                                ];
                            }
                            // シンプルな表示
                            return [
                                `${datasetLabel}: ${formatSignedProfitValue(dataPoint.totalProfit || 0)}`,
                                `  実現: ${formatSignedProfitValue(dataPoint.realizedProfit || 0)}`,
                                `  含み: ${formatSignedProfitValue(dataPoint.unrealizedProfit || 0)}`
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
                    callback: function (value) {
                        return formatProfitValue(value);
                    }
                },
                // Y軸の範囲を自動調整（異常値を除外）
                beforeUpdate: function (scale) {
                    if (profitData && profitData.length > 0) {
                        const allValues = [];
                        profitData.forEach(d => {
                            allValues.push(d.totalProfit || 0);
                            allValues.push(d.realizedProfit || 0);
                            allValues.push(d.unrealizedProfit || 0);
                        });

                        // 異常値を除外（上位・下位5%を除く）
                        allValues.sort((a, b) => a - b);
                        const p5 = Math.floor(allValues.length * 0.05);
                        const p95 = Math.floor(allValues.length * 0.95);
                        const filteredValues = allValues.slice(p5, p95);

                        if (filteredValues.length > 0) {
                            const min = Math.min(...filteredValues);
                            const max = Math.max(...filteredValues);
                            const range = max - min;
                            const padding = range * 0.1;

                            scale.options.min = min - padding;
                            scale.options.max = max + padding;
                        }
                    }
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };
}

/**
 * 複数銘柄の損益推移チャートのオプションを生成
 * @param {string} title - チャートタイトル
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createMultiCoinNameProfitChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: title,
                font: {
                    size: 16,
                    weight: 'bold'
                },
                color: '#2c3e50'
            },
            legend: {
                display: true,
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 15,
                    font: {
                        size: 11
                    }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        const value = context.parsed.y;
                        if (value === null) return null;
                        return `${context.dataset.label}: ${formatSignedProfitValue(value)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: '日付',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: '損益 (¥)',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                },
                ticks: {
                    callback: function (value) {
                        return formatSignedProfitValue(value);
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================

// 複数銘柄の価格履歴を並列取得
async function fetchMultipleCoinNamePriceHistories(coinNames) {
    const results = {};
    const promises = coinNames.map(async (coinName) => {
        try {
            const priceHistory = await fetchCoinNamePriceHistory(coinName);
            results[coinName] = priceHistory;
        } catch (error) {
            results[coinName] = null;
        }
    });

    await Promise.all(promises);
    return results;
}

/**
 * ポートフォリオの全銘柄の価格履歴を取得
 * @param {object} portfolioData - ポートフォリオデータ
 * @returns {Promise<{priceHistories: object, validCoinNames: string[]}>}
 * @throws {Error} 保有銘柄がない、または価格履歴を取得できた銘柄がない場合
 */
async function fetchPriceHistoriesForPortfolio(portfolioData) {
    const coinNames = portfolioData.summary.map(item => item.coinName);

    if (coinNames.length === 0) {
        throw new Error('保有銘柄がありません');
    }

    showInfoMessage(`${coinNames.length}銘柄の価格履歴を取得中...`);

    const priceHistories = await fetchMultipleCoinNamePriceHistories(coinNames);
    const validCoinNames = coinNames.filter(coinName => priceHistories[coinName]);

    if (validCoinNames.length === 0) {
        throw new Error('価格履歴を取得できた銘柄がありません');
    }

    return { priceHistories, validCoinNames };
}

// 価格履歴を使った日次総合損益データを生成
function generateHistoricalProfitTimeSeries(transactions, priceHistory) {

    // 取引を日付順にソート
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 各日付での保有状況を計算
    const dailyProfitData = [];

    priceHistory.forEach(pricePoint => {
        const targetDate = pricePoint.date instanceof Date ? pricePoint.date : new Date(pricePoint.date);
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
                    const result = calculateWeightedAverage(totalQuantity, weightedAvgPrice, tx.quantity, tx.rate);
                    totalQuantity = result.totalQty;
                    weightedAvgPrice = result.weightedAvgPrice;
                    totalBought += tx.amount;
                } else if (tx.type === '売') {
                    // 売却時の実現損益を計算（売却前の加重平均価格を使用）
                    const sellProfit = calculateRealizedProfit(tx.amount, tx.quantity, weightedAvgPrice);
                    realizedProfit += sellProfit;

                    // 保有数量を減らす（加重平均価格は変更しない）
                    totalQuantity -= tx.quantity;
                    totalSold += tx.amount;

                    // 保有数量が0以下になった場合、加重平均価格をリセット
                    if (totalQuantity <= 0) {
                        totalQuantity = 0;
                        weightedAvgPrice = 0;
                    }
                }
            }
        });

        // 含み損益を計算
        const unrealizedProfit = totalQuantity > 0.00000001
            ? calculateUnrealizedProfit(totalQuantity, price, weightedAvgPrice)
            : 0;

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

// 全銘柄の損益データを合計して統合損益推移を生成
function generateCombinedProfitTimeSeries(allProfitData) {
    
    // 全銘柄の日付を統合してソート
    const allDates = new Set();
    Object.values(allProfitData).forEach(profitData => {
        profitData.forEach(point => {
            allDates.add(point.date.toDateString());
        });
    });

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    
    // 日付ごとに全銘柄の損益を合計
    const combinedData = sortedDates.map(dateStr => {
        const targetDate = new Date(dateStr);
        let totalRealizedProfit = 0;
        let totalUnrealizedProfit = 0;
        let totalProfit = 0;
        let totalHoldingQuantity = 0;
        let totalCurrentValue = 0;

        Object.keys(allProfitData).forEach(coinName => {
            const profitData = allProfitData[coinName];
            const point = profitData.find(p => p.date.toDateString() === dateStr);
            
            if (point) {
                totalRealizedProfit += point.realizedProfit || 0;
                totalUnrealizedProfit += point.unrealizedProfit || 0;
                totalProfit += point.totalProfit || 0;
                
                // 保有量と評価額の合計（参考値）
                totalHoldingQuantity += point.holdingQuantity || 0;
                totalCurrentValue += (point.holdingQuantity || 0) * (point.currentPrice || 0);
            }
        });

        return {
            date: targetDate,
            realizedProfit: totalRealizedProfit,
            unrealizedProfit: totalUnrealizedProfit,
            totalProfit: totalProfit,
            holdingQuantity: totalHoldingQuantity, // 参考値（単位が異なるため）
            avgPrice: totalHoldingQuantity > 0 ? totalCurrentValue / totalHoldingQuantity : 0,
            currentPrice: 0 // 合計では意味がないため0
        };
    });

    return combinedData;
}

// 全銘柄の総合損益推移チャートを描画
async function renderAllCoinNamesProfitChart(portfolioData, chartMode) {
    // ChartElementIdsを使用してcanvasIdを取得
    const canvasId = ChartElementIds.getCanvas();

    try {
        // ポートフォリオの価格履歴を取得（エラーハンドリング含む）
        const { priceHistories, validCoinNames } = await fetchPriceHistoriesForPortfolio(portfolioData);

        // 各銘柄の損益推移データを生成
        const allProfitData = {};
        validCoinNames.forEach(coinName => {
            const coinNameData = portfolioData.coins[coinName];
            
            if (coinNameData && coinNameData.allTransactions) {
                const profitData = generateHistoricalProfitTimeSeries(
                    coinNameData.allTransactions,
                    priceHistories[coinName]
                );
                if (profitData && profitData.length > 0) {
                    allProfitData[coinName] = profitData;
                }
            } 
        });
        
        
        if (chartMode === 'combined') {
            // 全銘柄の合計損益推移チャートを表示
            const combinedProfitData = generateCombinedProfitTimeSeries(allProfitData);
            displayProfitChart(canvasId, combinedProfitData, 'ポートフォリオ総合損益推移（過去1か月）');
        } else {
            // 複数銘柄の個別損益推移チャートを表示
            displayMultiCoinNameProfitChart(canvasId, allProfitData, '全銘柄個別損益推移（過去1か月）');
        }

        const successCount = Object.keys(allProfitData).length;
        showSuccessMessage(`${successCount}銘柄の損益推移チャートを表示しました`);

    } catch (error) {
        console.error('全銘柄損益チャート描画エラー:', error);

        showChartError(canvasId, '全銘柄', error, [
            '一部の銘柄で価格履歴を取得できませんでした',
            'しばらく時間をおいて再度お試しください'
        ]);

        showErrorMessage(`全銘柄チャート表示失敗: ${error.message}`);
    }
}


// チャートエラー表示（詳細版）
function showChartError(canvasId, coinName, error, suggestions = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // エラーの種類に応じて色とアイコンを設定
    let color = '#dc3545';
    let icon = '❌';
    let title = 'チャート表示エラー';

    if (error.message.includes('サポートされていない銘柄')) {
        color = '#6c757d';
        icon = '⚠️';
        title = '対応していない銘柄';
    } else if (error.message.includes('価格履歴データを取得できませんでした')) {
        color = '#ffc107';
        icon = '📡';
        title = 'データ取得エラー';
    } else if (error.message.includes('API Error')) {
        color = '#fd7e14';
        icon = '🌐';
        title = 'API接続エラー';
    }

    // エラー表示
    ctx.fillStyle = color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${icon} ${title}`, canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = '14px Arial';
    ctx.fillStyle = '#495057';
    ctx.fillText(`${coinName}: ${error.message}`, canvas.width / 2, canvas.height / 2 - 10);

    // 提案の表示
    if (suggestions.length > 0) {
        ctx.font = '12px Arial';
        ctx.fillStyle = '#6c757d';
        suggestions.forEach((suggestion, index) => {
            ctx.fillText(`💡 ${suggestion}`, canvas.width / 2, canvas.height / 2 + 20 + (index * 20));
        });
    }


}

// 損益チャートを描画
function displayProfitChart(canvasId, profitData, title) {

    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            throw new Error(`Canvas element not found: ${canvasId}`);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(`Cannot get 2D context for canvas: ${canvasId}`);
        }

        // 既存のチャートインスタンスを破棄
        destroyChartSafely(canvasId);

        // データが空の場合
        if (!profitData || profitData.length === 0) {
            showChartError(canvasId, 'データなし', new Error('取引データがありません'), [
                '取引履歴が存在しない可能性があります',
                'CSVファイルに該当銘柄のデータが含まれているか確認してください'
            ]);
            return;
        }

        // データの妥当性チェック
        const validDataPoints = profitData.filter(d => d && d.date && typeof d.totalProfit === 'number');
        if (validDataPoints.length === 0) {
            throw new Error('有効なデータポイントがありません');
        }


        // Chart.jsでチャートを作成
        window.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: profitData.map(d => {
                    const date = d.date instanceof Date ? d.date : new Date(d.date);
                    return date.toLocaleDateString('ja-JP');
                }),
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
            options: createProfitChartOptions(title, profitData, canvasId)
        });


    } catch (error) {
        console.error('❌ Chart creation failed:', error);
        showChartError(canvasId, 'チャート作成', error, [
            'Chart.jsライブラリが正しく読み込まれているか確認してください',
            'ブラウザを更新してお試しください',
            'データ形式に問題がある可能性があります'
        ]);
    }
}

// 複数銘柄の損益推移チャート表示
function displayMultiCoinNameProfitChart(canvasId, allProfitData, title) {

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas not found: ${canvasId}`);
        return;
    }

    const ctx = canvas.getContext('2d');

    // 既存のチャートインスタンスを破棄
    destroyChartSafely(canvasId);

    // 全銘柄の日付を統合してソート
    const allDates = new Set();
    Object.values(allProfitData).forEach(profitData => {
        profitData.forEach(point => {
            allDates.add(point.date.toDateString());
        });
    });

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    const labels = sortedDates.map(dateStr => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    // 銘柄ごとのデータセットを作成
    const datasets = [];
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400'
    ];

    let colorIndex = 0;
    Object.keys(allProfitData).forEach(coinName => {
        const profitData = allProfitData[coinName];
        const color = colors[colorIndex % colors.length];

        // 日付ごとの損益データを作成
        const data = sortedDates.map(dateStr => {
            const point = profitData.find(p => p.date.toDateString() === dateStr);
            return point ? point.totalProfit : null;
        });

        // 最終損益で線の太さを調整
        const finalProfit = data[data.length - 1] || 0;
        const borderWidth = Math.abs(finalProfit) > 10000 ? 3 : 2;

        datasets.push({
            label: `${coinName}`,
            data: data,
            borderColor: color,
            backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            borderWidth: borderWidth,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true
        });

        colorIndex++;
    });

    // チャート設定
    const config = {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: createMultiCoinNameProfitChartOptions(title)
    };

    // チャートを作成
    window.chartInstances[canvasId] = new Chart(ctx, config);

}

// ===================================================================
// COIN_NAME CHART FUNCTIONS
// ===================================================================

// 銘柄別チャート描画
async function displayCoinNameChart(coinName) {
    const canvas = document.getElementById(`${coinName.toLowerCase()}-chart-canvas`);
    if (!canvas) {
        return;
    }

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
        loadingDiv.innerHTML = `📊 ${coinName}の価格データを取得中...`;
        container.appendChild(loadingDiv);
    }

    // データを取得
    const chartData = await fetchCoinNameHistoricalData(coinName);

    // データ検証
    if (!Array.isArray(chartData) || chartData.length === 0) {

        // ローディング表示を削除
        let loadingDiv = container?.querySelector('.loading-message');
        if (loadingDiv) {
            loadingDiv.remove();
        }

        // エラーメッセージをチャートエリアに表示
        if (container && !container.querySelector('.chart-error-message')) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'chart-error-message';
            errorDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                color: #e74c3c;
                font-size: 16px;
                z-index: 10;
                padding: 20px;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 80%;
            `;
            errorDiv.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                <div style="font-weight: bold; margin-bottom: 8px;">${coinName} 価格データを取得できませんでした</div>
                <div style="font-size: 14px; color: #666;">ネットワーク接続を確認してください</div>
            `;
            container.appendChild(errorDiv);
        }

        return;
    }

    const chartKey = `${coinName.toLowerCase()}-chart-canvas`;

    // 既存のチャートを削除（新しいデータがある場合のみ）
    destroyChartSafely(chartKey);

    // 既存のエラーメッセージとローディング表示を削除
    const existingError = container?.querySelector('.chart-error-message');
    if (existingError) {
        existingError.remove();
    }
    const loadingDiv = container?.querySelector('.loading-message');
    if (loadingDiv) {
        loadingDiv.remove();
    }

    // 銘柄の色を取得
    const color = COIN_NAME_COLORS[coinName] || DEFAULT_COIN_NAME_COLOR;

    const ctx = canvas.getContext('2d');
    // チャート作成
    window.chartInstances[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: `${coinName} 価格 (JPY)`,
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
        options: createCoinNamePriceChartOptions()
    });

}

// 銘柄別履歴データ取得 (using CacheService)
async function fetchCoinNameHistoricalData(coinName) {
    // AppConfig から銘柄マッピングを取得
    const coingeckoId = AppConfig.coinGeckoMapping[coinName];

    if (!coingeckoId) {
        throw new Error(`${coinName}はサポートされていません`);
    }

    // キャッシュキーを生成
    const cacheKey = cacheKeys.chartData(coinName, 30);

    // キャッシュチェック
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
        return cachedData;
    }

    try {
        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=30`;

        const response = await fetch(url);
        const data = await response.json();

        if (data.prices) {
            const chartData = data.prices.map(([timestamp, price]) => ({
                x: new Date(timestamp),
                y: price
            }));

            // キャッシュに保存（6時間）
            cache.set(cacheKey, chartData, PRICE_CACHE_CONFIG.CHART_DATA);

            return chartData;
        }

        return [];
    } catch (error) {
        console.error(`${coinName}履歴データ取得エラー:`, error);
        return [];
    }
}
// チャート
// 表示モードを切り替える（デスクトップ/モバイル統合版）
function toggleChartMode(currentMode = 'combined') {
    const newMode = (currentMode === 'combined') ? 'individual' : 'combined';

    // ChartElementIdsを使用してDOM要素を取得
    const toggleButton = document.getElementById(ChartElementIds.getToggleButton());
    const chartTitle = document.getElementById(ChartElementIds.getTitle());

    window.portfolioChartMode = newMode;
    safeSetJSON('portfolioChartMode', newMode);

    if (newMode === 'combined') {
        toggleButton.textContent = '個別表示';
        toggleButton.title = '各銘柄を個別に表示';
        chartTitle.textContent = '📈 ポートフォリオ総合損益推移（過去1か月）';
    } else {
        toggleButton.textContent = '合計表示';
        toggleButton.title = 'ポートフォリオ全体の合計を表示';
        chartTitle.textContent = '📈 各銘柄の個別損益推移（過去1か月）';
    }

    // チャートを再描画
    // storage-utils.jsのCacheServiceを使用してポートフォリオデータを取得
    const portfolioData = window.cache.getPortfolioData();
    if (portfolioData) {
        renderAllCoinNamesProfitChart(portfolioData, newMode);
    } else {
        console.error('Portfolio data not available for chart rendering');
        showErrorMessage('チャート表示エラー: ポートフォリオデータが利用できません');
    }

}

// 関数を即座にグローバルに登録
window.toggleChartMode = toggleChartMode;
window.renderAllCoinNamesProfitChart = renderAllCoinNamesProfitChart;