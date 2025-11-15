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

    // 銘柄別サブタブを再生成（価格データを反映）
    try {
        createCoinNameSubtabs(currentData);
    } catch (error) {
        console.error('❌ Error in createCoinNameSubtabs:', error);
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
    const coinNameData = {};

    transactions.forEach(tx => {
        if (!coinNameData[tx.coinName]) {
            coinNameData[tx.coinName] = {
                totalBuyAmount: 0,
                totalSellAmount: 0,
                totalQuantity: 0,
                totalFees: 0,
                totalBuyQuantity: 0,
                totalSellQuantity: 0,
                weightedRateSum: 0,
                // 取引配列は保存しない（rawTransactionsから取得）
                buyTransactionCount: 0,
                sellTransactionCount: 0
            };
        }

        const data = coinNameData[tx.coinName];

        if (tx.type === '買') {
            data.totalBuyAmount += tx.amount;
            data.totalBuyQuantity += tx.quantity;
            data.weightedRateSum += tx.rate * tx.quantity;
            data.buyTransactionCount++;
        } else if (tx.type === '売') {
            data.totalSellAmount += tx.amount;
            data.totalSellQuantity += tx.quantity;
            data.sellTransactionCount++;
        }

        data.totalQuantity += tx.type === '買' ? tx.quantity : -tx.quantity;
        data.totalFees += tx.fee;
    });

    // 各銘柄の統計・損益計算
    const portfolioSummary = [];
    let totalInvestment = 0;
    let totalRealizedProfit = 0;
    let totalFees = 0;

    Object.keys(coinNameData).forEach(coinName => {
        const data = coinNameData[coinName];
        const averagePurchaseRate = data.totalBuyQuantity > 0 ?
            data.weightedRateSum / data.totalBuyQuantity : 0;

        // 現在の保有分の投資額（平均購入レートベース）
        const currentHoldingInvestment = data.totalQuantity > 0 ?
            data.totalQuantity * averagePurchaseRate : 0;

        // 実現損益計算（売却時の損益）
        let realizedProfit = 0;
        if (data.totalSellQuantity > 0 && averagePurchaseRate > 0) {
            // 売却金額 - 売却分の平均購入コスト
            const soldCost = data.totalSellQuantity * averagePurchaseRate;
            realizedProfit = data.totalSellAmount - soldCost;
        }

        // 投資効率計算
        const investmentEfficiency = data.totalBuyAmount > 0 ?
            (realizedProfit / data.totalBuyAmount) * 100 : 0;

        const summary = {
            coinName: coinName,
            holdingQuantity: data.totalQuantity,
            totalInvestment: data.totalBuyAmount,
            currentHoldingInvestment,
            averagePurchaseRate,
            totalFees: data.totalFees,
            buyTransactionCount: data.buyTransactionCount,
            sellTransactionCount: data.sellTransactionCount,
            totalSellAmount: data.totalSellAmount,
            realizedProfit,
            investmentEfficiency,
            // 表示用の損益ステータス
            profitStatus: realizedProfit > 0 ? 'profit' : realizedProfit < 0 ? 'loss' : 'neutral'
        };

        totalInvestment += summary.totalInvestment;
        totalRealizedProfit += realizedProfit;
        totalFees += summary.totalFees;
        portfolioSummary.push(summary);
    });

    // 全体統計（総合損益対応）
    const portfolioStats = {
        totalInvestment,
        totalRealizedProfit,
        totalFees,
        overallProfitMargin: totalInvestment > 0 ? (totalRealizedProfit / totalInvestment) * 100 : 0,
        coinNameCount: portfolioSummary.length,
        profitableCoinNames: portfolioSummary.filter(s => s.realizedProfit > 0).length,
        lossCoinNames: portfolioSummary.filter(s => s.realizedProfit < 0).length,
        // 総合損益関連の統計（価格更新後に計算される）
        totalUnrealizedProfit: 0,
        totalProfit: totalRealizedProfit,
        totalProfitableCoinNames: 0,
        totalLossCoinNames: 0,
        overallTotalProfitMargin: 0
    };

    return {
        summary: portfolioSummary,
        stats: portfolioStats,
        coins: coinNameData,
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

    currentData.summary.sort((a, b) => {
        let aVal, bVal;

        // フィールド値取得
        switch (field) {
            case 'coinName':
                aVal = a.coinName;
                bVal = b.coinName;
                break;
            case 'averagePurchaseRate':
                aVal = a.averagePurchaseRate;
                bVal = b.averagePurchaseRate;
                break;
            case 'totalInvestment':
                aVal = a.totalInvestment;
                bVal = b.totalInvestment;
                break;
            case 'heldInvestment':
                aVal = a.currentHoldingInvestment;
                bVal = b.currentHoldingInvestment;
                break;
            case 'currentPrice':
                aVal = a.currentPrice || 0;
                bVal = b.currentPrice || 0;
                break;
            case 'currentValue':
                aVal = a.currentValue || 0;
                bVal = b.currentValue || 0;
                break;
            case 'realizedProfit':
                aVal = a.realizedProfit;
                bVal = b.realizedProfit;
                break;
            case 'unrealizedProfit':
                aVal = a.unrealizedProfit || 0;
                bVal = b.unrealizedProfit || 0;
                break;
            case 'totalProfit':
                aVal = a.totalProfit || a.realizedProfit;
                bVal = b.totalProfit || b.realizedProfit;
                break;
            default:
                return 0;
        }

        // ソート実行
        if (field === 'coinName') {
            // 文字列ソート
            if (direction === 'asc') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        } else {
            // 数値ソート
            if (direction === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        }
    });

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
        'unrealizedProfit', 'realizedProfit', 'totalProfit'];

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
                            <button onclick="renderAllCoinNamesProfitChart(window.cache.getPortfolioData(), 'combined')" style="padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
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
                            <button onclick="renderAllCoinNamesProfitChart(window.cache.getPortfolioData(), 'combined')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
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

        // 最も古いキャッシュのタイムスタンプを表示
        const oldestTimestamp = Math.min(...cacheTimestamps);
        const oldestDate = new Date(oldestTimestamp);
        const timeStr = oldestDate.toLocaleString('ja-JP', {
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric'
        });
        if (typeof updatePriceStatus === 'function') {
            updatePriceStatus(`${Object.keys(cachedPriceData).length}銘柄 | ${timeStr}のキャッシュ`);
        }
    } else {
        // キャッシュが全くない場合
        if (typeof updatePriceStatus === 'function') {
            updatePriceStatus('価格データなし - 手動更新してください');
        }
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
// TABLE GENERATION FUNCTIONS
// ===================================================================

// モバイル用ポートフォリオカード生成
function generateMobilePortfolioCards(portfolioData) {
    const stats = portfolioData.stats;

    // サマリーカード
    let html = `
        <div class="table-card" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px solid #3b82f6;">
            <div class="card-header">📊 ポートフォリオサマリー（${stats.coinNameCount}銘柄）</div>
            <div class="card-row">
                <span class="card-label">総合損益</span>
                <span class="card-value" style="color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}
                    (${stats.overallTotalProfitMargin >= 0 ? '+' : ''}${stats.overallTotalProfitMargin.toFixed(1)}%)
                </span>
            </div>
            <div class="card-row">
                <span class="card-label">投資額</span>
                <span class="card-value">¥${Math.abs(stats.totalInvestment).toLocaleString()}</span>
            </div>
            <div class="card-row">
                <span class="card-label">実現損益</span>
                <span class="card-value" style="color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}
                </span>
            </div>
            <div class="card-row">
                <span class="card-label">含み損益</span>
                <span class="card-value" style="color: ${stats.totalUnrealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalUnrealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit).toLocaleString()}
                </span>
            </div>
        </div>
    `;

    // 各銘柄のカード
    if (portfolioData.summary) {
        portfolioData.summary.forEach((row, index) => {
            const totalProfit = (row.realizedProfit || 0) + (row.unrealizedProfit || 0);
            const profitMargin = row.totalInvestment !== 0 ? ((totalProfit / Math.abs(row.totalInvestment)) * 100) : 0;

            html += `
                <div class="table-card" onclick="window.uiService.switchSubTab('${row.coinName.toLowerCase()}')" style="cursor: pointer;" title="タップして${row.coinName}の詳細を表示">
                    <div class="card-header" style="color: ${totalProfit >= 0 ? '#059669' : '#dc2626'};">
                        ${row.coinName}
                        <span style="float: right; font-size: 0.9rem;">
                            ${totalProfit >= 0 ? '+' : ''}¥${Math.round(totalProfit).toLocaleString()}
                        </span>
                    </div>
                    ${row.currentPrice ? `
                        <div class="card-row" style="background: #f9fafb; padding: 12px; margin: -8px -8px 8px -8px; border-radius: 4px; border-left: 3px solid #3b82f6;">
                            <span class="card-label" style="color: #6b7280; font-weight: 600; font-size: 0.85rem;">現在価格</span>
                            <span class="card-value" style="color: #111827; font-weight: 700; font-size: 1.1rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">¥${row.currentPrice.toLocaleString()}</span>
                        </div>
                    ` : ''}
                    <div class="card-row">
                        <span class="card-label">保有量</span>
                        <span class="card-value">${parseFloat(row.holdingQuantity || 0).toFixed(6)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">投資額</span>
                        <span class="card-value">¥${Math.abs(row.totalInvestment).toLocaleString()}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">実現損益</span>
                        <span class="card-value" style="color: ${row.realizedProfit >= 0 ? '#059669' : '#dc2626'};">
                            ${row.realizedProfit >= 0 ? '+' : ''}¥${Math.round(row.realizedProfit).toLocaleString()}
                        </span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">含み損益</span>
                        <span class="card-value" style="color: ${row.unrealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                            ${row.unrealizedProfit >= 0 ? '+' : ''}¥${Math.round(row.unrealizedProfit || 0).toLocaleString()}
                        </span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">損益率</span>
                        <span class="card-value" style="color: ${profitMargin >= 0 ? '#059669' : '#dc2626'};">
                            ${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(1)}%
                        </span>
                    </div>
                </div>
            `;
        });
    }

    return `<div class="mobile-card-table">${html}</div>`;
}

// ポートフォリオテーブル生成（損益計算版）
function generatePortfolioTable(portfolioData) {
    const stats = portfolioData.stats;
    const profitColor = stats.totalRealizedProfit >= 0 ? '#27ae60' : '#e74c3c';

    // 現在価格が設定されている銘柄のみフィルタ
    const coinsWithPrice = portfolioData.summary.filter(item => item.currentPrice > 0);
    const hasPriceData = coinsWithPrice.length > 0;

    let html = `
        <!-- ポートフォリオサマリー（統合版） -->
        <div style="margin-bottom: 25px; background: #ffffff; border: 1px solid #d1d5db; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">ポートフォリオサマリー（${stats.coinNameCount}銘柄）</h3>
            </div>

            <!-- 統計情報 -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
                <!-- 総合損益 -->
                <div style="text-align: center; padding: 12px; background: ${stats.totalProfit >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 6px; border: 1px solid ${stats.totalProfit >= 0 ? '#86efac' : '#fca5a5'};">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">総合損益</div>
                    <div style="font-size: 17px; font-weight: 700; color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}</div>
                    <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${stats.overallTotalProfitMargin >= 0 ? '+' : ''}${stats.overallTotalProfitMargin.toFixed(1)}%</div>
                </div>

                <!-- 投資額 -->
                <div style="text-align: center; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">投資額</div>
                    <div style="font-size: 15px; font-weight: 600; color: #374151;">¥${Math.abs(stats.totalInvestment).toLocaleString()}</div>
                </div>

                <!-- 実現損益 -->
                <div style="text-align: center; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">実現損益</div>
                    <div style="font-size: 15px; font-weight: 600; color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}</div>
                </div>

                <!-- 含み損益 -->
                <div style="text-align: center; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">含み損益</div>
                    <div style="font-size: 15px; font-weight: 600; color: ${(stats.totalUnrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(stats.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit || 0).toLocaleString()}</div>
                </div>

                <!-- 手数料 -->
                <div style="text-align: center; padding: 12px; background: #f9fafb; border-radius: 6px; border: 1px solid #e5e7eb;">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">手数料</div>
                    <div style="font-size: 15px; font-weight: 600; color: #374151;">¥${stats.totalFees.toLocaleString()}</div>
                </div>
            </div>

            ${hasPriceData ? `
            <!-- 現在価格一覧 -->
            <div>
                <div style="margin-bottom: 10px;">
                    <div style="font-size: 13px; font-weight: 600; color: #374151;">現在価格</div>
                    <div style="font-size: 11px; color: #6b7280;">CoinGecko API</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                    ${coinsWithPrice.map(item => {
                        const priceChange = item.currentPrice && item.averagePurchaseRate ?
                            ((item.currentPrice - item.averagePurchaseRate) / item.averagePurchaseRate * 100) : 0;
                        const isPositive = priceChange >= 0;
                        const bgColor = isPositive ? '#f0fdf4' : '#fef2f2';
                        const borderColor = isPositive ? '#86efac' : '#fca5a5';
                        return `
                            <div style="padding: 12px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;" onclick="window.uiService.switchSubTab('${item.coinName.toLowerCase()}')" onmouseover="this.style.backgroundColor='${isPositive ? '#dcfce7' : '#fee2e2'}'; this.style.borderColor='#3b82f6'" onmouseout="this.style.backgroundColor='${bgColor}'; this.style.borderColor='${borderColor}'">
                                <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px;">${item.coinName}</div>
                                <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">¥${item.currentPrice.toLocaleString()}</div>
                                <div style="font-size: 13px; color: #6b7280; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">平均 ¥${item.averagePurchaseRate.toLocaleString()}</div>
                                <div style="font-size: 12px; font-weight: 600; color: ${isPositive ? '#059669' : '#dc2626'};">
                                    ${isPositive ? '▲' : '▼'} ${isPositive ? '+' : ''}${priceChange.toFixed(2)}%
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
            ` : `
            <!-- 価格データなし -->
            <div style="padding: 16px; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px;">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">価格データがありません</div>
                <div style="font-size: 12px; color: #78350f; margin-bottom: 10px;">価格更新ボタンをクリックして最新価格を取得してください</div>
                <button onclick="fetchCurrentPrices()" style="background: #3b82f6; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 12px; transition: background 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                    価格を更新
                </button>
            </div>
            `}
        </div>

        <!-- 銘柄別詳細テーブル -->
        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 30px;">
            <table class="portfolio-table" border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; min-width: 800px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); background: white;">
            <colgroup>
                <col style="width: 100px;">  <!-- 銘柄 -->
                <col style="width: 120px;">  <!-- 現在価格 -->
                <col style="width: 140px;">  <!-- 平均購入レート -->
                <col style="width: 120px;">  <!-- 評価額 -->
                <col style="width: 130px;">  <!-- 保有分購入額 -->
                <col style="width: 120px;">  <!-- 合計購入額 -->
                <col style="width: 120px;">  <!-- 含み損益 -->
                <col style="width: 120px;">  <!-- 実現損益 -->
                <col style="width: 130px;">  <!-- 総合損益 -->
            </colgroup>
            <thead>
                <tr style="background-color: #f9fafb;">
                    <th onclick="sortTable('coinName')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: left; font-weight: 600; font-size: 0.9rem; color: #374151;">銘柄 <span id="sort-coinName">${getSortIcon('coinName')}</span></th>
                    <th onclick="sortTable('currentPrice')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">現在価格 <span id="sort-currentPrice">${getSortIcon('currentPrice')}</span></th>
                    <th onclick="sortTable('averagePurchaseRate')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">平均購入レート <span id="sort-averagePurchaseRate">${getSortIcon('averagePurchaseRate')}</span></th>
                    <th onclick="sortTable('currentValue')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">評価額 <span id="sort-currentValue">${getSortIcon('currentValue')}</span></th>
                    <th onclick="sortTable('heldInvestment')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">保有分購入額 <span id="sort-heldInvestment">${getSortIcon('heldInvestment')}</span></th>
                    <th onclick="sortTable('totalInvestment')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">合計購入額 <span id="sort-totalInvestment">${getSortIcon('totalInvestment')}</span></th>
                    <th onclick="sortTable('unrealizedProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">含み損益 <span id="sort-unrealizedProfit">${getSortIcon('unrealizedProfit')}</span></th>
                    <th onclick="sortTable('realizedProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">実現損益 <span id="sort-realizedProfit" style="color: #3b82f6;">${getSortIcon('realizedProfit')}</span></th>
                    <th onclick="sortTable('totalProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #374151;">総合損益 <span id="sort-totalProfit">${getSortIcon('totalProfit')}</span></th>
                </tr>
            </thead>
            <tbody>
    `;

    portfolioData.summary.forEach(item => {
        const profitColor = item.realizedProfit > 0 ? '#27ae60' : item.realizedProfit < 0 ? '#e74c3c' : '#6c757d';
        const profitBg = item.realizedProfit > 0 ? 'rgba(39, 174, 96, 0.05)' : item.realizedProfit < 0 ? 'rgba(231, 76, 60, 0.05)' : '';

        html += `
            <tr style="transition: all 0.2s ease; ${profitBg ? `background-color: ${profitBg};` : ''}" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='${profitBg ? profitBg : 'transparent'}'">
                <td onclick="window.uiService.switchSubTab('${item.coinName.toLowerCase()}')" style="padding: 12px; font-weight: 600; color: #3b82f6; border-bottom: 1px solid #e5e7eb; cursor: pointer;" title="クリックして${item.coinName}の詳細を表示">${item.coinName}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">${item.currentPrice > 0 ? '¥' + item.currentPrice.toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">¥${item.averagePurchaseRate.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">${item.currentValue > 0 ? '¥' + item.currentValue.toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">¥${item.currentHoldingInvestment.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">¥${item.totalInvestment.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${(item.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'}; font-weight: ${Math.abs(item.unrealizedProfit || 0) > 0 ? '600' : 'normal'};">${(item.unrealizedProfit || 0) !== 0 ? '¥' + Math.round(item.unrealizedProfit || 0).toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${profitColor}; font-weight: ${Math.abs(item.realizedProfit) > 0 ? '600' : 'normal'};">${item.realizedProfit !== 0 ? '¥' + Math.round(item.realizedProfit).toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${(item.totalProfit || item.realizedProfit) >= 0 ? '#059669' : '#dc2626'}; font-weight: ${Math.abs(item.totalProfit || item.realizedProfit) > 0 ? '600' : 'normal'};">${(item.totalProfit || item.realizedProfit) !== 0 ? '¥' + Math.round(item.totalProfit || item.realizedProfit).toLocaleString() : '-'}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
            <tfoot>
                <tr style="background-color: #f3f4f6; font-weight: 600; border-top: 2px solid #d1d5db;">
                    <td style="padding: 15px 12px; text-align: left; font-weight: 700; color: #1f2937; border-bottom: 1px solid #e5e7eb;">合計</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: #374151;">¥${Math.abs(stats.totalInvestment).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${(stats.totalUnrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(stats.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit || 0).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}</td>
                </tr>
            </tfoot>
        </table>
        </div>
    `;

    return html;
}

// モバイル用取引履歴カード生成
function generateMobileTradingCards(portfolioData) {
    const allTransactions = [];
    Object.values(portfolioData.coins).forEach(coinNameData => {
        allTransactions.push(...coinNameData.buyTransactions, ...coinNameData.sellTransactions);
    });

    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = '';
    allTransactions.slice(0, 50).forEach((tx, index) => {
        const date = new Date(tx.date);
        const typeColor = tx.type === '買い' ? '#059669' : '#dc2626';
        const typeIcon = tx.type === '買い' ? '📈' : '📉';

        html += `
            <div class="table-card">
                <div class="card-header" style="color: ${typeColor};">
                    ${typeIcon} ${tx.coinName} - ${tx.type}
                    <span style="float: right; font-size: 0.8rem; color: #7f8c8d;">
                        ${date.getMonth() + 1}/${date.getDate()}
                    </span>
                </div>
                <div class="card-row">
                    <span class="card-label">数量</span>
                    <span class="card-value">${parseFloat(tx.quantity || 0).toFixed(6)}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">単価</span>
                    <span class="card-value">¥${(tx.rate || 0).toLocaleString()}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">総額</span>
                    <span class="card-value">¥${Math.abs(tx.amount || 0).toLocaleString()}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">手数料</span>
                    <span class="card-value">¥${(tx.fee || 0).toLocaleString()}</span>
                </div>
            </div>
        `;
    });

    return `<div class="mobile-card-table">${html}</div>`;
}

// 取引履歴テーブル生成
function generateTradingHistoryTable(portfolioData) {
    // portfolioData.coinsから全取引を収集
    const allTransactions = [];
    if (portfolioData && portfolioData.coins) {
        for (const coinName in portfolioData.coins) {
            const coinData = portfolioData.coins[coinName];
            if (coinData.allTransactions) {
                allTransactions.push(...coinData.allTransactions);
            }
        }
    }

    // 日付順にソート
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = `
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h4 style="color: #2c3e50; margin-bottom: 20px;">全取引履歴（新しい順）</h4>
            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                <table class="trading-history-table" style="width: 100%; min-width: 700px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">日時</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">銘柄</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">売買</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">数量</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">レート</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">金額</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">取引所</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    allTransactions.slice(0, 50).forEach(tx => { // 最新50件のみ表示
        const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
        html += `
            <tr>
                <td style="border: 1px solid #dee2e6; padding: 12px; font-size: 0.9rem;">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; font-weight: bold;">${tx.coinName}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; color: ${typeColor}; font-weight: bold;">${tx.type}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">${tx.quantity.toFixed(8)}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">¥${tx.rate.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">¥${tx.amount.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-size: 0.85rem;">${tx.exchange}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
            ${allTransactions.length > 50 ? `<p style="color: #7f8c8d; text-align: center; margin-top: 15px;">※最新50件のみ表示（全${allTransactions.length}件）</p>` : ''}
        </div>
    `;
    return html;
}

// 個別銘柄詳細ページ生成
function generateCoinNameDetailPage(coinNameSummary, coinNameData) {
    const profitColor = coinNameSummary.realizedProfit >= 0 ? '#27ae60' : '#e74c3c';
    const profitIcon = coinNameSummary.realizedProfit > 0 ? '📈' : coinNameSummary.realizedProfit < 0 ? '📉' : '➖';

    let html = `
        <!-- 銘柄サマリーカード -->
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b;">${coinNameSummary.coinName} 詳細分析</h3>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">個別銘柄の取引履歴・統計・損益分析</p>
            </div>

            <!-- 損益カード（1行目） -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
                <!-- 総合損益 -->
                <div style="text-align: center; padding: 15px; background: ${coinNameSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : (coinNameSummary.totalProfit || coinNameSummary.realizedProfit) >= 0 ? 'linear-gradient(135deg, #d4f1d4 0%, #a8e6a8 100%)' : 'linear-gradient(135deg, #fcd4d4 0%, #f8a8a8 100%)'}; border-radius: 8px; border: 3px solid ${coinNameSummary.totalSellAmount === 0 ? '#9ca3af' : (coinNameSummary.totalProfit || coinNameSummary.realizedProfit) >= 0 ? '#059669' : '#dc2626'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 700;">総合損益</div>
                    <div style="font-size: 20px; font-weight: 900; color: ${coinNameSummary.totalSellAmount === 0 ? '#6b7280' : (coinNameSummary.totalProfit || coinNameSummary.realizedProfit) >= 0 ? '#047857' : '#b91c1c'};">${coinNameSummary.totalSellAmount === 0 ? '⏳ ' : profitIcon + ' '}${coinNameSummary.totalSellAmount === 0 ? '未確定' : ((coinNameSummary.totalProfit || coinNameSummary.realizedProfit) >= 0 ? '+' : '') + '¥' + Math.round(coinNameSummary.totalProfit || coinNameSummary.realizedProfit).toLocaleString()}</div>
                </div>

                <!-- 実現損益 -->
                <div style="text-align: center; padding: 15px; background: ${coinNameSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : coinNameSummary.realizedProfit >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${coinNameSummary.totalSellAmount === 0 ? '#9ca3af' : coinNameSummary.realizedProfit >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">実現損益</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${coinNameSummary.totalSellAmount === 0 ? '#6b7280' : coinNameSummary.realizedProfit >= 0 ? '#059669' : '#dc2626'};">${coinNameSummary.totalSellAmount === 0 ? '⏳ 未確定' : (coinNameSummary.realizedProfit >= 0 ? '+' : '') + '¥' + Math.round(coinNameSummary.realizedProfit).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 600;">${coinNameSummary.totalSellAmount === 0 ? '' : (coinNameSummary.investmentEfficiency >= 0 ? '+' : '') + coinNameSummary.investmentEfficiency.toFixed(1) + '%'}</div>
                </div>

                <!-- 含み損益 -->
                <div style="text-align: center; padding: 15px; background: ${(coinNameSummary.unrealizedProfit || 0) >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${(coinNameSummary.unrealizedProfit || 0) >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">含み損益</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${(coinNameSummary.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(coinNameSummary.unrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(coinNameSummary.unrealizedProfit || 0).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 600;">${coinNameSummary.currentHoldingInvestment > 0 ? ((coinNameSummary.unrealizedProfit || 0) >= 0 ? '+' : '') + (((coinNameSummary.unrealizedProfit || 0) / coinNameSummary.currentHoldingInvestment) * 100).toFixed(1) + '%' : ''}</div>
                </div>
            </div>

            <!-- 詳細統計（2行目） -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
                <!-- 保有数量 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">保有数量</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${parseFloat(coinNameSummary.holdingQuantity.toFixed(8))}</div>
                </div>

                <!-- 平均購入レート -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #8b5cf6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">平均購入レート</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinNameSummary.averagePurchaseRate.toLocaleString()}</div>
                </div>

                <!-- 総投資額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">総投資額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinNameSummary.totalInvestment.toLocaleString()}</div>
                </div>

                <!-- 売却金額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #06b6d4;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">売却金額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinNameSummary.totalSellAmount.toLocaleString()}</div>
                </div>

                <!-- 取引回数 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #84cc16;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">取引回数</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">買${coinNameSummary.buyTransactionCount}回・売${coinNameSummary.sellTransactionCount}回</div>
                </div>

                <!-- 現在価格 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #ec4899;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在価格</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${coinNameSummary.currentPrice > 0 ? '¥' + coinNameSummary.currentPrice.toLocaleString() : '取得中...'}</div>
                </div>

                <!-- 現在評価額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #14b8a6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在評価額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${coinNameSummary.currentValue > 0 ? '¥' + Math.round(coinNameSummary.currentValue).toLocaleString() : '計算中...'}</div>
                </div>
            </div>
        </div>

        <!-- 取引履歴テーブル -->
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
    `;

    // rawTransactionsから該当銘柄の取引を取得
    const transactions = getTransactionsByCoin(coinNameSummary.coinName);

    html += `
            <h4 style="color: #2c3e50; margin-bottom: 20px;">📊 ${coinNameSummary.coinName} 全取引履歴（${transactions.all.length}件）</h4>
            <div style="overflow-x: auto; -webkit-overflow-scrolling: touch;">
                <table style="width: 100%; min-width: 600px; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">日時</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">売買</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">数量</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">レート</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">金額</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">取引所</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    // 取引履歴を日付順に並び替え（新しい順）
    const sortedTransactions = [...transactions.all].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedTransactions.forEach(tx => {
        const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
        const typeBg = tx.type === '買' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';

        html += `
            <tr style="background-color: ${typeBg};">
                <td style="border: 1px solid #dee2e6; padding: 12px; font-size: 0.9rem;">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; color: ${typeColor}; font-weight: bold; font-size: 0.95rem;">${tx.type}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace;">${parseFloat(tx.quantity.toFixed(8))}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace;">¥${tx.rate.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace; font-weight: 600;">¥${tx.amount.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-size: 0.85rem; font-weight: 600;">${tx.exchange}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    return html;
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================
// (未使用のチャート関数を削除しました)