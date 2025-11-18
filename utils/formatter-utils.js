/**
 * FormatterUtils - フォーマット処理のユーティリティクラス
 *
 * 価格、損益、日付などの表示用フォーマット処理を提供します。
 */
class FormatterUtils {
    /**
     * 価格をフォーマット（円表示）
     * @param {number} value - 価格
     * @returns {string} フォーマットされた価格
     */
    static formatPrice(value) {
        if (value === null || value === undefined) return '¥-';

        // 0.001未満は6桁
        if (value < 0.001) return '¥' + value.toFixed(6);
        // 0.01未満は4桁
        if (value < 0.01) return '¥' + value.toFixed(4);
        // 1未満は3桁
        if (value < 1) return '¥' + value.toFixed(3);
        // 1以上は2桁
        return '¥' + value.toFixed(2);
    }

    /**
     * 損益をフォーマット（符号付き円表示）
     * @param {number} value - 損益
     * @returns {string} フォーマットされた損益
     */
    static formatProfit(value) {
        if (value === null || value === undefined) return '¥-';

        const sign = value >= 0 ? '+' : '';
        return `${sign}¥${Math.round(value).toLocaleString()}`;
    }

    /**
     * 損益を短縮形式でフォーマット（K/M単位）
     * @param {number} value - 損益
     * @returns {string} フォーマットされた損益
     */
    static formatProfitShort(value) {
        if (value === null || value === undefined) return '¥-';

        const absValue = Math.abs(value);
        const sign = value >= 0 ? '+' : '-';

        // 100万以上はM単位
        if (absValue >= 1000000) {
            return `${sign}¥${(absValue / 1000000).toFixed(1)}M`;
        }
        // 1000以上はK単位
        if (absValue >= 1000) {
            return `${sign}¥${(absValue / 1000).toFixed(0)}K`;
        }
        // それ以外は通常表示
        return `${sign}¥${absValue.toLocaleString()}`;
    }

    /**
     * 価格を短縮形式でフォーマット（K/M単位）
     * @param {number} value - 価格
     * @returns {string} フォーマットされた価格
     */
    static formatPriceShort(value) {
        if (value === null || value === undefined) return '¥-';

        const absValue = Math.abs(value);

        // 100万以上はM単位
        if (absValue >= 1000000) {
            return `¥${(absValue / 1000000).toFixed(1)}M`;
        }
        // 1000以上はK単位
        if (absValue >= 1000) {
            return `¥${(absValue / 1000).toFixed(0)}K`;
        }
        // 1未満は小数点表示
        if (absValue < 1) {
            return this.formatPrice(value);
        }
        // それ以外は通常表示
        return `¥${absValue.toLocaleString()}`;
    }

    /**
     * 日付を日本語形式でフォーマット
     * @param {string|Date} date - 日付
     * @returns {string} フォーマットされた日付
     */
    static formatDate(date) {
        if (!date) return '-';
        return new Date(date).toLocaleDateString('ja-JP');
    }

    /**
     * 日時を日本語形式でフォーマット（時刻含む）
     * @param {string|Date} date - 日時
     * @returns {string} フォーマットされた日時
     */
    static formatDateTime(date) {
        if (!date) return '-';
        return new Date(date).toLocaleString('ja-JP');
    }

    /**
     * 日付を短縮形式でフォーマット（月/日のみ）
     * @param {string|Date} date - 日付
     * @returns {string} フォーマットされた日付
     */
    static formatDateShort(date) {
        if (!date) return '-';
        const d = new Date(date);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    }

    /**
     * パーセンテージをフォーマット
     * @param {number} value - パーセンテージ値
     * @param {number} decimals - 小数点以下桁数（デフォルト: 2）
     * @returns {string} フォーマットされたパーセンテージ
     */
    static formatPercentage(value, decimals = 2) {
        if (value === null || value === undefined) return '-';
        const sign = value >= 0 ? '+' : '';
        return `${sign}${value.toFixed(decimals)}%`;
    }

    /**
     * 数量をフォーマット
     * @param {number} value - 数量
     * @param {number} decimals - 小数点以下桁数（デフォルト: 8）
     * @returns {string} フォーマットされた数量
     */
    static formatQuantity(value, decimals = 8) {
        if (value === null || value === undefined) return '-';

        // 小数点以下の末尾のゼロを削除
        const formatted = parseFloat(value.toFixed(decimals)).toString();
        return formatted;
    }

    /**
     * ファイルサイズをフォーマット
     * @param {number} bytes - バイト数
     * @returns {string} フォーマットされたファイルサイズ
     */
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        if (bytes === null || bytes === undefined) return '-';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// グローバルに公開
window.FormatterUtils = FormatterUtils;
