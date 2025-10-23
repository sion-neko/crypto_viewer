// ===================================================================
// API.JS - Price fetching and CoinGecko API related functions
// ===================================================================

// Global variables for price data (use window object to avoid conflicts)
if (!window.appPriceData) {
    window.appPriceData = {
        currentPrices: {},
        lastPriceUpdate: null
    };
}

// 後方互換性のためのエイリアス
let currentPrices = window.appPriceData.currentPrices;
let lastPriceUpdate = window.appPriceData.lastPriceUpdate;

// 価格データ永続化設定
const CACHE_DURATION_PRICE = 30 * 60 * 1000; // 30分
const CACHE_DURATION_HISTORY = 24 * 60 * 60 * 1000; // 24時間

// 銘柄マッピング（CoinGecko API用）
// グローバルスコープに公開して他のファイルから参照可能にする
window.SYMBOL_MAPPING = {
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

// ローカル参照用のエイリアス
const SYMBOL_MAPPING = window.SYMBOL_MAPPING;

// ===================================================================
// PRICE FETCHING FUNCTIONS
// ===================================================================

// 価格取得関連機能
async function fetchCurrentPrices() {
    try {
        if (typeof debugLog === 'function') {
            debugLog('🔄 fetchCurrentPrices called');
        }

        // ポートフォリオデータの存在確認を強化
        if (!currentPortfolioData) {
            // localStorageから再読み込みを試行
            const storedData = localStorage.getItem('portfolioData');
            if (storedData) {
                currentPortfolioData = JSON.parse(storedData);
            } else {
                throw new Error('ポートフォリオデータが見つかりません。先にCSVファイルをアップロードしてください。');
            }
        }

        if (!currentPortfolioData.summary || currentPortfolioData.summary.length === 0) {
            throw new Error('ポートフォリオサマリーデータが見つかりません');
        }

        // 対応銘柄のCoinGecko IDを取得
        const portfolioSymbols = currentPortfolioData.summary.map(item => item.symbol);
        const validSymbols = portfolioSymbols.filter(symbol => SYMBOL_MAPPING[symbol]);

        if (typeof debugLog === 'function') {
            debugLog('📊 Valid symbols for price fetch:', validSymbols);
        }

        if (validSymbols.length === 0) {
            throw new Error('対応銘柄が見つかりません');
        }

        // まず価格履歴キャッシュから現在価格を取得を試行（API効率化）
        const pricesFromHistory = await tryGetPricesFromHistory(validSymbols);
        if (pricesFromHistory && Object.keys(pricesFromHistory).length === validSymbols.length) {
            if (typeof debugLog === 'function') {
                debugLog('✅ All prices obtained from history cache');
            }
            window.appPriceData.currentPrices = pricesFromHistory;
            currentPrices = pricesFromHistory;
            window.appPriceData.lastPriceUpdate = new Date();
            lastPriceUpdate = window.appPriceData.lastPriceUpdate;

            updatePortfolioWithPrices(currentPortfolioData, currentPrices);
            sortPortfolioData(currentSortField, currentSortDirection);
            const tableContainer = document.getElementById('portfolio-table-container');
            tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

            // サマリー部分も更新（総合損益反映のため）
            updateDataStatus(currentPortfolioData);

            // 更新されたポートフォリオデータを保存
            localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

            showSuccessMessage(`キャッシュから表示: ${validSymbols.length}銘柄\n価格履歴データより`);
            updatePriceStatus();
            return;
        }

        // 永続化キャッシュキーを生成
        const cacheKey = `prices_${validSymbols.sort().join('_')}`;

        // 永続化キャッシュチェック（30分有効）
        const cachedPricesWithMeta = getCachedDataWithMetadata(cacheKey, CACHE_DURATION_PRICE);
        if (cachedPricesWithMeta) {
            const cachedPrices = cachedPricesWithMeta.value;
            const cacheTimestamp = cachedPricesWithMeta.timestamp;
            const cacheDate = new Date(cacheTimestamp);

            window.appPriceData.currentPrices = cachedPrices;
            currentPrices = cachedPrices;
            window.appPriceData.lastPriceUpdate = new Date(cachedPrices._metadata?.lastUpdate || cacheTimestamp);
            lastPriceUpdate = window.appPriceData.lastPriceUpdate;

            updatePortfolioWithPrices(currentPortfolioData, currentPrices);

            // 現在のソート順を維持してテーブル再描画
            sortPortfolioData(currentSortField, currentSortDirection);
            const tableContainer = document.getElementById('portfolio-table-container');
            tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

            // サマリー部分も更新（総合損益反映のため）
            updateDataStatus(currentPortfolioData);

            // 更新されたポートフォリオデータを保存
            localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

            // 永続キャッシュから取得した場合の通知（保存時刻付き）
            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });

            console.log(`💰 価格キャッシュを使用: ${validSymbols.length}銘柄`);

            showSuccessMessage(`キャッシュから表示: ${validSymbols.length}銘柄\n${cacheTimeStr}保存`);
            updatePriceStatus();
            return;
        } else {
            // フォールバック: 従来のキャッシュ取得を試行
            const fallbackCachedPrices = getCachedData(cacheKey, CACHE_DURATION_PRICE);
            if (fallbackCachedPrices) {
                if (typeof debugLog === 'function') {
                    debugLog(`✅ フォールバック価格キャッシュから取得`);
                }

                window.appPriceData.currentPrices = fallbackCachedPrices;
                currentPrices = fallbackCachedPrices;
                window.appPriceData.lastPriceUpdate = new Date(fallbackCachedPrices._metadata?.lastUpdate || Date.now());
                lastPriceUpdate = window.appPriceData.lastPriceUpdate;

                updatePortfolioWithPrices(currentPortfolioData, currentPrices);
                sortPortfolioData(currentSortField, currentSortDirection);
                const tableContainer = document.getElementById('portfolio-table-container');
                tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);
                updateDataStatus(currentPortfolioData);
                localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

                showSuccessMessage(`キャッシュから表示: ${validSymbols.length}銘柄\n保存時刻不明`);
                updatePriceStatus();
                return;
            }
        }

        // API取得開始の通知
        showInfoMessage('価格データを取得中...');

        const coingeckoIds = validSymbols.map(symbol => SYMBOL_MAPPING[symbol]).join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=jpy&include_last_updated_at=true`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // データを整理
        const prices = {};
        for (const symbol of validSymbols) {
            const coingeckoId = SYMBOL_MAPPING[symbol];
            if (data[coingeckoId]) {
                prices[symbol] = {
                    price_jpy: data[coingeckoId].jpy,
                    last_updated: data[coingeckoId].last_updated_at
                };
            }
        }

        // メタデータ追加
        prices._metadata = {
            lastUpdate: Date.now(),
            symbols: validSymbols
        };

        // 永続化キャッシュに保存（30分有効）
        setCachedData(cacheKey, prices, CACHE_DURATION_PRICE);

        // グローバル変数に保存
        window.appPriceData.currentPrices = prices;
        currentPrices = prices;
        window.appPriceData.lastPriceUpdate = new Date();
        lastPriceUpdate = window.appPriceData.lastPriceUpdate;

        // 従来のlocalStorageにも保存（後方互換性）
        localStorage.setItem('currentPrices', JSON.stringify(prices));
        localStorage.setItem('lastPriceUpdate', window.appPriceData.lastPriceUpdate.toISOString());

        if (typeof debugLog === 'function') {
            debugLog(`💾 価格データを永続保存: ${validSymbols.length}銘柄 (30分有効)`);
        }

        // ポートフォリオデータを再計算（含み損益含む）
        updatePortfolioWithPrices(currentPortfolioData, prices);

        // 現在のソート順を維持してテーブル再描画
        sortPortfolioData(currentSortField, currentSortDirection);
        const tableContainer = document.getElementById('portfolio-table-container');
        tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

        // サマリー部分も更新（総合損益反映のため）
        updateDataStatus(currentPortfolioData);

        // 更新されたポートフォリオデータを保存
        localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

        // 成功通知を表示（永続化情報付き）
        showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄 (30分間保存)`);
        updatePriceStatus();

        // 価格データ永続化レポート（デバッグモード時のみ）
        if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
            setTimeout(() => showPriceDataReport(), 1000);
        }

    } catch (error) {
        console.error('価格取得エラー:', error);
        // エラー通知を表示
        showErrorMessage(`価格取得失敗: ${error.message}`);
        updatePriceStatus('取得失敗');
    }
}

// 価格履歴キャッシュから現在価格を取得（API効率化）
async function tryGetPricesFromHistory(symbols) {
    const prices = {};
    let successCount = 0;

    for (const symbol of symbols) {
        try {
            const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;
            const cachedHistory = getCachedData(cacheKey);

            if (cachedHistory && cachedHistory.length > 0) {
                const latestPrice = cachedHistory[cachedHistory.length - 1].price;
                prices[symbol] = {
                    price_jpy: latestPrice,
                    last_updated_at: Date.now() / 1000
                };
                successCount++;
                if (typeof debugLog === 'function') {
                    debugLog(`📈 ${symbol} price from history: ¥${latestPrice.toLocaleString()}`);
                }
            }
        } catch (error) {
            console.warn(`Failed to get ${symbol} price from history:`, error);
        }
    }

    if (successCount > 0) {
        prices._metadata = {
            lastUpdate: Date.now(),
            symbols: Object.keys(prices).filter(key => key !== '_metadata'),
            source: 'price_history_cache'
        };
        return prices;
    }

    return null;
}

// 価格データでポートフォリオを更新（含み損益計算）
function updatePortfolioWithPrices(portfolioData, prices) {
    let totalUnrealizedProfit = 0;

    portfolioData.summary.forEach(item => {
        // 価格データが存在する場合
        if (prices[item.symbol]) {
            const currentPrice = prices[item.symbol].price_jpy;
            item.currentPrice = currentPrice;

            // 保有量が正の場合のみ含み損益を計算
            if (item.holdingQuantity > 0 && item.averagePurchaseRate > 0) {
                const currentValue = item.holdingQuantity * currentPrice;
                // 現在保有分の投資額 = 保有数量 × 平均購入レート
                const currentHoldingCost = item.holdingQuantity * item.averagePurchaseRate;
                const unrealizedProfit = currentValue - currentHoldingCost;

                // デバッグログ（開発時のみ）
                console.log(`${item.symbol} 含み損益計算:`, {
                    holdingQuantity: item.holdingQuantity,
                    currentPrice: currentPrice,
                    averagePurchaseRate: item.averagePurchaseRate,
                    currentValue: currentValue,
                    currentHoldingCost: currentHoldingCost,
                    unrealizedProfit: unrealizedProfit
                });

                // 含み損益を追加
                item.currentValue = currentValue;
                item.unrealizedProfit = unrealizedProfit;
                item.totalProfit = item.realizedProfit + unrealizedProfit;

                totalUnrealizedProfit += unrealizedProfit;
            } else {
                // 保有量が0以下の場合（完全売却済み）
                item.currentValue = 0;
                item.unrealizedProfit = 0;
                item.totalProfit = item.realizedProfit;
            }
        } else {
            // 価格データがない場合
            item.currentPrice = 0;
            item.currentValue = 0;
            item.unrealizedProfit = 0;
            item.totalProfit = item.realizedProfit;
        }
    });

    // 統計に含み損益と総合損益を追加
    portfolioData.stats.totalUnrealizedProfit = totalUnrealizedProfit;
    portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit + totalUnrealizedProfit;

    // 総合損益に基づく追加統計
    portfolioData.stats.totalProfitableSymbols = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) > 0).length;
    portfolioData.stats.totalLossSymbols = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) < 0).length;
    portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
        (portfolioData.stats.totalProfit / portfolioData.stats.totalInvestment) * 100 : 0;

    console.log('📊 Portfolio stats updated:', {
        totalRealizedProfit: Math.round(portfolioData.stats.totalRealizedProfit),
        totalUnrealizedProfit: Math.round(totalUnrealizedProfit),
        totalProfit: Math.round(portfolioData.stats.totalProfit),
        totalProfitMargin: portfolioData.stats.overallTotalProfitMargin.toFixed(2) + '%',
        totalProfitableSymbols: portfolioData.stats.totalProfitableSymbols,
        totalLossSymbols: portfolioData.stats.totalLossSymbols
    });

    // 各銘柄の総合損益も確認（デバッグモード時のみ）
    if (typeof debugLog === 'function') {
        debugLog('💰 Symbol total profits:', portfolioData.summary.map(s => ({
            symbol: s.symbol,
            realized: Math.round(s.realizedProfit),
            unrealized: Math.round(s.unrealizedProfit || 0),
            total: Math.round(s.totalProfit || s.realizedProfit)
        })));
    }
}

// 保存済み価格データを復元
function loadSavedPrices() {
    try {
        const savedPrices = localStorage.getItem('currentPrices');
        const savedUpdate = localStorage.getItem('lastPriceUpdate');

        if (savedPrices && savedUpdate) {
            window.appPriceData.currentPrices = JSON.parse(savedPrices);
            currentPrices = window.appPriceData.currentPrices;
            window.appPriceData.lastPriceUpdate = new Date(savedUpdate);
            lastPriceUpdate = window.appPriceData.lastPriceUpdate;

            // 1時間以内のデータのみ使用
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (window.appPriceData.lastPriceUpdate > oneHourAgo) {
                updatePortfolioWithPrices(currentPortfolioData, currentPrices);
                return true;
            }
        }
    } catch (error) {
        console.error('保存済み価格データ読み込みエラー:', error);
    }
    return false;
}

// キャッシュ機能（api.js用 - charts.jsと共通）
function getCachedData(key, duration = CACHE_DURATION_PRICE) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || CACHE_DURATION_PRICE;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                return data.value;
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

// メタデータ付きキャッシュ取得（保存時刻情報付き）
function getCachedDataWithMetadata(key, duration = CACHE_DURATION_PRICE) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || CACHE_DURATION_PRICE;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                return {
                    value: data.value,
                    timestamp: data.timestamp,
                    duration: data.duration,
                    key: data.key
                };
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

function setCachedData(key, value, duration = CACHE_DURATION_PRICE) {
    try {
        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration,
            key: key
        };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('キャッシュ保存エラー:', error);

        // ストレージ容量不足の場合の処理
        if (error.name === 'QuotaExceededError') {
            console.log('🧹 ストレージ容量不足のため古いキャッシュを削除中...');
            // 古いキャッシュを削除
            const keysToDelete = [];
            for (let storageKey in localStorage) {
                if (storageKey.includes('_price_') || storageKey.includes('prices_')) {
                    try {
                        const oldData = JSON.parse(localStorage[storageKey]);
                        if (oldData.timestamp && Date.now() - oldData.timestamp > 60 * 60 * 1000) {
                            keysToDelete.push(storageKey);
                        }
                    } catch (e) {
                        keysToDelete.push(storageKey);
                    }
                }
            }

            keysToDelete.forEach(keyToDelete => {
                localStorage.removeItem(keyToDelete);
            });

            // 再試行
            try {
                localStorage.setItem(key, JSON.stringify(data));
                console.log(`✅ キャッシュ保存成功（再試行）: ${key}`);
            } catch (retryError) {
                console.error('キャッシュ保存再試行失敗:', retryError);
            }
        }
    }
}

// 価格更新ステータス表示（永続化情報付き）
function updatePriceStatus(message = null) {
    const statusElement = document.getElementById('price-update-status');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        return;
    }

    const lastUpdate = window.appPriceData.lastPriceUpdate || lastPriceUpdate;
    if (lastUpdate) {
        const symbols = Object.keys(window.appPriceData.currentPrices || currentPrices).filter(key => key !== '_metadata').length;
        const timeStr = lastUpdate.toLocaleString('ja-JP');
        const ageMinutes = Math.round((Date.now() - lastUpdate.getTime()) / 1000 / 60);

        statusElement.textContent = `${symbols}銘柄 | ${timeStr} (${ageMinutes}分前)`;
        statusElement.style.color = ageMinutes < 30 ? '#28a745' : '#ffc107';

        // 30分以上古い場合は警告色
        if (ageMinutes >= 30) {
            statusElement.style.color = '#ffc107';
            statusElement.title = '価格データが古くなっています。更新をお勧めします。';
        } else {
            statusElement.style.color = '#28a745';
            statusElement.title = '価格データは最新です';
        }
    } else {
        statusElement.textContent = '価格データなし';
        statusElement.style.color = '#6c757d';
        statusElement.title = '価格データを取得してください';
    }
}