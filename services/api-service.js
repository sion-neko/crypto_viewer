// ========== API-SERVICE.JS - API呼び出しの一元管理 ==========

/**
 * APIサービスクラス
 * CoinGecko APIへの現在価格リクエストを管理し、キャッシュを活用する
 */
class APIService {
    /**
     * @param {CacheService} cacheService - キャッシュサービスインスタンス
     * @param {object} config - AppConfig
     */
    constructor(cacheService, config) {
        this.cache = cacheService;
        this.config = config;
        this.cacheKeys = window.cacheKeys;
    }

    /**
     * 複数銘柄の現在価格を取得（キャッシュ優先、個別銘柄キャッシュ）
     * @param {string[]} coinNames - 銘柄シンボルの配列 ['BTC', 'ETH', ...]
     * @returns {Promise<object>} 価格データ {BTC: {price_jpy: 1000000, last_updated: 123456}, ...}
     * @throws {Error} API呼び出しエラー
     */
    async fetchCurrentPrices(coinNames) {
        // 対応銘柄のみフィルタリング
        const validCoinNames = coinNames.filter(coinName => this.config.coinGeckoMapping[coinName]);

        if (validCoinNames.length === 0) {
            throw new Error('対応銘柄が見つかりません');
        }

        const prices = {};
        const uncachedCoins = [];

        // 個別銘柄キャッシュから取得
        for (const coinName of validCoinNames) {
            const cacheKey = this.cacheKeys.currentPrice(coinName);
            const cachedPrice = this.cache.get(cacheKey);

            if (cachedPrice) {
                prices[coinName] = cachedPrice;
            } else {
                uncachedCoins.push(coinName);
            }
        }

        // キャッシュにない銘柄はAPI呼び出し
        if (uncachedCoins.length > 0) {
            try {
                const coingeckoIds = uncachedCoins.map(coinName => this.config.coinGeckoMapping[coinName]).join(',');
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=jpy&include_last_updated_at=true`;

                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn('API制限に達しました (429) - キャッシュデータを使用します');
                        prices._metadata = prices._metadata || {};
                        prices._metadata.uncachedCoins = uncachedCoins;
                        prices._metadata.isPartialSuccess = true;
                        prices._metadata.apiLimitReached = true;
                    } else {
                        throw new Error(`API Error: ${response.status}`);
                    }
                } else {
                    const data = await response.json();

                    // データを整理して個別にキャッシュ
                    for (const coinName of uncachedCoins) {
                        const coingeckoId = this.config.coinGeckoMapping[coinName];
                        if (data[coingeckoId]) {
                            const priceData = {
                                price_jpy: data[coingeckoId].jpy,
                                last_updated_at: data[coingeckoId].last_updated_at
                            };
                            prices[coinName] = priceData;

                            // 個別銘柄ごとにキャッシュ保存（30分有効）
                            const cacheKey = this.cacheKeys.currentPrice(coinName);
                            this.cache.set(cacheKey, priceData, this.config.cacheDurations.CURRENT_PRICES);
                        }
                    }
                }
            } catch (error) {
                console.error('現在価格取得エラー:', error.message);
                // エラーが発生してもキャッシュデータで続行
                prices._metadata = prices._metadata || {};
                prices._metadata.errors = prices._metadata.errors || [];
                prices._metadata.errors.push({
                    message: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // メタデータ追加
        prices._metadata = {
            ...prices._metadata,
            lastUpdate: Date.now(),
            coinNames: validCoinNames,
            cachedCount: validCoinNames.length - uncachedCoins.length,
            apiCallCount: uncachedCoins.length
        };

        return prices;
    }
}

// グローバルシングルトンインスタンスを作成
window.apiService = new APIService(window.cache, AppConfig);
