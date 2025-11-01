// ===================================================================
// CACHE-KEYS.JS - Cache key generation functions
// ===================================================================

/**
 * キャッシュキー生成関数群
 * localStorageに保存するデータのキーを一元管理
 */

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

/**
 * キャッシュキーのパターンマッチング用の正規表現
 */
const CACHE_KEY_PATTERNS = {
    PRICE_HISTORY: /^[a-z]+_price_history_\d+d$/,
    CURRENT_PRICES: /^prices_[a-z_]+$/,
    CHART_DATA: /^chart_[A-Z]+_\d+days$/
};

/**
 * キャッシュキーの種類を判定
 * @param {string} key - キャッシュキー
 * @returns {string|null} キーの種類 ('price_history', 'current_prices', 'chart_data', null)
 */
function getCacheKeyType(key) {
    if (CACHE_KEY_PATTERNS.PRICE_HISTORY.test(key)) {
        return 'price_history';
    } else if (CACHE_KEY_PATTERNS.CURRENT_PRICES.test(key)) {
        return 'current_prices';
    } else if (CACHE_KEY_PATTERNS.CHART_DATA.test(key)) {
        return 'chart_data';
    }
    return null;
}
