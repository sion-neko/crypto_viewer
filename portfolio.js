// ===================================================================
// PORTFOLIO.JS - Portfolio analysis, calculations, and display
// ===================================================================

// ===================================================================
// PORTFOLIO DATA SERVICE CLASS
// ===================================================================

/**
 * ポートフォリオデータを管理するサービスクラス
 * CacheServiceと連携してデータの取得・更新を行う
 */
class PortfolioDataService {
    constructor() {
        this.currentData = null;
        this.sortField = 'realizedProfit';
        this.sortDirection = 'desc';
    }

    /**
     * ポートフォリオデータを取得
     * @returns {object|null} ポートフォリオデータ
     */
    getData() {
        // メモリキャッシュがあればそれを返す
        if (this.currentData) {
            return this.currentData;
        }

        // なければCacheServiceから取得
        this.currentData = cache.getPortfolioData();
        return this.currentData;
    }

    /**
     * ポートフォリオデータを更新
     * @param {object} portfolioData - 新しいポートフォリオデータ
     */
    updateData(portfolioData) {
        if (portfolioData) {
            this.currentData = portfolioData;

            // 保存用のコピーを作成して価格情報をクリア
            // （価格は個別キャッシュ price_btc などから取得するため、永続化不要）
            const dataToSave = JSON.parse(JSON.stringify(portfolioData));
            clearPriceDataFromPortfolio(dataToSave);
            safeSetJSON('portfolioData', dataToSave);
        }
    }

    /**
     * 現在のソート状態を取得
     * @returns {object} {field, direction}
     */
    getSortState() {
        return {
            field: this.sortField,
            direction: this.sortDirection
        };
    }

    /**
     * ソート状態を更新
     * @param {string} field - ソートフィールド
     * @param {string} direction - ソート方向 ('asc' or 'desc')
     */
    setSortState(field, direction) {
        this.sortField = field;
        this.sortDirection = direction;
    }

    /**
     * メモリキャッシュをクリア（次回getData()時に再読み込み）
     */
    clearCache() {
        this.currentData = null;
    }

    /**
     * ポートフォリオデータが存在するか確認
     * @returns {boolean}
     */
    hasData() {
        return this.getData() !== null;
    }
}

// シングルトンインスタンスを作成してグローバルに公開
window.portfolioDataService = new PortfolioDataService();

// ===================================================================
// PORTFOLIO UPDATE HELPER
// ===================================================================

/**
 * ポートフォリオ表示を更新（共通処理）
 * @param {object} portfolioData - ポートフォリオデータ（省略可）
 * @param {string} message - 成功メッセージ（省略可）
 */
function refreshPortfolioDisplay(portfolioData = null, message = null) {
    // ポートフォリオデータが渡された場合、PortfolioDataServiceを更新
    if (portfolioData) {
        portfolioDataService.updateData(portfolioData);
    }

    // PortfolioDataServiceから現在のデータとソート状態を取得
    const currentData = portfolioDataService.getData();
    const sortState = portfolioDataService.getSortState();

    // 現在のソート順を維持してテーブル再描画
    sortPortfolioData(sortState.field, sortState.direction);

    const tableContainer = document.getElementById('portfolio-table-container');
    if (tableContainer) {
        tableContainer.innerHTML = generatePortfolioTable(currentData);
    }

    // サマリー部分も更新（総合損益反映のため）
    updateDataStatus(currentData);

    // 銘柄別サブタブを再生成（価格更新を反映）
    try {
        createCoinNameSubtabs(currentData);
    } catch (error) {
        console.error('❌ Error regenerating coin subtabs:', error);
    }

    // 成功メッセージ表示
    if (message) {
        showSuccessMessage(message);
    }

    // 価格ステータス更新
    updatePriceStatus();
}

// ===================================================================
// PORTFOLIO ANALYSIS FUNCTIONS
// ===================================================================

// ポートフォリオ分析（損益計算強化版）
function analyzePortfolioData(transactions) {
    // 新しいPortfolioAnalyzerクラスに委譲
    const result = window.portfolioAnalyzer.analyze(transactions);

    return {
        summary: result.summary,
        stats: result.stats,
        coins: {}, // 互換性のため保持（使用されていない）
        lastUpdated: new Date().toISOString()
    };
}

// ===================================================================
// TABLE SORTING FUNCTIONS
// ===================================================================

// テーブルソート機能
function sortTable(field) {
    const currentData = portfolioDataService.getData();
    if (!currentData) return;

    const sortState = portfolioDataService.getSortState();
    let newDirection;

    // 同じフィールドクリック時は方向を逆転
    if (sortState.field === field) {
        newDirection = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        // 新しいフィールドの場合は降順から開始
        newDirection = 'desc';
    }

    // ソート状態を更新
    portfolioDataService.setSortState(field, newDirection);

    sortPortfolioData(field, newDirection);

    // テーブル再描画
    const tableContainer = document.getElementById('portfolio-table-container');
    tableContainer.innerHTML = generatePortfolioTable(currentData);
}

// ポートフォリオデータソート
function sortPortfolioData(field, direction) {
    const currentData = portfolioDataService.getData();
    if (!currentData || !currentData.summary) return;

    // 新しいPortfolioAnalyzerクラスに委譲
    currentData.summary = window.portfolioAnalyzer.sort(currentData.summary, field, direction);

    updateSortIndicators(field, direction);
}

// ソートアイコン取得
function getSortIcon(field) {
    const sortState = portfolioDataService.getSortState();
    if (sortState.field === field) {
        return sortState.direction === 'asc' ? '▲' : '▼';
    }
    return '';
}

// ソート方向表示更新
function updateSortIndicators(activeField, direction) {
    const fields = ['coinName', 'holdingQuantity', 'averagePurchaseRate', 'totalInvestment',
        'currentPrice', 'currentValue', 'totalSellAmount', 'realizedProfit',
        'unrealizedProfit', 'totalProfit'];

    fields.forEach(field => {
        const indicator = document.getElementById(`sort-${field}`);
        if (indicator) {
            if (field === activeField) {
                indicator.textContent = direction === 'asc' ? '▲' : '▼';
                indicator.style.color = '#3498db';
            } else {
                indicator.textContent = '';
                indicator.style.color = '';
            }
        }
    });
}

// ===================================================================
// DASHBOARD AND DISPLAY FUNCTIONS
// ===================================================================

// ダッシュボード表示（タブシステム版）
function displayDashboard(portfolioData) {
    // PortfolioDataServiceに保存
    portfolioDataService.updateData(portfolioData);

    // デフォルトソート（実現損益降順）
    portfolioDataService.setSortState('realizedProfit', 'desc');
    sortPortfolioData('realizedProfit', 'desc');

    // 旧表示エリアを非表示
    document.getElementById('dashboardArea').style.display = 'none';

    // タブコンテナを表示
    document.getElementById('tabContainer').style.display = 'block';

    // チャート表示エリアを一度だけ初期化（ソート時に消えないように）
    const chartContainer = document.getElementById('portfolio-chart-container');
    if (!chartContainer.hasChildNodes()) {
        if (isMobile()) {
            // モバイル版チャート
            chartContainer.innerHTML = `
                <div class="table-card" style="background: white; border: 1px solid #cbd5e1; margin-bottom: 15px;">
                    <div class="card-header">
                        <span>📈 ポートフォリオ総合損益推移（過去1か月）</span>
                        <div style="float: right;">
                            <button onclick="renderAllCoinNamesProfitChart()" style="padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                                更新
                            </button>
                        </div>
                    </div>
                    <div style="height: 300px; padding: 10px; position: relative;">
                        <canvas id="mobile-all-coinNames-profit-chart" style="max-height: 300px;"></canvas>
                    </div>
                </div>
            `;
        } else {
            // デスクトップ版チャート
            chartContainer.innerHTML = `
                <div style="margin-bottom: 25px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                        <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">📈 ポートフォリオ総合損益推移（過去1か月）</h3>
                        <div>
                            <button onclick="renderAllCoinNamesProfitChart()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                                チャート更新
                            </button>
                        </div>
                    </div>
                    <div style="height: 400px; position: relative;">
                        <canvas id="all-coinNames-profit-chart" style="max-height: 400px;"></canvas>
                    </div>
                </div>
            `;
        }
    }

    // ポートフォリオテーブル表示
    const tableContainer = document.getElementById('portfolio-table-container');
    const currentData = portfolioDataService.getData();
    tableContainer.innerHTML = generatePortfolioTable(currentData);

    // キャッシュに価格データがある場合は自動的に復元
    const coinNames = portfolioData.summary.map(item => item.coinName);

    // 個別銘柄のキャッシュからタイムスタンプを収集
    const cacheTimestamps = [];
    const cachedPriceData = {};

    for (const coinName of coinNames) {
        const cacheKey = window.cacheKeys.currentPrice(coinName);
        const cached = window.cache.get(cacheKey);
        if (cached) {
            const rawData = window.cache.storage.getItem(cacheKey);
            if (rawData) {
                const parsedData = JSON.parse(rawData);
                cacheTimestamps.push(parsedData.timestamp);
                cachedPriceData[coinName] = cached;
            }
        }
    }

    // キャッシュされた価格データがある場合
    if (Object.keys(cachedPriceData).length > 0) {
        // キャッシュから価格を復元
        const pricesObject = {};
        for (const [coinName, priceData] of Object.entries(cachedPriceData)) {
            pricesObject[coinName] = priceData;
        }
        pricesObject._metadata = { lastUpdate: Math.min(...cacheTimestamps) };

        updatePortfolioWithPrices(portfolioData, pricesObject);
        portfolioDataService.updateData(portfolioData);
        const updatedData = portfolioDataService.getData();
        tableContainer.innerHTML = generatePortfolioTable(updatedData);
        // portfolioDataの保存はupdateData()内で実行済み（価格情報はクリアして保存）

        // 価格ステータスを更新（実際のキャッシュ状態を表示）
        if (typeof updatePriceStatus === 'function') {
            updatePriceStatus();
        }
    } else {
        // キャッシュが全くない場合は自動的に価格を取得
        if (typeof updatePriceStatus === 'function') {
            updatePriceStatus('価格データ取得中...');
        }

        // 自動的に価格を取得
        setTimeout(() => {
            if (typeof fetchCurrentPrices === 'function') {
                fetchCurrentPrices();
            }
        }, 1000);
    }

    // 取引履歴テーブル表示
    const tradingContainer = document.getElementById('trading-history-container');
    tradingContainer.innerHTML = generateTradingHistoryTable(portfolioData);

    // 銘柄別サブタブ作成
    try {
        createCoinNameSubtabs(portfolioData);
    } catch (error) {
        console.error('❌ Error in createCoinNameSubtabs:', error);
    }

    // サマリータブを明示的にアクティブに設定
    setTimeout(() => {
        switchSubtab('summary');

        // 事前キャッシュは全銘柄チャート描画で一括処理するため削除
    }, 50);

    updateDataStatus(portfolioData);

    // アップロード成功後はダッシュボードページに切り替え
    showPage('dashboard');

    // 全銘柄の損益推移チャートを描画（DOM準備完了後）
    setTimeout(() => {
        // サマリータブは常に全体表示（combined）モードで描画
        renderAllCoinNamesProfitChart(portfolioData, 'combined');
    }, 800); // DOM要素の準備を待つため少し短縮
}

// データ状態更新
function updateDataStatus(portfolioData) {
    const statusElement = document.getElementById('data-status');
    const managementElement = document.getElementById('data-management');

    if (portfolioData && portfolioData.summary.length > 0) {
        const stats = portfolioData.stats;
        // 総合損益を優先表示（含み損益込み）
        const displayProfit = stats.totalProfit || stats.totalRealizedProfit;
        const profitColor = displayProfit >= 0 ? '#27ae60' : '#e74c3c';
        const profitIcon = displayProfit > 0 ? '📈' : displayProfit < 0 ? '📉' : '➖';

        statusElement.innerHTML = `
            <div style="color: #27ae60; font-weight: 600;">✅ データあり</div>
            <div style="margin-top: 5px; font-size: 0.8rem;">
                ${stats.coinNameCount}銘柄<br>
                投資額: ¥${stats.totalInvestment.toLocaleString()}<br>
                <span style="color: ${profitColor}; font-weight: 600;">
                    ${profitIcon} ¥${Math.round(displayProfit).toLocaleString()}
                </span>
                ${stats.totalUnrealizedProfit !== undefined ? `<br><span style="font-size: 0.7rem; color: #6c757d;">実現+含み損益</span>` : ''}
            </div>
        `;
        managementElement.style.display = 'block';
    } else {
        statusElement.innerHTML = `<div style="color: #7f8c8d;">データなし</div>`;
        managementElement.style.display = 'none';
    }
}

// ===================================================================
// SUBTAB CREATION AND MANAGEMENT
// ===================================================================

// 銘柄別サブタブ生成（サービスクラスへの委譲版）
function createCoinNameSubtabs(portfolioData) {
    window.uiService.createCoinSubTabs(portfolioData);
}

// ===================================================================
// LEGACY RENDERING FUNCTIONS - DEPRECATED
// ===================================================================
// These functions are kept for backward compatibility during migration.
// All rendering logic has been moved to TableRenderer in ui-service.js.
// These will be removed in a future update.

function generateMobilePortfolioCards(portfolioData) {
    return window.uiService.tableRenderer._renderMobilePortfolioCards(portfolioData);
}

function generatePortfolioTable(portfolioData) {
    return window.uiService.tableRenderer._renderDesktopPortfolioTable(portfolioData);
}

function generateMobileTradingCards(portfolioData) {
    return window.uiService.tableRenderer._renderMobileTradingCards(portfolioData);
}

function generateTradingHistoryTable(portfolioData) {
    return window.uiService.tableRenderer._renderDesktopTradingHistoryTable(portfolioData);
}

function generateCoinNameDetailPage(coinNameSummary, coinNameData) {
    return window.uiService.tableRenderer.renderCoinDetailPage(coinNameSummary);
}