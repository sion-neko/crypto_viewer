/**
 * TransactionUtils - トランザクション操作のユーティリティクラス
 *
 * 重複判定、マージ、フィルタリングなどのトランザクション関連の
 * 共通処理を提供します。
 */
class TransactionUtils {
    /**
     * 2つのトランザクションが重複しているか判定
     * @param {Object} tx1 - トランザクション1
     * @param {Object} tx2 - トランザクション2
     * @returns {boolean} 重複している場合true
     */
    static isDuplicate(tx1, tx2) {
        return tx1.date === tx2.date &&
               tx1.coinName === tx2.coinName &&
               tx1.exchange === tx2.exchange &&
               Math.abs(tx1.quantity - tx2.quantity) < 0.00000001 &&
               Math.abs(tx1.amount - tx2.amount) < 0.01 &&
               tx1.type === tx2.type;
    }

    /**
     * トランザクションデータをマージ（重複を除外）
     * @param {Array} existingData - 既存のトランザクション配列
     * @param {Array} newData - 新規トランザクション配列
     * @returns {Array} マージされたトランザクション配列
     */
    static merge(existingData, newData) {
        const merged = [...existingData];
        let duplicateCount = 0;

        newData.forEach(newTx => {
            const isDuplicate = existingData.some(existingTx =>
                this.isDuplicate(existingTx, newTx)
            );

            if (isDuplicate) {
                duplicateCount++;
            } else {
                merged.push(newTx);
            }
        });

        console.log(`Merged transactions: ${newData.length} new, ${duplicateCount} duplicates, ${merged.length - existingData.length} added`);

        return merged;
    }

    /**
     * 銘柄でトランザクションをフィルタリング
     * @param {Array} transactions - トランザクション配列
     * @param {string} coinName - 銘柄名
     * @returns {Array} フィルタリングされたトランザクション配列
     */
    static filterByCoin(transactions, coinName) {
        return transactions.filter(tx => tx.coinName === coinName);
    }

    /**
     * トランザクションを日時でソート
     * @param {Array} transactions - トランザクション配列
     * @param {boolean} ascending - 昇順の場合true、降順の場合false
     * @returns {Array} ソートされたトランザクション配列
     */
    static sortByDate(transactions, ascending = true) {
        return [...transactions].sort((a, b) => {
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            return ascending ? dateA - dateB : dateB - dateA;
        });
    }

    /**
     * トランザクションを買いと売りに分類
     * @param {Array} transactions - トランザクション配列
     * @returns {Object} {buy: Array, sell: Array}
     */
    static categorizeByType(transactions) {
        return {
            buy: transactions.filter(tx => tx.type === '買'),
            sell: transactions.filter(tx => tx.type === '売')
        };
    }

    /**
     * トランザクションデータの検証
     * @param {Object} transaction - トランザクションオブジェクト
     * @returns {boolean} 有効な場合true
     */
    static validate(transaction) {
        const requiredFields = ['date', 'coinName', 'exchange', 'type', 'quantity', 'amount'];

        for (const field of requiredFields) {
            if (transaction[field] === undefined || transaction[field] === null) {
                console.warn(`Invalid transaction: missing field "${field}"`, transaction);
                return false;
            }
        }

        if (transaction.quantity <= 0) {
            console.warn('Invalid transaction: quantity must be positive', transaction);
            return false;
        }

        if (!['買', '売'].includes(transaction.type)) {
            console.warn('Invalid transaction: type must be "買" or "売"', transaction);
            return false;
        }

        return true;
    }
}

// グローバルに公開
window.TransactionUtils = TransactionUtils;
