// storage-utils.js - キャッシュ管理ユーティリティ


// ===================================================================
// CACHE KEY GENERATION FUNCTIONS (from cache-keys.js)
// ===================================================================

/**
 * 価格履歴データのキャッシュキーを生成
 * @param {string} coinName - 銘柄シンボル (例: 'BTC', 'ETH')
 * @returns {string} キャッシュキー
 */
function getPriceHistoryCacheKey(coinName) {
  return `${coinName.toLowerCase()}_price_history_30d`;
}

/**
* 現在価格データのキャッシュキーを生成
* @param {string[]} coinNames - 銘柄シンボルの配列 (例: ['BTC', 'ETH'])
* @returns {string} キャッシュキー
*/
function getCurrentPricesCacheKey(coinNames) {
  return `prices_${coinNames.sort().join('_')}`;
}

/**
* チャートデータのキャッシュキーを生成
* @param {string} coinName - 銘柄シンボル
* @param {number} days - 日数 (例: 30)
* @returns {string} キャッシュキー
*/
function getChartDataCacheKey(coinName, days = 30) {
  return `chart_${coinName}_${days}days`;
}

// キャッシュの有効期限設定を AppConfig から取得
const CACHE_DURATIONS = AppConfig.cacheDurations;

// 後方互換性のため、グローバルにも公開
window.CACHE_DURATIONS = CACHE_DURATIONS;

// キャッシュキー生成関数をオブジェクトにまとめてグローバルに公開
window.cacheKeys = {
    priceHistory: getPriceHistoryCacheKey,
    currentPrices: getCurrentPricesCacheKey,
    chartData: getChartDataCacheKey
};


/**
 * キャッシュ管理サービスクラス
 * localStorageを使用してキャッシュデータを管理
 */
class CacheService {
    constructor(storage = localStorage) {
        this.storage = storage;
    }

    /**
     * キャッシュにデータを保存
     * @param {string} key - キャッシュキー
     * @param {*} value - 保存する値
     * @param {number} duration - 有効期限（ミリ秒）
     */
    set(key, value, duration = CACHE_DURATIONS.CURRENT_PRICES) {
        const data = { value, timestamp: Date.now(), duration };
        try {
            this._checkUsage();
            this.storage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('キャッシュ保存失敗:', e);
            this._cleanupOld();
        }
    }

    /**
     * キャッシュからデータを取得
     * @param {string} key - キャッシュキー
     * @returns {*} キャッシュされた値（期限切れまたは存在しない場合はnull）
     */
    get(key) {
        try {
            const raw = this.storage.getItem(key);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (this._isExpired(data)) {
                this.storage.removeItem(key);
                return null;
            }
            return data.value;
        } catch (e) {
            console.error('キャッシュ読み込み失敗:', e);
            return null;
        }
    }

    /**
     * 特定のキャッシュを削除
     * @param {string} key - キャッシュキー
     */
    delete(key) {
        this.storage.removeItem(key);
    }

    /**
     * 全キャッシュをクリア
     */
    clearAll() {
        this.storage.clear();
    }

    /**
     * 価格関連のキャッシュのみをクリア
     * @returns {number} クリアしたキャッシュ数
     */
    clearPriceCache() {
        let clearedCount = 0;
        const keysToDelete = [];

        // 価格関連のキーを特定
        for (let key in this.storage) {
            if (this.storage.hasOwnProperty(key)) {
                if (key.includes('_price_history_') ||
                    key.includes('prices_') ||
                    key.includes('chart_') ||
                    key === 'currentPrices' ||
                    key === 'lastPriceUpdate' ||
                    key === 'cache_metadata') {
                    keysToDelete.push(key);
                }
            }
        }

        // キャッシュを削除
        keysToDelete.forEach(key => {
            this.storage.removeItem(key);
            clearedCount++;
        });

        return clearedCount;
    }

    /**
     * ストレージ統計情報を取得
     * @returns {object} ストレージ統計情報
     */
    getStorageStats() {
        let totalSize = 0;
        let priceDataCount = 0;
        let priceDataSize = 0;
        let portfolioDataSize = 0;

        for (let key in this.storage) {
            if (this.storage.hasOwnProperty(key)) {
                const size = this.storage[key].length;
                totalSize += size;

                if (key.includes('_price_') || key.includes('prices_') || key.includes('chart_')) {
                    priceDataCount++;
                    priceDataSize += size;
                }

                if (key === 'portfolioData' || key === 'rawTransactions') {
                    portfolioDataSize += size;
                }
            }
        }

        return {
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            priceDataCount,
            priceDataSize,
            priceDataSizeMB: (priceDataSize / 1024 / 1024).toFixed(2),
            portfolioDataSize,
            portfolioDataSizeMB: (portfolioDataSize / 1024 / 1024).toFixed(2),
            usageRatio: totalSize / CACHE_DURATIONS.MAX_STORAGE_SIZE
        };
    }

    /**
     * キャッシュが期限切れかチェック
     * @param {object} data - キャッシュデータオブジェクト
     * @returns {boolean} 期限切れの場合true
     */
    _isExpired(data) {
        return !data?.timestamp || Date.now() - data.timestamp > (data.duration || 0);
    }

    /**
     * ストレージ使用量をチェックし、必要に応じてクリーンアップ
     */
    _checkUsage() {
        let totalSize = 0;
        for (let key in this.storage) {
            if (this.storage.hasOwnProperty(key)) {
                totalSize += this.storage[key].length;
            }
        }
        const ratio = totalSize / CACHE_DURATIONS.MAX_STORAGE_SIZE;
        if (ratio > CACHE_DURATIONS.CLEANUP_THRESHOLD) {
            console.warn('ストレージ使用率が高いためクリーンアップを実行します');
            this._cleanupOld();
        }
    }

    /**
     * 古いキャッシュを削除（タイムスタンプの古い順に半分削除）
     */
    _cleanupOld() {
        const items = [];

        for (let key in this.storage) {
            try {
                const data = JSON.parse(this.storage[key]);
                items.push({ key, timestamp: data.timestamp || 0 });
            } catch {
                // パースできないデータは削除
                this.storage.removeItem(key);
            }
        }

        items.sort((a, b) => a.timestamp - b.timestamp);
        const toRemove = items.slice(0, Math.floor(items.length / 2));
        toRemove.forEach(({ key }) => this.storage.removeItem(key));
    }

    /**
     * 現在のポートフォリオデータを取得
     * @returns {object|null} ポートフォリオデータまたはnull
     */
    getPortfolioData() {
        return safeGetJSON('portfolioData', null);
    }
}

// ===================================================================
// グローバルシングルトンインスタンス
// ===================================================================

// シングルトンインスタンスを作成してグローバルに公開
window.cache = new CacheService();

// 後方互換性のためのエイリアス
window.CacheService = CacheService;

// ===================================================================
// LOCALSTORAGE UTILITY FUNCTIONS
// ===================================================================

/**
 * JSONデータをlocalStorageから安全に読み込む
 * @param {string} key - localStorageキー
 * @param {*} defaultValue - 読み込み失敗時のデフォルト値
 * @returns {*} パース済みのデータまたはデフォルト値
 */
function safeGetJSON(key, defaultValue = null) {
    try {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : defaultValue;
    } catch (error) {
        console.error(`localStorage読み込みエラー (${key}):`, error);
        return defaultValue;
    }
}

/**
 * JSONデータをlocalStorageに安全に保存する
 * @param {string} key - localStorageキー
 * @param {*} value - 保存する値（自動的にJSON文字列化される）
 * @returns {boolean} 保存成功時true、失敗時false
 */
function safeSetJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
    } catch (error) {
        console.error(`localStorage保存エラー (${key}):`, error);
        return false;
    }
}

/**
 * localStorageからキーを安全に削除する
 * @param {string} key - localStorageキー
 * @returns {boolean} 削除成功時true、失敗時false
 */
function safeRemoveItem(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error(`localStorage削除エラー (${key}):`, error);
        return false;
    }
}

/**
 * 日付フォーマットユーティリティ
 */
const DateFormat = {
    /**
     * 日本語フルフォーマット (例: "2025/11/08 15:30:45")
     */
    jpFull: (date) => new Date(date).toLocaleString('ja-JP'),

    /**
     * 日本語日付フォーマット (例: "2025/11/08")
     */
    jpDate: (date) => new Date(date).toLocaleDateString('ja-JP'),

    /**
     * 短縮日付フォーマット (例: "11/8")
     */
    shortDate: (date) => {
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }
};

// ===================================================================
// PROFIT CALCULATION UTILITIES
// ===================================================================

/**
 * 加重平均価格を計算
 * @param {number} currentQty - 現在の保有数量
 * @param {number} currentAvgPrice - 現在の加重平均価格
 * @param {number} newQty - 新規購入数量
 * @param {number} newPrice - 新規購入価格
 * @returns {object} { totalQty, weightedAvgPrice }
 */
function calculateWeightedAverage(currentQty, currentAvgPrice, newQty, newPrice) {
    const newTotalValue = (currentQty * currentAvgPrice) + (newQty * newPrice);
    const totalQty = currentQty + newQty;
    const weightedAvgPrice = totalQty > 0 ? newTotalValue / totalQty : 0;

    return {
        totalQty,
        weightedAvgPrice
    };
}

/**
 * 実現損益を計算（売却時）
 * @param {number} sellAmount - 売却金額
 * @param {number} sellQty - 売却数量
 * @param {number} avgPurchaseRate - 平均購入単価
 * @returns {number} 実現損益
 */
function calculateRealizedProfit(sellAmount, sellQty, avgPurchaseRate) {
    return sellAmount - (sellQty * avgPurchaseRate);
}

/**
 * 含み損益を計算
 * @param {number} holdingQty - 保有数量
 * @param {number} currentPrice - 現在価格
 * @param {number} avgPurchaseRate - 平均購入単価
 * @returns {number} 含み損益
 */
function calculateUnrealizedProfit(holdingQty, currentPrice, avgPurchaseRate) {
    if (holdingQty <= 0 || avgPurchaseRate <= 0 || currentPrice <= 0) {
        return 0;
    }
    const currentValue = holdingQty * currentPrice;
    const holdingCost = holdingQty * avgPurchaseRate;
    return currentValue - holdingCost;
}

/**
 * Chart.jsインスタンスを安全に破棄
 * @param {string} canvasId - Canvas要素のID
 */
function destroyChartSafely(canvasId) {
    if (!window.chartInstances) {
        window.chartInstances = {};
    }

    const chart = window.chartInstances[canvasId];
    if (chart) {
        try {
            chart.destroy();
        } catch (error) {
            console.warn(`チャート破棄エラー (${canvasId}):`, error);
        }
        delete window.chartInstances[canvasId];
    }
}
  