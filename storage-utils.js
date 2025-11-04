// storage-utils.js - キャッシュ管理ユーティリティ


// ===================================================================
// CACHE KEY GENERATION FUNCTIONS (from cache-keys.js)
// ===================================================================

/**
 * 価格履歴データのキャッシュキーを生成
 * @param {string} coinName - 銘柄シンボル (例: 'BTC', 'ETH')
 * @param {number} days - 日数 (例: 30)
 * @returns {string} キャッシュキー
 */
function getPriceHistoryCacheKey(coinName, days = 30) {
  return `${coinName.toLowerCase()}_price_history_${days}d`;
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

// キャッシュの有効期限設定（ミリ秒）
const CACHE_DURATIONS = Object.freeze({
    CURRENT_PRICES: 30 * 60 * 1000,      // 現在価格: 30分
    PRICE_HISTORY: 24 * 60 * 60 * 1000,  // 価格履歴: 24時間
    CHART_DATA: 6 * 60 * 60 * 1000,      // チャートデータ: 6時間
    MAX_STORAGE_SIZE: 50 * 1024 * 1024,  // 最大50MB
    CLEANUP_THRESHOLD: 0.8               // 80%使用時にクリーンアップ
});

// グローバルに公開
window.CACHE_DURATIONS = CACHE_DURATIONS;

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
}

// ===================================================================
// グローバルシングルトンインスタンス
// ===================================================================

// シングルトンインスタンスを作成してグローバルに公開
window.cache = new CacheService();

// 後方互換性のためのエイリアス
window.CacheService = CacheService;
  