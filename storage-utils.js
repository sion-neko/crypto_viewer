// storage-utils.js - キャッシュ管理ユーティリティ

// ========== CACHE KEY GENERATION FUNCTIONS ==========

/**
* 現在価格データのキャッシュキーを生成
* @param {string} coinName - 銘柄シンボル (例: 'BTC')
* @returns {string} キャッシュキー
*/
function getCurrentPriceCacheKey(coinName) {
    return `price_${coinName.toLowerCase()}`;
}

// キャッシュの有効期限設定を AppConfig から取得
const CACHE_DURATIONS = AppConfig.cacheDurations;

// キャッシュキー生成関数をグローバルに公開
window.cacheKeys = {
    currentPrice: getCurrentPriceCacheKey
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
            this.storage.setItem(key, JSON.stringify(data));
        } catch (e) {
            console.error('キャッシュ保存失敗:', e);
        }
    }

    /**
     * キャッシュからデータを取得（TTL付き）
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
     * ポートフォリオデータを取得
     * @returns {object|null} ポートフォリオデータまたはnull
     */
    getPortfolioData() {
        try {
            const data = this.storage.getItem('portfolioData');
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('ポートフォリオデータ読み込みエラー:', error);
            return null;
        }
    }

    /**
     * ポートフォリオデータを保存
     * @param {object} value - ポートフォリオデータ
     */
    setPortfolioData(value) {
        try {
            this.storage.setItem('portfolioData', JSON.stringify(value));
        } catch (error) {
            console.error('ポートフォリオデータ保存エラー:', error);
        }
    }

    /**
     * 生の取引データを取得
     * @returns {Array} 取引データ配列
     */
    getRawTransactions() {
        try {
            const data = this.storage.getItem('rawTransactions');
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('取引データ読み込みエラー:', error);
            return [];
        }
    }

    /**
     * 生の取引データを保存
     * @param {Array} value - 取引データ配列
     */
    setRawTransactions(value) {
        try {
            this.storage.setItem('rawTransactions', JSON.stringify(value));
        } catch (error) {
            console.error('取引データ保存エラー:', error);
        }
    }

    /**
     * 読み込み済みファイル名を取得
     * @returns {string[]} ファイル名の配列
     */
    getLoadedFileNames() {
        try {
            const data = this.storage.getItem('loadedFileNames');
            return data ? JSON.parse(data) : [];
        } catch (error) {
            console.error('ファイル名読み込みエラー:', error);
            return [];
        }
    }

    /**
     * 読み込み済みファイル名を保存
     * @param {string[]} value - ファイル名の配列
     */
    setLoadedFileNames(value) {
        try {
            this.storage.setItem('loadedFileNames', JSON.stringify(value));
        } catch (error) {
            console.error('ファイル名保存エラー:', error);
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
     * 価格キャッシュのみをクリア
     * @returns {number} クリアしたキャッシュ数
     */
    clearPriceCache() {
        let clearedCount = 0;
        const keysToDelete = [];

        for (let key in this.storage) {
            if (key.startsWith('price_')) {
                keysToDelete.push(key);
            }
        }

        keysToDelete.forEach(key => {
            this.storage.removeItem(key);
            clearedCount++;
        });

        return clearedCount;
    }

    /**
     * キャッシュが期限切れかチェック
     * @param {object} data - キャッシュデータオブジェクト
     * @returns {boolean} 期限切れの場合true
     */
    _isExpired(data) {
        return !data?.timestamp || Date.now() - data.timestamp > (data.duration || 0);
    }
}

// グローバルシングルトンインスタンス
window.cache = new CacheService();
window.CacheService = CacheService;

// ========== PORTFOLIO DATA UTILITY FUNCTIONS ==========

/**
 * ポートフォリオデータから価格情報を削除（永続化前の処理）
 * @param {object} portfolioData - ポートフォリオデータ
 */
function clearPriceDataFromPortfolio(portfolioData) {
    if (!portfolioData || !portfolioData.summary) {
        return;
    }

    portfolioData.summary.forEach(item => {
        item.currentPrice = 0;
        item.currentValue = 0;
        item.unrealizedProfit = 0;
        item.totalProfit = item.realizedProfit;
    });

    if (portfolioData.stats) {
        portfolioData.stats.totalUnrealizedProfit = 0;
        portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit;
        portfolioData.stats.totalProfitableCoinNames = portfolioData.summary.filter(s => s.realizedProfit > 0).length;
        portfolioData.stats.totalLossCoinNames = portfolioData.summary.filter(s => s.realizedProfit < 0).length;
        portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
            (portfolioData.stats.totalRealizedProfit / portfolioData.stats.totalInvestment) * 100 : 0;
    }
}

/**
 * 指定銘柄の取引履歴を取得
 * @param {string} coinName - 銘柄名
 * @returns {object} { all: [], buy: [], sell: [] } 形式の取引履歴
 */
function getTransactionsByCoin(coinName) {
    const rawTransactions = window.cache.getRawTransactions();
    const all = rawTransactions.filter(tx => tx.coinName === coinName);
    const buy = all.filter(tx => tx.type === '買');
    const sell = all.filter(tx => tx.type === '売');
    return { all, buy, sell };
}

// グローバルに公開
window.clearPriceDataFromPortfolio = clearPriceDataFromPortfolio;
window.getTransactionsByCoin = getTransactionsByCoin;

// ========== PROFIT CALCULATION UTILITIES ==========

/**
 * 加重平均価格を計算
 */
function calculateWeightedAverage(currentQty, currentAvgPrice, newQty, newPrice) {
    const newTotalValue = (currentQty * currentAvgPrice) + (newQty * newPrice);
    const totalQty = currentQty + newQty;
    const weightedAvgPrice = totalQty > 0 ? newTotalValue / totalQty : 0;
    return { totalQty, weightedAvgPrice };
}

/**
 * 実現損益を計算（売却時）
 */
function calculateRealizedProfit(sellAmount, sellQty, avgPurchaseRate) {
    return sellAmount - (sellQty * avgPurchaseRate);
}

/**
 * 含み損益を計算
 */
function calculateUnrealizedProfit(holdingQty, currentPrice, avgPurchaseRate) {
    if (holdingQty <= 0 || avgPurchaseRate <= 0 || currentPrice <= 0) {
        return 0;
    }
    const currentValue = holdingQty * currentPrice;
    const holdingCost = holdingQty * avgPurchaseRate;
    return currentValue - holdingCost;
}
