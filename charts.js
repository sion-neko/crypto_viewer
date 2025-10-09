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

// 銘柄の過去1か月の価格履歴を取得（永続化強化版）
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

    // 永続化キャッシュチェック（24時間有効 - 古くなったら最新を取得）
    const cachedDataWithMeta = getCachedDataWithMetadata(cacheKey, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);
    if (cachedDataWithMeta) {
        const cachedData = cachedDataWithMeta.value;
        const cacheTimestamp = cachedDataWithMeta.timestamp;
        const cacheDate = new Date(cacheTimestamp);

        console.log(`📈 ${symbol}の価格履歴キャッシュを使用 (${cachedData.length}日分)`);

        console.log(`✅ ${symbol}価格履歴を永続キャッシュから取得 (${cachedData.length}日分)`);

        // キャッシュデータの最新性をチェック
        const latestDataDate = new Date(cachedData[cachedData.length - 1].date);
        const hoursOld = (Date.now() - latestDataDate.getTime()) / (1000 * 60 * 60);

        if (hoursOld < 6) {
            // 6時間以内のデータは新鮮とみなす
            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });



            showSuccessMessage(`${symbol}: キャッシュから表示\n${cacheTimeStr}保存`);
            return cachedData;
        } else {
            console.log(`⏰ ${symbol}価格履歴が古い (${Math.round(hoursOld)}時間前) - 最新データを取得中...`);
            showInfoMessage(`${symbol}: 価格データが古いため最新データを取得中...`);
        }
    } else {
        // フォールバック: 従来のキャッシュ取得を試行
        const fallbackCachedData = getCachedData(cacheKey, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);
        if (fallbackCachedData) {
            console.log(`✅ ${symbol}価格履歴をフォールバックキャッシュから取得 (${fallbackCachedData.length}日分)`);

            // キャッシュデータの最新性をチェック
            const latestDataDate = new Date(fallbackCachedData[fallbackCachedData.length - 1].date);
            const hoursOld = (Date.now() - latestDataDate.getTime()) / (1000 * 60 * 60);

            if (hoursOld < 6) {
                showSuccessMessage(`${symbol}: キャッシュから表示 (保存時刻不明)`);
                return fallbackCachedData;
            } else {
                console.log(`⏰ ${symbol}価格履歴が古い (${Math.round(hoursOld)}時間前) - 最新データを取得中...`);
                showInfoMessage(`${symbol}: 価格データが古いため最新データを取得中...`);
            }
        } else {
            console.log(`📡 ${symbol}価格履歴のキャッシュなし - 新規取得中...`);
            showInfoMessage(`${symbol}: 価格履歴を新規取得中...`);
        }
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

        // 永続キャッシュに保存（24時間有効）
        setCachedData(cacheKey, priceHistory, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);

        console.log(`✅ ${symbol}価格履歴を永続保存: ${priceHistory.length}日分 (24時間有効)`);

        // 成功時のトースト通知
        if (priceHistory.length > 0) {
            showSuccessMessage(`${symbol}: ${priceHistory.length}日分の価格履歴をキャッシュに保存しました`);
        }

        // 価格データレポート更新
        if (console.log) {
            const status = getPriceDataStatus();
            console.log(`💾 価格データ保存状況: ${status.priceHistories.length}銘柄, ${Math.round(status.totalCacheSize / 1024)}KB`);
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

// ===================================================================
// PRICE DATA PERSISTENCE FUNCTIONS
// ===================================================================

// 価格データ永続化設定
const PRICE_CACHE_CONFIG = {
    CURRENT_PRICES_DURATION: 30 * 60 * 1000,      // 現在価格: 30分
    PRICE_HISTORY_DURATION: 24 * 60 * 60 * 1000,  // 価格履歴: 24時間
    CHART_DATA_DURATION: 6 * 60 * 60 * 1000,      // チャートデータ: 6時間
    MAX_STORAGE_SIZE: 50 * 1024 * 1024,           // 最大50MB
    CLEANUP_THRESHOLD: 0.8                         // 80%使用時にクリーンアップ
};

// 永続化キャッシュ機能（強化版）
function getCachedData(key, duration = null) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                console.log(`📦 キャッシュヒット: ${key} (${Math.round((Date.now() - data.timestamp) / 1000 / 60)}分前)`);
                return data.value;
            } else {
                console.log(`⏰ キャッシュ期限切れ: ${key} (${Math.round((Date.now() - data.timestamp) / 1000 / 60)}分前)`);
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        // 破損したキャッシュを削除
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

// メタデータ付きキャッシュ取得（保存時刻情報付き）
function getCachedDataWithMetadata(key, duration = null) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                console.log(`📦 キャッシュヒット: ${key} (${Math.round((Date.now() - data.timestamp) / 1000 / 60)}分前)`);
                return {
                    value: data.value,
                    timestamp: data.timestamp,
                    duration: data.duration,
                    key: data.key
                };
            } else {
                console.log(`⏰ キャッシュ期限切れ: ${key} (${Math.round((Date.now() - data.timestamp) / 1000 / 60)}分前)`);
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        // 破損したキャッシュを削除
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

function setCachedData(key, value, duration = PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION) {
    try {
        // ストレージ使用量チェック
        checkStorageUsage();

        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration,
            key: key,
            size: JSON.stringify(value).length
        };

        const serializedData = JSON.stringify(data);
        localStorage.setItem(key, serializedData);

        console.log(`💾 キャッシュ保存: ${key} (${Math.round(serializedData.length / 1024)}KB, ${Math.round(duration / 1000 / 60)}分有効)`);

        // メタデータ更新
        updateCacheMetadata(key, data.size, duration);

    } catch (error) {
        console.error('キャッシュ保存エラー:', error);

        // ストレージ容量不足の場合、古いデータを削除して再試行
        if (error.name === 'QuotaExceededError') {
            console.log('🧹 ストレージ容量不足のため古いキャッシュを削除中...');
            cleanupOldCache();

            try {
                localStorage.setItem(key, JSON.stringify(data));
                console.log(`✅ キャッシュ保存成功（再試行）: ${key}`);
            } catch (retryError) {
                console.error('キャッシュ保存再試行失敗:', retryError);
                showWarningMessage('ストレージ容量不足のため、一部のデータが保存できませんでした');
            }
        }
    }
}

// ストレージ使用量監視
function checkStorageUsage() {
    try {
        // 概算使用量計算
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length;
            }
        }

        const usageRatio = totalSize / PRICE_CACHE_CONFIG.MAX_STORAGE_SIZE;

        if (usageRatio > PRICE_CACHE_CONFIG.CLEANUP_THRESHOLD) {
            console.log(`⚠️ ストレージ使用量: ${Math.round(usageRatio * 100)}% (${Math.round(totalSize / 1024 / 1024)}MB)`);
            cleanupOldCache();
        }

    } catch (error) {
        console.error('ストレージ使用量チェックエラー:', error);
    }
}

// 古いキャッシュデータのクリーンアップ
function cleanupOldCache() {
    try {
        const cacheKeys = [];
        const now = Date.now();

        // キャッシュキーを収集
        for (let key in localStorage) {
            if (key.includes('_price_history_') || key.includes('prices_') || key.includes('_chart_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    if (data.timestamp) {
                        cacheKeys.push({
                            key: key,
                            timestamp: data.timestamp,
                            age: now - data.timestamp,
                            size: localStorage[key].length
                        });
                    }
                } catch (e) {
                    // 破損したデータは削除対象
                    cacheKeys.push({
                        key: key,
                        timestamp: 0,
                        age: Infinity,
                        size: localStorage[key].length
                    });
                }
            }
        }

        // 古い順にソート
        cacheKeys.sort((a, b) => b.age - a.age);

        // 古いデータから削除（上位30%）
        const deleteCount = Math.ceil(cacheKeys.length * 0.3);
        let deletedSize = 0;

        for (let i = 0; i < deleteCount && i < cacheKeys.length; i++) {
            const item = cacheKeys[i];
            localStorage.removeItem(item.key);
            deletedSize += item.size;
            console.log(`🗑️ 古いキャッシュ削除: ${item.key} (${Math.round(item.age / 1000 / 60)}分前)`);
        }

        console.log(`✅ キャッシュクリーンアップ完了: ${deleteCount}件削除 (${Math.round(deletedSize / 1024)}KB解放)`);

    } catch (error) {
        console.error('キャッシュクリーンアップエラー:', error);
    }
}

// キャッシュメタデータ管理
function updateCacheMetadata(key, size, duration) {
    try {
        const metadata = JSON.parse(localStorage.getItem('cache_metadata') || '{}');
        metadata[key] = {
            size: size,
            duration: duration,
            lastAccess: Date.now()
        };
        localStorage.setItem('cache_metadata', JSON.stringify(metadata));
    } catch (error) {
        console.error('キャッシュメタデータ更新エラー:', error);
    }
}

// 価格データの永続化状態確認
function getPriceDataStatus() {
    const status = {
        currentPrices: null,
        priceHistories: [],
        totalCacheSize: 0,
        oldestData: null,
        newestData: null
    };

    try {
        // 現在価格データ
        const currentPricesKey = Object.keys(localStorage).find(key => key.startsWith('prices_'));
        if (currentPricesKey) {
            const data = JSON.parse(localStorage[currentPricesKey]);
            status.currentPrices = {
                key: currentPricesKey,
                timestamp: data.timestamp,
                age: Date.now() - data.timestamp,
                symbols: data.value._metadata?.symbols || []
            };
        }

        // 価格履歴データ
        for (let key in localStorage) {
            if (key.includes('_price_history_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    const symbol = key.split('_')[0].toUpperCase();
                    status.priceHistories.push({
                        symbol: symbol,
                        key: key,
                        timestamp: data.timestamp,
                        age: Date.now() - data.timestamp,
                        dataPoints: data.value?.length || 0
                    });

                    status.totalCacheSize += localStorage[key].length;

                    if (!status.oldestData || data.timestamp < status.oldestData.timestamp) {
                        status.oldestData = { key, timestamp: data.timestamp };
                    }
                    if (!status.newestData || data.timestamp > status.newestData.timestamp) {
                        status.newestData = { key, timestamp: data.timestamp };
                    }
                } catch (e) {
                    console.warn(`破損した価格履歴データ: ${key}`);
                }
            }
        }

    } catch (error) {
        console.error('価格データ状態確認エラー:', error);
    }

    return status;
}

// 価格データ永続化レポート表示
function showPriceDataReport() {
    const status = getPriceDataStatus();

    console.log('📊 価格データ永続化レポート:');
    console.log(`💾 総キャッシュサイズ: ${Math.round(status.totalCacheSize / 1024)}KB`);

    if (status.currentPrices) {
        console.log(`💰 現在価格: ${status.currentPrices.symbols.length}銘柄 (${Math.round(status.currentPrices.age / 1000 / 60)}分前)`);
    } else {
        console.log('💰 現在価格: なし');
    }

    console.log(`📈 価格履歴: ${status.priceHistories.length}銘柄`);
    status.priceHistories.forEach(history => {
        console.log(`  - ${history.symbol}: ${history.dataPoints}日分 (${Math.round(history.age / 1000 / 60 / 60)}時間前)`);
    });

    if (status.oldestData) {
        const oldestAge = Math.round((Date.now() - status.oldestData.timestamp) / 1000 / 60 / 60);
        console.log(`⏰ 最古データ: ${oldestAge}時間前`);
    }

    return status;
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

// 全銘柄の総合損益推移チャートを描画
async function renderAllSymbolsProfitChart() {
    console.log('🔄 renderAllSymbolsProfitChart called');

    const portfolioData = window.currentPortfolioData || currentPortfolioData;
    if (!portfolioData) {
        console.error('❌ Portfolio data not available');
        return;
    }

    const canvasId = 'all-symbols-profit-chart';
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`❌ Canvas element not found: ${canvasId}`);
        return;
    }

    try {
        // 保有銘柄を取得
        const symbols = portfolioData.summary
            .filter(item => item.holdingQuantity > 0)
            .map(item => item.symbol);

        if (symbols.length === 0) {
            showChartError(canvasId, '全銘柄', new Error('保有銘柄がありません'), [
                '現在保有している銘柄がないため、チャートを表示できません'
            ]);
            return;
        }

        console.log(`📊 Fetching price histories for ${symbols.length} symbols:`, symbols);
        showInfoMessage(`${symbols.length}銘柄の価格履歴を取得中...`);

        // 複数銘柄の価格履歴を並列取得
        const priceHistories = await fetchMultipleSymbolPriceHistories(symbols);

        // 成功した銘柄のみでチャートデータを生成
        const validSymbols = symbols.filter(symbol => priceHistories[symbol]);

        if (validSymbols.length === 0) {
            throw new Error('価格履歴を取得できた銘柄がありません');
        }

        console.log(`✅ Price histories obtained for ${validSymbols.length}/${symbols.length} symbols`);

        // 各銘柄の損益推移データを生成
        const allProfitData = {};
        validSymbols.forEach(symbol => {
            const symbolData = portfolioData.symbols[symbol];
            if (symbolData && symbolData.allTransactions) {
                const profitData = generateHistoricalProfitTimeSeries(
                    symbol,
                    symbolData.allTransactions,
                    priceHistories[symbol]
                );
                if (profitData && profitData.length > 0) {
                    allProfitData[symbol] = profitData;
                }
            }
        });

        if (Object.keys(allProfitData).length === 0) {
            throw new Error('損益データを生成できませんでした');
        }

        // 複数銘柄の損益推移チャートを表示
        displayMultiSymbolProfitChart(canvasId, allProfitData, '全銘柄総合損益推移（過去1か月）');

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

    if (!symbolSummary) {
        console.log(`⚠️ ${symbol}のポートフォリオデータが見つかりません`);
    } else if (currentPrice <= 0) {
        console.log(`⚠️ ${symbol}の現在価格が設定されていません`);
    }

    if (currentPrice > 0) {
        console.log(`💡 Using current price for ${symbol}: ¥${currentPrice.toLocaleString()}`);

        // 現在価格での損益推移チャートを生成
        const profitData = generateTotalProfitTimeSeries(symbol, symbolData.allTransactions, currentPrice);

        if (profitData && profitData.length > 0) {
            displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（取引履歴ベース）`);

            // 価格データの取得元を判定してメッセージを表示
            const lastPriceUpdate = window.lastPriceUpdate;

            // 現在価格キャッシュから保存時刻を取得を試行
            let priceSourceMessage = `${symbol}: 現在価格でチャート表示`;

            if (lastPriceUpdate) {
                const ageMinutes = Math.round((Date.now() - lastPriceUpdate.getTime()) / 1000 / 60);
                const updateTimeStr = lastPriceUpdate.toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                });

                if (ageMinutes < 30) {
                    priceSourceMessage = `${symbol}: 最新価格でチャート表示\n${updateTimeStr}取得`;
                } else {
                    priceSourceMessage = `${symbol}: キャッシュ価格でチャート表示\n${updateTimeStr}取得`;
                }
            } else {
                // 価格キャッシュから保存時刻を取得を試行
                try {
                    // 複数の可能なキャッシュキーを試行
                    const possibleKeys = [
                        `prices_${symbol.toLowerCase()}`,
                        `prices_${[symbol].sort().join('_')}`,
                        'currentPrices'
                    ];

                    let cachedPricesWithMeta = null;

                    // 各キーを試行
                    for (const key of possibleKeys) {
                        cachedPricesWithMeta = getCachedDataWithMetadata(key);
                        if (cachedPricesWithMeta) {
                            console.log(`💾 ${symbol}の価格キャッシュを発見`);
                            break;
                        }
                    }

                    if (cachedPricesWithMeta) {
                        const cacheDate = new Date(cachedPricesWithMeta.timestamp);
                        const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        });
                        priceSourceMessage = `${symbol}: キャッシュ価格でチャート表示\n${cacheTimeStr}保存`;
                    } else {
                        // フォールバック: 従来のlastPriceUpdateを確認
                        const savedLastUpdate = localStorage.getItem('lastPriceUpdate');
                        if (savedLastUpdate) {
                            try {
                                const updateDate = new Date(savedLastUpdate);
                                const updateTimeStr = updateDate.toLocaleString('ja-JP', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: 'numeric'
                                });
                                priceSourceMessage = `${symbol}: 保存済み価格でチャート表示\n${updateTimeStr}取得`;
                            } catch (dateError) {
                                priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                            }
                        } else {
                            priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                        }
                    }
                } catch (error) {
                    priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                }
            }

            showSuccessMessage(priceSourceMessage);

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

        // チャート描画成功時のトースト通知（データソース明記）
        if (profitData.length > 0) {
            // 価格履歴キャッシュの保存時刻を取得
            try {
                const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;
                const cachedDataWithMeta = getCachedDataWithMetadata(cacheKey);

                if (cachedDataWithMeta) {
                    const cacheDate = new Date(cachedDataWithMeta.timestamp);
                    const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                    });
                    showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示\n${cacheTimeStr}保存`);
                } else {
                    showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示 (保存時刻不明)`);
                }
            } catch (error) {
                showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示 (保存時刻不明)`);
            }
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
                    // フォールバック時も価格キャッシュの保存時刻を取得を試行
                    try {
                        const validSymbols = [symbol];
                        const cacheKey = `prices_${validSymbols.sort().join('_')}`;
                        const cachedPricesWithMeta = getCachedDataWithMetadata(cacheKey);

                        if (cachedPricesWithMeta) {
                            const cacheDate = new Date(cachedPricesWithMeta.timestamp);
                            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric'
                            });
                            showSuccessMessage(`${symbol}: フォールバック価格でチャート表示\n${cacheTimeStr}保存`);
                        } else {
                            showSuccessMessage(`${symbol}: フォールバック価格でチャート表示 (保存時刻不明)`);
                        }
                    } catch (error) {
                        showSuccessMessage(`${symbol}: フォールバック価格でチャート表示 (保存時刻不明)`);
                    }
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
                    // 売却時の実現損益を計算（売却前の加重平均価格を使用）
                    const sellProfit = tx.amount - (tx.quantity * weightedAvgPrice);
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
        let unrealizedProfit = 0;
        if (price > 0 && totalQuantity > 0.00000001 && weightedAvgPrice > 0) {
            const currentValue = totalQuantity * price;
            const holdingCost = totalQuantity * weightedAvgPrice;
            unrealizedProfit = currentValue - holdingCost;

            // 異常に大きな含み損益をチェック（デバッグ用）
            if (Math.abs(unrealizedProfit) > 1000000) {
                console.warn(`⚠️ Large unrealized profit detected for ${symbol}:`, {
                    date: targetDate.toISOString().split('T')[0],
                    totalQuantity,
                    price,
                    weightedAvgPrice,
                    currentValue,
                    holdingCost,
                    unrealizedProfit
                });
            }
        } else if (totalQuantity <= 0.00000001) {
            // 保有数量が極小の場合は含み損益を0にする
            unrealizedProfit = 0;
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

        // デバッグ用：異常な値をログ出力
        if (Math.abs(unrealizedProfit) > 100000 || Math.abs(totalProfit) > 500000) {
            console.log(`📊 ${symbol} ${targetDate.toISOString().split('T')[0]}:`, {
                holdingQuantity: totalQuantity.toFixed(8),
                avgPrice: Math.round(weightedAvgPrice),
                currentPrice: Math.round(price),
                realizedProfit: Math.round(realizedProfit),
                unrealizedProfit: Math.round(unrealizedProfit),
                totalProfit: Math.round(totalProfit)
            });
        }
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
                                // 大きな値は簡略表示
                                if (Math.abs(value) >= 1000000) {
                                    return '¥' + (value / 1000000).toFixed(1) + 'M';
                                } else if (Math.abs(value) >= 1000) {
                                    return '¥' + (value / 1000).toFixed(0) + 'K';
                                } else {
                                    return '¥' + value.toLocaleString();
                                }
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
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const dataPoint = profitData[context.dataIndex];
                                const datasetLabel = context.dataset.label;

                                if (datasetLabel === '総合損益 (¥)') {
                                    // 銘柄名をcanvasIdから取得
                                    const symbolMatch = canvasId.match(/^([a-z]+)-profit-chart$/);
                                    const symbolName = symbolMatch ? symbolMatch[1].toUpperCase() : 'SYMBOL';

                                    return [
                                        `� $有{(dataPoint.date instanceof Date ? dataPoint.date : new Date(dataPoint.date)).toLocaleDateString('ja-JP')}`,
                                        `� 平総合損益: ¥${Math.round(dataPoint.totalProfit || dataPoint.profit || 0).toLocaleString()}`,
                                        `　├ 実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`,
                                        `　└ 含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`,
                                        `📊 保有量: ${dataPoint.holdingQuantity.toFixed(6)} ${symbolName}`,
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

// 複数銘柄の損益推移チャート表示
function displayMultiSymbolProfitChart(canvasId, allProfitData, title) {
    console.log(`🎨 displayMultiSymbolProfitChart called for ${canvasId}`);

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas not found: ${canvasId}`);
        return;
    }

    const ctx = canvas.getContext('2d');

    // 既存のチャートインスタンスを破棄
    if (window.chartInstances && window.chartInstances[canvasId]) {
        window.chartInstances[canvasId].destroy();
    }

    // チャートインスタンス管理用のグローバルオブジェクト
    if (!window.chartInstances) {
        window.chartInstances = {};
    }

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
    Object.keys(allProfitData).forEach(symbol => {
        const profitData = allProfitData[symbol];
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
            label: `${symbol}`,
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
                            const sign = value >= 0 ? '+' : '';
                            return `${context.dataset.label}: ${sign}¥${Math.round(value).toLocaleString()}`;
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
                            const sign = value >= 0 ? '+' : '';
                            return `${sign}¥${Math.round(value).toLocaleString()}`;
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    };

    // チャートを作成
    window.chartInstances[canvasId] = new Chart(ctx, config);

    console.log(`✅ Multi-symbol profit chart displayed: ${canvasId} (${Object.keys(allProfitData).length} symbols)`);
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