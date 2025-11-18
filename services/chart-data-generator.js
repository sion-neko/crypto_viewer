/**
 * ChartDataGenerator - チャートデータ生成サービス
 *
 * トランザクションと価格履歴からチャート用の時系列データを生成します。
 */
class ChartDataGenerator {
    /**
     * 個別銘柄の損益推移時系列データを生成
     * @param {Array} transactions - トランザクション配列
     * @param {Array} priceHistory - 価格履歴配列 [{date: Date, price: number}]
     * @returns {Array} 日次損益データ
     */
    generateHistoricalProfitTimeSeries(transactions, priceHistory) {
        // 取引を日付順にソート
        const sortedTransactions = [...transactions].sort((a, b) =>
            new Date(a.date) - new Date(b.date)
        );

        // 各日付での保有状況を計算
        const dailyProfitData = [];

        priceHistory.forEach(pricePoint => {
            const targetDate = pricePoint.date instanceof Date ?
                pricePoint.date : new Date(pricePoint.date);
            const price = pricePoint.price;

            // この日付までの取引を集計
            let realizedProfit = 0;
            let totalQuantity = 0;
            let weightedAvgPrice = 0;
            let totalBought = 0;
            let totalSold = 0;

            sortedTransactions.forEach(tx => {
                const txDate = new Date(tx.date);

                // この日付以前の取引のみを考慮
                if (txDate <= targetDate) {
                    if (tx.type === '買') {
                        // 加重平均価格を更新
                        const result = calculateWeightedAverage(
                            totalQuantity, weightedAvgPrice, tx.quantity, tx.rate
                        );
                        totalQuantity = result.totalQty;
                        weightedAvgPrice = result.weightedAvgPrice;
                        totalBought += tx.amount;
                    } else if (tx.type === '売') {
                        // 売却時の実現損益を計算
                        const sellProfit = calculateRealizedProfit(
                            tx.amount, tx.quantity, weightedAvgPrice
                        );
                        realizedProfit += sellProfit;

                        // 保有数量を減らす
                        totalQuantity -= tx.quantity;
                        totalSold += tx.amount;

                        // 保有数量が0以下になった場合、加重平均価格をリセット
                        if (totalQuantity <= 0) {
                            totalQuantity = 0;
                            weightedAvgPrice = 0;
                        }
                    }
                }
            });

            // 含み損益を計算
            const unrealizedProfit = totalQuantity > 0.00000001
                ? calculateUnrealizedProfit(totalQuantity, price, weightedAvgPrice)
                : 0;

            // 総合損益 = 実現損益 + 含み損益
            const totalProfit = realizedProfit + unrealizedProfit;

            dailyProfitData.push({
                date: targetDate,
                realizedProfit: realizedProfit,
                unrealizedProfit: unrealizedProfit,
                totalProfit: totalProfit,
                totalBought: totalBought,
                totalSold: totalSold,
                holdingQuantity: totalQuantity,
                avgPrice: weightedAvgPrice,
                currentPrice: price
            });
        });

        return dailyProfitData;
    }

    /**
     * 全銘柄の損益データを合算して統合損益推移を生成
     * @param {Object} allProfitData - 銘柄ごとの損益データ {coinName: profitData[]}
     * @returns {Array} 統合された日次損益データ
     */
    generateCombinedProfitTimeSeries(allProfitData) {
        // 全銘柄の日付を統合してソート
        const allDates = new Set();
        Object.values(allProfitData).forEach(profitData => {
            profitData.forEach(point => {
                allDates.add(point.date.toDateString());
            });
        });

        const sortedDates = Array.from(allDates).sort((a, b) =>
            new Date(a) - new Date(b)
        );

        // 日付ごとに全銘柄の損益を合計
        const combinedData = sortedDates.map(dateStr => {
            const targetDate = new Date(dateStr);
            let totalRealizedProfit = 0;
            let totalUnrealizedProfit = 0;
            let totalProfit = 0;
            let totalHoldingQuantity = 0;
            let totalCurrentValue = 0;

            Object.keys(allProfitData).forEach(coinName => {
                const profitData = allProfitData[coinName];
                const point = profitData.find(p => p.date.toDateString() === dateStr);

                if (point) {
                    totalRealizedProfit += point.realizedProfit || 0;
                    totalUnrealizedProfit += point.unrealizedProfit || 0;
                    totalProfit += point.totalProfit || 0;
                    totalHoldingQuantity += point.holdingQuantity || 0;
                    totalCurrentValue += (point.holdingQuantity || 0) * (point.currentPrice || 0);
                }
            });

            return {
                date: targetDate,
                realizedProfit: totalRealizedProfit,
                unrealizedProfit: totalUnrealizedProfit,
                totalProfit: totalProfit,
                totalHoldingQuantity: totalHoldingQuantity,
                totalCurrentValue: totalCurrentValue
            };
        });

        return combinedData;
    }

    /**
     * 価格履歴からチャート用データを生成
     * @param {Array} priceHistory - 価格履歴配列
     * @returns {Object} {labels: Array, data: Array}
     */
    generatePriceChartData(priceHistory) {
        const labels = priceHistory.map(point => {
            const date = point.date instanceof Date ? point.date : new Date(point.date);
            return date;
        });

        const data = priceHistory.map(point => point.price);

        return { labels, data };
    }
}

// グローバルに公開
window.ChartDataGenerator = ChartDataGenerator;
