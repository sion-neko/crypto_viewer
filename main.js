// ===================================================================
// MAIN.JS - File handling, CSV processing, UI navigation, utilities
// ===================================================================

// DOM Elements and Event Listeners (will be initialized in DOMContentLoaded)
let uploadZone, fileInput, dashboardArea;

// ファイル処理（データ統合版）
function handleFiles(files) {
    const csvFiles = Array.from(files).filter(file =>
        file.type === 'text/csv' || file.name.endsWith('.csv')
    );

    if (csvFiles.length === 0) {
        showErrorMessage('CSVファイルを選択してください');
        return;
    }

    // 既存データを取得
    const existingData = getExistingTransactions();

    // 並列でCSVファイルを読み込み
    const promises = csvFiles.map(file => parseCSVFile(file));

    Promise.all(promises)
        .then(results => {
            const newData = results.flat();

            if (newData.length > 0) {
                // ファイル名を保存
                const fileNames = csvFiles.map(file => file.name);
                const existingFileNames = getLoadedFileNames();
                const allFileNames = [...new Set([...existingFileNames, ...fileNames])];
                saveLoadedFileNames(allFileNames);

                // 重複データを除外して統合
                const mergedData = mergeTransactionData(existingData, newData);
                const addedCount = mergedData.length - existingData.length;

                // ポートフォリオ再計算
                const portfolioData = analyzePortfolioData(mergedData);

                // 生の取引データも保存（次回の重複チェック用）
                localStorage.setItem('rawTransactions', JSON.stringify(mergedData));
                localStorage.setItem('portfolioData', JSON.stringify(portfolioData));

                displayDashboard(portfolioData);

                if (addedCount > 0) {
                    showSuccessMessage(`${csvFiles.length}個のCSVファイルを処理し、${addedCount}件の新しい取引を追加しました`);
                } else {
                    showInfoMessage(`${csvFiles.length}個のCSVファイルを処理しましたが、新しい取引はありませんでした（重複データのため）`);
                }
            } else {
                showErrorMessage('有効な取引データが見つかりませんでした');
            }
        })
        .catch(error => {
            console.error('CSV処理エラー:', error);
            showErrorMessage('CSVファイルの処理中にエラーが発生しました');
        });
}

// 既存取引データ取得
function getExistingTransactions() {
    try {
        const rawData = localStorage.getItem('rawTransactions');
        return rawData ? JSON.parse(rawData) : [];
    } catch (error) {
        console.error('既存データ読み込みエラー:', error);
        return [];
    }
}

// 取引データ統合（重複除外）
function mergeTransactionData(existingData, newData) {
    const merged = [...existingData];
    let duplicateCount = 0;

    newData.forEach(newTx => {
        // 重複チェック：日時・銘柄・取引所・数量・金額が完全一致
        const isDuplicate = existingData.some(existingTx =>
            existingTx.date === newTx.date &&
            existingTx.symbol === newTx.symbol &&
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
    const selectedExchange = document.querySelector('input[name="exchange"]:checked').value;

    // 最初の行で列名を確認（デバッグ用）
    if (data.length > 0) {
    }

    data.forEach(row => {
        // GMOコイン形式
        if ((selectedExchange === 'GMO' || selectedExchange === 'AUTO') &&
            row['精算区分'] && row['精算区分'].includes('取引所現物取引')) {
            const symbol = row['銘柄名'];
            if (symbol && symbol !== 'JPY') {
                const transaction = {
                    exchange: 'GMO',
                    symbol: symbol,
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
            const symbol = pair.replace('/JPY', '');

            if (symbol !== 'JPY' && row['売買'] === '購入') {
                const transaction = {
                    exchange: 'OKJ',
                    symbol: symbol,
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

// タブ切り替え機能
function switchTab(tabName) {
    // 全タブボタンのアクティブ状態をリセット
    document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // 選択されたタブをアクティブに
    document.querySelector(`[onclick="switchTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
}

// サブタブ切り替え機能
function switchSubtab(subtabName) {
    // 全サブタブボタンのアクティブ状態をリセット
    document.querySelectorAll('.subtab-button').forEach(btn => {
        btn.classList.remove('active');
        // ボタンの背景色をリセット
        if (!btn.classList.contains('active')) {
            btn.style.backgroundColor = '';
        }
    });
    document.querySelectorAll('.subtab-content').forEach(content => content.classList.remove('active'));

    // 選択されたサブタブをアクティブに
    const targetButton = document.getElementById(`subtab-${subtabName}`);
    const targetContent = document.getElementById(`subtab-content-${subtabName}`);

    if (targetButton) {
        targetButton.classList.add('active');
        // アクティブボタンの背景色を設定
        targetButton.style.backgroundColor = '';
    }
    if (targetContent) {
        targetContent.classList.add('active');

        // 銘柄タブが選択された場合、チャートを描画（summaryは除外）
        if (subtabName !== 'summary') {
            displaySymbolChart(subtabName.toUpperCase());
            
            // ETHの場合は損益推移チャートも描画
            if (subtabName.toUpperCase() === 'ETH') {
                setTimeout(() => {
                    renderETHProfitChart();
                }, 100); // DOM更新後に実行
            }
        }
    }
}

// サブタブ間の移動関数
function switchToPreviousSubtab() {
    if (!document.getElementById('tab-portfolio').classList.contains('active')) return;

    const activeSubtab = document.querySelector('.subtab-button.active');
    if (!activeSubtab) return;

    const allSubtabs = document.querySelectorAll('.subtab-button');
    const currentIndex = Array.from(allSubtabs).indexOf(activeSubtab);
    const previousIndex = currentIndex > 0 ? currentIndex - 1 : allSubtabs.length - 1;

    const previousSubtab = allSubtabs[previousIndex];
    if (previousSubtab) {
        previousSubtab.click();
    }
}

function switchToNextSubtab() {
    if (!document.getElementById('tab-portfolio').classList.contains('active')) return;

    const activeSubtab = document.querySelector('.subtab-button.active');
    if (!activeSubtab) return;

    const allSubtabs = document.querySelectorAll('.subtab-button');
    const currentIndex = Array.from(allSubtabs).indexOf(activeSubtab);
    const nextIndex = currentIndex < allSubtabs.length - 1 ? currentIndex + 1 : 0;

    const nextSubtab = allSubtabs[nextIndex];
    if (nextSubtab) {
        nextSubtab.click();
    }
}

// ===================================================================
// MESSAGE AND NOTIFICATION FUNCTIONS
// ===================================================================

// メッセージ表示（シンプル版）
function showSuccessMessage(message) {
    showSimpleToast(message, 'success');
}

function showErrorMessage(message) {
    showSimpleToast(message, 'error');
}

function showInfoMessage(message) {
    showSimpleToast(message, 'info');
}

function showWarningMessage(message) {
    showSimpleToast(message, 'warning');
}

// ===================================================================
// SIMPLE TOAST SYSTEM (FALLBACK)
// ===================================================================

// シンプルなトースト表示関数（フォールバック）
function showSimpleToast(message, type = 'success') {
    // 既存のトーストがあれば削除
    const existingToast = document.querySelector('.simple-toast');
    if (existingToast) {
        existingToast.remove();
    }

    // 新しいトースト作成
    const toast = document.createElement('div');
    toast.className = 'simple-toast';

    const colors = {
        success: '#28a745',
        error: '#dc3545',
        warning: '#ffc107',
        info: '#17a2b8'
    };

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type] || colors.success};
        color: white;
        padding: 16px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 99999;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        max-width: 350px;
        display: flex;
        align-items: center;
        gap: 8px;
    `;

    toast.innerHTML = `
        <span>${icons[type] || icons.success}</span>
        <span>${message}</span>
    `;

    document.body.appendChild(toast);

    // 表示アニメーション
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 100);

    // 自動削除
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 4000);
}

// 後方互換性のための関数
function showToast(message) {
    showSimpleToast(message, 'success');
}



// ===================================================================
// FILE MANAGEMENT FUNCTIONS
// ===================================================================

// ファイル名を保存
function saveLoadedFileNames(fileNames) {
    localStorage.setItem('loadedFileNames', JSON.stringify(fileNames));
}

// 保存されたファイル名を取得
function getLoadedFileNames() {
    const stored = localStorage.getItem('loadedFileNames');
    return stored ? JSON.parse(stored) : [];
}

// 読み込み済みファイル情報を表示（アップロードタブのみ）
function displayLoadedFiles() {
    const fileNames = getLoadedFileNames();
    const uploadSection = document.getElementById('upload-files-section');
    const uploadList = document.getElementById('upload-files-list');

    if (fileNames.length > 0) {
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
            </div>`
        ).join('');
    } else {
        uploadSection.style.display = 'none';
    }
}

// 全データクリア
function clearAllData() {
    if (confirm('本当に全てのデータをクリアしますか？この操作は元に戻せません。')) {
        localStorage.removeItem('portfolioData');
        localStorage.removeItem('rawTransactions');
        localStorage.removeItem('loadedFileNames');

        // UI初期状態に戻す
        document.getElementById('dashboardArea').style.display = 'block';
        document.getElementById('tabContainer').style.display = 'none';
        updateDataStatus(null);

        // ファイル表示もクリア
        displayLoadedFiles();

        showSuccessMessage('全データをクリアしました');
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

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

// モバイルデバイス検出
function isMobile() {
    return window.innerWidth <= 768;
}

// キャッシュ機能
const CACHE_DURATION_PRICE = 5 * 60 * 1000; // 5分
const CACHE_DURATION_CHART = 30 * 60 * 1000; // 30分

function getCachedData(key) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);
            if (Date.now() - data.timestamp < data.duration) {
                return data.value;
            }
            localStorage.removeItem(key);
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
    }
    return null;
}

function setCachedData(key, value, duration) {
    try {
        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration
        };
        localStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
        console.error('キャッシュ保存エラー:', error);
    }
}

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

    // ウィンドウリサイズ時にテーブル表示を更新
    window.addEventListener('resize', () => {
        if (currentPortfolioData) {
            const tableContainer = document.getElementById('portfolio-table-container');
            if (tableContainer) {
                tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);
            }

            const tradingContainer = document.getElementById('trading-history-container');
            if (tradingContainer) {
                tradingContainer.innerHTML = generateTradingHistoryTable(currentPortfolioData);
            }
        }
    });

    // 既存のデータがあるかチェック（localStorage）
    const savedData = localStorage.getItem('portfolioData');
    if (savedData) {
        try {
            const portfolioData = JSON.parse(savedData);
            // データがある場合はタブシステムで表示
            displayDashboard(portfolioData);
        } catch (error) {
            console.error('データ復元エラー:', error);
            localStorage.removeItem('portfolioData');
            updateDataStatus(null);
        }
    } else {
        updateDataStatus(null);
    }
});

// グローバル関数として明示的に定義（HTMLから呼び出し可能にする）
(function () {
    // 関数が定義されているか確認してからグローバルに設定
    if (typeof showPage === 'function') window.showPage = showPage;
    if (typeof switchTab === 'function') window.switchTab = switchTab;
    if (typeof switchSubtab === 'function') window.switchSubtab = switchSubtab;
    if (typeof clearAllData === 'function') window.clearAllData = clearAllData;
})();