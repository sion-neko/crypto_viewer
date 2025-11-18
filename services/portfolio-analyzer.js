/**
 * PortfolioAnalyzer - ポートフォリオ分析サービス
 *
 * トランザクションデータから損益計算、統計生成、ソート処理を行います。
 */
class PortfolioAnalyzer {
    /**
     * トランザクションデータを分析してポートフォリオサマリーを生成
     * @param {Array} transactions - トランザクション配列
     * @returns {Object} {summary: Array, stats: Object}
     */
    analyze(transactions) {
        const coinNameData = {};

        // 各銘柄ごとにデータを集計
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
                profitStatus: realizedProfit > 0 ? 'profit' : realizedProfit < 0 ? 'loss' : 'neutral'
            };

            totalInvestment += summary.totalInvestment;
            totalRealizedProfit += realizedProfit;
            totalFees += summary.totalFees;
            portfolioSummary.push(summary);
        });

        // 全体統計
        const portfolioStats = {
            totalInvestment,
            totalRealizedProfit,
            totalFees,
            overallProfitMargin: totalInvestment > 0 ? (totalRealizedProfit / totalInvestment) * 100 : 0,
            coinNameCount: portfolioSummary.length,
            profitableCoinNames: portfolioSummary.filter(s => s.realizedProfit > 0).length,
            lossCoinNames: portfolioSummary.filter(s => s.realizedProfit < 0).length,
            totalUnrealizedProfit: 0,
            totalProfit: totalRealizedProfit,
            totalProfitableCoinNames: 0,
            totalLossCoinNames: 0,
            overallTotalProfitMargin: 0
        };

        return {
            summary: portfolioSummary,
            stats: portfolioStats
        };
    }

    /**
     * ポートフォリオデータをソート
     * @param {Array} summaryData - サマリーデータ配列
     * @param {string} field - ソートフィールド
     * @param {string} direction - ソート方向 ('asc' | 'desc')
     * @returns {Array} ソートされたサマリーデータ
     */
    sort(summaryData, field, direction) {
        return [...summaryData].sort((a, b) => {
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
                return direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            } else {
                return direction === 'asc' ? aVal - bVal : bVal - aVal;
            }
        });
    }

    /**
     * 現在価格でポートフォリオデータを更新
     * @param {Object} portfolioData - ポートフォリオデータ
     * @param {Object} prices - 価格オブジェクト {coinName: price}
     * @returns {Object} 更新されたポートフォリオデータ
     */
    updateWithPrices(portfolioData, prices) {
        const updatedSummary = portfolioData.summary.map(item => {
            const currentPrice = prices[item.coinName];

            if (currentPrice !== undefined && currentPrice !== null) {
                const currentValue = item.holdingQuantity * currentPrice;
                const unrealizedProfit = currentValue - item.currentHoldingInvestment;
                const totalProfit = item.realizedProfit + unrealizedProfit;

                return {
                    ...item,
                    currentPrice,
                    currentValue,
                    unrealizedProfit,
                    totalProfit,
                    profitStatus: totalProfit > 0 ? 'profit' : totalProfit < 0 ? 'loss' : 'neutral'
                };
            }

            return item;
        });

        // 全体統計を再計算
        const totalUnrealizedProfit = updatedSummary
            .reduce((sum, item) => sum + (item.unrealizedProfit || 0), 0);
        const totalProfit = portfolioData.stats.totalRealizedProfit + totalUnrealizedProfit;

        const updatedStats = {
            ...portfolioData.stats,
            totalUnrealizedProfit,
            totalProfit,
            totalProfitableCoinNames: updatedSummary.filter(s => (s.totalProfit || s.realizedProfit) > 0).length,
            totalLossCoinNames: updatedSummary.filter(s => (s.totalProfit || s.realizedProfit) < 0).length,
            overallTotalProfitMargin: portfolioData.stats.totalInvestment > 0 ?
                (totalProfit / portfolioData.stats.totalInvestment) * 100 : 0
        };

        return {
            ...portfolioData,
            summary: updatedSummary,
            stats: updatedStats
        };
    }
}

// グローバルに公開
window.PortfolioAnalyzer = PortfolioAnalyzer;
