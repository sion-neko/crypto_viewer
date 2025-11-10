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
     * 複数銘柄の現在価格を取得（キャッシュ優先）
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

        // まず価格履歴キャッシュから現在価格を取得を試行（API効率化）
        const pricesFromHistory = await this._tryGetPricesFromHistory(validCoinNames);
        if (pricesFromHistory && Object.keys(pricesFromHistory).length === validCoinNames.length) {
            return pricesFromHistory;
        }

        // 永続化キャッシュキーを生成
        const cacheKey = this.cacheKeys.currentPrices(validCoinNames);

        // 永続化キャッシュチェック（30分有効）
        const cachedPrices = this.cache.get(cacheKey);
        if (cachedPrices) {
            return cachedPrices;
        }

        // API呼び出し
        const coingeckoIds = validCoinNames.map(coinName => this.config.coinGeckoMapping[coinName]).join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=jpy&include_last_updated_at=true`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // データを整理
        const prices = {};
        for (const coinName of validCoinNames) {
            const coingeckoId = this.config.coinGeckoMapping[coinName];
            if (data[coingeckoId]) {
                prices[coinName] = {
                    price_jpy: data[coingeckoId].jpy,
                    last_updated: data[coingeckoId].last_updated_at
                };
            }
        }

        // メタデータ追加
        prices._metadata = {
            lastUpdate: Date.now(),
            coinNames: validCoinNames
        };

        // 永続化キャッシュに保存（30分有効）
        this.cache.set(cacheKey, prices, this.config.cacheDurations.CURRENT_PRICES);

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

                if (historyValue && historyValue.length > 0) {
                    const latestPrice = historyValue[historyValue.length - 1].price;
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
     * 単一銘柄の価格履歴を取得（キャッシュ優先）
     * @param {string} coinName - 銘柄シンボル
     * @param {object} options - オプション設定
     * @param {string} options.vsCurrency - 通貨単位（デフォルト: 'jpy'）
     * @param {number} options.days - 日数（デフォルト: 30）
     * @param {string} options.interval - 間隔（デフォルト: 'daily'）※90日以上の場合は自動的に省略される
     * @param {number} options.timeoutMs - タイムアウト（デフォルト: 20000）
     * @returns {Promise<Array>} 価格履歴データ [{date: Date, price: number}, ...]
     * @throws {Error} 銘柄が未サポート、またはAPI呼び出しエラー
     */
    async fetchPriceHistory(coinName, options = {}) {
        const {
            vsCurrency = 'jpy',
            days = 30,
            interval = 'daily',
            timeoutMs = null  // nullの場合は日数に応じて自動設定
        } = options;

        // 日数に応じてタイムアウトを調整
        const adjustedTimeout = timeoutMs || this._getTimeoutForDays(days);

        const coingeckoId = this.config.coinGeckoMapping[coinName];
        if (!coingeckoId) {
            throw new Error(`${coinName}はサポートされていない銘柄です`);
        }

        // キャッシュから取得（日数を含めたキー）
        const cacheKey = `${this.cacheKeys.priceHistory(coinName)}_${days}d`;
        const cachedData = this.cache.get(cacheKey);

        if (cachedData) {
            console.log(`${coinName}の価格履歴（${days}日）をキャッシュから取得`);
            return cachedData;
        }

        // API呼び出し
        console.log(`${coinName}の価格履歴（${days}日）をAPIから取得中... (timeout: ${adjustedTimeout}ms)`);
        const data = await this._executePriceHistoryApi(coingeckoId, {
            vsCurrency,
            days,
            interval,
            timeoutMs: adjustedTimeout
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
     * 複数銘柄の価格履歴を並列取得
     * @param {string[]} coinNames - 銘柄シンボルの配列
     * @param {object} options - オプション設定（fetchPriceHistoryと同じ）
     * @returns {Promise<object>} 銘柄別の価格履歴データ {BTC: [...], ETH: [...], ...}
     */
    async fetchMultiplePriceHistories(coinNames, options = {}) {
        const results = {};
        const { days = 30 } = options;

        // 長期間データの場合は順次取得してAPI制限を回避
        if (days > 365) {
            console.log(`長期間データ（${days}日）を順次取得します...`);
            for (const coinName of coinNames) {
                try {
                    const priceHistory = await this.fetchPriceHistory(coinName, options);
                    results[coinName] = priceHistory;
                    // API制限を避けるため、次のリクエストまで少し待機
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error(`${coinName}の価格履歴取得失敗（${days}日）:`, error.message);
                    // トーストでエラー表示
                    window.uiService.showWarning(`${coinName}の価格履歴取得失敗: ${error.message}`);
                    results[coinName] = null;
                }
            }
        } else {
            // 90日以下は並列取得
            const promises = coinNames.map(async (coinName) => {
                try {
                    const priceHistory = await this.fetchPriceHistory(coinName, options);
                    results[coinName] = priceHistory;
                } catch (error) {
                    console.error(`${coinName}の価格履歴取得失敗（${days}日）:`, error.message);
                    // トーストでエラー表示
                    window.uiService.showWarning(`${coinName}の価格履歴取得失敗: ${error.message}`);
                    results[coinName] = null;
                }
            });

            await Promise.all(promises);
        }

        return results;
    }

    /**
     * チャート用の価格履歴を取得（簡易フォーマット）
     * @param {string} coinName - 銘柄シンボル
     * @param {number} days - 日数（デフォルト: 30）
     * @returns {Promise<Array>} チャート用データ [{x: Date, y: number}, ...]
     */
    async fetchChartData(coinName, days = 30) {
        const coingeckoId = this.config.coinGeckoMapping[coinName];
        if (!coingeckoId) {
            throw new Error(`${coinName}はサポートされていません`);
        }

        // キャッシュキーを生成
        const cacheKey = this.cacheKeys.chartData(coinName, days);

        // キャッシュチェック
        const cachedData = this.cache.get(cacheKey);
        if (cachedData) {
            return cachedData;
        }

        // API呼び出し
        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=${days}`;
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.prices || data.prices.length === 0) {
            return [];
        }

        const chartData = data.prices.map(([timestamp, price]) => ({
            x: new Date(timestamp),
            y: price
        }));

        // キャッシュに保存（6時間）
        this.cache.set(cacheKey, chartData, this.config.cacheDurations.CHART_DATA);

        return chartData;
    }

    // ===================================================================
    // 内部メソッド
    // ===================================================================

    /**
     * 日数に応じた適切なタイムアウトを返す
     * @private
     * @param {number} days - 日数
     * @returns {number} タイムアウト（ミリ秒）
     */
    _getTimeoutForDays(days) {
        if (days <= 90) {
            return 20000;  // 20秒
        } else if (days <= 365) {
            return 30000;  // 30秒
        } else {
            return 45000;  // 45秒
        }
    }

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
            timeoutMs = 20000  // デフォルトタイムアウト
        } = options;

        // CoinGecko APIでは90日以上の場合、intervalパラメータを省略する必要がある
        // （自動的に適切なgranularityが選択される）
        let url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=${encodeURIComponent(String(days))}`;

        // 90日未満の場合のみintervalパラメータを追加
        if (days < 90) {
            url += `&interval=${encodeURIComponent(interval)}`;
        }

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
                    throw new Error(`API Error: ${response.status} - ${response.statusText}`);
                }
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error(`タイムアウト: ${days}日分のデータ取得に${timeoutMs}ms以上かかりました`);
            }
            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

// グローバルシングルトンインスタンスを作成
window.apiService = new APIService(window.cache, AppConfig);

// 後方互換性のためのエクスポート
window.APIService = APIService;
