// ========== MAIN.JS - File handling, CSV processing, UI navigation, utilities ==========

// CSVファイルアップロード処理（サービスクラスへの委譲版）
async function handleFiles(files) {
    const result = await window.fileService.handleFiles(files);

    if (result.success) {
        await window.uiService.displayDashboard(result.portfolioData);

        if (result.addedCount > 0) {
            window.uiService.showSuccess(`${result.totalFiles}個のCSVファイルを処理し、${result.addedCount}件の新しい取引を追加しました`);
        } else {
            window.uiService.showInfo(`${result.totalFiles}個のCSVファイルを処理しましたが、新しい取引はありませんでした（重複データのため）`);
        }

        // ファイル表示を更新
        window.fileService.displayLoadedFiles();

        // 価格データ状況を更新
        updatePriceDataStatusDisplay();
    }
}

// CSV処理関数はFileServiceに移動済み（services/file-service.js参照）

// ========== UI NAVIGATION AND UTILITY FUNCTIONS ==========

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

// タブ切り替え、サブタブ切り替えなどの関数は削除されました。
// 直接 window.uiService のメソッドを呼び出してください。

// ========== MESSAGE AND NOTIFICATION FUNCTIONS ==========
// メッセージ表示関数は削除されました。直接 window.uiService.showSuccess/showError/showInfo/showWarning を使用してください。

// ========== FILE MANAGEMENT FUNCTIONS ==========

// ファイル名を保存
function saveLoadedFileNames(fileNames) {
    window.cache.setLoadedFileNames(fileNames);
}

// 保存されたファイル名を取得
function getLoadedFileNames() {
    return window.cache.getLoadedFileNames();
}

// 読み込み済みファイル情報を表示（fileServiceに委譲）
function displayLoadedFiles() {
    if (window.fileService) {
        window.fileService.displayLoadedFiles();
    }
}


// ========== KEYBOARD SHORTCUTS ==========

// キーボードショートカット機能
function initializeKeyboardShortcuts() {
    // 重複登録を防止
    if (window._keyboardShortcutsInitialized) {
        return;
    }

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
                window.uiService.switchMainTab('portfolio');
                break;
            case '2':
                e.preventDefault();
                window.uiService.switchMainTab('trading');
                break;
            case 's':
                e.preventDefault();
                if (document.getElementById('tab-portfolio').classList.contains('active')) {
                    window.uiService.switchSubTab('summary');
                }
                break;
            case 'ArrowLeft':
                e.preventDefault();
                window.uiService.switchToPreviousSubTab();
                break;
            case 'ArrowRight':
                e.preventDefault();
                window.uiService.switchToNextSubTab();
                break;
        }
    });

    window._keyboardShortcutsInitialized = true;
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

// ========== UTILITY FUNCTIONS ==========

// モバイルデバイス検出
function isMobile() {
    return window.innerWidth <= 768;
}

// キャッシュ機能はcharts.jsで統一管理

// ========== INITIALIZATION ==========

// ページ読み込み時の初期化
document.addEventListener('DOMContentLoaded', async () => {
    // DOM要素を取得してイベントリスナーを設定（ローカル変数）
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');

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
    if (!window._resizeListenerInitialized) {
        window.addEventListener('resize', () => {
            const currentData = window.cache.getPortfolioData();
            if (currentData) {
                const tableContainer = document.getElementById('portfolio-table-container');
                if (tableContainer) {
                    tableContainer.innerHTML = window.uiService.tableRenderer._renderDesktopPortfolioTable(currentData);
                }

                const tradingContainer = document.getElementById('trading-history-container');
                if (tradingContainer) {
                    tradingContainer.innerHTML = window.uiService.tableRenderer._renderDesktopTradingHistoryTable(currentData);
                }
            }
        });

        window._resizeListenerInitialized = true;
    }

    // アップロード済みのデータがあるかチェック（localStorage）
    const portfolioData = window.cache.getPortfolioData();
    if (portfolioData) {
        // データがある場合はタブシステムで表示
        await window.uiService.displayDashboard(portfolioData);
    } else {
        window.uiService.updateDataStatus(null);
    }
});

// ========== PRICE HISTORY ACCUMULATION ==========



