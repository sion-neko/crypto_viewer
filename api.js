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

        if (validSymbols.length === 0) {
            throw new Error('対応銘柄が見つかりません');
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

            showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄 (キャッシュ)`);
            updatePriceStatus();
            return;
        }

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

        showSuccessMessage(`価格更新完了: ${validSymbols.length}銘柄`);
        updatePriceStatus();

    } catch (error) {
        console.error('価格取得エラー:', error);
        showErrorMessage(`価格取得失敗: ${error.message}`);
        updatePriceStatus('取得失敗');
    }
}

// 価格データでポートフォリオを更新（含み損益計算）
function updatePortfolioWithPrices(portfolioData, prices) {
    let totalUnrealizedProfit = 0;

    portfolioData.summary.forEach(item => {
        if (prices[item.symbol] && item.holdingQuantity > 0) {
            const currentPrice = prices[item.symbol].price_jpy;
            const currentValue = item.holdingQuantity * currentPrice;
            // 現在保有分の投資額 = 保有数量 × 平均購入レート
            const currentHoldingCost = item.holdingQuantity * item.averagePurchaseRate;
            const unrealizedProfit = currentValue - currentHoldingCost;

            // 含み損益を追加
            item.currentPrice = currentPrice;
            item.currentValue = currentValue;
            item.unrealizedProfit = unrealizedProfit;
            item.totalProfit = item.realizedProfit + unrealizedProfit;

            totalUnrealizedProfit += unrealizedProfit;
        } else {
            // 価格データがない場合はゼロで初期化
            item.currentPrice = 0;
            item.currentValue = 0;
            item.unrealizedProfit = 0;
            item.totalProfit = item.realizedProfit;
        }
    });

    // 統計に含み損益を追加
    portfolioData.stats.totalUnrealizedProfit = totalUnrealizedProfit;
    portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit + totalUnrealizedProfit;
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