// ===================================================================
// API.JS - Price fetching and CoinGecko API related functions
// ===================================================================

// Global variables for price data
let currentPrices = {};
let lastPriceUpdate = null;

// 銘柄マッピング（CoinGecko API用）
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

// ===================================================================
// PRICE FETCHING FUNCTIONS
// ===================================================================

// 価格取得関連機能
async function fetchCurrentPrices() {
    try {
        console.log('🔄 fetchCurrentPrices called');

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

        console.log('📊 Valid symbols for price fetch:', validSymbols);

        if (validSymbols.length === 0) {
            throw new Error('対応銘柄が見つかりません');
        }

        // まず価格履歴キャッシュから現在価格を取得を試行（API効率化）
        const pricesFromHistory = await tryGetPricesFromHistory(validSymbols);
        if (pricesFromHistory && Object.keys(pricesFromHistory).length === validSymbols.length) {
            console.log('✅ All prices obtained from history cache');
            currentPrices = pricesFromHistory;
            lastPriceUpdate = new Date();

            updatePortfolioWithPrices(currentPortfolioData, currentPrices);
            sortPortfolioData(currentSortField, currentSortDirection);
            const tableContainer = document.getElementById('portfolio-table-container');
            tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

            // サマリー部分も更新（総合損益反映のため）
            updateDataStatus(currentPortfolioData);

            // 更新されたポートフォリオデータを保存
            localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

            showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄 (履歴データより)`);
            updatePriceStatus();
            return;
        }

        // キャッシュキーを生成
        const cacheKey = `prices_${validSymbols.sort().join('_')}`;

        // キャッシュチェック
        const cachedPrices = getCachedData(cacheKey);
        if (cachedPrices) {
            currentPrices = cachedPrices;
            lastPriceUpdate = new Date(cachedPrices._metadata?.lastUpdate || Date.now());

            updatePortfolioWithPrices(currentPortfolioData, currentPrices);

            // 現在のソート順を維持してテーブル再描画
            sortPortfolioData(currentSortField, currentSortDirection);
            const tableContainer = document.getElementById('portfolio-table-container');
            tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

            // サマリー部分も更新（総合損益反映のため）
            updateDataStatus(currentPortfolioData);

            // 更新されたポートフォリオデータを保存
            localStorage.setItem('portfolioData', JSON.stringify(currentPortfolioData));

            // キャッシュから取得した場合の通知
            showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄`);
            updatePriceStatus();
            return;
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

        // キャッシュに保存
        setCachedData(cacheKey, prices, CACHE_DURATION_PRICE);

        // グローバル変数に保存
        currentPrices = prices;
        lastPriceUpdate = new Date();

        // localStorage に保存
        localStorage.setItem('currentPrices', JSON.stringify(prices));
        localStorage.setItem('lastPriceUpdate', lastPriceUpdate.toISOString());

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

        // 成功通知を表示
        showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄`);
        updatePriceStatus();

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
                console.log(`📈 ${symbol} price from history: ¥${latestPrice.toLocaleString()}`);
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
    
    // 各銘柄の総合損益も確認
    console.log('💰 Symbol total profits:', portfolioData.summary.map(s => ({
        symbol: s.symbol,
        realized: Math.round(s.realizedProfit),
        unrealized: Math.round(s.unrealizedProfit || 0),
        total: Math.round(s.totalProfit || s.realizedProfit)
    })));
}

// 保存済み価格データを復元
function loadSavedPrices() {
    try {
        const savedPrices = localStorage.getItem('currentPrices');
        const savedUpdate = localStorage.getItem('lastPriceUpdate');

        if (savedPrices && savedUpdate) {
            currentPrices = JSON.parse(savedPrices);
            lastPriceUpdate = new Date(savedUpdate);

            // 1時間以内のデータのみ使用
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
            if (lastPriceUpdate > oneHourAgo) {
                updatePortfolioWithPrices(currentPortfolioData, currentPrices);
                return true;
            }
        }
    } catch (error) {
        console.error('保存済み価格データ読み込みエラー:', error);
    }
    return false;
}

// 価格更新ステータス表示
function updatePriceStatus(message = null) {
    const statusElement = document.getElementById('price-update-status');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        return;
    }

    if (lastPriceUpdate) {
        const symbols = Object.keys(currentPrices).length;
        const timeStr = lastPriceUpdate.toLocaleString('ja-JP');
        statusElement.textContent = `${symbols}銘柄 | ${timeStr}`;
        statusElement.style.color = '#28a745';
    } else {
        statusElement.textContent = '価格データなし';
        statusElement.style.color = '#6c757d';
    }
}