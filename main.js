// ===================================================================
// MAIN.JS - File handling, CSV processing, UI navigation, utilities
// ===================================================================

// DOM Elements and Event Listeners (will be initialized in DOMContentLoaded)
let uploadZone, fileInput, dashboardArea;

// CSVファイルアップロード処理（サービスクラスへの委譲版）
async function handleFiles(files) {
    const result = await window.fileService.handleFiles(files);

    if (result.success) {
        displayDashboard(result.portfolioData);

        if (result.addedCount > 0) {
            showSuccessMessage(`${result.totalFiles}個のCSVファイルを処理し、${result.addedCount}件の新しい取引を追加しました`);
        } else {
            showInfoMessage(`${result.totalFiles}個のCSVファイルを処理しましたが、新しい取引はありませんでした（重複データのため）`);
        }

        // ファイル表示を更新
        window.fileService.displayLoadedFiles();

        // 価格データ状況を更新
        updatePriceDataStatusDisplay();
    }
}

// 既存取引データ取得
function getExistingTransactions() {
    return safeGetJSON('rawTransactions', []);
}

// 取引データ統合（重複除外）
function mergeTransactionData(existingData, newData) {
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

// CSVファイル解析
function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            encoding: 'UTF-8',
            complete: function (results) {
                const processedData = processCSVData(results.data, file.name);
                resolve(processedData);
            },
            error: function (error) {
                console.error(`${file.name} 解析エラー:`, error);
                reject(error);
            }
        });
    });
}

// CSV データ処理（GMO・OKJ対応）
function processCSVData(data, fileName) {
    const transactions = [];
    const selectedExchange = 'AUTO'; // 常に自動判定

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
// UI NAVIGATION AND UTILITY FUNCTIONS
// ===================================================================

// ページ切り替え
function showPage(pageId) {
    // 全ページを非表示
    document.querySelectorAll('.page-content').forEach(page => {
        page.classList.remove('active');
    });

    // ナビアイテムのアクティブ状態をリセット
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // 選択されたページを表示
    document.getElementById(`page-${pageId}`).classList.add('active');
    document.getElementById(`nav-${pageId}`).classList.add('active');
}

// タブ切り替え機能（サービスクラスへの委譲版）
function switchTab(tabName) {
    window.uiService.switchMainTab(tabName);
}

// サブタブ切り替え機能（サービスクラスへの委譲版）
function switchSubtab(subtabName) {
    window.uiService.switchSubTab(subtabName);
}

// サブタブ間の移動関数（サービスクラスへの委譲版）
function switchToPreviousSubtab() {
    window.uiService.switchToPreviousSubTab();
}

function switchToNextSubtab() {
    window.uiService.switchToNextSubTab();
}

// ===================================================================
// MESSAGE AND NOTIFICATION FUNCTIONS
// ===================================================================

// メッセージ表示（サービスクラスへの委譲版）
function showSuccessMessage(message) {
    window.uiService.showSuccess(message);
}

function showErrorMessage(message) {
    window.uiService.showError(message);
}

function showInfoMessage(message) {
    window.uiService.showInfo(message);
}

function showWarningMessage(message) {
    window.uiService.showWarning(message);
}

// ===================================================================
// FILE MANAGEMENT FUNCTIONS
// ===================================================================

// ファイル名を保存
function saveLoadedFileNames(fileNames) {
    safeSetJSON('loadedFileNames', fileNames);
}

// 保存されたファイル名を取得
function getLoadedFileNames() {
    return safeGetJSON('loadedFileNames', []);
}

// 読み込み済みファイル情報を表示（fileServiceに委譲）
function displayLoadedFiles() {
    if (window.fileService) {
        window.fileService.displayLoadedFiles();
    }
}

// 全データクリア（サービスクラスへの委譲版）
function clearAllData() {
    if (window.fileService.clearAllData()) {
        updateDataStatus(null);
        // 価格データ状況を更新
        updatePriceDataStatusDisplay();
    }
}

// ===================================================================
// PRICE DATA MANAGEMENT FUNCTIONS
// ===================================================================

// 価格データ管理機能（CacheService使用版）
function clearPriceData() {
    if (confirm('価格データをクリアしますか？チャート表示には再取得が必要になります。')) {
        // CacheServiceを使用して価格キャッシュをクリア
        const clearedCount = window.cache.clearPriceCache();

        // 価格ステータス更新
        updatePriceStatus('価格データクリア済み');

        // サイドバーの価格データ状況を更新
        updatePriceDataStatusDisplay();

        showSuccessMessage(`価格データをクリアしました (${clearedCount}件)`);
    }
}

// 価格データ状況表示（CacheService使用版）
function showPriceDataStatus() {
    try {
        // CacheServiceから統計情報を取得
        const stats = window.cache.getStorageStats();

        const maxSizeMB = (AppConfig.cacheDurations.MAX_STORAGE_SIZE / 1024 / 1024).toFixed(0);

        const message = `
📊 ストレージ使用状況:
💾 合計サイズ: ${stats.totalSizeMB}MB / ${maxSizeMB}MB
📈 価格キャッシュ: ${stats.priceDataCount}件 (${stats.priceDataSizeMB}MB)
📂 ポートフォリオデータ: ${stats.portfolioDataSizeMB}MB
📊 使用率: ${(stats.usageRatio * 100).toFixed(1)}%

詳細はブラウザのコンソール(F12)で確認できます。
        `.trim();

        alert(message);
        console.log('ストレージ統計:', stats);
    } catch (error) {
        console.error('価格データ状況表示エラー:', error);
        showErrorMessage('価格データ状況の取得に失敗しました');
    }
}

// 価格データ状況を自動更新（サイドバーに表示）
function updatePriceDataStatusDisplay() {
    const statusElement = document.getElementById('price-data-status');
    if (!statusElement) return;

    try {
        // CacheServiceから統計情報を取得
        const stats = window.cache.getStorageStats();
        const maxSizeMB = (AppConfig.cacheDurations.MAX_STORAGE_SIZE / 1024 / 1024).toFixed(0);

        // 状態表示を生成
        const statusHTML = `
            <div style="margin-bottom: 4px;">合計: ${stats.totalSizeMB}MB / ${maxSizeMB}MB (${(stats.usageRatio * 100).toFixed(1)}%)</div>
            <div style="margin-bottom: 4px;">価格キャッシュ: ${stats.priceDataCount}件 (${stats.priceDataSizeMB}MB)</div>
            <div>ポートフォリオ: ${stats.portfolioDataSizeMB}MB</div>
        `;

        statusElement.innerHTML = statusHTML;
    } catch (error) {
        console.error('価格データ状況更新エラー:', error);
        statusElement.innerHTML = '<div style="color: #dc3545;">状態取得エラー</div>';
    }
}

// ===================================================================
// KEYBOARD SHORTCUTS
// ===================================================================

// キーボードショートカット機能
function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // 入力フィールドにフォーカスがある場合はショートカットを無効化
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrlキーが押されている場合のみ処理
        if (!e.ctrlKey) return;

        switch (e.key) {
            case '1':
                e.preventDefault();
                switchTab('portfolio');
                break;
            case '2':
                e.preventDefault();
                switchTab('trading');
                break;
            case 's':
                e.preventDefault();
                if (document.getElementById('tab-portfolio').classList.contains('active')) {
                    switchSubtab('summary');
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                switchToPreviousSubtab();
                break;
            case 'ArrowRight':
                e.preventDefault();
                switchToNextSubtab();
                break;
        }
    });
}

// モバイルメニューの初期化（ハンバーガーメニュー）
function initializeMobileMenu() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');

    if (!sidebarToggle || !sidebar || !sidebarOverlay) return;

    // メニューを開く/閉じる
    function toggleMenu() {
        const isOpen = sidebar.classList.contains('mobile-open');

        if (isOpen) {
            sidebar.classList.remove('mobile-open');
            sidebarOverlay.classList.remove('active');
            sidebarToggle.classList.remove('active');
        } else {
            sidebar.classList.add('mobile-open');
            sidebarOverlay.classList.add('active');
            sidebarToggle.classList.add('active');
        }
    }

    // ハンバーガーボタンクリック
    sidebarToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });

    // オーバーレイクリックでメニューを閉じる
    sidebarOverlay.addEventListener('click', () => {
        toggleMenu();
    });

    // サイドバー内のナビゲーションアイテムをクリックしたら閉じる
    const navItems = sidebar.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            if (isMobile()) {
                toggleMenu();
            }
        });
    });
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

// モバイルデバイス検出
function isMobile() {
    return window.innerWidth <= 768;
}

// キャッシュ機能はcharts.jsで統一管理

// ===================================================================
// INITIALIZATION
// ===================================================================

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素を初期化
    uploadZone = document.getElementById('uploadZone');
    fileInput = document.getElementById('fileInput');
    dashboardArea = document.getElementById('dashboardArea');

    // イベントリスナーを設定
    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const files = e.dataTransfer.files;
            handleFiles(files);
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            handleFiles(files);
        });
    }

    // 保存されたファイル名を表示
    displayLoadedFiles();

    // キーボードショートカット初期化
    initializeKeyboardShortcuts();

    // モバイルメニュー初期化
    initializeMobileMenu();

    // ウィンドウリサイズ時にテーブル表示を更新
    window.addEventListener('resize', () => {
        const currentData = portfolioDataService.getData();
        if (currentData) {
            const tableContainer = document.getElementById('portfolio-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = generatePortfolioTable(currentData);
            }

            const tradingContainer = document.getElementById('trading-history-container');
            if (tradingContainer) {
                tradingContainer.innerHTML = generateTradingHistoryTable(currentData);
            }
        }
    });

    // ページロード時にportfolioChartModeを復元
    window.portfolioChartMode = safeGetJSON('portfolioChartMode', 'combined');

    // アップロード済みのデータがあるかチェック（localStorage）
    const portfolioData = safeGetJSON('portfolioData');
    if (portfolioData) {
        // データがある場合はタブシステムで表示
        displayDashboard(portfolioData);
    } else {
        updateDataStatus(null);
    }

    // 起動時に旧形式の価格キャッシュをクリーンアップ
    setTimeout(() => {
        window.cache.cleanupLegacyPriceCache();
        // 旧チャートキャッシュのクリーンアップ（chart_* → price_history統合）
        window.cache.cleanupLegacyChartCache();
    }, 1000);

    // 価格データ状況を初期表示
    setTimeout(() => {
        updatePriceDataStatusDisplay();
    }, 100);

    // 定期的に価格データ状況を更新（30秒ごと）
    setInterval(() => {
        updatePriceDataStatusDisplay();
    }, 30000);
});

// ===================================================================
// INDIVIDUAL COIN PROFIT CHART RENDERING
// ===================================================================

/**
 * 個別銘柄の損益推移チャートを描画
 * @param {string} coinName - 銘柄シンボル（例: "BTC"）
 */
async function renderCoinProfitChart(coinName) {
    try {
        // ポートフォリオデータを取得
        const portfolioData = window.cache.getPortfolioData();
        if (!portfolioData) {
            throw new Error('ポートフォリオデータが見つかりません');
        }

        const canvasId = `${coinName.toLowerCase()}-profit-chart`;

        // rawTransactionsから該当銘柄の取引を取得
        const transactions = getTransactionsByCoin(coinName);
        if (!transactions || transactions.all.length === 0) {
            throw new Error(`${coinName}の取引データが見つかりません`);
        }

        // 価格履歴を取得
        showInfoMessage(`${coinName}の価格履歴を取得中...`);
        const priceHistory = await fetchCoinNamePriceHistory(coinName);

        // 損益推移データを生成
        const profitData = generateHistoricalProfitTimeSeries(
            transactions.all,
            priceHistory
        );

        // チャートを描画（含み損益のみ）
        displayProfitChart(
            canvasId,
            profitData,
            `${coinName} 含み損益推移（過去1か月）`,
            'coin'
        );

        showSuccessMessage(`${coinName}の損益チャートを表示しました`);

    } catch (error) {
        console.error(`${coinName}チャート描画エラー:`, error);
        showErrorMessage(`${coinName}チャート描画失敗: ${error.message}`);
    }
}

// グローバル関数として明示的に定義（HTMLから呼び出し可能にする）
(function () {
    window.showPage = showPage;
    window.switchTab = switchTab;
    window.switchSubtab = switchSubtab;
    window.clearAllData = clearAllData;
    window.clearPriceData = clearPriceData;
    window.showPriceDataStatus = showPriceDataStatus;
    window.updatePriceDataStatusDisplay = updatePriceDataStatusDisplay;
    window.renderCoinProfitChart = renderCoinProfitChart;
    // トースト通知関数をグローバルに公開（他のJSファイルから呼び出し可能に）
    window.showSuccessMessage = showSuccessMessage;
    window.showErrorMessage = showErrorMessage;
    window.showWarningMessage = showWarningMessage;
    window.showInfoMessage = showInfoMessage;
})();