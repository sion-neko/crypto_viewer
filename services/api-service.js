// ===================================================================
// API-SERVICE.JS - API呼び出しの一元管理
// ===================================================================

/**
 * APIサービスクラス
 * CoinGecko APIへの全てのリクエストを管理し、キャッシュを活用する
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

    // ===================================================================
    // 現在価格取得
    // ===================================================================

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

        // 1. 個別銘柄キャッシュから取得
        for (const coinName of validCoinNames) {
            const cacheKey = this.cacheKeys.currentPrice(coinName);
            const cachedPrice = this.cache.get(cacheKey);

            if (cachedPrice) {
                prices[coinName] = cachedPrice;
            } else {
                uncachedCoins.push(coinName);
            }
        }

        // 2. キャッシュにない銘柄は価格履歴から取得を試行
        if (uncachedCoins.length > 0) {
            const pricesFromHistory = await this._tryGetPricesFromHistory(uncachedCoins);

            if (pricesFromHistory) {
                for (const coinName in pricesFromHistory) {
                    if (coinName !== '_metadata') {
                        prices[coinName] = pricesFromHistory[coinName];
                        uncachedCoins.splice(uncachedCoins.indexOf(coinName), 1);
                    }
                }
            }
        }

        // 3. まだキャッシュにない銘柄はAPI呼び出し
        if (uncachedCoins.length > 0) {
            try {
                const coingeckoIds = uncachedCoins.map(coinName => this.config.coinGeckoMapping[coinName]).join(',');
                const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=jpy&include_last_updated_at=true`;

                const response = await fetch(url);
                if (!response.ok) {
                    if (response.status === 429) {
                        console.warn('API制限に達しました (429) - キャッシュデータを使用します');
                        // 429エラーの場合は例外をスローせず、キャッシュデータのみで続行
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
                                last_updated: data[coingeckoId].last_updated_at
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
            }
        }

        // メタデータ追加
        prices._metadata = {
            lastUpdate: Date.now(),
            coinNames: validCoinNames,
            cachedCount: validCoinNames.length - uncachedCoins.length,
            apiCallCount: uncachedCoins.length
        };

        return prices;
    }

    /**
     * 価格履歴キャッシュから現在価格を取得（API効率化）
     * @private
     * @param {string[]} coinNames - 銘柄シンボルの配列
     * @returns {Promise<object|null>} 価格データまたはnull
     */
    async _tryGetPricesFromHistory(coinNames) {
        const prices = {};
        let successCount = 0;

        for (const coinName of coinNames) {
            const cacheKey = this.cacheKeys.priceHistory(coinName);
            const historyValue = this.cache.get(cacheKey);

            if (historyValue && historyValue.length > 0) {
                const latestPrice = historyValue[historyValue.length - 1].price;
                prices[coinName] = {
                    price_jpy: latestPrice,
                    last_updated_at: Date.now() / 1000
                };
                successCount++;
            }
        }

        if (successCount > 0) {
            prices._metadata = {
                lastUpdate: Date.now(),
                coinNames: Object.keys(prices).filter(key => key !== '_metadata'),
                source: 'price_history_cache'
            };
            return prices;
        }

        return null;
    }

    // ===================================================================
    // 価格履歴取得
    // ===================================================================

    /**
     * 単一銘柄の価格履歴を取得（キャッシュ優先）
     * @param {string} coinName - 銘柄シンボル
     * @param {object} options - オプション設定
     * @param {string} options.vsCurrency - 通貨単位（デフォルト: 'jpy'）
     * @param {number} options.days - 日数（デフォルト: 30）
     * @param {string} options.interval - 間隔（デフォルト: 'daily'）
     * @param {number} options.timeoutMs - タイムアウト（デフォルト: 10000）
     * @returns {Promise<Array>} 価格履歴データ [{date: Date, price: number}, ...]
     * @throws {Error} 銘柄が未サポート、またはAPI呼び出しエラー
     */
    async fetchPriceHistory(coinName, options = {}) {
        const {
            vsCurrency = 'jpy',
            days = 30,
            interval = 'daily',
            timeoutMs = 10000
        } = options;

        const coingeckoId = this.config.coinGeckoMapping[coinName];
        if (!coingeckoId) {
            throw new Error(`${coinName}はサポートされていない銘柄です`);
        }

        // キャッシュから取得
        const cacheKey = this.cacheKeys.priceHistory(coinName);
        const cachedData = this.cache.get(cacheKey);

        if (cachedData) {
            return cachedData;
        }

        // API呼び出し
        const data = await this._executePriceHistoryApi(coingeckoId, {
            vsCurrency,
            days,
            interval,
            timeoutMs
        });

        if (!data.prices || data.prices.length === 0) {
            throw new Error(`${coinName}の価格データを取得できませんでした`);
        }

        // データを整形
        const priceHistory = data.prices.map(([timestamp, price]) => ({
            date: new Date(timestamp),
            price: price
        }));

        // 永続キャッシュに保存
        this.cache.set(cacheKey, priceHistory, this.config.cacheDurations.PRICE_HISTORY);

        return priceHistory;
    }

    /**
     * 複数銘柄の価格履歴を順次取得（API制限対策）
     * @param {string[]} coinNames - 銘柄シンボルの配列
     * @param {object} options - オプション設定（fetchPriceHistoryと同じ）
     * @returns {Promise<object>} 銘柄別の価格履歴データ {BTC: [...], ETH: [...], ...}
     */
    async fetchMultiplePriceHistories(coinNames, options = {}) {
        const results = {};

        // 直列実行でAPI制限を回避（リクエスト間に300ms待機）
        for (let i = 0; i < coinNames.length; i++) {
            const coinName = coinNames[i];
            try {
                const priceHistory = await this.fetchPriceHistory(coinName, options);
                results[coinName] = priceHistory;

                // 次のリクエストまで300ms待機（最後のリクエスト後は待機不要）
                if (i < coinNames.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 300));
                }
            } catch (error) {
                console.warn(`${coinName}の価格履歴取得失敗:`, error.message);

                // 429エラーの場合、期限切れキャッシュも利用を試みる
                if (error.message.includes('429')) {
                    const staleCache = this._getStaleCache(coinName, options);
                    if (staleCache) {
                        console.log(`${coinName}: 期限切れキャッシュを使用`);
                        results[coinName] = staleCache;
                        continue;
                    }
                }

                results[coinName] = null;
            }
        }

        return results;
    }

    /**
     * 期限切れキャッシュを取得（429エラー時のフォールバック用）
     * @private
     * @param {string} coinName - 銘柄シンボル
     * @param {object} options - オプション設定
     * @returns {array|null} キャッシュデータ（なければnull）
     */
    _getStaleCache(coinName, options = {}) {
        const { days = 30 } = options;
        const cacheKey = window.cacheKeys.priceHistory(coinName, days);

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                return parsed.data || null;
            }
        } catch (error) {
            console.error('期限切れキャッシュ取得エラー:', error);
        }

        return null;
    }


    // ===================================================================
    // 内部メソッド
    // ===================================================================

    /**
     * 価格履歴API実行（タイムアウト・エラーハンドリング付き）
     * @private
     * @param {string} coingeckoId - CoinGecko銘柄ID
     * @param {object} options - API呼び出しオプション
     * @returns {Promise<object>} APIレスポンス
     * @throws {Error} API呼び出しエラー
     */
    async _executePriceHistoryApi(coingeckoId, options = {}) {
        const {
            vsCurrency = 'jpy',
            days = 30,
            interval = 'daily',
            timeoutMs = 10000
        } = options;

        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}`;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                signal: controller.signal,
                headers: { 'Accept': 'application/json' }
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error('API制限に達しました (429 Too Many Requests)');
                } else if (response.status === 403) {
                    throw new Error('APIアクセスが拒否されました (403 Forbidden)');
                } else {
                    throw new Error(`API Error: ${response.status}`);
                }
            }

            return await response.json();
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

// グローバルシングルトンインスタンスを作成
window.apiService = new APIService(window.cache, AppConfig);

// 後方互換性のためのエクスポート
window.APIService = APIService;
