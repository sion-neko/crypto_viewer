// ========== PORTFOLIO DATA SERVICE ==========

/**
 * ポートフォリオデータのビジネスロジックを管理するサービスクラス
 * CacheServiceと連携してデータの取得・更新を行う
 */
class PortfolioDataService {
    constructor() {
        // ビジネスロジック専用のサービスクラス
        // データストレージはCacheServiceに委譲
    }

    /**
     * 取引データからポートフォリオデータを分析・計算
     * @param {Array} transactions - 取引データ配列
     * @returns {object} ポートフォリオデータ
     */
    analyzePortfolioData(transactions) {
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
                realizedProfit
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
            coinNameCount: portfolioSummary.length,
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

    /**
     * ポートフォリオデータを更新
     * @param {object} portfolioData - 新しいポートフォリオデータ
     */
    updateData(portfolioData) {
        if (portfolioData) {
            // 保存用のコピーを作成して価格情報をクリア
            // （価格は個別キャッシュ price_btc などから取得するため、永続化不要）
            const dataToSave = JSON.parse(JSON.stringify(portfolioData));
            clearPriceDataFromPortfolio(dataToSave);
            window.cache.setPortfolioData(dataToSave);
        }
    }

    /**
     * 価格データでポートフォリオを更新（含み損益計算）
     * @param {object} prices - 価格データオブジェクト
     */
    updateWithPrices(prices) {
        const portfolioData = window.cache.getPortfolioData();
        if (!portfolioData || !portfolioData.summary) return;

        let totalUnrealizedProfit = 0;

        portfolioData.summary.forEach(item => {
            if (prices[item.coinName]) {
                const currentPrice = prices[item.coinName].price_jpy;
                item.currentPrice = currentPrice;

                const unrealizedProfit = calculateUnrealizedProfit(
                    item.holdingQuantity,
                    currentPrice,
                    item.averagePurchaseRate
                );

                if (unrealizedProfit !== 0) {
                    item.currentValue = item.holdingQuantity * currentPrice;
                    item.unrealizedProfit = unrealizedProfit;
                    item.totalProfit = item.realizedProfit + unrealizedProfit;
                    totalUnrealizedProfit += unrealizedProfit;
                } else {
                    item.currentValue = 0;
                    item.unrealizedProfit = 0;
                    item.totalProfit = item.realizedProfit;
                }
            } else {
                item.currentPrice = 0;
                item.currentValue = 0;
                item.unrealizedProfit = 0;
                item.totalProfit = item.realizedProfit;
            }
        });

        // 統計に含み損益と総合損益を追加
        portfolioData.stats.totalUnrealizedProfit = totalUnrealizedProfit;
        portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit + totalUnrealizedProfit;

        // 総合損益に基づく追加統計
        portfolioData.stats.totalProfitableCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) > 0).length;
        portfolioData.stats.totalLossCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) < 0).length;
        portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
            (portfolioData.stats.totalProfit / portfolioData.stats.totalInvestment) * 100 : 0;

        // 価格情報を含めたまま保存（表示用の一時的な保存）
        // 注意: 次回updateData()が呼ばれると価格情報はクリアされる
        const dataToSave = JSON.parse(JSON.stringify(portfolioData));
        window.cache.setPortfolioData(dataToSave);
    }
}
