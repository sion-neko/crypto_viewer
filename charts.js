// ===================================================================
// CHARTS.JS - Chart rendering and historical data functions
// ===================================================================

// Global variables for chart data
let historicalData = {};
let profitChartInstance = null;

// API使用状況の監視
let apiCallCount = 0;
const API_CALL_LIMIT = 50; // CoinGecko無料プランの制限
let lastApiCall = 0;
const API_CALL_INTERVAL = 1200; // 1.2秒間隔（50回/分制限対応）
let apiCallResetTime = Date.now() + 60000; // 1分後にリセット

// API制限カウンターのリセット（1分ごと）
setInterval(() => {
    if (Date.now() > apiCallResetTime) {
        apiCallCount = 0;
        apiCallResetTime = Date.now() + 60000;
        console.log('🔄 API制限カウンターをリセットしました');
    }
}, 10000); // 10秒ごとにチェック

// ===================================================================
// PRICE HISTORY FUNCTIONS
// ===================================================================

// 銘柄の過去1か月の価格履歴を取得（汎用版）
async function fetchSymbolPriceHistory(symbol) {
    // api.jsのSYMBOL_MAPPINGを参照
    const SYMBOL_MAPPING = {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'XRP': 'ripple',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'ASTR': 'astar',
        'XTZ': 'tezos',
        'XLM': 'stellar',
        'SHIB': 'shiba-inu',
        'PEPE': 'pepe',
        'SUI': 'sui',
        'DAI': 'dai'
    };

    const coingeckoId = SYMBOL_MAPPING[symbol];
    if (!coingeckoId) {
        throw new Error(`${symbol}はサポートされていない銘柄です`);
    }

    const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;

    // キャッシュチェック（1時間有効）
    const cachedData = getCachedData(cacheKey, 60 * 60 * 1000);
    if (cachedData) {
        console.log(`${symbol}価格履歴をキャッシュから取得`);
        return cachedData;
    }

    try {
        // API制限チェック
        if (apiCallCount >= API_CALL_LIMIT) {
            throw new Error('API制限に達しました。しばらく時間をおいてからお試しください。');
        }

        // API呼び出し間隔制御
        const now = Date.now();
        const timeSinceLastCall = now - lastApiCall;
        if (timeSinceLastCall < API_CALL_INTERVAL) {
            const waitTime = API_CALL_INTERVAL - timeSinceLastCall;
            const waitSeconds = Math.ceil(waitTime / 1000);
            console.log(`⏳ API制限回避のため${waitTime}ms待機中...`);

            // 待機時間が1秒以上の場合はトースト表示
            if (waitSeconds >= 1) {
                showInfoMessage(`${symbol}: API制限回避のため${waitSeconds}秒待機中...`);
            }

            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // CoinGecko APIで過去30日の価格データを取得
        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=30&interval=daily`;

        // API呼び出し記録を更新
        apiCallCount++;
        lastApiCall = Date.now();
        console.log(`API呼び出し: ${apiCallCount}/${API_CALL_LIMIT} - ${symbol}価格履歴`);

        // タイムアウト付きでfetch実行
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error(`API制限に達しました (429 Too Many Requests)`);
            } else if (response.status === 403) {
                throw new Error(`APIアクセスが拒否されました (403 Forbidden)`);
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
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

        // 最新価格を現在価格として保存（API効率化）
        if (priceHistory.length > 0) {
            const latestPrice = priceHistory[priceHistory.length - 1].price;
            updateSymbolCurrentPrice(symbol, latestPrice);
        }

        // キャッシュに保存
        setCachedData(cacheKey, priceHistory, 60 * 60 * 1000);

        console.log(`${symbol}価格履歴を取得: ${priceHistory.length}日分`);

        // 成功時のトースト通知（控えめに、エラーが多い場合のみ）
        if (priceHistory.length > 0 && apiCallCount <= 3) {
            showSuccessMessage(`${symbol}: ${priceHistory.length}日分の価格履歴を取得`);
        }

        return priceHistory;

    } catch (error) {
        console.error(`${symbol}価格履歴取得エラー:`, error);

        // より詳細なエラー情報を提供
        if (error.name === 'AbortError') {
            throw new Error(`リクエストタイムアウト - サーバーの応答が遅すぎます`);
        } else if (error.message.includes('API制限に達しました') || error.message.includes('429')) {
            throw new Error(`API制限に達しました - 1分後に再度お試しください`);
        } else if (error.message.includes('403') || error.message.includes('CORS') || error.message.includes('blocked by CORS')) {
            throw new Error(`APIアクセスが制限されています - ブラウザの設定またはネットワーク環境を確認してください`);
        } else if (error.message.includes('API Error: 404')) {
            throw new Error(`${symbol}の価格データが見つかりません`);
        } else if (error.message.includes('API Error: 500')) {
            throw new Error(`CoinGecko APIサーバーエラー - しばらく時間をおいてお試しください`);
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error(`ネットワーク接続エラー - インターネット接続を確認してください`);
        } else {
            throw new Error(`価格履歴取得エラー: ${error.message}`);
        }
    }
}

// ETH専用関数（後方互換性のため）
async function fetchETHPriceHistory() {
    return await fetchSymbolPriceHistory('ETH');
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

// 銘柄の現在価格を更新（API効率化）
function updateSymbolCurrentPrice(symbol, price) {
    try {
        // currentPortfolioDataが利用可能な場合、現在価格を更新
        const portfolioData = window.currentPortfolioData;
        if (portfolioData && portfolioData.summary) {
            const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
            if (symbolSummary) {
                symbolSummary.currentPrice = price;

                // 含み損益も再計算
                if (symbolSummary.holdingQuantity > 0 && symbolSummary.averagePurchaseRate > 0) {
                    const currentValue = symbolSummary.holdingQuantity * price;
                    const holdingCost = symbolSummary.holdingQuantity * symbolSummary.averagePurchaseRate;
                    symbolSummary.currentValue = currentValue;
                    symbolSummary.unrealizedProfit = currentValue - holdingCost;
                    symbolSummary.totalProfit = symbolSummary.realizedProfit + symbolSummary.unrealizedProfit;
                }

                console.log(`${symbol}の現在価格を更新: ¥${price.toLocaleString()}`);
            }
        }
    } catch (error) {
        console.error('現在価格更新エラー:', error);
    }
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================

// 複数銘柄の価格履歴を効率的に取得
async function fetchMultipleSymbolPriceHistories(symbols) {
    const results = {};
    const promises = symbols.map(async (symbol) => {
        try {
            const priceHistory = await fetchSymbolPriceHistory(symbol);
            results[symbol] = priceHistory;
        } catch (error) {
            console.warn(`${symbol}の価格履歴取得をスキップ:`, error.message);
            results[symbol] = null;
        }
    });

    await Promise.all(promises);
    return results;
}

// 銘柄別損益推移チャートを描画（汎用版）
async function renderSymbolProfitChart(symbol) {
    console.log(`🔄 renderSymbolProfitChart called for ${symbol}`);

    // portfolio.jsのcurrentPortfolioDataを参照
    const portfolioData = window.currentPortfolioData || currentPortfolioData;
    if (!portfolioData) {
        console.error('❌ Portfolio data not available');
        return;
    }

    // 指定銘柄の取引データを取得
    const symbolData = portfolioData.symbols[symbol];
    if (!symbolData || !symbolData.allTransactions || symbolData.allTransactions.length === 0) {
        console.error(`❌ ${symbol} transaction data not found`);
        return;
    }

    const canvasId = `${symbol.toLowerCase()}-profit-chart`;
    console.log(`📊 Canvas ID: ${canvasId}`);

    // Canvas要素の存在確認
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`❌ Canvas element not found: ${canvasId}`);
        return;
    }

    // 現在価格ベースでのチャート表示（CORS回避）
    const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
    const currentPrice = symbolSummary ? symbolSummary.currentPrice : 0;
    
    if (currentPrice > 0) {
        console.log(`💡 Using current price for ${symbol}: ¥${currentPrice.toLocaleString()}`);
        
        // 現在価格での損益推移チャートを生成
        const profitData = generateTotalProfitTimeSeries(symbol, symbolData.allTransactions, currentPrice);
        
        if (profitData && profitData.length > 0) {
            displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（取引履歴ベース）`);
            showSuccessMessage(`${symbol}: 損益推移チャートを表示しました`);
            console.log(`✅ ${symbol} profit chart rendered successfully`);
            return;
        }
    }
    
    // 現在価格がない場合のエラー表示
    showChartError(canvasId, symbol, new Error('現在価格データがありません'), [
        '「価格更新」ボタンをクリックして現在価格を取得してください',
        '価格データ取得後にチャートが表示されます'
    ]);
    
    showWarningMessage(`${symbol}: 価格データがないためチャートを表示できません`);

    try {
        console.log(`📈 Fetching price history for ${symbol}...`);

        // 過去1か月の価格履歴を取得
        const priceHistory = await fetchSymbolPriceHistory(symbol);

        if (!priceHistory || priceHistory.length === 0) {
            throw new Error('価格履歴データを取得できませんでした');
        }

        console.log(`✅ Price history fetched: ${priceHistory.length} days`);

        // 時系列総合損益データを生成
        console.log(`🔢 Generating profit data...`);
        const profitData = generateHistoricalProfitTimeSeries(symbol, symbolData.allTransactions, priceHistory);

        console.log(`✅ Profit data generated: ${profitData.length} points`);

        // チャートを描画
        console.log(`🎨 Displaying chart...`);
        displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（過去1か月・日次）`);

        console.log(`✅ ${symbol} profit chart rendered successfully`);

        // チャート描画成功時のトースト通知（控えめに）
        if (profitData.length > 0) {
            showSuccessMessage(`${symbol}: 総合損益チャートを表示しました`);
        }

    } catch (error) {
        console.error(`${symbol}損益チャート描画エラー:`, error);

        // エラーの種類に応じてトースト通知を表示
        let toastMessage = '';
        let suggestions = [];

        if (error.message.includes('サポートされていない銘柄')) {
            toastMessage = `${symbol}は価格履歴チャートに対応していません`;
            suggestions = [
                '現在価格での損益は上記の統計で確認できます',
                '対応銘柄: BTC, ETH, SOL, XRP, ADA, DOGE, ASTR, XTZ, XLM, SHIB, PEPE, SUI, DAI'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('API制限') || error.message.includes('429')) {
            toastMessage = `${symbol}: API制限に達しました - 1分後に再度お試しください`;
            suggestions = [
                'API制限に達しました',
                '1分後に再度お試しください',
                'キャッシュされたデータがあれば使用されます'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('CORS') || error.message.includes('blocked')) {
            toastMessage = `${symbol}: ブラウザのセキュリティ制限により接続できません`;
            suggestions = [
                'ブラウザのCORS制限により接続できません',
                'HTTPSサイトでアクセスしてください',
                '現在価格での損益チャートを表示します'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('ネットワーク') || error.message.includes('Failed to fetch')) {
            toastMessage = `${symbol}: ネットワーク接続エラー - インターネット接続を確認してください`;
            suggestions = [
                'インターネット接続を確認してください',
                'VPNやプロキシを使用している場合は無効にしてください',
                '現在価格での損益チャートを表示します'
            ];
            showErrorMessage(toastMessage);
        } else if (error.message.includes('タイムアウト')) {
            toastMessage = `${symbol}: サーバーの応答が遅すぎます - しばらく時間をおいてお試しください`;
            suggestions = [
                'サーバーの応答が遅すぎます',
                'しばらく時間をおいて再度お試しください',
                '現在価格での損益チャートを表示します'
            ];
            showWarningMessage(toastMessage);
        } else {
            toastMessage = `${symbol}: チャート表示エラー - ${error.message}`;
            suggestions = [
                'ページを再読み込みしてお試しください',
                'ブラウザのコンソール(F12)で詳細を確認できます',
                '現在価格での損益チャートを表示します'
            ];
            showErrorMessage(toastMessage);
        }

        // 詳細なエラー表示（チャートエリア内）
        showChartError(canvasId, symbol, error, suggestions);

        // フォールバック: 現在価格のみでチャートを描画を試行
        try {
            const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
            const currentPrice = symbolSummary ? symbolSummary.currentPrice : 0;

            if (currentPrice > 0) {
                console.log(`🔄 Attempting fallback chart for ${symbol} with current price: ¥${currentPrice.toLocaleString()}`);
                const profitData = generateTotalProfitTimeSeries(symbol, symbolData.allTransactions, currentPrice);

                if (profitData && profitData.length > 0) {
                    displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（現在価格ベース）`);
                    console.log(`✅ Fallback chart displayed for ${symbol}`);
                    return; // フォールバック成功
                }
            }
        } catch (fallbackError) {
            console.error(`${symbol}フォールバックチャート描画エラー:`, fallbackError);
        }

        // フォールバックも失敗した場合は、価格更新を促すメッセージを追加
        if (!error.message.includes('サポートされていない銘柄')) {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.font = '12px Arial';
                ctx.fillStyle = '#28a745';
                ctx.textAlign = 'center';
                ctx.fillText('💡 「価格更新」ボタンをクリックして現在価格を取得してください', canvas.width / 2, canvas.height / 2 + 100);
            }
        }
    }
}

// ETH専用関数（後方互換性のため）
async function renderETHProfitChart() {
    return await renderSymbolProfitChart('ETH');
}

// 価格履歴を使った日次総合損益データを生成
function generateHistoricalProfitTimeSeries(symbol, transactions, priceHistory) {
    console.log(`🔢 Generating profit data for ${symbol}`);
    console.log(`📊 Transactions: ${transactions.length}, Price history: ${priceHistory.length}`);

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

    console.log(`✅ Generated ${dailyProfitData.length} profit data points`);
    if (dailyProfitData.length > 0) {
        console.log('📅 Sample data point:', {
            date: dailyProfitData[0].date,
            dateType: typeof dailyProfitData[0].date,
            isDate: dailyProfitData[0].date instanceof Date
        });
    }

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

// チャートエラー表示（詳細版）
function showChartError(canvasId, symbol, error, suggestions = []) {
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
    ctx.fillText(`${symbol}: ${error.message}`, canvas.width / 2, canvas.height / 2 - 10);

    // 提案の表示
    if (suggestions.length > 0) {
        ctx.font = '12px Arial';
        ctx.fillStyle = '#6c757d';
        suggestions.forEach((suggestion, index) => {
            ctx.fillText(`💡 ${suggestion}`, canvas.width / 2, canvas.height / 2 + 20 + (index * 20));
        });
    }

    // デバッグ情報（開発時のみ）
    if (console.log) {
        ctx.font = '10px Arial';
        ctx.fillStyle = '#adb5bd';
        ctx.fillText('詳細はブラウザのコンソール(F12)を確認してください', canvas.width / 2, canvas.height / 2 + 80);
    }
}

// 損益チャートを描画
function displayProfitChart(canvasId, profitData, title) {
    console.log(`🎨 displayProfitChart called for ${canvasId}`);
    console.log(`📊 Profit data points: ${profitData ? profitData.length : 0}`);

    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            throw new Error(`Canvas element not found: ${canvasId}`);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(`Cannot get 2D context for canvas: ${canvasId}`);
        }

        // 既存のチャートを削除
        if (profitChartInstance) {
            console.log('🗑️ Destroying existing chart instance');
            profitChartInstance.destroy();
        }

        // データが空の場合
        if (!profitData || profitData.length === 0) {
            console.warn('⚠️ No profit data available');
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

        console.log(`✅ Creating Chart.js instance with ${validDataPoints.length} valid data points...`);

        // Chart.jsでチャートを作成
        profitChartInstance = new Chart(ctx, {
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
                            callback: function (value) {
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
                            label: function (context) {
                                const dataPoint = profitData[context.dataIndex];
                                const datasetLabel = context.dataset.label;

                                if (datasetLabel === '総合損益 (¥)') {
                                    return [
                                        `📅 ${(dataPoint.date instanceof Date ? dataPoint.date : new Date(dataPoint.date)).toLocaleDateString('ja-JP')}`,
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

        console.log('✅ Chart.js instance created successfully');

    } catch (error) {
        console.error('❌ Chart creation failed:', error);
        showChartError(canvasId, 'チャート作成', error, [
            'Chart.jsライブラリが正しく読み込まれているか確認してください',
            'ブラウザを更新してお試しください',
            'データ形式に問題がある可能性があります'
        ]);
    }
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
                        callback: function (value) {
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