// ========== PORTFOLIO.JS - Portfolio analysis, calculations, and display ==========

// PortfolioDataService は services/portfolio-data-service.js に移動済み

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

        portfolioDataService.updateWithPrices(prices);

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

        window.uiService.dashboard.refreshDisplay(currentPortfolioData, message);

    } catch (error) {
        console.error('価格取得エラー:', error);
        showErrorMessage(`価格取得失敗: ${error.message}`);
        uiService.displayPriceDataStatus('取得失敗');
    }
}

// ========== DASHBOARD AND DISPLAY FUNCTIONS ==========
// (すべてui-service.js DashboardManagerに移行済み)

// ========== UI生成関数は全てui-service.jsに移行済み ==========
// displayDashboard, updateDataStatus, createCoinNameSubtabs
// generateMobilePortfolioCards, generatePortfolioTable,
// generateMobileTradingCards, generateTradingHistoryTable,
// generateCoinNameDetailPage
// (全13関数がDashboardManagerとTableRendererに移行)