// ========== API.JS - Price fetching and CoinGecko API related functions ==========

// 注: 価格データは全てCacheServiceで管理されます（window.cache）

// 価格データ永続化設定 (from AppConfig)
const CACHE_DURATION_PRICE = AppConfig.cacheDurations.CURRENT_PRICES;
const CACHE_DURATION_HISTORY = AppConfig.cacheDurations.PRICE_HISTORY;

// 銘柄マッピング（CoinGecko API用） - AppConfigから取得
const COIN_NAME_MAPPING = AppConfig.coinGeckoMapping;

// 後方互換性のため、グローバルにも公開
window.COIN_NAME_MAPPING = AppConfig.coinGeckoMapping;

// ========== PRICE FETCHING FUNCTIONS ==========

// executePriceHistoryApi() は APIService._executePriceHistoryApi() に移動済み
// fetchCurrentPrices() は portfolio.js に移動済み
// tryGetPricesFromHistory() は APIService._tryGetPricesFromHistory() に移動済み

// 価格データでポートフォリオを更新（含み損益計算）
function updatePortfolioWithPrices(portfolioData, prices) {
    let totalUnrealizedProfit = 0;

    portfolioData.summary.forEach(item => {
        // 価格データが存在する場合
        if (prices[item.coinName]) {
            const currentPrice = prices[item.coinName].price_jpy;
            item.currentPrice = currentPrice;

            // 保有量が正の場合のみ含み損益を計算
            const unrealizedProfit = calculateUnrealizedProfit(
                item.holdingQuantity,
                currentPrice,
                item.averagePurchaseRate
            );

            if (unrealizedProfit !== 0) {
                // 含み損益を追加
                item.currentValue = item.holdingQuantity * currentPrice;
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
    portfolioData.stats.totalProfitableCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) > 0).length;
    portfolioData.stats.totalLossCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) < 0).length;
    portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
        (portfolioData.stats.totalProfit / portfolioData.stats.totalInvestment) * 100 : 0;
}

// 価格更新ステータス表示（個別銘柄キャッシュ対応版）
function updatePriceStatus(message = null) {
    const statusElement = document.getElementById('price-update-status');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        return;
    }

    // ポートフォリオデータから銘柄リストを取得
    const portfolioData = window.portfolioDataService.getData();
    if (!portfolioData || !portfolioData.summary) {
        statusElement.textContent = '価格データなし';
        statusElement.style.color = '#6c757d';
        statusElement.title = '価格データを取得してください';
        return;
    }

    const coinNames = portfolioData.summary.map(item => item.coinName);

    // 個別銘柄キャッシュを確認（最も古いキャッシュのタイムスタンプを取得）
    let oldestUpdateTime = null;
    let cachedCount = 0;

    for (const coinName of coinNames) {
        const cacheKey = cacheKeys.currentPrice(coinName);
        const rawCacheData = localStorage.getItem(cacheKey);

        if (rawCacheData) {
            try {
                const cacheData = JSON.parse(rawCacheData);
                if (cacheData.timestamp) {
                    cachedCount++;
                    if (!oldestUpdateTime || cacheData.timestamp < oldestUpdateTime) {
                        oldestUpdateTime = cacheData.timestamp;
                    }
                }
            } catch (e) {
                // キャッシュ読み込みエラー
            }
        }
    }

    if (cachedCount > 0 && oldestUpdateTime) {
        const lastUpdate = new Date(oldestUpdateTime);
        const timeStr = lastUpdate.toLocaleString('ja-JP');
        const ageMinutes = Math.round((Date.now() - oldestUpdateTime) / 1000 / 60);

        statusElement.textContent = `${cachedCount}/${coinNames.length}銘柄 | ${timeStr} (${ageMinutes}分前)`;

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