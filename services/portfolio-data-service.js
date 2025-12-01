// ========== PORTFOLIO DATA SERVICE ==========

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
            window.cache.setPortfolioData(dataToSave);
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

    /**
     * 価格データでポートフォリオを更新（含み損益計算）
     * @param {object} prices - 価格データオブジェクト
     */
    updateWithPrices(prices) {
        const portfolioData = this.getData();
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

        this.updateData(portfolioData);
    }
}
