// ===================================================================
// STORAGE-UTILS.JS - Centralized localStorage management utilities
// ===================================================================

/**
 * localStorage操作の共通ユーティリティ
 * api.jsとcharts.jsで重複していたキャッシュ管理機能を統合
 */

// ===================================================================
// CACHE DURATION CONSTANTS
// ===================================================================

const CACHE_DURATIONS = {
    CURRENT_PRICES: 30 * 60 * 1000,      // 現在価格: 30分
    PRICE_HISTORY: 24 * 60 * 60 * 1000,  // 価格履歴: 24時間
    CHART_DATA: 6 * 60 * 60 * 1000,      // チャートデータ: 6時間
    MAX_STORAGE_SIZE: 50 * 1024 * 1024,  // 最大50MB
    CLEANUP_THRESHOLD: 0.8                // 80%使用時にクリーンアップ
};

// グローバル公開
window.CACHE_DURATIONS = CACHE_DURATIONS;

// ===================================================================
// BASIC CACHE OPERATIONS
// ===================================================================

/**
 * キャッシュデータを取得
 * @param {string} key - キャッシュキー
 * @returns {object|null} キャッシュデータ（{value, timestamp, duration}）またはnull
 */
function getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        return null;
    }
}

/**
 * キャッシュデータを保存
 * @param {string} key - キャッシュキー
 * @param {any} value - 保存する値
 * @param {number} duration - キャッシュ有効期間（ミリ秒）
 */
function setCachedData(key, value, duration = CACHE_DURATIONS.CURRENT_PRICES) {
    try {
        // ストレージ使用量チェック
        checkStorageUsage();

        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration,
            key: key,
            size: JSON.stringify(value).length
        };

        const serializedData = JSON.stringify(data);
        localStorage.setItem(key, serializedData);

        // メタデータ更新
        updateCacheMetadata(key, data.size, duration);

    } catch (error) {
        console.error('キャッシュ保存エラー:', error);

        // ストレージ容量不足の場合、古いデータを削除して再試行
        if (error.name === 'QuotaExceededError') {
            cleanupOldCache();

            try {
                const data = {
                    value: value,
                    timestamp: Date.now(),
                    duration: duration,
                    key: key
                };
                localStorage.setItem(key, JSON.stringify(data));
            } catch (retryError) {
                console.error('キャッシュ保存再試行失敗:', retryError);
                if (typeof showWarningMessage === 'function') {
                    showWarningMessage('ストレージ容量不足のため、一部のデータが保存できませんでした');
                }
            }
        }
    }
}

/**
 * キャッシュの有効期限をチェック
 * @param {object} cachedData - キャッシュデータオブジェクト
 * @returns {boolean} 期限切れの場合true
 */
function isCacheExpired(cachedData) {
    if (!cachedData || !cachedData.timestamp || !cachedData.duration) {
        return true;
    }
    return (Date.now() - cachedData.timestamp) > cachedData.duration;
}

/**
 * キャッシュが有効期限内かチェック（逆のロジック）
 * @param {object} cachedData - キャッシュデータオブジェクト
 * @returns {boolean} 有効期限内の場合true
 */
function isCacheWithinExpiration(cachedData) {
    return !isCacheExpired(cachedData);
}

// ===================================================================
// ADVANCED CACHE OPERATIONS
// ===================================================================

/**
 * メタデータ付きキャッシュ取得（保存時刻情報付き）
 * @param {string} key - キャッシュキー
 * @returns {object|null} {value, timestamp, duration, key} またはnull
 */
function getCachedDataWithMetadata(key) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // 保存時のdurationを使用
            const effectiveDuration = data.duration || CACHE_DURATIONS.CURRENT_PRICES;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                return {
                    value: data.value,
                    timestamp: data.timestamp,
                    duration: data.duration,
                    key: data.key
                };
            } else {
                // 期限切れの場合は削除
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        // 破損したキャッシュを削除
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

// ===================================================================
// STORAGE MANAGEMENT
// ===================================================================

/**
 * ストレージ使用量を監視
 */
function checkStorageUsage() {
    try {
        // 概算使用量計算
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length;
            }
        }

        const usageRatio = totalSize / CACHE_DURATIONS.MAX_STORAGE_SIZE;

        if (usageRatio > CACHE_DURATIONS.CLEANUP_THRESHOLD) {
            cleanupOldCache();
        }

    } catch (error) {
        console.error('ストレージ使用量チェックエラー:', error);
    }
}

/**
 * 古いキャッシュデータをクリーンアップ
 * @returns {number} 削除したキャッシュの数
 */
function cleanupOldCache() {
    try {
        const cacheKeys = [];
        const now = Date.now();

        // キャッシュキーを収集
        for (let key in localStorage) {
            if (key.includes('_price_history_') || key.includes('prices_') || key.includes('_chart_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    if (data.timestamp) {
                        cacheKeys.push({
                            key: key,
                            timestamp: data.timestamp,
                            age: now - data.timestamp,
                            size: localStorage[key].length
                        });
                    }
                } catch (e) {
                    // 破損したデータは削除対象
                    cacheKeys.push({
                        key: key,
                        timestamp: 0,
                        age: Infinity,
                        size: localStorage[key].length
                    });
                }
            }
        }

        // 古い順にソート
        cacheKeys.sort((a, b) => b.age - a.age);

        // 削除対象を決定: 期限切れデータを優先削除、それでも足りなければ古いものから30%削除
        let deleteCount = 0;
        let deletedSize = 0;
        const keysToDelete = [];

        // まず期限切れデータを収集
        for (const item of cacheKeys) {
            const duration = item.key.includes('_price_history_') ?
                CACHE_DURATIONS.PRICE_HISTORY :
                CACHE_DURATIONS.CURRENT_PRICES;

            if (item.age > duration) {
                keysToDelete.push(item);
            }
        }

        // 期限切れだけでは不十分な場合、古いものから30%削除
        if (keysToDelete.length < cacheKeys.length * 0.1) {
            const additionalCount = Math.ceil(cacheKeys.length * 0.3) - keysToDelete.length;
            for (let i = 0; i < additionalCount && i < cacheKeys.length; i++) {
                if (!keysToDelete.includes(cacheKeys[i])) {
                    keysToDelete.push(cacheKeys[i]);
                }
            }
        }

        // 削除実行
        for (const item of keysToDelete) {
            localStorage.removeItem(item.key);
            deletedSize += item.size;
            deleteCount++;
        }

        return deleteCount;

    } catch (error) {
        console.error('キャッシュクリーンアップエラー:', error);
        return 0;
    }
}

/**
 * キャッシュメタデータを更新
 * @param {string} key - キャッシュキー
 * @param {number} size - データサイズ
 * @param {number} duration - 有効期間
 */
function updateCacheMetadata(key, size, duration) {
    try {
        const metadata = JSON.parse(localStorage.getItem('cache_metadata') || '{}');
        metadata[key] = {
            size: size,
            duration: duration,
            lastAccess: Date.now()
        };
        localStorage.setItem('cache_metadata', JSON.stringify(metadata));
    } catch (error) {
        console.error('キャッシュメタデータ更新エラー:', error);
    }
}

// ===================================================================
// CACHE STATUS AND REPORTING
// ===================================================================

/**
 * 価格データの永続化状態を確認
 * @returns {object} 価格データの状態情報
 */
function getPriceDataStatus() {
    const status = {
        currentPrices: null,
        priceHistories: [],
        totalCacheSize: 0,
        oldestData: null,
        newestData: null
    };

    try {
        // 現在価格データ
        const currentPricesKey = Object.keys(localStorage).find(key => key.startsWith('prices_'));
        if (currentPricesKey) {
            const data = JSON.parse(localStorage[currentPricesKey]);
            status.currentPrices = {
                key: currentPricesKey,
                timestamp: data.timestamp,
                age: Date.now() - data.timestamp,
                coinNames: data.value._metadata?.coinNames || []
            };
        }

        // 価格履歴データ
        for (let key in localStorage) {
            if (key.includes('_price_history_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    const coinName = key.split('_')[0].toUpperCase();
                    status.priceHistories.push({
                        coinName: coinName,
                        key: key,
                        timestamp: data.timestamp,
                        age: Date.now() - data.timestamp,
                        dataPoints: data.value?.length || 0
                    });

                    status.totalCacheSize += localStorage[key].length;

                    if (!status.oldestData || data.timestamp < status.oldestData.timestamp) {
                        status.oldestData = { key, timestamp: data.timestamp };
                    }
                    if (!status.newestData || data.timestamp > status.newestData.timestamp) {
                        status.newestData = { key, timestamp: data.timestamp };
                    }
                } catch (e) {
                    // エラーは無視
                }
            }
        }

    } catch (error) {
        console.error('価格データ状態確認エラー:', error);
    }

    return status;
}

/**
 * 価格データ永続化レポートを表示
 * @returns {object} 価格データの状態情報
 */
function showPriceDataReport() {
    return getPriceDataStatus();
}

// ===================================================================
// GLOBAL EXPORTS
// ===================================================================

// グローバルスコープに関数を公開
window.getCachedData = getCachedData;
window.setCachedData = setCachedData;
window.isCacheExpired = isCacheExpired;
window.isCacheWithinExpiration = isCacheWithinExpiration;
window.getCachedDataWithMetadata = getCachedDataWithMetadata;
window.checkStorageUsage = checkStorageUsage;
window.cleanupOldCache = cleanupOldCache;
window.updateCacheMetadata = updateCacheMetadata;
window.getPriceDataStatus = getPriceDataStatus;
window.showPriceDataReport = showPriceDataReport;
