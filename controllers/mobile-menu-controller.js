/**
 * MobileMenuController - モバイルメニュー管理
 *
 * ハンバーガーメニューの開閉、オーバーレイ表示などを管理します。
 */
class MobileMenuController {
    constructor() {
        this.sidebarToggle = null;
        this.sidebar = null;
        this.sidebarOverlay = null;
    }

    /**
     * モバイルメニューを初期化
     */
    initialize() {
        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.sidebar = document.getElementById('sidebar');
        this.sidebarOverlay = document.getElementById('sidebarOverlay');

        if (!this.sidebarToggle || !this.sidebar || !this.sidebarOverlay) {
            console.warn('Mobile menu elements not found');
            return;
        }

        this._setupEventListeners();
    }

    /**
     * イベントリスナーをセットアップ
     * @private
     */
    _setupEventListeners() {
        // ハンバーガーボタンクリック
        this.sidebarToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMenu();
        });

        // オーバーレイクリックでメニューを閉じる
        this.sidebarOverlay.addEventListener('click', () => {
            this.closeMenu();
        });

        // サイドバー内のナビゲーションアイテムをクリックしたら閉じる
        const navItems = this.sidebar.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                if (this._isMobile()) {
                    this.closeMenu();
                }
            });
        });
    }

    /**
     * メニューを開く/閉じる
     */
    toggleMenu() {
        const isOpen = this.sidebar.classList.contains('mobile-open');
        isOpen ? this.closeMenu() : this.openMenu();
    }

    /**
     * メニューを開く
     */
    openMenu() {
        this.sidebar.classList.add('mobile-open');
        this.sidebarOverlay.classList.add('active');
        this.sidebarToggle.classList.add('active');
    }

    /**
     * メニューを閉じる
     */
    closeMenu() {
        this.sidebar.classList.remove('mobile-open');
        this.sidebarOverlay.classList.remove('active');
        this.sidebarToggle.classList.remove('active');
    }

    /**
     * モバイルデバイスかチェック
     * @private
     * @returns {boolean}
     */
    _isMobile() {
        return window.innerWidth <= 768;
    }
}

// グローバルに公開
window.MobileMenuController = MobileMenuController;
