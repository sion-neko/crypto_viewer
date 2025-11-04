// ===================================================================
// CONFIG.JS - Application configuration and constants
// ===================================================================

/**
 * アプリケーション全体の設定と定数を管理
 * 全てのグローバル定数をここに集約し、読み取り専用にする
 */
const AppConfig = {
    // ===================================================================
    // API設定
    // ===================================================================

    /**
     * CoinGecko API用の銘柄マッピング
     * 日本の取引所の銘柄シンボル → CoinGecko ID
     */
    coinGeckoMapping: {
        'BTC': 'bitcoin',
        'ETH': 'ethereum',
        'SOL': 'solana',
        'XRP': 'ripple',
        'ADA': 'cardano',
        'DOGE': 'dogecoin',
        'ASTR': 'astar',
        'XTZ': 'tezos',
        'XLM': 'stellar',
        'SHIB': 'shiba-inu',
        'PEPE': 'pepe',
        'SUI': 'sui',
        'DAI': 'dai'
    },

    // ===================================================================
    // キャッシュ設定
    // ===================================================================

    /**
     * キャッシュの有効期限（ミリ秒）
     */
    cacheDurations: {
        CURRENT_PRICES: 30 * 60 * 1000,      // 現在価格: 30分
        PRICE_HISTORY: 24 * 60 * 60 * 1000,  // 価格履歴: 24時間
        CHART_DATA: 6 * 60 * 60 * 1000,      // チャートデータ: 6時間
        MAX_STORAGE_SIZE: 50 * 1024 * 1024,  // 最大50MB
        CLEANUP_THRESHOLD: 0.8               // 80%使用時にクリーンアップ
    },

    // ===================================================================
    // チャート設定
    // ===================================================================

    /**
     * 銘柄別のチャート色設定
     * border: チャートの線の色
     * bg: チャートの背景色（透明度0.1）
     */
    coinColors: {
        'BTC': { border: '#F7931A', bg: 'rgba(247, 147, 26, 0.1)' },
        'ETH': { border: '#627EEA', bg: 'rgba(98, 126, 234, 0.1)' },
        'SOL': { border: '#9945FF', bg: 'rgba(153, 69, 255, 0.1)' },
        'XRP': { border: '#23292F', bg: 'rgba(35, 41, 47, 0.1)' },
        'ADA': { border: '#0033AD', bg: 'rgba(0, 51, 173, 0.1)' },
        'DOGE': { border: '#C2A633', bg: 'rgba(194, 166, 51, 0.1)' },
        'ASTR': { border: '#0070F3', bg: 'rgba(0, 112, 243, 0.1)' },
        'XTZ': { border: '#2C7DF7', bg: 'rgba(44, 125, 247, 0.1)' },
        'XLM': { border: '#14B6E7', bg: 'rgba(20, 182, 231, 0.1)' },
        'SHIB': { border: '#FFA409', bg: 'rgba(255, 164, 9, 0.1)' },
        'PEPE': { border: '#00D924', bg: 'rgba(0, 217, 36, 0.1)' },
        'SUI': { border: '#4DA2FF', bg: 'rgba(77, 162, 255, 0.1)' },
        'DAI': { border: '#FBCC5F', bg: 'rgba(251, 204, 95, 0.1)' }
    },

    /**
     * デフォルトの色（未定義の銘柄用）
     */
    defaultCoinColor: {
        border: '#3498db',
        bg: 'rgba(52, 152, 219, 0.1)'
    }
};

// 設定オブジェクトを読み取り専用にする
Object.freeze(AppConfig.coinGeckoMapping);
Object.freeze(AppConfig.cacheDurations);
Object.freeze(AppConfig.coinColors);
Object.freeze(AppConfig.defaultCoinColor);
Object.freeze(AppConfig);

// グローバルスコープに公開
window.AppConfig = AppConfig;
