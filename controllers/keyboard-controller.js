/**
 * KeyboardController - キーボードショートカット管理
 *
 * アプリケーション全体のキーボードショートカットを管理します。
 */
class KeyboardController {
    constructor(uiService) {
        this.uiService = uiService;
    }

    /**
     * キーボードショートカットを初期化
     */
    initialize() {
        document.addEventListener('keydown', (e) => this._handleKeyPress(e));
    }

    /**
     * キーボードイベントを処理
     * @private
     * @param {KeyboardEvent} e - キーボードイベント
     */
    _handleKeyPress(e) {
        // 入力フィールドにフォーカスがある場合はショートカットを無効化
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        // Ctrlキーが押されている場合のみ処理
        if (!e.ctrlKey) return;

        const handled = this._executeShortcut(e.key);
        if (handled) {
            e.preventDefault();
        }
    }

    /**
     * ショートカットキーに対応する処理を実行
     * @private
     * @param {string} key - 押されたキー
     * @returns {boolean} 処理が実行された場合true
     */
    _executeShortcut(key) {
        switch (key) {
            case '1':
                this.uiService.switchMainTab('portfolio');
                return true;

            case '2':
                this.uiService.switchMainTab('trading');
                return true;

            case 's':
                if (this._isPortfolioTabActive()) {
                    this.uiService.switchSubTab('summary');
                }
                return true;

            case 'ArrowLeft':
                this.uiService.switchToPreviousSubtab();
                return true;

            case 'ArrowRight':
                this.uiService.switchToNextSubtab();
                return true;

            default:
                return false;
        }
    }

    /**
     * ポートフォリオタブがアクティブかチェック
     * @private
     * @returns {boolean}
     */
    _isPortfolioTabActive() {
        const portfolioTab = document.getElementById('tab-portfolio');
        return portfolioTab && portfolioTab.classList.contains('active');
    }
}

// グローバルに公開
window.KeyboardController = KeyboardController;
