// ===================================================================
// CHARTS.JS - Chart rendering and historical data functions
// ===================================================================

// Global variables for chart data (use window object to avoid conflicts)
if (!window.appChartData) {
    window.appChartData = {
        historicalData: {},
        historicalDataTimestamps: {}, // 各銘柄の履歴データ取得タイムスタンプ
        profitChartInstance: null,
        apiCallCount: 0,
        lastApiCall: 0
    };
}

// 後方互換性のためのエイリアス
let historicalData = window.appChartData.historicalData;
let profitChartInstance = window.appChartData.profitChartInstance;

// API使用状況の監視（定数化）
const API_CALL_LIMIT = 50; // CoinGecko無料プランの制限
const API_CALL_INTERVAL = 1200; // 1.2秒間隔（50回/分制限対応）
const API_RESET_INTERVAL = 60000; // 1分

// API制限カウンターのリセット（1分ごと正確にリセット）
let lastResetTime = Date.now();
setInterval(() => {
    const now = Date.now();
    const elapsed = now - lastResetTime;

    // 1分経過したらリセット
    if (elapsed >= API_RESET_INTERVAL) {
        window.appChartData.apiCallCount = 0;
        lastResetTime = now;
    }
}, 10000); // 10秒ごとにチェック

// ===================================================================
// PRICE HISTORY FUNCTIONS
// ===================================================================

// 銘柄の過去1か月の価格履歴を取得（永続化強化版）
async function fetchSymbolPriceHistory(symbol) {
    // api.jsのSYMBOL_MAPPINGを参照（グローバル変数として利用）
    const SYMBOL_MAPPING = window.SYMBOL_MAPPING || {
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
    };

    const coingeckoId = SYMBOL_MAPPING[symbol];
    if (!coingeckoId) {
        throw new Error(`${symbol}はサポートされていない銘柄です`);
    }

    const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;

    // キャッシュチェック（24時間有効、6時間以内は新鮮とみなす）
    const cachedDataWithMeta = getCachedDataWithMetadata(cacheKey, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);
    if (cachedDataWithMeta) {
        const cachedData = cachedDataWithMeta.value;
        const cacheTimestamp = cachedDataWithMeta.timestamp;
        const cacheDate = new Date(cacheTimestamp);

        // キャッシュデータの最新性をチェック
        const latestDataDate = new Date(cachedData[cachedData.length - 1].date);
        const hoursOld = (Date.now() - latestDataDate.getTime()) / (1000 * 60 * 60);

        if (hoursOld < 6) {
            // 6時間以内のデータは新鮮とみなす
            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });

            showSuccessMessage(`${symbol}: キャッシュから表示\n${cacheTimeStr}保存`);
            return cachedData;
        } else {
            showInfoMessage(`${symbol}: 価格データが古いため最新データを取得中...`);
        }
    } else {
        showInfoMessage(`${symbol}: 価格履歴を新規取得中...`);
    }

    try {
        // API制限チェック
        if (window.appChartData.apiCallCount >= API_CALL_LIMIT) {
            throw new Error('API制限に達しました。しばらく時間をおいてからお試しください。');
        }

        // API呼び出し間隔制御
        const now = Date.now();
        const timeSinceLastCall = now - window.appChartData.lastApiCall;
        if (timeSinceLastCall < API_CALL_INTERVAL) {
            const waitTime = API_CALL_INTERVAL - timeSinceLastCall;
            const waitSeconds = Math.ceil(waitTime / 1000);

            // 待機時間が1秒以上の場合はトースト表示
            if (waitSeconds >= 1) {
                showInfoMessage(`${symbol}: API制限回避のため${waitSeconds}秒待機中...`);
            }

            await new Promise(resolve => setTimeout(resolve, waitTime));
        }

        // CoinGecko APIで過去30日の価格データを取得
        const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=30&interval=daily`;

        // API呼び出し記録を更新
        window.appChartData.apiCallCount++;
        window.appChartData.lastApiCall = Date.now();

        // タイムアウト付きでfetch実行
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10秒タイムアウト

        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
            }
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 429) {
                throw new Error(`API制限に達しました (429 Too Many Requests)`);
            } else if (response.status === 403) {
                throw new Error(`APIアクセスが拒否されました (403 Forbidden)`);
            } else {
                throw new Error(`API Error: ${response.status}`);
            }
        }

        const data = await response.json();

        if (!data.prices || data.prices.length === 0) {
            throw new Error('価格データが空です');
        }

        // データを整形
        const priceHistory = data.prices.map(([timestamp, price]) => ({
            date: new Date(timestamp),
            price: price
        }));

        // 最新価格を現在価格として保存（API効率化）
        if (priceHistory.length > 0) {
            const latestPrice = priceHistory[priceHistory.length - 1].price;
            updateSymbolCurrentPrice(symbol, latestPrice);
        }

        // 永続キャッシュに保存（24時間有効）
        setCachedData(cacheKey, priceHistory, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);


        // 成功時のトースト通知
        if (priceHistory.length > 0) {
            showSuccessMessage(`${symbol}: ${priceHistory.length}日分の価格履歴をキャッシュに保存しました`);
        }

        // 価格データレポート更新（デバッグモード時のみ）
        if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
            const status = getPriceDataStatus();
        }

        return priceHistory;

    } catch (error) {
        console.error(`${symbol}価格履歴取得エラー:`, error);

        // より詳細なエラー情報を提供
        if (error.name === 'AbortError') {
            throw new Error(`リクエストタイムアウト - サーバーの応答が遅すぎます`);
        } else if (error.message.includes('API制限に達しました') || error.message.includes('429')) {
            throw new Error(`API制限に達しました - 1分後に再度お試しください`);
        } else if (error.message.includes('403') || error.message.includes('CORS') || error.message.includes('blocked by CORS')) {
            throw new Error(`APIアクセスが制限されています - ブラウザの設定またはネットワーク環境を確認してください`);
        } else if (error.message.includes('API Error: 404')) {
            throw new Error(`${symbol}の価格データが見つかりません`);
        } else if (error.message.includes('API Error: 500')) {
            throw new Error(`CoinGecko APIサーバーエラー - しばらく時間をおいてお試しください`);
        } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            throw new Error(`ネットワーク接続エラー - インターネット接続を確認してください`);
        } else {
            throw new Error(`価格履歴取得エラー: ${error.message}`);
        }
    }
}

// ETH専用関数（後方互換性のため）
async function fetchETHPriceHistory() {
    return await fetchSymbolPriceHistory('ETH');
}

// ===================================================================
// PRICE DATA PERSISTENCE FUNCTIONS
// ===================================================================

// 価格データ永続化設定
const PRICE_CACHE_CONFIG = {
    CURRENT_PRICES_DURATION: 30 * 60 * 1000,      // 現在価格: 30分
    PRICE_HISTORY_DURATION: 24 * 60 * 60 * 1000,  // 価格履歴: 24時間
    CHART_DATA_DURATION: 6 * 60 * 60 * 1000,      // チャートデータ: 6時間
    MAX_STORAGE_SIZE: 50 * 1024 * 1024,           // 最大50MB
    CLEANUP_THRESHOLD: 0.8                         // 80%使用時にクリーンアップ
};

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

/**
 * 銘柄別の色設定（チャート描画用）
 * border: チャートの線の色
 * bg: チャートの背景色（透明度0.1）
 */
const SYMBOL_COLORS = {
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
};

// デフォルトの色（未定義の銘柄用）
const DEFAULT_SYMBOL_COLOR = { border: '#3498db', bg: 'rgba(52, 152, 219, 0.1)' };

// ===================================================================
// CHART FORMATTING AND CONFIGURATION HELPERS
// ===================================================================

/**
 * 銘柄に応じた価格フォーマット関数
 * @param {number} value - フォーマット対象の価格値
 * @param {string} symbol - 銘柄シンボル（例: 'SHIB', 'PEPE'）
 * @returns {string} フォーマットされた価格文字列
 */
function formatPriceValue(value, symbol) {
    // SHIBとPEPEの場合は小数点以下の表示を調整
    if (symbol === 'SHIB' || symbol === 'PEPE') {
        if (value < 0.001) {
            return '¥' + value.toFixed(6);
        } else if (value < 0.01) {
            return '¥' + value.toFixed(4);
        } else if (value < 1) {
            return '¥' + value.toFixed(3);
        } else {
            return '¥' + value.toFixed(2);
        }
    }
    return '¥' + value.toLocaleString();
}

/**
 * 損益値のフォーマット関数（大きな値を簡略表示）
 * @param {number} value - フォーマット対象の損益値
 * @returns {string} フォーマットされた損益文字列
 */
function formatProfitValue(value) {
    if (Math.abs(value) >= 1000000) {
        return '¥' + (value / 1000000).toFixed(1) + 'M';
    } else if (Math.abs(value) >= 1000) {
        return '¥' + (value / 1000).toFixed(0) + 'K';
    } else {
        return '¥' + value.toLocaleString();
    }
}

/**
 * 損益値の符号付きフォーマット関数
 * @param {number} value - フォーマット対象の損益値
 * @returns {string} 符号付きでフォーマットされた損益文字列
 */
function formatSignedProfitValue(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}¥${Math.round(value).toLocaleString()}`;
}

/**
 * 銘柄別価格チャートのオプションを生成
 * @param {string} symbol - 銘柄シンボル
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createSymbolPriceChartOptions(symbol) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
            intersect: false,
            mode: 'index'
        },
        plugins: {
            title: {
                display: false
            },
            legend: {
                display: false
            }
        },
        scales: {
            x: {
                type: 'time',
                time: {
                    unit: 'day',
                    displayFormats: {
                        day: 'MM/dd'
                    }
                }
            },
            y: {
                beginAtZero: false,
                ticks: {
                    callback: function (value) {
                        return formatPriceValue(value, symbol);
                    }
                }
            }
        }
    };
}

/**
 * 単一銘柄の損益推移チャートのオプションを生成
 * @param {string} title - チャートタイトル
 * @param {Array} profitData - 損益データ配列
 * @param {string} canvasId - キャンバス要素のID（オプション）
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createProfitChartOptions(title, profitData, canvasId = '') {
    // 銘柄名を取得（canvasIdが提供されている場合）
    const symbolMatch = canvasId ? canvasId.match(/^([a-z]+)-profit-chart$/) : null;
    const symbolName = symbolMatch ? symbolMatch[1].toUpperCase() : 'SYMBOL';

    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: title,
                font: {
                    size: 16,
                    weight: 'bold'
                }
            },
            legend: {
                display: true,
                position: 'top'
            },
            tooltip: {
                callbacks: {
                    label: function (context) {
                        const dataPoint = profitData[context.dataIndex];
                        const datasetLabel = context.dataset.label;

                        if (datasetLabel === '総合損益 (¥)') {
                            // 詳細情報を含むツールチップ
                            if (dataPoint.holdingQuantity !== undefined && dataPoint.avgPrice !== undefined) {
                                return [
                                    `📅 ${(dataPoint.date instanceof Date ? dataPoint.date : new Date(dataPoint.date)).toLocaleDateString('ja-JP')}`,
                                    `💰 総合損益: ¥${Math.round(dataPoint.totalProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　├ 実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`,
                                    `　└ 含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`,
                                    `📊 保有量: ${dataPoint.holdingQuantity.toFixed(6)} ${symbolName}`,
                                    `📈 平均価格: ¥${Math.round(dataPoint.avgPrice).toLocaleString()}`,
                                    `💹 その日の価格: ¥${Math.round(dataPoint.currentPrice || 0).toLocaleString()}`
                                ];
                            }
                            // シンプルな表示
                            return [
                                `${datasetLabel}: ${formatSignedProfitValue(dataPoint.totalProfit || 0)}`,
                                `  実現: ${formatSignedProfitValue(dataPoint.realizedProfit || 0)}`,
                                `  含み: ${formatSignedProfitValue(dataPoint.unrealizedProfit || 0)}`
                            ];
                        } else if (datasetLabel === '実現損益 (¥)') {
                            return `実現損益: ¥${Math.round(dataPoint.realizedProfit || dataPoint.profit || 0).toLocaleString()}`;
                        } else if (datasetLabel === '含み損益 (¥)') {
                            return `含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`;
                        }

                        return `${datasetLabel}: ¥${context.parsed.y.toLocaleString()}`;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: '日付'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: '損益 (¥)'
                },
                ticks: {
                    callback: function (value) {
                        return formatProfitValue(value);
                    }
                },
                // Y軸の範囲を自動調整（異常値を除外）
                beforeUpdate: function (scale) {
                    if (profitData && profitData.length > 0) {
                        const allValues = [];
                        profitData.forEach(d => {
                            allValues.push(d.totalProfit || 0);
                            allValues.push(d.realizedProfit || 0);
                            allValues.push(d.unrealizedProfit || 0);
                        });

                        // 異常値を除外（上位・下位5%を除く）
                        allValues.sort((a, b) => a - b);
                        const p5 = Math.floor(allValues.length * 0.05);
                        const p95 = Math.floor(allValues.length * 0.95);
                        const filteredValues = allValues.slice(p5, p95);

                        if (filteredValues.length > 0) {
                            const min = Math.min(...filteredValues);
                            const max = Math.max(...filteredValues);
                            const range = max - min;
                            const padding = range * 0.1;

                            scale.options.min = min - padding;
                            scale.options.max = max + padding;
                        }
                    }
                }
            }
        },
        interaction: {
            intersect: false,
            mode: 'index'
        }
    };
}

/**
 * 複数銘柄の損益推移チャートのオプションを生成
 * @param {string} title - チャートタイトル
 * @returns {object} Chart.jsのオプション設定オブジェクト
 */
function createMultiSymbolProfitChartOptions(title) {
    return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: {
                display: true,
                text: title,
                font: {
                    size: 16,
                    weight: 'bold'
                },
                color: '#2c3e50'
            },
            legend: {
                display: true,
                position: 'top',
                labels: {
                    usePointStyle: true,
                    padding: 15,
                    font: {
                        size: 11
                    }
                }
            },
            tooltip: {
                mode: 'index',
                intersect: false,
                callbacks: {
                    label: function (context) {
                        const value = context.parsed.y;
                        if (value === null) return null;
                        return `${context.dataset.label}: ${formatSignedProfitValue(value)}`;
                    }
                }
            }
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: '日付',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                }
            },
            y: {
                display: true,
                title: {
                    display: true,
                    text: '損益 (¥)',
                    font: {
                        size: 12,
                        weight: 'bold'
                    }
                },
                grid: {
                    color: 'rgba(0,0,0,0.1)'
                },
                ticks: {
                    callback: function (value) {
                        return formatSignedProfitValue(value);
                    }
                }
            }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };
}

// ===================================================================
// CACHE FUNCTIONS
// ===================================================================

// 永続化キャッシュ機能（強化版）
function getCachedData(key, duration = null) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                return data.value;
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        // 破損したキャッシュを削除
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

// メタデータ付きキャッシュ取得（保存時刻情報付き）
function getCachedDataWithMetadata(key, duration = null) {
    try {
        const cached = localStorage.getItem(key);
        if (cached) {
            const data = JSON.parse(cached);

            // durationが指定されていない場合は、保存時のdurationを使用
            const effectiveDuration = duration || data.duration || PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION;

            // データが有効期限内かチェック
            if (Date.now() - data.timestamp < effectiveDuration) {
                return {
                    value: data.value,
                    timestamp: data.timestamp,
                    duration: data.duration,
                    key: data.key
                };
            } else {
                localStorage.removeItem(key);
            }
        }
    } catch (error) {
        console.error('キャッシュ読み込みエラー:', error);
        // 破損したキャッシュを削除
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('破損キャッシュ削除エラー:', e);
        }
    }
    return null;
}

function setCachedData(key, value, duration = PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION) {
    try {
        // ストレージ使用量チェック
        checkStorageUsage();

        const data = {
            value: value,
            timestamp: Date.now(),
            duration: duration,
            key: key,
            size: JSON.stringify(value).length
        };

        const serializedData = JSON.stringify(data);
        localStorage.setItem(key, serializedData);


        // メタデータ更新
        updateCacheMetadata(key, data.size, duration);

    } catch (error) {
        console.error('キャッシュ保存エラー:', error);

        // ストレージ容量不足の場合、古いデータを削除して再試行
        if (error.name === 'QuotaExceededError') {
            cleanupOldCache();

            try {
                localStorage.setItem(key, JSON.stringify(data));
            } catch (retryError) {
                console.error('キャッシュ保存再試行失敗:', retryError);
                if (typeof showWarningMessage === 'function') {
                    showWarningMessage('ストレージ容量不足のため、一部のデータが保存できませんでした');
                }
            }
        }
    }
}

// ストレージ使用量監視
function checkStorageUsage() {
    try {
        // 概算使用量計算
        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage[key].length;
            }
        }

        const usageRatio = totalSize / PRICE_CACHE_CONFIG.MAX_STORAGE_SIZE;

        if (usageRatio > PRICE_CACHE_CONFIG.CLEANUP_THRESHOLD) {
            cleanupOldCache();
        }

    } catch (error) {
        console.error('ストレージ使用量チェックエラー:', error);
    }
}

// 古いキャッシュデータのクリーンアップ（改善版）
function cleanupOldCache() {
    try {
        const cacheKeys = [];
        const now = Date.now();

        // キャッシュキーを収集
        for (let key in localStorage) {
            if (key.includes('_price_history_') || key.includes('prices_') || key.includes('_chart_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    if (data.timestamp) {
                        cacheKeys.push({
                            key: key,
                            timestamp: data.timestamp,
                            age: now - data.timestamp,
                            size: localStorage[key].length
                        });
                    }
                } catch (e) {
                    // 破損したデータは削除対象
                    cacheKeys.push({
                        key: key,
                        timestamp: 0,
                        age: Infinity,
                        size: localStorage[key].length
                    });
                }
            }
        }

        // 古い順にソート
        cacheKeys.sort((a, b) => b.age - a.age);

        // 削除対象を決定: 期限切れデータを優先削除、それでも足りなければ古いものから30%削除
        let deleteCount = 0;
        let deletedSize = 0;
        const keysToDelete = [];

        // まず期限切れデータを収集
        for (const item of cacheKeys) {
            const duration = item.key.includes('_price_history_') ?
                PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION :
                PRICE_CACHE_CONFIG.CURRENT_PRICES_DURATION;

            if (item.age > duration) {
                keysToDelete.push(item);
            }
        }

        // 期限切れだけでは不十分な場合、古いものから30%削除
        if (keysToDelete.length < cacheKeys.length * 0.1) {
            const additionalCount = Math.ceil(cacheKeys.length * 0.3) - keysToDelete.length;
            for (let i = 0; i < additionalCount && i < cacheKeys.length; i++) {
                if (!keysToDelete.includes(cacheKeys[i])) {
                    keysToDelete.push(cacheKeys[i]);
                }
            }
        }

        // 削除実行
        for (const item of keysToDelete) {
            localStorage.removeItem(item.key);
            deletedSize += item.size;
            deleteCount++;
        }


    } catch (error) {
        console.error('キャッシュクリーンアップエラー:', error);
    }
}

// キャッシュメタデータ管理
function updateCacheMetadata(key, size, duration) {
    try {
        const metadata = JSON.parse(localStorage.getItem('cache_metadata') || '{}');
        metadata[key] = {
            size: size,
            duration: duration,
            lastAccess: Date.now()
        };
        localStorage.setItem('cache_metadata', JSON.stringify(metadata));
    } catch (error) {
        console.error('キャッシュメタデータ更新エラー:', error);
    }
}

// 価格データの永続化状態確認
function getPriceDataStatus() {
    const status = {
        currentPrices: null,
        priceHistories: [],
        totalCacheSize: 0,
        oldestData: null,
        newestData: null
    };

    try {
        // 現在価格データ
        const currentPricesKey = Object.keys(localStorage).find(key => key.startsWith('prices_'));
        if (currentPricesKey) {
            const data = JSON.parse(localStorage[currentPricesKey]);
            status.currentPrices = {
                key: currentPricesKey,
                timestamp: data.timestamp,
                age: Date.now() - data.timestamp,
                symbols: data.value._metadata?.symbols || []
            };
        }

        // 価格履歴データ
        for (let key in localStorage) {
            if (key.includes('_price_history_')) {
                try {
                    const data = JSON.parse(localStorage[key]);
                    const symbol = key.split('_')[0].toUpperCase();
                    status.priceHistories.push({
                        symbol: symbol,
                        key: key,
                        timestamp: data.timestamp,
                        age: Date.now() - data.timestamp,
                        dataPoints: data.value?.length || 0
                    });

                    status.totalCacheSize += localStorage[key].length;

                    if (!status.oldestData || data.timestamp < status.oldestData.timestamp) {
                        status.oldestData = { key, timestamp: data.timestamp };
                    }
                    if (!status.newestData || data.timestamp > status.newestData.timestamp) {
                        status.newestData = { key, timestamp: data.timestamp };
                    }
                } catch (e) {
                }
            }
        }

    } catch (error) {
        console.error('価格データ状態確認エラー:', error);
    }

    return status;
}

// 価格データ永続化レポート表示
function showPriceDataReport() {
    const status = getPriceDataStatus();


    if (status.currentPrices) {
    } else {
    }

    status.priceHistories.forEach(history => {
    });

    if (status.oldestData) {
        const oldestAge = Math.round((Date.now() - status.oldestData.timestamp) / 1000 / 60 / 60);
    }

    return status;
}

// 銘柄の現在価格を更新（API効率化）
function updateSymbolCurrentPrice(symbol, price) {
    try {
        // currentPortfolioDataが利用可能な場合、現在価格を更新
        const portfolioData = window.currentPortfolioData;
        if (portfolioData && portfolioData.summary) {
            const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
            if (symbolSummary) {
                symbolSummary.currentPrice = price;

                // 含み損益も再計算
                if (symbolSummary.holdingQuantity > 0 && symbolSummary.averagePurchaseRate > 0) {
                    const currentValue = symbolSummary.holdingQuantity * price;
                    const holdingCost = symbolSummary.holdingQuantity * symbolSummary.averagePurchaseRate;
                    symbolSummary.currentValue = currentValue;
                    symbolSummary.unrealizedProfit = currentValue - holdingCost;
                    symbolSummary.totalProfit = symbolSummary.realizedProfit + symbolSummary.unrealizedProfit;
                }

            }
        }
    } catch (error) {
        console.error('現在価格更新エラー:', error);
    }
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================

// 複数銘柄の価格履歴を効率的に取得
async function fetchMultipleSymbolPriceHistories(symbols) {
    const results = {};
    const promises = symbols.map(async (symbol) => {
        try {
            const priceHistory = await fetchSymbolPriceHistory(symbol);
            results[symbol] = priceHistory;
        } catch (error) {
            results[symbol] = null;
        }
    });

    await Promise.all(promises);
    return results;
}

// 価格履歴を使った日次総合損益データを生成
function generateHistoricalProfitTimeSeries(symbol, transactions, priceHistory) {

    // 取引を日付順にソート
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    // 各日付での保有状況を計算
    const dailyProfitData = [];

    priceHistory.forEach(pricePoint => {
        const targetDate = pricePoint.date instanceof Date ? pricePoint.date : new Date(pricePoint.date);
        const price = pricePoint.price;

        // この日付までの取引を集計
        let realizedProfit = 0;
        let totalQuantity = 0;
        let weightedAvgPrice = 0;
        let totalBought = 0;
        let totalSold = 0;

        sortedTransactions.forEach(tx => {
            const txDate = new Date(tx.date);

            // この日付以前の取引のみを考慮
            if (txDate <= targetDate) {
                if (tx.type === '買') {
                    // 加重平均価格を更新
                    const newTotalValue = (totalQuantity * weightedAvgPrice) + (tx.quantity * tx.rate);
                    totalQuantity += tx.quantity;
                    weightedAvgPrice = totalQuantity > 0 ? newTotalValue / totalQuantity : 0;
                    totalBought += tx.amount;
                } else if (tx.type === '売') {
                    // 売却時の実現損益を計算（売却前の加重平均価格を使用）
                    const sellProfit = tx.amount - (tx.quantity * weightedAvgPrice);
                    realizedProfit += sellProfit;

                    // 保有数量を減らす（加重平均価格は変更しない）
                    totalQuantity -= tx.quantity;
                    totalSold += tx.amount;

                    // 保有数量が0以下になった場合、加重平均価格をリセット
                    if (totalQuantity <= 0) {
                        totalQuantity = 0;
                        weightedAvgPrice = 0;
                    }
                }
            }
        });

        // 含み損益を計算
        let unrealizedProfit = 0;
        if (price > 0 && totalQuantity > 0.00000001 && weightedAvgPrice > 0) {
            const currentValue = totalQuantity * price;
            const holdingCost = totalQuantity * weightedAvgPrice;
            unrealizedProfit = currentValue - holdingCost;
        } else if (totalQuantity <= 0.00000001) {
            // 保有数量が極小の場合は含み損益を0にする
            unrealizedProfit = 0;
        }

        // 総合損益 = 実現損益 + 含み損益
        const totalProfit = realizedProfit + unrealizedProfit;

        dailyProfitData.push({
            date: targetDate,
            realizedProfit: realizedProfit,
            unrealizedProfit: unrealizedProfit,
            totalProfit: totalProfit,
            totalBought: totalBought,
            totalSold: totalSold,
            holdingQuantity: totalQuantity,
            avgPrice: weightedAvgPrice,
            currentPrice: price
        });

    });

    return dailyProfitData;
}

// 全銘柄の損益データを合計して統合損益推移を生成
function generateCombinedProfitTimeSeries(allProfitData) {
    
    // 全銘柄の日付を統合してソート
    const allDates = new Set();
    Object.values(allProfitData).forEach(profitData => {
        profitData.forEach(point => {
            allDates.add(point.date.toDateString());
        });
    });

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    
    // 日付ごとに全銘柄の損益を合計
    const combinedData = sortedDates.map(dateStr => {
        const targetDate = new Date(dateStr);
        let totalRealizedProfit = 0;
        let totalUnrealizedProfit = 0;
        let totalProfit = 0;
        let totalHoldingQuantity = 0;
        let totalCurrentValue = 0;

        Object.keys(allProfitData).forEach(symbol => {
            const profitData = allProfitData[symbol];
            const point = profitData.find(p => p.date.toDateString() === dateStr);
            
            if (point) {
                totalRealizedProfit += point.realizedProfit || 0;
                totalUnrealizedProfit += point.unrealizedProfit || 0;
                totalProfit += point.totalProfit || 0;
                
                // 保有量と評価額の合計（参考値）
                totalHoldingQuantity += point.holdingQuantity || 0;
                totalCurrentValue += (point.holdingQuantity || 0) * (point.currentPrice || 0);
            }
        });

        return {
            date: targetDate,
            realizedProfit: totalRealizedProfit,
            unrealizedProfit: totalUnrealizedProfit,
            totalProfit: totalProfit,
            holdingQuantity: totalHoldingQuantity, // 参考値（単位が異なるため）
            avgPrice: totalHoldingQuantity > 0 ? totalCurrentValue / totalHoldingQuantity : 0,
            currentPrice: 0 // 合計では意味がないため0
        };
    });

    return combinedData;
}

// 全銘柄の総合損益推移チャートを描画
async function renderAllSymbolsProfitChart() {

    // デバッグ: Chart.jsライブラリの確認
    if (typeof Chart === 'undefined') {
        console.error('❌ Chart.js library not loaded!');
        return;
    } else {
    }

    const portfolioData = window.currentPortfolioData || currentPortfolioData;
    if (!portfolioData) {
        console.error('❌ Portfolio data not available');
        return;
    }

    // デスクトップ版とモバイル版の両方のcanvasを確認
    const desktopCanvasId = 'all-symbols-profit-chart';
    const mobileCanvasId = 'mobile-all-symbols-profit-chart';

    const desktopCanvas = document.getElementById(desktopCanvasId);
    const mobileCanvas = document.getElementById(mobileCanvasId);

    if (!desktopCanvas && !mobileCanvas) {
        console.error(`❌ Canvas elements not found: ${desktopCanvasId}, ${mobileCanvasId}`);
        return;
    }
    
    // 表示されているcanvasを特定（デスクトップ優先）
    let canvasId, canvas;
    if (desktopCanvas && desktopCanvas.offsetParent !== null) {
        canvasId = desktopCanvasId;
        canvas = desktopCanvas;
    } else if (mobileCanvas && mobileCanvas.offsetParent !== null) {
        canvasId = mobileCanvasId;
        canvas = mobileCanvas;
    } else {
        // どちらも表示されていない場合はデスクトップを優先
        canvasId = desktopCanvasId;
        canvas = desktopCanvas;
    }

    try {
        // 取引のある銘柄を取得（保有量に関係なく）
        const symbols = portfolioData.summary.map(item => item.symbol);


        if (symbols.length === 0) {
            console.error('❌ No symbols found in portfolio data');
            showChartError(canvasId, '全銘柄', new Error('保有銘柄がありません'), [
                '現在保有している銘柄がないため、チャートを表示できません'
            ]);
            return;
        }

        showInfoMessage(`${symbols.length}銘柄の価格履歴を取得中...`);

        // 複数銘柄の価格履歴を並列取得
        const priceHistories = await fetchMultipleSymbolPriceHistories(symbols);

        // 成功した銘柄のみでチャートデータを生成
        const validSymbols = symbols.filter(symbol => priceHistories[symbol]);
        

        if (validSymbols.length === 0) {
            console.error('❌ No valid symbols with price history');
            throw new Error('価格履歴を取得できた銘柄がありません');
        }


        // 各銘柄の損益推移データを生成
        const allProfitData = {};
        validSymbols.forEach(symbol => {
            const symbolData = portfolioData.symbols[symbol];
            
            if (symbolData && symbolData.allTransactions) {
                const profitData = generateHistoricalProfitTimeSeries(
                    symbol,
                    symbolData.allTransactions,
                    priceHistories[symbol]
                );
                if (profitData && profitData.length > 0) {
                    allProfitData[symbol] = profitData;
                }
            } 
        });
        

        if (Object.keys(allProfitData).length === 0) {
            console.error('❌ No profit data generated for any symbol');
            throw new Error('損益データを生成できませんでした');
        }

        // チャート表示モードを確認
        const chartMode = window.portfolioChartMode || 'combined';
        
        
        if (chartMode === 'combined') {
            // 全銘柄の合計損益推移チャートを表示
            const combinedProfitData = generateCombinedProfitTimeSeries(allProfitData);
            displayProfitChart(canvasId, combinedProfitData, 'ポートフォリオ総合損益推移（過去1か月）');
        } else {
            // 複数銘柄の個別損益推移チャートを表示
            displayMultiSymbolProfitChart(canvasId, allProfitData, '全銘柄個別損益推移（過去1か月）');
        }

        const successCount = Object.keys(allProfitData).length;
        showSuccessMessage(`${successCount}銘柄の損益推移チャートを表示しました`);

    } catch (error) {
        console.error('全銘柄損益チャート描画エラー:', error);

        showChartError(canvasId, '全銘柄', error, [
            '一部の銘柄で価格履歴を取得できませんでした',
            'しばらく時間をおいて再度お試しください'
        ]);

        showErrorMessage(`全銘柄チャート表示失敗: ${error.message}`);
    }
}

// 銘柄別損益推移チャートを描画（汎用版）
async function renderSymbolProfitChart(symbol) {
    
    // 重複実行を防ぐため、実行中フラグをチェック
    const renderingKey = `rendering_${symbol}`;
    if (window[renderingKey]) {
        return;
    }
    
    // 実行中フラグを設定
    window[renderingKey] = true;

    // portfolio.jsのcurrentPortfolioDataを参照
    const portfolioData = window.currentPortfolioData || currentPortfolioData;
    if (!portfolioData) {
        console.error('❌ Portfolio data not available');
        return;
    }

    // 指定銘柄の取引データを取得
    const symbolData = portfolioData.symbols[symbol];
    if (!symbolData || !symbolData.allTransactions || symbolData.allTransactions.length === 0) {
        console.error(`❌ ${symbol} transaction data not found`);
        return;
    }

    const canvasId = `${symbol.toLowerCase()}-profit-chart`;

    // Canvas要素の存在確認
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`❌ Canvas element not found: ${canvasId}`);
        return;
    }

    // 現在価格ベースでのチャート表示（CORS回避）
    const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
    const currentPrice = symbolSummary ? symbolSummary.currentPrice : 0;

    if (!symbolSummary) {
    } else if (currentPrice <= 0) {
    }

    if (currentPrice > 0) {

        // 現在価格での損益推移チャートを生成
        const profitData = generateTotalProfitTimeSeries(symbol, symbolData.allTransactions, currentPrice);

        if (profitData && profitData.length > 0) {
            displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（取引履歴ベース）`);

            // 価格データの取得元を判定してメッセージを表示
            const lastPriceUpdate = window.lastPriceUpdate;

            // 現在価格キャッシュから保存時刻を取得を試行
            let priceSourceMessage = `${symbol}: 現在価格でチャート表示`;

            if (lastPriceUpdate) {
                const ageMinutes = Math.round((Date.now() - lastPriceUpdate.getTime()) / 1000 / 60);
                const updateTimeStr = lastPriceUpdate.toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                });

                if (ageMinutes < 30) {
                    priceSourceMessage = `${symbol}: 最新価格でチャート表示\n${updateTimeStr}取得`;
                } else {
                    priceSourceMessage = `${symbol}: キャッシュ価格でチャート表示\n${updateTimeStr}取得`;
                }
            } else {
                // 価格キャッシュから保存時刻を取得を試行
                try {
                    // 複数の可能なキャッシュキーを試行
                    const possibleKeys = [
                        `prices_${symbol.toLowerCase()}`,
                        `prices_${[symbol].sort().join('_')}`,
                        'currentPrices'
                    ];

                    let cachedPricesWithMeta = null;

                    // 各キーを試行
                    for (const key of possibleKeys) {
                        cachedPricesWithMeta = getCachedDataWithMetadata(key);
                        if (cachedPricesWithMeta) {
                            break;
                        }
                    }

                    if (cachedPricesWithMeta) {
                        const cacheDate = new Date(cachedPricesWithMeta.timestamp);
                        const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                            month: 'numeric',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: 'numeric'
                        });
                        priceSourceMessage = `${symbol}: キャッシュ価格でチャート表示\n${cacheTimeStr}保存`;
                    } else {
                        // フォールバック: 従来のlastPriceUpdateを確認
                        const savedLastUpdate = localStorage.getItem('lastPriceUpdate');
                        if (savedLastUpdate) {
                            try {
                                const updateDate = new Date(savedLastUpdate);
                                const updateTimeStr = updateDate.toLocaleString('ja-JP', {
                                    month: 'numeric',
                                    day: 'numeric',
                                    hour: 'numeric',
                                    minute: 'numeric'
                                });
                                priceSourceMessage = `${symbol}: 保存済み価格でチャート表示\n${updateTimeStr}取得`;
                            } catch (dateError) {
                                priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                            }
                        } else {
                            priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                        }
                    }
                } catch (error) {
                    priceSourceMessage = `${symbol}: 保存済み価格でチャート表示 (保存時刻不明)`;
                }
            }

            showSuccessMessage(priceSourceMessage);

            return;
        }
    }

    // 現在価格がない場合のエラー表示
    showChartError(canvasId, symbol, new Error('現在価格データがありません'), [
        '「価格更新」ボタンをクリックして現在価格を取得してください',
        '価格データ取得後にチャートが表示されます'
    ]);

    showWarningMessage(`${symbol}: 価格データがないためチャートを表示できません`);

    try {

        // まずキャッシュをチェック
        const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;
        const cachedDataWithMeta = getCachedDataWithMetadata(cacheKey, PRICE_CACHE_CONFIG.PRICE_HISTORY_DURATION);
        
        let priceHistory = null;
        
        if (cachedDataWithMeta) {
            const cachedData = cachedDataWithMeta.value;
            const latestDataDate = new Date(cachedData[cachedData.length - 1].date);
            const hoursOld = (Date.now() - latestDataDate.getTime()) / (1000 * 60 * 60);
            
            if (hoursOld < 6) {
                // キャッシュが新鮮な場合は使用
                priceHistory = cachedData;
                showSuccessMessage(`${symbol}: キャッシュから価格履歴を取得`);
            } else {
            }
        }
        
        // キャッシュがない、または古い場合のみAPI呼び出し
        if (!priceHistory) {
            priceHistory = await fetchSymbolPriceHistory(symbol);
        }

        if (!priceHistory || priceHistory.length === 0) {
            throw new Error('価格履歴データを取得できませんでした');
        }


        // 時系列総合損益データを生成
        const profitData = generateHistoricalProfitTimeSeries(symbol, symbolData.allTransactions, priceHistory);


        // チャートを描画
        displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（過去1か月・日次）`);


        // チャート描画成功時のトースト通知（データソース明記）
        if (profitData.length > 0) {
            // 価格履歴キャッシュの保存時刻を取得
            try {
                const cacheKey = `${symbol.toLowerCase()}_price_history_30d`;
                const cachedDataWithMeta = getCachedDataWithMetadata(cacheKey);

                if (cachedDataWithMeta) {
                    const cacheDate = new Date(cachedDataWithMeta.timestamp);
                    const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: 'numeric'
                    });
                    showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示\n${cacheTimeStr}保存`);
                } else {
                    showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示 (保存時刻不明)`);
                }
            } catch (error) {
                showSuccessMessage(`${symbol}: キャッシュから価格履歴チャート表示 (保存時刻不明)`);
            }
        }

    } catch (error) {
        console.error(`${symbol}損益チャート描画エラー:`, error);

        // エラーの種類に応じてトースト通知を表示
        let toastMessage = '';
        let suggestions = [];

        if (error.message.includes('サポートされていない銘柄')) {
            toastMessage = `${symbol}は価格履歴チャートに対応していません`;
            suggestions = [
                '現在価格での損益は上記の統計で確認できます',
                '対応銘柄: BTC, ETH, SOL, XRP, ADA, DOGE, ASTR, XTZ, XLM, SHIB, PEPE, SUI, DAI'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('API制限') || error.message.includes('429')) {
            toastMessage = `${symbol}: API制限に達しました - 1分後に再度お試しください`;
            suggestions = [
                'API制限に達しました',
                '1分後に再度お試しください',
                'キャッシュされたデータがあれば使用されます'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('CORS') || error.message.includes('blocked')) {
            toastMessage = `${symbol}: ブラウザのセキュリティ制限により接続できません`;
            suggestions = [
                'ブラウザのCORS制限により接続できません',
                'HTTPSサイトでアクセスしてください',
                '現在価格での損益チャートを表示します'
            ];
            showWarningMessage(toastMessage);
        } else if (error.message.includes('ネットワーク') || error.message.includes('Failed to fetch')) {
            toastMessage = `${symbol}: ネットワーク接続エラー - インターネット接続を確認してください`;
            suggestions = [
                'インターネット接続を確認してください',
                'VPNやプロキシを使用している場合は無効にしてください',
                '現在価格での損益チャートを表示します'
            ];
            showErrorMessage(toastMessage);
        } else if (error.message.includes('タイムアウト')) {
            toastMessage = `${symbol}: サーバーの応答が遅すぎます - しばらく時間をおいてお試しください`;
            suggestions = [
                'サーバーの応答が遅すぎます',
                'しばらく時間をおいて再度お試しください',
                '現在価格での損益チャートを表示します'
            ];
            showWarningMessage(toastMessage);
        } else {
            toastMessage = `${symbol}: チャート表示エラー - ${error.message}`;
            suggestions = [
                'ページを再読み込みしてお試しください',
                'ブラウザのコンソール(F12)で詳細を確認できます',
                '現在価格での損益チャートを表示します'
            ];
            showErrorMessage(toastMessage);
        }

        // 詳細なエラー表示（チャートエリア内）
        showChartError(canvasId, symbol, error, suggestions);

        // フォールバック: 現在価格のみでチャートを描画を試行
        try {
            const symbolSummary = portfolioData.summary.find(item => item.symbol === symbol);
            const currentPrice = symbolSummary ? symbolSummary.currentPrice : 0;

            if (currentPrice > 0) {
                const profitData = generateTotalProfitTimeSeries(symbol, symbolData.allTransactions, currentPrice);

                if (profitData && profitData.length > 0) {
                    displayProfitChart(canvasId, profitData, `${symbol}総合損益推移（現在価格ベース）`);
                    // フォールバック時も価格キャッシュの保存時刻を取得を試行
                    try {
                        const validSymbols = [symbol];
                        const cacheKey = `prices_${validSymbols.sort().join('_')}`;
                        const cachedPricesWithMeta = getCachedDataWithMetadata(cacheKey);

                        if (cachedPricesWithMeta) {
                            const cacheDate = new Date(cachedPricesWithMeta.timestamp);
                            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: 'numeric'
                            });
                            showSuccessMessage(`${symbol}: フォールバック価格でチャート表示\n${cacheTimeStr}保存`);
                        } else {
                            showSuccessMessage(`${symbol}: フォールバック価格でチャート表示 (保存時刻不明)`);
                        }
                    } catch (error) {
                        showSuccessMessage(`${symbol}: フォールバック価格でチャート表示 (保存時刻不明)`);
                    }
                    return; // フォールバック成功
                }
            }
        } catch (fallbackError) {
            console.error(`${symbol}フォールバックチャート描画エラー:`, fallbackError);
        }

        // フォールバックも失敗した場合は、価格更新を促すメッセージを追加
        if (!error.message.includes('サポートされていない銘柄')) {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.font = '12px Arial';
                ctx.fillStyle = '#28a745';
                ctx.textAlign = 'center';
                ctx.fillText('💡 「価格更新」ボタンをクリックして現在価格を取得してください', canvas.width / 2, canvas.height / 2 + 100);
            }
        }
    } finally {
        // 実行中フラグをクリア
        const renderingKey = `rendering_${symbol}`;
        window[renderingKey] = false;
    }
}

// ETH専用関数（後方互換性のため）
// async function renderETHProfitChart() {
//     return await renderSymbolProfitChart('ETH');
// }



// 総合損益推移の時系列データを生成（実現損益 + 含み損益）- 旧版
function generateTotalProfitTimeSeries(symbol, transactions, currentPrice) {
    // 取引を日付順にソート
    const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));

    const profitData = [];
    let realizedProfit = 0; // 実現損益
    let totalBought = 0;
    let totalSold = 0;
    let weightedAvgPrice = 0;
    let totalQuantity = 0;

    sortedTransactions.forEach(tx => {
        const date = new Date(tx.date);

        if (tx.type === '買') {
            // 加重平均価格を更新
            const newTotalValue = (totalQuantity * weightedAvgPrice) + (tx.quantity * tx.rate);
            totalQuantity += tx.quantity;
            weightedAvgPrice = totalQuantity > 0 ? newTotalValue / totalQuantity : 0;
            totalBought += tx.amount;
        } else if (tx.type === '売') {
            // 売却時の実現損益を計算
            const sellProfit = tx.amount - (tx.quantity * weightedAvgPrice);
            realizedProfit += sellProfit;
            totalQuantity -= tx.quantity;
            totalSold += tx.amount;
        }

        // 含み損益を計算（現在価格が利用可能な場合）
        let unrealizedProfit = 0;
        if (currentPrice > 0 && totalQuantity > 0 && weightedAvgPrice > 0) {
            const currentValue = totalQuantity * currentPrice;
            const holdingCost = totalQuantity * weightedAvgPrice;
            unrealizedProfit = currentValue - holdingCost;
        }

        // 総合損益 = 実現損益 + 含み損益
        const totalProfit = realizedProfit + unrealizedProfit;

        profitData.push({
            date: date,
            realizedProfit: realizedProfit,
            unrealizedProfit: unrealizedProfit,
            totalProfit: totalProfit,
            totalBought: totalBought,
            totalSold: totalSold,
            holdingQuantity: totalQuantity,
            avgPrice: weightedAvgPrice,
            currentPrice: currentPrice
        });
    });

    return profitData;
}

// 旧関数（後方互換性のため残す）
function generateProfitTimeSeries(symbol, transactions) {
    return generateTotalProfitTimeSeries(symbol, transactions, 0);
}

// ローディング表示
function showLoadingMessage(canvasId, message) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(message, canvas.width / 2, canvas.height / 2);
}

// チャートエラー表示（詳細版）
function showChartError(canvasId, symbol, error, suggestions = []) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // エラーの種類に応じて色とアイコンを設定
    let color = '#dc3545';
    let icon = '❌';
    let title = 'チャート表示エラー';

    if (error.message.includes('サポートされていない銘柄')) {
        color = '#6c757d';
        icon = '⚠️';
        title = '対応していない銘柄';
    } else if (error.message.includes('価格履歴データを取得できませんでした')) {
        color = '#ffc107';
        icon = '📡';
        title = 'データ取得エラー';
    } else if (error.message.includes('API Error')) {
        color = '#fd7e14';
        icon = '🌐';
        title = 'API接続エラー';
    }

    // エラー表示
    ctx.fillStyle = color;
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${icon} ${title}`, canvas.width / 2, canvas.height / 2 - 40);

    ctx.font = '14px Arial';
    ctx.fillStyle = '#495057';
    ctx.fillText(`${symbol}: ${error.message}`, canvas.width / 2, canvas.height / 2 - 10);

    // 提案の表示
    if (suggestions.length > 0) {
        ctx.font = '12px Arial';
        ctx.fillStyle = '#6c757d';
        suggestions.forEach((suggestion, index) => {
            ctx.fillText(`💡 ${suggestion}`, canvas.width / 2, canvas.height / 2 + 20 + (index * 20));
        });
    }


}

// 損益チャートを描画
function displayProfitChart(canvasId, profitData, title) {

    try {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            throw new Error(`Canvas element not found: ${canvasId}`);
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            throw new Error(`Cannot get 2D context for canvas: ${canvasId}`);
        }

        // 既存のチャートインスタンスを破棄（統一管理）
        if (window.chartInstances && window.chartInstances[canvasId]) {
            try {
                window.chartInstances[canvasId].destroy();
            } catch (destroyError) {
            }
            delete window.chartInstances[canvasId];
        }

        // チャートインスタンス管理用のグローバルオブジェクト
        if (!window.chartInstances) {
            window.chartInstances = {};
        }

        // 古いprofitChartInstanceも破棄（後方互換性）
        if (window.appChartData.profitChartInstance && canvasId.includes('profit')) {
            try {
                window.appChartData.profitChartInstance.destroy();
            } catch (destroyError) {
            }
            window.appChartData.profitChartInstance = null;
            profitChartInstance = null;
        }

        // データが空の場合
        if (!profitData || profitData.length === 0) {
            showChartError(canvasId, 'データなし', new Error('取引データがありません'), [
                '取引履歴が存在しない可能性があります',
                'CSVファイルに該当銘柄のデータが含まれているか確認してください'
            ]);
            return;
        }

        // データの妥当性チェック
        const validDataPoints = profitData.filter(d => d && d.date && typeof d.totalProfit === 'number');
        if (validDataPoints.length === 0) {
            throw new Error('有効なデータポイントがありません');
        }


        // Chart.jsでチャートを作成
        window.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: profitData.map(d => {
                    const date = d.date instanceof Date ? d.date : new Date(d.date);
                    return date.toLocaleDateString('ja-JP');
                }),
                datasets: [
                    {
                        label: '総合損益 (¥)',
                        data: profitData.map(d => Math.round(d.totalProfit || d.profit || 0)),
                        borderColor: profitData[profitData.length - 1].totalProfit >= 0 ? '#28a745' : '#dc3545',
                        backgroundColor: profitData[profitData.length - 1].totalProfit >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.1
                    },
                    {
                        label: '実現損益 (¥)',
                        data: profitData.map(d => Math.round(d.realizedProfit || d.profit || 0)),
                        borderColor: '#17a2b8',
                        backgroundColor: 'rgba(23, 162, 184, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                        borderDash: [5, 5]
                    },
                    {
                        label: '含み損益 (¥)',
                        data: profitData.map(d => Math.round(d.unrealizedProfit || 0)),
                        borderColor: '#ffc107',
                        backgroundColor: 'rgba(255, 193, 7, 0.1)',
                        borderWidth: 2,
                        fill: false,
                        tension: 0.1,
                        borderDash: [2, 2]
                    }
                ]
            },
            options: createProfitChartOptions(title, profitData, canvasId)
        });


    } catch (error) {
        console.error('❌ Chart creation failed:', error);
        showChartError(canvasId, 'チャート作成', error, [
            'Chart.jsライブラリが正しく読み込まれているか確認してください',
            'ブラウザを更新してお試しください',
            'データ形式に問題がある可能性があります'
        ]);
    }
}

// 複数銘柄の損益推移チャート表示
function displayMultiSymbolProfitChart(canvasId, allProfitData, title) {

    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        console.error(`Canvas not found: ${canvasId}`);
        return;
    }

    const ctx = canvas.getContext('2d');

    // 既存のチャートインスタンスを破棄
    if (window.chartInstances && window.chartInstances[canvasId]) {
        try {
            window.chartInstances[canvasId].destroy();
        } catch (destroyError) {
        }
        delete window.chartInstances[canvasId];
    }

    // チャートインスタンス管理用のグローバルオブジェクト
    if (!window.chartInstances) {
        window.chartInstances = {};
    }

    // 全銘柄の日付を統合してソート
    const allDates = new Set();
    Object.values(allProfitData).forEach(profitData => {
        profitData.forEach(point => {
            allDates.add(point.date.toDateString());
        });
    });

    const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));
    const labels = sortedDates.map(dateStr => {
        const date = new Date(dateStr);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });

    // 銘柄ごとのデータセットを作成
    const datasets = [];
    const colors = [
        '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
        '#1abc9c', '#34495e', '#e67e22', '#95a5a6', '#d35400'
    ];

    let colorIndex = 0;
    Object.keys(allProfitData).forEach(symbol => {
        const profitData = allProfitData[symbol];
        const color = colors[colorIndex % colors.length];

        // 日付ごとの損益データを作成
        const data = sortedDates.map(dateStr => {
            const point = profitData.find(p => p.date.toDateString() === dateStr);
            return point ? point.totalProfit : null;
        });

        // 最終損益で線の太さを調整
        const finalProfit = data[data.length - 1] || 0;
        const borderWidth = Math.abs(finalProfit) > 10000 ? 3 : 2;

        datasets.push({
            label: `${symbol}`,
            data: data,
            borderColor: color,
            backgroundColor: color.replace('rgb', 'rgba').replace(')', ', 0.1)'),
            borderWidth: borderWidth,
            fill: false,
            tension: 0.1,
            pointBackgroundColor: color,
            pointBorderColor: '#ffffff',
            pointBorderWidth: 1,
            pointRadius: 3,
            pointHoverRadius: 5,
            spanGaps: true
        });

        colorIndex++;
    });

    // チャート設定
    const config = {
        type: 'line',
        data: {
            labels: labels,
            datasets: datasets
        },
        options: createMultiSymbolProfitChartOptions(title)
    };

    // チャートを作成
    window.chartInstances[canvasId] = new Chart(ctx, config);

}

// ===================================================================
// SYMBOL CHART FUNCTIONS
// ===================================================================

// 銘柄別チャート描画
async function displaySymbolChart(symbol) {
    const canvas = document.getElementById(`${symbol.toLowerCase()}-chart-canvas`);
    if (!canvas) {
        return;
    }

    let chartData = [];

    // メモリにデータがあるか
    {
        // ローディング表示
        const container = canvas.parentElement;
        if (container && !container.querySelector('.loading-message')) {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'loading-message';
            loadingDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                color: #666;
                font-size: 14px;
                z-index: 10;
            `;
            loadingDiv.innerHTML = `📊 ${symbol}の価格データを取得中...`;
            container.appendChild(loadingDiv);
        }

        // データを取得
        await fetchSymbolHistoricalData(symbol);
    }

    // データ取得
    chartData = historicalData[symbol];

    // データ検証
    if (!Array.isArray(chartData) || chartData.length === 0) {

        // ローディング表示を削除
        const container = canvas.parentElement;
        const loadingDiv = container?.querySelector('.loading-message');
        if (loadingDiv) {
            loadingDiv.remove();
        }

        // エラーメッセージをチャートエリアに表示
        if (container && !container.querySelector('.chart-error-message')) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'chart-error-message';
            errorDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                text-align: center;
                color: #e74c3c;
                font-size: 16px;
                z-index: 10;
                padding: 20px;
                background: rgba(255, 255, 255, 0.95);
                border-radius: 8px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                max-width: 80%;
            `;
            errorDiv.innerHTML = `
                <div style="font-size: 48px; margin-bottom: 10px;">⚠️</div>
                <div style="font-weight: bold; margin-bottom: 8px;">${symbol} 価格データを取得できませんでした</div>
                <div style="font-size: 14px; color: #666;">ネットワーク接続を確認してください</div>
            `;
            container.appendChild(errorDiv);
        }

        return;
    }

    const chartKey = `${symbol.toLowerCase()}TabChart`;

    // 既存のチャートを削除（新しいデータがある場合のみ）
    if (window[chartKey]) {
        window[chartKey].destroy();
    }

    // 既存のエラーメッセージとローディング表示を削除
    const container = canvas.parentElement;
    const existingError = container?.querySelector('.chart-error-message');
    if (existingError) {
        existingError.remove();
    }
    const loadingDiv = container?.querySelector('.loading-message');
    if (loadingDiv) {
        loadingDiv.remove();
    }

    // 銘柄の色を取得
    const color = SYMBOL_COLORS[symbol] || DEFAULT_SYMBOL_COLOR;

    const ctx = canvas.getContext('2d');
    // チャート作成
    window[chartKey] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: `${symbol} 価格 (JPY)`,
                data: chartData,
                borderColor: color.border,
                backgroundColor: color.bg,
                borderWidth: 2,
                fill: true,
                tension: 0.1,
                pointRadius: 2,
                pointHoverRadius: 4
            }]
        },
        options: createSymbolPriceChartOptions(symbol)
    });

}

// 銘柄別履歴データ取得
async function fetchSymbolHistoricalData(symbol) {
    if (!historicalData[symbol]){
        // api.jsで定義されたSYMBOL_MAPPINGを参照
        const coingeckoId = window.SYMBOL_MAPPING?.[symbol];

        // キャッシュキーを生成
        const cacheKey = `chart_${symbol}_30days`;

        // キャッシュチェック
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            historicalData[symbol] = cachedData;
            return;
        }

        try {
            const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=jpy&days=30`;

            const response = await fetch(url);
            const data = await response.json();

            if (data.prices) {
                const chartData = data.prices.map(([timestamp, price]) => ({
                    x: new Date(timestamp),
                    y: price  // Math.round()を削除して元の価格を保持
                }));

                // キャッシュに保存（6時間）
                setCachedData(cacheKey, chartData, PRICE_CACHE_CONFIG.CHART_DATA_DURATION);

                historicalData[symbol] = chartData;

                // 新しいデータを取得したタイムスタンプを記録
                window.appChartData.historicalDataTimestamps[symbol] = Date.now();
            }
        } catch (error) {
            console.error(`${symbol}履歴データ取得エラー:`, error);
        }
    }
}
// チャート
// 表示モードを切り替える（デスクトップ/モバイル統合版）
function toggleChartMode() {
    const currentMode = window.portfolioChartMode || 'combined';
    const newMode = currentMode === 'combined' ? 'individual' : 'combined';
    
    window.portfolioChartMode = newMode;
    localStorage.setItem('portfolioChartMode', newMode);
    
    // デスクトップ版のボタンとタイトルを更新
    const desktopToggleButton = document.getElementById('chart-mode-toggle');
    const desktopChartTitle = document.getElementById('chart-title');
    
    // モバイル版のボタンとタイトルを更新
    const mobileToggleButton = document.getElementById('mobile-chart-mode-toggle');
    const mobileChartTitle = document.getElementById('mobile-chart-title');
    
    if (newMode === 'combined') {
        // 合計表示モード
        if (desktopToggleButton) {
            desktopToggleButton.textContent = '個別表示';
            desktopToggleButton.title = '各銘柄を個別に表示';
        }
        if (mobileToggleButton) {
            mobileToggleButton.textContent = '個別';
            mobileToggleButton.title = '個別表示に切り替え';
        }
        if (desktopChartTitle) {
            desktopChartTitle.textContent = '📈 ポートフォリオ総合損益推移（過去1か月）';
        }
        if (mobileChartTitle) {
            mobileChartTitle.textContent = '📈 ポートフォリオ総合損益推移（過去1か月）';
        }
    } else {
        // 個別表示モード
        if (desktopToggleButton) {
            desktopToggleButton.textContent = '合計表示';
            desktopToggleButton.title = 'ポートフォリオ全体の合計を表示';
        }
        if (mobileToggleButton) {
            mobileToggleButton.textContent = '合計';
            mobileToggleButton.title = '合計表示に切り替え';
        }
        if (desktopChartTitle) {
            desktopChartTitle.textContent = '📈 各銘柄の個別損益推移（過去1か月）';
        }
        if (mobileChartTitle) {
            mobileChartTitle.textContent = '📈 各銘柄の個別損益推移（過去1か月）';
        }
    }
    
    // チャートを再描画
    if (typeof renderAllSymbolsProfitChart === 'function') {
        renderAllSymbolsProfitChart();
    }
    
}

// 関数を即座にグローバルに登録
window.toggleChartMode = toggleChartMode;
window.renderAllSymbolsProfitChart = renderAllSymbolsProfitChart;