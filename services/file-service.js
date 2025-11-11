// ===================================================================
// FILE-SERVICE.JS - ファイル処理の一元管理
// ===================================================================

/**
 * ファイルサービスクラス
 * CSVファイルのアップロード・解析・処理を管理
 */
class FileService {
    /**
     * @param {PortfolioDataService} portfolioDataService - ポートフォリオデータサービス
     * @param {UIService} uiService - UIサービス
     */
    constructor(portfolioDataService, uiService) {
        this.portfolioDataService = portfolioDataService;
        this.uiService = uiService;
        this.loadedFileNames = [];
    }

    // ===================================================================
    // ファイル処理
    // ===================================================================

    /**
     * CSVファイルをアップロード処理
     * @param {FileList} files - アップロードされたファイル
     * @returns {Promise<object>} 処理結果 {success: boolean, addedCount: number, message: string}
     */
    async handleFiles(files) {
        const csvFiles = Array.from(files).filter(file =>
            file.type === 'text/csv' || file.name.endsWith('.csv')
        );

        if (csvFiles.length === 0) {
            this.uiService.showError('CSVファイルを選択してください');
            return { success: false, addedCount: 0, message: 'No CSV files' };
        }

        try {
            // 既存データを取得
            const existingData = this._getExistingTransactions();

            // 並列でCSVファイルを読み込み
            const promises = csvFiles.map(file => this.parseCSVFile(file));
            const results = await Promise.all(promises);
            const newData = results.flat();

            if (newData.length === 0) {
                this.uiService.showError('有効な取引データが見つかりませんでした');
                return { success: false, addedCount: 0, message: 'No valid transactions' };
            }

            // ファイル名を保存
            const fileNames = csvFiles.map(file => file.name);
            this._updateLoadedFileNames(fileNames);

            // 重複データを除外して統合
            const mergedData = this._mergeTransactionData(existingData, newData);
            const addedCount = mergedData.length - existingData.length;

            // ポートフォリオ再計算
            const portfolioData = analyzePortfolioData(mergedData);

            // 生の取引データも保存
            localStorage.setItem('rawTransactions', JSON.stringify(mergedData));
            this.portfolioDataService.updateData(portfolioData);

            return {
                success: true,
                addedCount,
                totalFiles: csvFiles.length,
                portfolioData
            };

        } catch (error) {
            console.error('CSV処理エラー:', error);
            this.uiService.showError('CSVファイルの処理中にエラーが発生しました');
            return { success: false, addedCount: 0, message: error.message };
        }
    }

    /**
     * CSVファイルを解析
     * @param {File} file - CSVファイル
     * @returns {Promise<Array>} トランザクション配列
     */
    parseCSVFile(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                encoding: 'UTF-8',
                complete: function (results) {
                    const processedData = this._processCSVData(results.data, file.name);
                    resolve(processedData);
                }.bind(this),
                error: function (error) {
                    console.error(`${file.name} 解析エラー:`, error);
                    reject(error);
                }
            });
        });
    }

    /**
     * CSV データ処理（GMO・OKJ対応）
     * @private
     * @param {Array} data - パース済みCSVデータ
     * @param {string} fileName - ファイル名
     * @returns {Array} トランザクション配列
     */
    _processCSVData(data, fileName) {
        const transactions = [];
        const selectedExchange = document.querySelector('input[name="exchange"]:checked')?.value || 'AUTO';

        data.forEach(row => {
            // 空行をスキップ
            if (!row || Object.values(row).every(val => !val || val.trim() === '')) {
                return;
            }

            // GMOコイン形式
            if ((selectedExchange === 'GMO' || selectedExchange === 'AUTO') &&
                row['精算区分'] && row['精算区分'].includes('取引所現物取引')) {
                const coinName = row['銘柄名'];
                if (coinName && coinName !== 'JPY') {
                    const transaction = {
                        fileName: fileName,  // ファイル名を追加
                        exchange: 'GMO',
                        coinName: coinName,
                        type: row['売買区分'], // 買 or 売
                        amount: parseFloat(row['日本円受渡金額']?.replace(/,/g, '') || 0),
                        quantity: parseFloat(row['約定数量']?.replace(/,/g, '') || 0),
                        fee: parseFloat(row['注文手数料']?.replace(/,/g, '') || 0),
                        date: row['日時'] || 'データなし',
                        rate: parseFloat(row['約定レート']?.replace(/,/g, '') || 0)
                    };

                    if (transaction.quantity > 0) {
                        transactions.push(transaction);
                    }
                }
            }

            // OKCoin Japan形式
            if ((selectedExchange === 'OKJ' || selectedExchange === 'AUTO') &&
                row['取引銘柄'] && row['売買'] && row['ステータス'] === '全部約定') {
                const pair = row['取引銘柄'];
                const coinName = pair.replace('/JPY', '');

                if (coinName !== 'JPY' && row['売買'] === '購入') {
                    const transaction = {
                        fileName: fileName,  // ファイル名を追加
                        exchange: 'OKJ',
                        coinName: coinName,
                        type: '買', // OKJの「購入」を「買」に統一
                        amount: parseFloat(row['約定代金']?.replace(/,/g, '') || 0),
                        quantity: parseFloat(row['約定数量']?.replace(/,/g, '') || 0),
                        fee: 0, // OKJのCSVには手数料列がないため0とする
                        date: row['注文日時'],
                        rate: parseFloat(row['平均約定価格']?.replace(/,/g, '') || 0)
                    };

                    if (transaction.quantity > 0 && transaction.amount > 0) {
                        transactions.push(transaction);
                    }
                }
            }
        });

        return transactions;
    }

    // ===================================================================
    // データ管理
    // ===================================================================

    /**
     * 既存取引データ取得
     * @private
     * @returns {Array} 既存トランザクション配列
     */
    _getExistingTransactions() {
        return safeGetJSON('rawTransactions', []);
    }

    /**
     * 取引データ統合（重複除外）
     * @private
     * @param {Array} existingData - 既存データ
     * @param {Array} newData - 新規データ
     * @returns {Array} 統合済みデータ
     */
    _mergeTransactionData(existingData, newData) {
        const merged = [...existingData];
        let duplicateCount = 0;

        newData.forEach(newTx => {
            // 重複チェック：日時・銘柄・取引所・数量・金額が完全一致
            const isDuplicate = existingData.some(existingTx =>
                existingTx.date === newTx.date &&
                existingTx.coinName === newTx.coinName &&
                existingTx.exchange === newTx.exchange &&
                Math.abs(existingTx.quantity - newTx.quantity) < 0.00000001 &&
                Math.abs(existingTx.amount - newTx.amount) < 0.01 &&
                existingTx.type === newTx.type
            );

            if (!isDuplicate) {
                merged.push(newTx);
            } else {
                duplicateCount++;
            }
        });

        return merged;
    }

    // ===================================================================
    // ファイル名管理
    // ===================================================================

    /**
     * 読み込み済みファイル名を更新
     * @private
     * @param {string[]} newFileNames - 新しいファイル名の配列
     */
    _updateLoadedFileNames(newFileNames) {
        const existingFileNames = safeGetJSON('loadedFileNames', []);
        const allFileNames = [...new Set([...existingFileNames, ...newFileNames])];
        safeSetJSON('loadedFileNames', allFileNames);
        this.loadedFileNames = allFileNames;
    }

    /**
     * 読み込み済みファイル名を取得
     * @returns {string[]} ファイル名の配列
     */
    getLoadedFileNames() {
        return safeGetJSON('loadedFileNames', []);
    }

    /**
     * 読み込み済みファイル情報を表示
     * @param {string} containerId - 表示先コンテナのID（デフォルト: 'upload-files-list'）
     */
    displayLoadedFiles(containerId = 'upload-files-list') {
        const fileNames = this.getLoadedFileNames();
        const uploadSection = document.getElementById('upload-files-section');
        const uploadList = document.getElementById(containerId);

        if (!uploadList) {
            console.warn('Upload files list container not found');
            return;
        }

        if (fileNames.length > 0 && uploadSection) {
            uploadSection.style.display = 'block';
            uploadList.innerHTML = fileNames.map(fileName =>
                `<div style="
                    background: white;
                    padding: 12px 15px;
                    margin-bottom: 8px;
                    border-radius: 8px;
                    border: 1px solid #dee2e6;
                    font-size: 0.95rem;
                    color: #495057;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.08);
                    transition: transform 0.2s ease, box-shadow 0.2s ease;
                " onmouseover="this.style.transform='translateY(-1px)'; this.style.boxShadow='0 3px 8px rgba(0,0,0,0.12)'" onmouseout="this.style.transform=''; this.style.boxShadow='0 2px 4px rgba(0,0,0,0.08)'">
                    <span style="font-size: 1.2rem;">📄</span>
                    <span style="word-break: break-all; flex: 1;">${fileName}</span>
                    <span style="font-size: 0.8rem; color: #28a745; background: #d4edda; padding: 2px 8px; border-radius: 12px;">読み込み済み</span>
                    <button
                        onclick="window.fileService.deleteFile('${fileName.replace(/'/g, "\\'")}')"
                        style="
                            background: #dc3545;
                            color: white;
                            border: none;
                            padding: 4px 12px;
                            border-radius: 6px;
                            font-size: 0.8rem;
                            cursor: pointer;
                            transition: background 0.2s ease;
                        "
                        onmouseover="this.style.background='#c82333'"
                        onmouseout="this.style.background='#dc3545'"
                        title="このファイルを削除">
                        削除
                    </button>
                </div>`
            ).join('');
        } else if (uploadSection) {
            uploadSection.style.display = 'none';
        }
    }

    // ===================================================================
    // ファイル削除
    // ===================================================================

    /**
     * 指定したファイルの取引データを削除し、ポートフォリオを再計算
     * @param {string} fileName - 削除するファイル名
     * @returns {boolean} 削除成功時true
     */
    deleteFile(fileName) {
        if (!confirm(`「${fileName}」を削除しますか？\nこのファイルから読み込んだ取引データがすべて削除されます。`)) {
            return false;
        }

        try {
            // 既存の取引データを取得
            const allTransactions = this._getExistingTransactions();

            // 該当ファイルの取引をフィルタリングして除外
            const remainingTransactions = allTransactions.filter(tx => tx.fileName !== fileName);

            // 削除された取引の数を計算
            const deletedCount = allTransactions.length - remainingTransactions.length;

            if (deletedCount === 0) {
                this.uiService.showWarning(`「${fileName}」に紐づく取引データが見つかりませんでした`);
                return false;
            }

            // ファイル名リストから削除
            const fileNames = this.getLoadedFileNames();
            const updatedFileNames = fileNames.filter(name => name !== fileName);
            safeSetJSON('loadedFileNames', updatedFileNames);
            this.loadedFileNames = updatedFileNames;

            // 残りの取引データでポートフォリオを再計算
            if (remainingTransactions.length > 0) {
                const portfolioData = analyzePortfolioData(remainingTransactions);
                localStorage.setItem('rawTransactions', JSON.stringify(remainingTransactions));
                this.portfolioDataService.updateData(portfolioData);

                // ダッシュボードを更新
                if (typeof displayDashboard === 'function') {
                    displayDashboard(portfolioData);
                }

                this.uiService.showSuccess(`「${fileName}」を削除しました（${deletedCount}件の取引を削除）`);
            } else {
                // 全データが削除された場合
                localStorage.removeItem('portfolioData');
                localStorage.removeItem('rawTransactions');
                this.portfolioDataService.clearCache();

                // UI初期状態に戻す
                const dashboardArea = document.getElementById('dashboardArea');
                const tabContainer = document.getElementById('tabContainer');
                if (dashboardArea) dashboardArea.style.display = 'block';
                if (tabContainer) tabContainer.style.display = 'none';

                // データステータス更新
                if (typeof updateDataStatus === 'function') {
                    updateDataStatus(null);
                }

                this.uiService.showSuccess(`「${fileName}」を削除しました（全データが削除されました）`);
            }

            // ファイル一覧表示を更新
            this.displayLoadedFiles();

            return true;

        } catch (error) {
            console.error('ファイル削除エラー:', error);
            this.uiService.showError('ファイル削除中にエラーが発生しました');
            return false;
        }
    }

    // ===================================================================
    // データクリア
    // ===================================================================

    /**
     * 全データをクリア
     * @returns {boolean} クリア成功時true
     */
    clearAllData() {
        if (confirm('本当に全てのデータをクリアしますか？この操作は元に戻せません。')) {
            localStorage.removeItem('portfolioData');
            localStorage.removeItem('rawTransactions');
            localStorage.removeItem('loadedFileNames');

            this.portfolioDataService.clearCache();
            this.loadedFileNames = [];

            // UI初期状態に戻す
            const dashboardArea = document.getElementById('dashboardArea');
            const tabContainer = document.getElementById('tabContainer');
            if (dashboardArea) dashboardArea.style.display = 'block';
            if (tabContainer) tabContainer.style.display = 'none';

            // ファイル表示もクリア
            this.displayLoadedFiles();

            this.uiService.showSuccess('全データをクリアしました');
            return true;
        }
        return false;
    }
}

// グローバルシングルトンインスタンスを作成（依存関係を解決後に初期化）
// 注: portfolioDataService と uiService が既に初期化されている前提
window.FileService = FileService;
