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
