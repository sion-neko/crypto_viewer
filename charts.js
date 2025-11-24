// ========== CHARTS.JS - Legacy Wrapper for ChartService ==========

// Note: This file is kept for backward compatibility.
// All actual logic has been moved to services/chart-service.js and services/api-service.js.
// This resolves issues with API rate limiting and zombie charts.

// ========== DELEGATED FUNCTIONS ==========

/**
 * 銘柄の過去の価格履歴を取得 (Delegates to APIService)
 * @param {string} coinName 
 * @returns {Promise<Array>}
 */
async function fetchCoinNamePriceHistory(coinName) {
    // APIServiceを使用して価格履歴を取得（レート制限付き）
    return await window.apiService.fetchPriceHistory(coinName, { days: 30 });
}

/**
 * 全銘柄の総合損益推移チャートを描画 (Delegates to ChartService)
 * @param {object} portfolioData
 */
async function renderAllCoinNamesProfitChart(portfolioData = null) {
    // データが渡されない場合はServiceから取得
    const data = portfolioData || window.portfolioDataService.getData();

    if (!data) {
        console.error('ポートフォリオデータがありません');
        return;
    }

    return await window.chartService.renderPortfolioProfitChart(data);
}

/**
 * 損益チャートを描画 (Delegates to ChartService)
 * @param {string} canvasId 
 * @param {Array} profitData 
 * @param {string} title 
 * @param {string} chartType 
 */
function displayProfitChart(canvasId, profitData, title, chartType = 'summary') {
    window.chartService.displayProfitChart(canvasId, profitData, title, chartType);
}


/**
 * 価格履歴を使った日次総合損益データを生成 (Delegates to ChartService)
 * @param {Array} transactions 
 * @param {Array} priceHistory 
 * @returns {Array}
 */
function generateHistoricalProfitTimeSeries(transactions, priceHistory) {
    return window.chartService._generateHistoricalProfitTimeSeries(transactions, priceHistory);
}

/**
 * 全銘柄の損益データを合計して統合損益推移を生成 (Delegates to ChartService)
 * @param {object} allProfitData 
 * @returns {Array}
 */
function generateCombinedProfitTimeSeries(allProfitData) {
    return window.chartService._generateCombinedProfitTimeSeries(allProfitData);
}

/**
 * 銘柄別チャート描画 (Delegates to ChartService)
 * @param {string} coinName 
 */
async function displayCoinNameChart(coinName) {
    await window.chartService.renderCoinChart(coinName);
}

// ========== EXPORTS ==========

// グローバルスコープに公開（既存のコードとの互換性のため）
window.fetchCoinNamePriceHistory = fetchCoinNamePriceHistory;
window.renderAllCoinNamesProfitChart = renderAllCoinNamesProfitChart;
window.displayProfitChart = displayProfitChart;
window.generateHistoricalProfitTimeSeries = generateHistoricalProfitTimeSeries;
window.generateCombinedProfitTimeSeries = generateCombinedProfitTimeSeries;
window.displayCoinNameChart = displayCoinNameChart;

console.log('✅ charts.js initialized (Delegating to ChartService)');