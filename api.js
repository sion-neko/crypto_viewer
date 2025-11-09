// ===================================================================
// API.JS - Price fetching and CoinGecko API related functions
// ===================================================================

// 注: 価格データは全てCacheServiceで管理されます（window.cache）

// 価格データ永続化設定 (from AppConfig)
const CACHE_DURATION_PRICE = AppConfig.cacheDurations.CURRENT_PRICES;
const CACHE_DURATION_HISTORY = AppConfig.cacheDurations.PRICE_HISTORY;

// 銘柄マッピング（CoinGecko API用） - AppConfigから取得
const COIN_NAME_MAPPING = AppConfig.coinGeckoMapping;

// 後方互換性のため、グローバルにも公開
window.COIN_NAME_MAPPING = AppConfig.coinGeckoMapping;

// ===================================================================
// PRICE FETCHING FUNCTIONS
// ===================================================================

// 価格履歴API実行（タイムアウト・エラーハンドリング付き）
async function executePriceHistoryApi(coingeckoId, options = {}) {
	const {
		vsCurrency = 'jpy',
		days = 30,
		interval = 'daily',
		timeoutMs = 10000
	} = options;

	const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart?vs_currency=${encodeURIComponent(vsCurrency)}&days=${encodeURIComponent(String(days))}&interval=${encodeURIComponent(interval)}`;

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			signal: controller.signal,
			headers: { 'Accept': 'application/json' }
		});

		if (!response.ok) {
			if (response.status === 429) {
				throw new Error('API制限に達しました (429 Too Many Requests)');
			} else if (response.status === 403) {
				throw new Error('APIアクセスが拒否されました (403 Forbidden)');
			} else {
				throw new Error(`API Error: ${response.status}`);
			}
		}

		return await response.json();
	} finally {
		clearTimeout(timeoutId);
	}
}

// グローバル公開
window.executePriceHistoryApi = executePriceHistoryApi;

// 価格取得関連機能
async function fetchCurrentPrices() {
    try {
        // CacheServiceを使用してポートフォリオデータを取得
        const currentPortfolioData = cache.getPortfolioData();

        if (!currentPortfolioData) {
            throw new Error('ポートフォリオデータが見つかりません。先にCSVファイルをアップロードしてください。');
        }

        if (!currentPortfolioData.summary || currentPortfolioData.summary.length === 0) {
            throw new Error('ポートフォリオサマリーデータが見つかりません');
        }

        // 対応銘柄のCoinGecko IDを取得
        const portfolioCoinNames = currentPortfolioData.summary.map(item => item.coinName);
        const validCoinNames = portfolioCoinNames.filter(coinName => COIN_NAME_MAPPING[coinName]);

        if (validCoinNames.length === 0) {
            throw new Error('対応銘柄が見つかりません');
        }

        // まず価格履歴キャッシュから現在価格を取得を試行（API効率化）
        const pricesFromHistory = await tryGetPricesFromHistory(validCoinNames);
        if (pricesFromHistory && Object.keys(pricesFromHistory).length === validCoinNames.length) {
            // 価格履歴から取得した価格でポートフォリオを更新
            updatePortfolioWithPrices(currentPortfolioData, pricesFromHistory);

            // 更新されたポートフォリオデータをグローバルステートに保存
            if (window.appPortfolioState) {
                window.appPortfolioState.currentPortfolioData = currentPortfolioData;
            }

            refreshPortfolioDisplay(`キャッシュから表示: ${validCoinNames.length}銘柄\n価格履歴データより`);
            return;
        }

        // 永続化キャッシュキーを生成
        const cacheKey = cacheKeys.currentPrices(validCoinNames);

        // 永続化キャッシュチェック（30分有効）
        const cachedPrices = cache.get(cacheKey);
        if (cachedPrices) {
            const cacheTimestamp = cachedPrices._metadata?.lastUpdate || Date.now();
            const cacheDate = new Date(cacheTimestamp);

            // キャッシュから取得した価格でポートフォリオを更新
            updatePortfolioWithPrices(currentPortfolioData, cachedPrices);

            // 更新されたポートフォリオデータをグローバルステートに保存
            if (window.appPortfolioState) {
                window.appPortfolioState.currentPortfolioData = currentPortfolioData;
            }

            // 永続キャッシュから取得した場合の通知（保存時刻付き）
            const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: 'numeric'
            });

            refreshPortfolioDisplay(`キャッシュから表示: ${validCoinNames.length}銘柄\n${cacheTimeStr}保存`);
            return;
        }

        // API取得開始の通知
        showInfoMessage('価格データを取得中...');

        const coingeckoIds = validCoinNames.map(coinName => COIN_NAME_MAPPING[coinName]).join(',');
        const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoIds}&vs_currencies=jpy&include_last_updated_at=true`;

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const data = await response.json();

        // データを整理
        const prices = {};
        for (const coinName of validCoinNames) {
            const coingeckoId = COIN_NAME_MAPPING[coinName];
            if (data[coingeckoId]) {
                prices[coinName] = {
                    price_jpy: data[coingeckoId].jpy,
                    last_updated: data[coingeckoId].last_updated_at
                };
            }
        }

        // メタデータ追加
        prices._metadata = {
            lastUpdate: Date.now(),
            coinNames: validCoinNames
        };

        // 永続化キャッシュに保存（30分有効）
        cache.set(cacheKey, prices, CACHE_DURATION_PRICE);

        // ポートフォリオデータを再計算（含み損益含む）
        updatePortfolioWithPrices(currentPortfolioData, prices);

        // 更新されたポートフォリオデータをグローバルステートに保存
        if (window.appPortfolioState) {
            window.appPortfolioState.currentPortfolioData = currentPortfolioData;
        }

        // 成功通知を表示して再描画（永続化情報付き）
        refreshPortfolioDisplay(`価格更新完了: ${validCoinNames.length}銘柄 (30分間保存)`);

        // 価格データ永続化レポート（デバッグモード時のみ）
        if (typeof DEBUG_MODE !== 'undefined' && DEBUG_MODE) {
            setTimeout(() => showPriceDataReport(), 1000);
        }

    } catch (error) {
        console.error('価格取得エラー:', error);
        // エラー通知を表示
        showErrorMessage(`価格取得失敗: ${error.message}`);
        updatePriceStatus('取得失敗');
    }
}

// 価格履歴キャッシュから現在価格を取得（API効率化）
async function tryGetPricesFromHistory(coinNames) {
    const prices = {};
    let successCount = 0;

    for (const coinName of coinNames) {
        try {
            const cacheKey = cacheKeys.priceHistory(coinName);
            const historyValue = cache.get(cacheKey);

            if (historyValue && historyValue.length > 0) {
                const latestPrice = historyValue[historyValue.length - 1].price;
                prices[coinName] = {
                    price_jpy: latestPrice,
                    last_updated_at: Date.now() / 1000
                };
                successCount++;
            }
        } catch (error) {
        }
    }

    if (successCount > 0) {
        prices._metadata = {
            lastUpdate: Date.now(),
            coinNames: Object.keys(prices).filter(key => key !== '_metadata'),
            source: 'price_history_cache'
        };
        return prices;
    }

    return null;
}

// 価格データでポートフォリオを更新（含み損益計算）
function updatePortfolioWithPrices(portfolioData, prices) {
    let totalUnrealizedProfit = 0;

    portfolioData.summary.forEach(item => {
        // 価格データが存在する場合
        if (prices[item.coinName]) {
            const currentPrice = prices[item.coinName].price_jpy;
            item.currentPrice = currentPrice;

            // 保有量が正の場合のみ含み損益を計算
            const unrealizedProfit = calculateUnrealizedProfit(
                item.holdingQuantity,
                currentPrice,
                item.averagePurchaseRate
            );

            if (unrealizedProfit !== 0) {
                // 含み損益を追加
                item.currentValue = item.holdingQuantity * currentPrice;
                item.unrealizedProfit = unrealizedProfit;
                item.totalProfit = item.realizedProfit + unrealizedProfit;
                totalUnrealizedProfit += unrealizedProfit;
            } else {
                // 保有量が0以下の場合（完全売却済み）
                item.currentValue = 0;
                item.unrealizedProfit = 0;
                item.totalProfit = item.realizedProfit;
            }
        } else {
            // 価格データがない場合
            item.currentPrice = 0;
            item.currentValue = 0;
            item.unrealizedProfit = 0;
            item.totalProfit = item.realizedProfit;
        }
    });

    // 統計に含み損益と総合損益を追加
    portfolioData.stats.totalUnrealizedProfit = totalUnrealizedProfit;
    portfolioData.stats.totalProfit = portfolioData.stats.totalRealizedProfit + totalUnrealizedProfit;

    // 総合損益に基づく追加統計
    portfolioData.stats.totalProfitableCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) > 0).length;
    portfolioData.stats.totalLossCoinNames = portfolioData.summary.filter(s => (s.totalProfit || s.realizedProfit) < 0).length;
    portfolioData.stats.overallTotalProfitMargin = portfolioData.stats.totalInvestment > 0 ?
        (portfolioData.stats.totalProfit / portfolioData.stats.totalInvestment) * 100 : 0;
}

// 価格更新ステータス表示（CacheService使用版）
function updatePriceStatus(message = null) {
    const statusElement = document.getElementById('price-update-status');
    if (!statusElement) return;

    if (message) {
        statusElement.textContent = message;
        return;
    }

    // ポートフォリオデータから銘柄リストを取得
    const portfolioData = cache.getPortfolioData();
    if (!portfolioData || !portfolioData.summary) {
        statusElement.textContent = '価格データなし';
        statusElement.style.color = '#6c757d';
        statusElement.title = '価格データを取得してください';
        return;
    }

    const coinNames = portfolioData.summary.map(item => item.coinName);
    const cacheKey = cacheKeys.currentPrices(coinNames);
    const cachedPrices = cache.get(cacheKey);

    if (cachedPrices && cachedPrices._metadata) {
        const lastUpdate = new Date(cachedPrices._metadata.lastUpdate);
        const validCoinNames = cachedPrices._metadata.coinNames || [];
        const timeStr = lastUpdate.toLocaleString('ja-JP');
        const ageMinutes = Math.round((Date.now() - lastUpdate.getTime()) / 1000 / 60);

        statusElement.textContent = `${validCoinNames.length}銘柄 | ${timeStr} (${ageMinutes}分前)`;

        // 30分以上古い場合は警告色
        if (ageMinutes >= 30) {
            statusElement.style.color = '#ffc107';
            statusElement.title = '価格データが古くなっています。更新をお勧めします。';
        } else {
            statusElement.style.color = '#28a745';
            statusElement.title = '価格データは最新です';
        }
    } else {
        statusElement.textContent = '価格データなし';
        statusElement.style.color = '#6c757d';
        statusElement.title = '価格データを取得してください';
    }
}