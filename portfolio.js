// ========== PORTFOLIO.JS - Portfolio analysis, calculations, and display ==========

// PortfolioDataService は services/portfolio-data-service.js に移動済み

// ========== PORTFOLIO UPDATE HELPER ==========

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

// ========== PORTFOLIO ANALYSIS FUNCTIONS ==========

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

// ========== TABLE SORTING FUNCTIONS ==========

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

// ========== PRICE UPDATE FUNCTIONS ==========

// 価格取得とポートフォリオ更新
async function fetchCurrentPrices() {
    try {
        const currentPortfolioData = portfolioDataService.getData();

        if (!currentPortfolioData) {
            throw new Error('ポートフォリオデータが見つかりません。先にCSVファイルをアップロードしてください。');
        }

        if (!currentPortfolioData.summary || currentPortfolioData.summary.length === 0) {
            throw new Error('ポートフォリオサマリーデータが見つかりません');
        }

        const portfolioCoinNames = currentPortfolioData.summary.map(item => item.coinName);

        showInfoMessage('価格データを取得中...');
        const prices = await window.apiService.fetchCurrentPrices(portfolioCoinNames);

        updatePortfolioWithPrices(currentPortfolioData, prices);

        const validCoinNames = prices._metadata?.coinNames || [];
        let message = `価格更新完了: ${validCoinNames.length}銘柄`;

        if (prices._metadata?.source === 'price_history_cache') {
            message = `キャッシュから表示: ${validCoinNames.length}銘柄\n価格履歴データより`;
        } else if (prices._metadata?.lastUpdate) {
            const cacheDate = new Date(prices._metadata.lastUpdate);
            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });
            message = `価格更新完了: ${validCoinNames.length}銘柄\n${cacheTimeStr}保存`;
        }

        refreshPortfolioDisplay(currentPortfolioData, message);

    } catch (error) {
        console.error('価格取得エラー:', error);
        showErrorMessage(`価格取得失敗: ${error.message}`);
        updatePriceStatus('取得失敗');
    }
}

// ========== DASHBOARD AND DISPLAY FUNCTIONS ==========

// ダッシュボード表示（メイン関数）
function displayDashboard(portfolioData) {
    _initializeDashboardData(portfolioData);
    _toggleDashboardDisplay();
    _initializeChartContainer();
    _renderDashboardTables(portfolioData);
    _finalizeDashboardSetup(portfolioData);
}

// データ保存とソート設定
function _initializeDashboardData(portfolioData) {
    portfolioDataService.updateData(portfolioData);
    portfolioDataService.setSortState('realizedProfit', 'desc');
    sortPortfolioData('realizedProfit', 'desc');
}

// UI表示/非表示の切り替え
function _toggleDashboardDisplay() {
    document.getElementById('dashboardArea').style.display = 'none';
    document.getElementById('tabContainer').style.display = 'block';
}

// チャートコンテナの初期化
function _initializeChartContainer() {
    const chartContainer = document.getElementById('portfolio-chart-container');
    if (chartContainer.hasChildNodes()) return;

    if (isMobile()) {
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

// テーブル描画とキャッシュ価格復元
function _renderDashboardTables(portfolioData) {
    const tableContainer = document.getElementById('portfolio-table-container');
    const currentData = portfolioDataService.getData();
    tableContainer.innerHTML = generatePortfolioTable(currentData);

    const coinNames = portfolioData.summary.map(item => item.coinName);
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

    if (Object.keys(cachedPriceData).length > 0) {
        const pricesObject = {};
        for (const [coinName, priceData] of Object.entries(cachedPriceData)) {
            pricesObject[coinName] = priceData;
        }
        pricesObject._metadata = { lastUpdate: Math.min(...cacheTimestamps) };

        updatePortfolioWithPrices(portfolioData, pricesObject);
        portfolioDataService.updateData(portfolioData);
        const updatedData = portfolioDataService.getData();
        tableContainer.innerHTML = generatePortfolioTable(updatedData);

        updatePriceStatus();
    } else {
        updatePriceStatus('価格データ取得中...');

        setTimeout(() => {
            fetchCurrentPrices();
        }, 1000);
    }

    const tradingContainer = document.getElementById('trading-history-container');
    tradingContainer.innerHTML = generateTradingHistoryTable(portfolioData);
}

// サブタブ作成、ステータス更新、チャート描画
function _finalizeDashboardSetup(portfolioData) {
    try {
        createCoinNameSubtabs(portfolioData);
    } catch (error) {
        console.error('❌ Error in createCoinNameSubtabs:', error);
    }

    setTimeout(() => {
        switchSubtab('summary');
    }, 50);

    updateDataStatus(portfolioData);
    showPage('dashboard');

    setTimeout(() => {
        const coinNames = portfolioData.summary.map(item => item.coinName);
        const hasCache = coinNames.some(coinName => {
            const cacheKey = window.cacheKeys.priceHistory(coinName);
            const cached = window.cache.get(cacheKey);
            return cached && cached.data && cached.data.length > 0;
        });

        if (hasCache) {
            renderAllCoinNamesProfitChart(portfolioData);
        } else {
            console.log('💡 価格履歴キャッシュがありません。「チャート更新」ボタンをクリックして取得してください。');
        }
    }, 800);
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

// ========== SUBTAB CREATION AND MANAGEMENT ==========

// 銘柄別サブタブ生成（サービスクラスへの委譲版）
function createCoinNameSubtabs(portfolioData) {
    window.uiService.createCoinSubTabs(portfolioData);
}

// ========== TABLE GENERATION FUNCTIONS ==========
// (テーブル生成はすべてservices/ui-service.jsのTableRendererに移動済み)

// 後方互換性のためのラッパー関数
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

// ========== 削除された関数 ==========
// 以下の関数はui-service.jsに移動されました:
// - generateMobilePortfolioCards() の実装
// - generatePortfolioTable() の実装
// - generateMobileTradingCards() の実装
// - generateTradingHistoryTable() の実装
// - generateCoinNameDetailPage() の実装
// - _renderPortfolioSummarySection()
// - _renderPortfolioTableHeader()
// - _renderPortfolioTableBody()
// - _renderCoinProfitSummaryCards()
// - _renderCoinDetailStatsGrid()
// - _renderCoinTransactionTable()

// ========== PROFIT CHART FUNCTIONS ==========
// (未使用のチャート関数を削除しました)