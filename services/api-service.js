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
                        const index = uncachedCoins.indexOf(coinName);
                        if (index !== -1) {
                            uncachedCoins.splice(index, 1);
                        }
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
            try {
                const cacheKey = this.cacheKeys.priceHistory(coinName);
                const historyValue = this.cache.get(cacheKey);

                // 蓄積データ形式の場合
                const priceData = historyValue?.data || historyValue;

                if (priceData && Array.isArray(priceData) && priceData.length > 0) {
                    const latestPrice = priceData[priceData.length - 1].price;
                    prices[coinName] = {
                        price_jpy: latestPrice,
                        last_updated_at: Date.now() / 1000
                    };
                    successCount++;
                }
            } catch (error) {
                // スキップ
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
     * 単一銘柄の価格履歴を取得（蓄積データ優先、差分更新）
     * @param {string} coinName - 銘柄シンボル
     * @param {object} options - オプション設定
     * @param {string} options.vsCurrency - 通貨単位（デフォルト: 'jpy'）
     * @param {string} options.interval - 間隔（デフォルト: 'daily'）
     * @param {number} options.timeoutMs - タイムアウト（デフォルト: 10000）
     * @returns {Promise<Array>} 価格履歴データ [{date: Date, price: number}, ...]
     * @throws {Error} 銘柄が未サポート、またはAPI呼び出しエラー
     */
    async fetchPriceHistory(coinName, options = {}) {
        const {
            vsCurrency = 'jpy',
            interval = 'daily',
            timeoutMs = 10000
        } = options;

        const coingeckoId = this.config.coinGeckoMapping[coinName];
        if (!coingeckoId) {
            throw new Error(`${coinName}はサポートされていない銘柄です`);
        }

        // 蓄積キャッシュから取得
        const cacheKey = this.cacheKeys.priceHistory(coinName);
        const existing = this.cache.get(cacheKey);

        // 更新が必要かチェック
        const needsUpdate = this._needsUpdate(existing);

        if (!needsUpdate && existing) {
            // 更新不要、既存データを返す
            return existing.data;
        }

        // 差分取得日数を計算
        const daysToFetch = this._calculateDaysToFetch(existing);

        // API呼び出し
        const data = await this._executePriceHistoryApi(coingeckoId, {
            vsCurrency,
            days: daysToFetch,
            interval,
            timeoutMs
        });

        if (!data.prices || data.prices.length === 0) {
            throw new Error(`${coinName}の価格データを取得できませんでした`);
        }

        // データを整形
        const newPriceHistory = data.prices.map(([timestamp, price]) => ({
            date: new Date(timestamp),
            price: price
        }));

        // 既存データとマージ
        const merged = this._mergeHistoricalData(existing, newPriceHistory, coinName);

        // 蓄積キャッシュに保存（無期限）
        this.cache.set(cacheKey, merged, Infinity);

        return merged.data;
    }

    /**
     * 複数銘柄の価格履歴を順次取得（API制限対策）
     * @param {string[]} coinNames - 銘柄シンボルの配列
     * @param {object} options - オプション設定（fetchPriceHistoryと同じ）
     * @param {number} options.delayMs - リクエスト間の待機時間（デフォルト: 300ms）
     * @returns {Promise<object>} 銘柄別の価格履歴データ {BTC: [...], ETH: [...], ...}
     */
    async fetchMultiplePriceHistories(coinNames, options = {}) {
        const results = {};
        const delayMs = options.delayMs || 300;

        // 直列実行でAPI制限を回避（リクエスト間に指定時間待機）
        for (let i = 0; i < coinNames.length; i++) {
            const coinName = coinNames[i];
            try {
                const priceHistory = await this.fetchPriceHistory(coinName, options);
                results[coinName] = priceHistory;

                // 次のリクエストまで指定時間待機（最後のリクエスト後は待機不要）
                if (i < coinNames.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, delayMs));
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
        const cacheKey = window.cacheKeys.priceHistory(coinName);

        try {
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached);
                // 蓄積データ形式の場合
                if (parsed.value && parsed.value.data) {
                    return parsed.value.data;
                }
                // 旧形式の場合
                return parsed.value || null;
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

    /**
     * 更新が必要かチェック（24時間経過判定）
     * @private
     * @param {object} existing - 既存の蓄積データ
     * @returns {boolean} 更新が必要な場合true
     */
    _needsUpdate(existing) {
        if (!existing || !existing.metadata) {
            return true; // データがない場合は更新必要
        }

        const lastUpdate = existing.metadata.lastUpdated;
        const now = Date.now();
        const dayInMs = 24 * 60 * 60 * 1000;

        return (now - lastUpdate) > dayInMs;
    }

    /**
     * 差分取得日数を計算
     * @private
     * @param {object} existing - 既存の蓄積データ
     * @returns {number} 取得すべき日数（最大365）
     */
    _calculateDaysToFetch(existing) {
        if (!existing || !existing.metadata || !existing.metadata.lastDate) {
            return 365; // 初回は365日分取得
        }

        const lastDate = new Date(existing.metadata.lastDate);
        const today = new Date();
        const daysDiff = Math.ceil((today - lastDate) / (24 * 60 * 60 * 1000));

        // 差分が365日超の場合は365日のみ取得（欠損発生）
        return Math.min(daysDiff, 365);
    }

    /**
     * 価格履歴データをマージ（重複排除）
     * @private
     * @param {object} existing - 既存の蓄積データ
     * @param {Array} newData - 新規データ配列
     * @param {string} coinName - 銘柄名
     * @returns {object} マージされた蓄積データ
     */
    _mergeHistoricalData(existing, newData, coinName) {
        // 日付をキーにしたマップで重複排除
        const dateMap = new Map();

        // 既存データを格納
        if (existing && existing.data) {
            existing.data.forEach(point => {
                const dateKey = new Date(point.date).toDateString();
                dateMap.set(dateKey, {
                    date: new Date(point.date),
                    price: point.price
                });
            });
        }

        // 新規データで上書き・追加
        newData.forEach(point => {
            const dateKey = point.date.toDateString();
            dateMap.set(dateKey, {
                date: new Date(point.date),
                price: point.price
            });
        });

        // 日付順にソート
        const sortedData = Array.from(dateMap.values())
            .sort((a, b) => a.date - b.date);

        // メタデータ生成
        const metadata = this._generateMetadata(sortedData, coinName);

        return {
            coinName,
            data: sortedData,
            metadata
        };
    }

    /**
     * メタデータ生成
     * @private
     * @param {Array} sortedData - ソート済みデータ配列
     * @param {string} coinName - 銘柄名
     * @returns {object} メタデータ
     */
    _generateMetadata(sortedData, coinName) {
        if (sortedData.length === 0) {
            return {
                firstDate: null,
                lastDate: null,
                totalDays: 0,
                lastUpdated: Date.now()
            };
        }

        const firstDate = sortedData[0].date;
        const lastDate = sortedData[sortedData.length - 1].date;
        const totalDays = sortedData.length;

        return {
            firstDate,
            lastDate,
            totalDays,
            lastUpdated: Date.now()
        };
    }
}

// グローバルシングルトンインスタンスを作成
window.apiService = new APIService(window.cache, AppConfig);

// 後方互換性のためのエクスポート
window.APIService = APIService;
