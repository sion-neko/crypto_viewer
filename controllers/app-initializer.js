/**
 * AppInitializer - アプリケーション初期化管理
 *
 * アプリケーション起動時の初期化処理を管理します。
 */
class AppInitializer {
    constructor(services) {
        this.services = services;
        this.keyboardController = null;
        this.mobileMenuController = null;
    }

    /**
     * アプリケーションを初期化
     */
    async initialize() {
        console.log('Initializing application...');

        // DOM要素を初期化
        this._initializeDOMElements();

        // イベントリスナーを設定
        this._setupEventListeners();

        // コントローラーを初期化
        this._initializeControllers();

        // 保存されたデータをロード
        await this._loadSavedData();

        // バックグラウンド処理を開始
        this._startBackgroundTasks();

        console.log('Application initialized successfully');
    }

    /**
     * DOM要素を初期化
     * @private
     */
    _initializeDOMElements() {
        this.uploadZone = document.getElementById('uploadZone');
        this.fileInput = document.getElementById('fileInput');
        this.dashboardArea = document.getElementById('dashboardArea');
    }

    /**
     * イベントリスナーを設定
     * @private
     */
    _setupEventListeners() {
        // ファイルアップロード（ドラッグ&ドロップ）
        if (this.uploadZone) {
            this.uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                this.uploadZone.classList.add('drag-over');
            });

            this.uploadZone.addEventListener('dragleave', () => {
                this.uploadZone.classList.remove('drag-over');
            });

            this.uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                this.uploadZone.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                this._handleFileUpload(files);
            });
        }

        // ファイルアップロード（ファイル選択）
        if (this.fileInput) {
            this.fileInput.addEventListener('change', (e) => {
                const files = e.target.files;
                this._handleFileUpload(files);
            });
        }

        // ウィンドウリサイズ時にテーブル表示を更新
        window.addEventListener('resize', () => this._handleWindowResize());
    }

    /**
     * コントローラーを初期化
     * @private
     */
    _initializeControllers() {
        // キーボードショートカット
        this.keyboardController = new KeyboardController(this.services.uiService);
        this.keyboardController.initialize();

        // モバイルメニュー
        this.mobileMenuController = new MobileMenuController();
        this.mobileMenuController.initialize();
    }

    /**
     * 保存されたデータをロード
     * @private
     */
    async _loadSavedData() {
        // 保存されたファイル名を表示
        this.services.fileService.displayLoadedFiles();

        // チャート表示モードを復元
        window.portfolioChartMode = safeGetJSON('portfolioChartMode', 'combined');

        // ポートフォリオデータをロード
        const portfolioData = this.services.portfolioDataService.getData();

        if (portfolioData) {
            // データがある場合はダッシュボードを表示
            displayDashboard(portfolioData);
        } else {
            updateDataStatus(null);
        }
    }

    /**
     * バックグラウンドタスクを開始
     * @private
     */
    _startBackgroundTasks() {
        // レガシーキャッシュのクリーンアップ（1秒後）
        setTimeout(() => {
            this.services.cache.cleanupLegacyPriceCache();
            this.services.cache.cleanupLegacyChartCache();
        }, 1000);

        // 価格データ状況を初期表示（100ms後）
        setTimeout(() => {
            updatePriceDataStatusDisplay();
        }, 100);

        // 価格データ状況の定期更新（30秒ごと）
        setInterval(() => {
            updatePriceDataStatusDisplay();
        }, 30000);

        // 価格履歴の自動更新（1秒後）
        setTimeout(() => {
            initializePriceHistoryAccumulation();
        }, 1000);
    }

    /**
     * ファイルアップロードを処理
     * @private
     * @param {FileList} files - アップロードされたファイル
     */
    async _handleFileUpload(files) {
        const result = await this.services.fileService.handleFiles(files);

        if (result.success) {
            displayDashboard(result.portfolioData);

            if (result.addedCount > 0) {
                this.services.uiService.showSuccess(
                    `${result.totalFiles}個のCSVファイルを処理し、${result.addedCount}件の新しい取引を追加しました`
                );
            } else {
                this.services.uiService.showInfo(
                    `${result.totalFiles}個のCSVファイルを処理しましたが、新しい取引はありませんでした（重複データのため）`
                );
            }

            // ファイル表示を更新
            this.services.fileService.displayLoadedFiles();

            // 価格データ状況を更新
            updatePriceDataStatusDisplay();
        }
    }

    /**
     * ウィンドウリサイズを処理
     * @private
     */
    _handleWindowResize() {
        const currentData = this.services.portfolioDataService.getData();
        if (!currentData) return;

        // ポートフォリオテーブルを更新
        const tableContainer = document.getElementById('portfolio-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = generatePortfolioTable(currentData);
        }

        // 取引履歴テーブルを更新
        const tradingContainer = document.getElementById('trading-history-container');
        if (tradingContainer) {
            tradingContainer.innerHTML = generateTradingHistoryTable(currentData);
        }
    }
}

// グローバルに公開
window.AppInitializer = AppInitializer;
