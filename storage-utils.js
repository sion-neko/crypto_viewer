// storage-utils.js - キャッシュ管理ユーティリティ


// ========== CACHE KEY GENERATION FUNCTIONS (from cache-keys.js) ==========

/**
 * 蓄積価格履歴データのキャッシュキーを生成
 * @param {string} coinName - 銘柄シンボル (例: 'BTC', 'ETH')
 * @returns {string} キャッシュキー
 */
function getAccumulatedPriceHistoryCacheKey(coinName) {
  return `${coinName.toLowerCase()}_accumulated_price_history`;
}

/**
* 現在価格データのキャッシュキーを生成（個別銘柄）
* @param {string} coinName - 銘柄シンボル (例: 'BTC')
* @returns {string} キャッシュキー
*/
function getCurrentPriceCacheKey(coinName) {
  return `price_${coinName.toLowerCase()}`;
}

/**
* 現在価格データのキャッシュキーを生成（複数銘柄）- 非推奨
* @deprecated 個別銘柄キャッシュ (getCurrentPriceCacheKey) を使用してください
* @param {string|string[]} coinNames - 銘柄シンボル（配列または単一）
* @returns {string} キャッシュキー
*/
function getCurrentPricesCacheKey(coinNames) {
  // 後方互換性: 単一銘柄の場合は個別キャッシュキーを返す
  if (typeof coinNames === 'string') {
    return getCurrentPriceCacheKey(coinNames);
  }
  // 配列の場合も個別キャッシュに誘導するため、最初の銘柄のキーを返す
  if (Array.isArray(coinNames) && coinNames.length === 1) {
    return getCurrentPriceCacheKey(coinNames[0]);
  }
  // 互換性のため、従来形式も維持（将来削除予定）
  return `prices_${coinNames.sort().join('_')}`;
}

// キャッシュの有効期限設定を AppConfig から取得
const CACHE_DURATIONS = AppConfig.cacheDurations;

// 後方互換性のため、グローバルにも公開
window.CACHE_DURATIONS = CACHE_DURATIONS;

// キャッシュキー生成関数をオブジェクトにまとめてグローバルに公開
window.cacheKeys = {
    priceHistory: getAccumulatedPriceHistoryCacheKey,  // 蓄積データに統一
    currentPrice: getCurrentPriceCacheKey,              // 新: 個別銘柄キャッシュ（推奨）
    currentPrices: getCurrentPricesCacheKey             // 旧: 複数銘柄キャッシュ（非推奨）
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
     * キャッシュからデータを取得（TTL付き/無し両対応）
     * @param {string} key - キャッシュキー
     * @param {*} defaultValue - 読み込み失敗時のデフォルト値
     * @returns {*} キャッシュされた値（期限切れまたは存在しない場合はdefaultValue）
     */
    get(key, defaultValue = null) {
        try {
            const raw = this.storage.getItem(key);
            if (!raw) return defaultValue;

            const data = JSON.parse(raw);

            // TTL形式かチェック（timestamp と value プロパティの存在で判定）
            if (data && typeof data === 'object' && 'timestamp' in data && 'value' in data) {
                // TTL形式: 期限チェック
                if (this._isExpired(data)) {
                    this.storage.removeItem(key);
                    return defaultValue;
                }
                return data.value;
            }

            // 通常形式: そのまま返す
            return data;
        } catch (e) {
            console.error(`localStorage読み込みエラー (${key}):`, e);
            return defaultValue;
        }
    }

    /**
     * JSONデータをlocalStorageに安全に保存する（TTLなし）
     * set()との違い: TTLラッパーを付けずに直接保存
     * @param {string} key - localStorageキー
     * @param {*} value - 保存する値（自動的にJSON文字列化される）
     * @returns {boolean} 保存成功時true、失敗時false
     */
    setJSON(key, value) {
        try {
            this.storage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error(`localStorage保存エラー (${key}):`, error);
            return false;
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
            if (key.includes('_price_history_') ||
                key.includes('prices_') ||      // 旧形式（セット単位）
                key.startsWith('price_') ||     // 新形式（個別銘柄）
                key.includes('chart_') ||
                key === 'currentPrices' ||
                key === 'lastPriceUpdate' ||
                key === 'cache_metadata') {
                keysToDelete.push(key);
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
     * 旧形式の価格キャッシュ（複数銘柄セット）を削除
     * 新形式の個別銘柄キャッシュは保持
     * @returns {number} 削除したキャッシュ数
     */
    cleanupLegacyPriceCache() {
        let clearedCount = 0;
        const keysToDelete = [];

        // 旧形式の prices_BTC_ETH_... 形式のキーを特定
        for (let key in this.storage) {
            // prices_ で始まり、アンダースコアが複数含まれる = 複数銘柄セット
            if (key.startsWith('prices_') && (key.match(/_/g) || []).length > 1) {
                keysToDelete.push(key);
            }
        }

        // 旧形式キャッシュを削除
        keysToDelete.forEach(key => {
            this.storage.removeItem(key);
            clearedCount++;
        });

        if (clearedCount > 0) {
            console.log(`旧形式の価格キャッシュを${clearedCount}件削除しました`);
        }

        return clearedCount;
    }

    /**
     * 旧チャートキャッシュ（chart_*）をクリーンアップ
     * price_historyへの統合により不要になったチャートキャッシュを削除
     * @returns {number} クリアしたキャッシュ数
     */
    cleanupLegacyChartCache() {
        let clearedCount = 0;
        const keysToDelete = [];

        // chart_ で始まる旧キャッシュキーを検出
        for (let key in this.storage) {
            if (this.storage.hasOwnProperty(key) && key.startsWith('chart_')) {
                keysToDelete.push(key);
            }
        }

        // 旧キャッシュを削除
        keysToDelete.forEach(key => {
            this.storage.removeItem(key);
            clearedCount++;
        });

        if (clearedCount > 0) {
            console.log(`旧チャートキャッシュ ${clearedCount} 件をクリーンアップしました（chart_* → price_history に統合済み）`);
        }

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
            totalSize += this.storage[key].length;
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
        return this.get('portfolioData', null);
    }
}

// ========== グローバルシングルトンインスタンス ==========

// シングルトンインスタンスを作成してグローバルに公開
window.cache = new CacheService();

// 後方互換性のためのエイリアス
window.CacheService = CacheService;

// ========== LOCALSTORAGE UTILITY FUNCTIONS ==========
// 注: safeGetJSON/safeSetJSON/safeRemoveItemは削除されました
// 代わりにCacheServiceのgetJSON/setJSON/deleteメソッドを使用してください

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

// ========== PROFIT CALCULATION UTILITIES ==========

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
 * portfolioDataから価格情報をクリア（永続化前の処理）
 * 価格データは個別キャッシュ（price_btc など）から取得するため、
 * portfolioDataには保存しない
 * @param {object} portfolioData - ポートフォリオデータ
 */
function clearPriceDataFromPortfolio(portfolioData) {
    if (!portfolioData || !portfolioData.summary) {
        return;
    }

    // 各銘柄の価格情報をクリア
    portfolioData.summary.forEach(item => {
        item.currentPrice = 0;
        item.currentValue = 0;
        item.unrealizedProfit = 0;
        item.totalProfit = item.realizedProfit; // 実現損益のみ
    });

    // 統計情報から含み損益をクリア
    if (portfolioData.stats) {
        portfolioData.stats.totalUnrealizedProfit = 0;
        portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit; // 実現損益のみ
        portfolioData.stats.totalProfitableCoinNames = portfolioData.summary.filter(s => s.realizedProfit > 0).length;
        portfolioData.stats.totalLossCoinNames = portfolioData.summary.filter(s => s.realizedProfit < 0).length;
        portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
            (portfolioData.stats.totalRealizedProfit / portfolioData.stats.totalInvestment) * 100 : 0;
    }
}

/**
 * rawTransactionsから特定銘柄の取引を取得
 * 取引データはportfolioDataに保存せず、rawTransactionsから動的に取得
 * @param {string} coinName - 銘柄シンボル
 * @returns {object} {all, buy, sell} 取引配列
 */
function getTransactionsByCoin(coinName) {
    const rawTransactions = window.cache.get('rawTransactions', []);
    const all = rawTransactions.filter(tx => tx.coinName === coinName);
    const buy = all.filter(tx => tx.type === '買');
    const sell = all.filter(tx => tx.type === '売');

    return { all, buy, sell };
}

  