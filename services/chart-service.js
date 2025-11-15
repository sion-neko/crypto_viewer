// ===================================================================
// CHART-SERVICE.JS - チャート管理の一元化
// ===================================================================

/**
 * チャートサービスクラス
 * 全てのチャート描画・管理を統合的に処理
 */
class ChartService {
    /**
     * @param {APIService} apiService - APIサービスインスタンス
     * @param {PortfolioDataService} portfolioDataService - ポートフォリオデータサービス
     * @param {object} config - AppConfig
     */
    constructor(apiService, portfolioDataService, config) {
        this.apiService = apiService;
        this.portfolioDataService = portfolioDataService;
        this.config = config;
        this.chartInstances = {};
    }

    // ===================================================================
    // ポートフォリオチャート描画
    // ===================================================================

    /**
     * 全銘柄の総合損益推移チャートを描画
     * @param {object} portfolioData - ポートフォリオデータ
     * @param {string} chartMode - チャートモード ('combined' or 'individual')
     * @returns {Promise<void>}
     */
    async renderPortfolioProfitChart(portfolioData, chartMode = 'combined') {
        const canvasId = ChartElementIds.getCanvas();

        try {
            // ポートフォリオの価格履歴を取得
            const coinNames = portfolioData.summary.map(item => item.coinName);

            if (coinNames.length === 0) {
                throw new Error('保有銘柄がありません');
            }

            // 複数銘柄の価格履歴を並列取得
            const priceHistories = await this.apiService.fetchMultiplePriceHistories(coinNames);
            const validCoinNames = coinNames.filter(coinName => priceHistories[coinName]);

            if (validCoinNames.length === 0) {
                throw new Error('価格履歴を取得できた銘柄がありません');
            }

            // 各銘柄の損益推移データを生成
            const allProfitData = {};
            validCoinNames.forEach(coinName => {
                // rawTransactionsから取引データを取得
                const transactions = getTransactionsByCoin(coinName);

                if (transactions && transactions.all.length > 0) {
                    const profitData = this._generateHistoricalProfitTimeSeries(
                        transactions.all,
                        priceHistories[coinName]
                    );
                    if (profitData && profitData.length > 0) {
                        allProfitData[coinName] = profitData;
                    }
                }
            });

            if (chartMode === 'combined') {
                // 全銘柄の合計損益推移チャートを表示
                const combinedProfitData = this._generateCombinedProfitTimeSeries(allProfitData);
                this.displayProfitChart(canvasId, combinedProfitData, 'ポートフォリオ総合損益推移（過去1か月）');
            } else {
                // 複数銘柄の個別損益推移チャートを表示
                this._displayMultiCoinProfitChart(canvasId, allProfitData, '全銘柄個別損益推移（過去1か月）');
            }

            return { success: true, coinCount: Object.keys(allProfitData).length };

        } catch (error) {
            console.error('全銘柄損益チャート描画エラー:', error);
            this.showChartError(canvasId, '全銘柄', error, [
                '一部の銘柄で価格履歴を取得できませんでした',
                'しばらく時間をおいて再度お試しください'
            ]);
            throw error;
        }
    }

    /**
     * 個別銘柄の価格チャートを描画
     * @param {string} coinName - 銘柄シンボル
     * @returns {Promise<void>}
     */
    async renderCoinChart(coinName) {
        const canvasId = `${coinName.toLowerCase()}-chart-canvas`;
        const canvas = document.getElementById(canvasId);

        if (!canvas) {
            return;
        }

        // ローディング表示
        this._showLoadingMessage(canvas, coinName);

        try {
            // 価格履歴を取得（chartDataではなくpriceHistoryを使用）
            const priceHistory = await this.apiService.fetchPriceHistory(coinName, { days: 30 });

            // データ検証
            if (!Array.isArray(priceHistory) || priceHistory.length === 0) {
                throw new Error('価格データを取得できませんでした');
            }

            // priceHistory形式 [{date: Date, price: number}, ...] を
            // Chart.js形式 [{x: Date, y: number}, ...] に変換
            const chartData = priceHistory.map(point => ({
                x: point.date,
                y: point.price
            }));

            // ローディング表示を削除
            this._removeLoadingMessage(canvas);

            // 既存のチャートを破棄
            this.destroyChart(canvasId);

            // 銘柄の色を取得
            const color = this.config.coinColors[coinName] || this.config.defaultCoinColor;

            const ctx = canvas.getContext('2d');
            this.chartInstances[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    datasets: [{
                        label: `${coinName} 価格 (JPY)`,
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
                options: this._createCoinPriceChartOptions()
            });

        } catch (error) {
            console.error(`${coinName}チャート描画エラー:`, error);
            this._removeLoadingMessage(canvas);
            this._showErrorMessage(canvas, coinName, error);
        }
    }

    // ===================================================================
    // チャート描画（内部メソッド）
    // ===================================================================

    /**
     * 損益チャートを描画
     * @param {string} canvasId - キャンバスID
     * @param {Array} profitData - 損益データ
     * @param {string} title - チャートタイトル
     * @param {string} chartType - チャートタイプ ('summary': 総合損益のみ, 'coin': 含み損益のみ)
     */
    displayProfitChart(canvasId, profitData, title, chartType = 'summary') {
        try {
            const canvas = document.getElementById(canvasId);
            if (!canvas) {
                throw new Error(`Canvas element not found: ${canvasId}`);
            }

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                throw new Error(`Cannot get 2D context for canvas: ${canvasId}`);
            }

            // 既存のチャートインスタンスを破棄
            this.destroyChart(canvasId);

            // データが空の場合
            if (!profitData || profitData.length === 0) {
                this.showChartError(canvasId, 'データなし', new Error('取引データがありません'), [
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

            // データセットをchartTypeに応じて生成
            let datasets = [];
            if (chartType === 'summary') {
                // サマリー: 総合損益のみ
                datasets = [
                    {
                        label: '総合損益 (¥)',
                        data: profitData.map(d => Math.round(d.totalProfit || d.profit || 0)),
                        borderColor: profitData[profitData.length - 1].totalProfit >= 0 ? '#28a745' : '#dc3545',
                        backgroundColor: profitData[profitData.length - 1].totalProfit >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.1
                    }
                ];
            } else if (chartType === 'coin') {
                // 各銘柄: 含み損益のみ
                datasets = [
                    {
                        label: '含み損益 (¥)',
                        data: profitData.map(d => Math.round(d.unrealizedProfit || 0)),
                        borderColor: profitData[profitData.length - 1].unrealizedProfit >= 0 ? '#28a745' : '#dc3545',
                        backgroundColor: profitData[profitData.length - 1].unrealizedProfit >= 0 ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)',
                        borderWidth: 3,
                        fill: true,
                        tension: 0.1
                    }
                ];
            }

            // Chart.jsでチャートを作成
            this.chartInstances[canvasId] = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: profitData.map(d => {
                        const date = d.date instanceof Date ? d.date : new Date(d.date);
                        return date.toLocaleDateString('ja-JP');
                    }),
                    datasets: datasets
                },
                options: this._createProfitChartOptions(title, profitData, canvasId, chartType)
            });

        } catch (error) {
            console.error('❌ Chart creation failed:', error);
            this.showChartError(canvasId, 'チャート作成', error, [
                'Chart.jsライブラリが正しく読み込まれているか確認してください',
                'ブラウザを更新してお試しください',
                'データ形式に問題がある可能性があります'
            ]);
        }
    }

    /**
     * 複数銘柄の損益推移チャート表示
     * @private
     */
    _displayMultiCoinProfitChart(canvasId, allProfitData, title) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas not found: ${canvasId}`);
            return;
        }

        const ctx = canvas.getContext('2d');
        this.destroyChart(canvasId);

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
        Object.keys(allProfitData).forEach(coinName => {
            const profitData = allProfitData[coinName];
            const color = colors[colorIndex % colors.length];

            const data = sortedDates.map(dateStr => {
                const point = profitData.find(p => p.date.toDateString() === dateStr);
                return point ? point.totalProfit : null;
            });

            const finalProfit = data[data.length - 1] || 0;
            const borderWidth = Math.abs(finalProfit) > 10000 ? 3 : 2;

            datasets.push({
                label: `${coinName}`,
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

        this.chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets },
            options: this._createMultiCoinProfitChartOptions(title)
        });
    }

    // ===================================================================
    // チャート管理
    // ===================================================================

    /**
     * チャートインスタンスを破棄
     * @param {string} canvasId - キャンバスID
     */
    destroyChart(canvasId) {
        const chart = this.chartInstances[canvasId];
        if (chart) {
            try {
                chart.destroy();
            } catch (error) {
                console.warn(`チャート破棄エラー (${canvasId}):`, error);
            }
            delete this.chartInstances[canvasId];
        }
    }

    /**
     * 全てのチャートを破棄
     */
    destroyAllCharts() {
        Object.keys(this.chartInstances).forEach(canvasId => {
            this.destroyChart(canvasId);
        });
    }

    // ===================================================================
    // エラー表示
    // ===================================================================

    /**
     * チャートエラー表示
     * @param {string} canvasId - キャンバスID
     * @param {string} coinName - 銘柄名
     * @param {Error} error - エラーオブジェクト
     * @param {string[]} suggestions - 提案メッセージ
     */
    showChartError(canvasId, coinName, error, suggestions = []) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

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

        ctx.fillStyle = color;
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${icon} ${title}`, canvas.width / 2, canvas.height / 2 - 40);

        ctx.font = '14px Arial';
        ctx.fillStyle = '#495057';
        ctx.fillText(`${coinName}: ${error.message}`, canvas.width / 2, canvas.height / 2 - 10);

        if (suggestions.length > 0) {
            ctx.font = '12px Arial';
            ctx.fillStyle = '#6c757d';
            suggestions.forEach((suggestion, index) => {
                ctx.fillText(`💡 ${suggestion}`, canvas.width / 2, canvas.height / 2 + 20 + (index * 20));
            });
        }
    }

    // ===================================================================
    // UI補助メソッド
    // ===================================================================

    _showLoadingMessage(canvas, coinName) {
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
            loadingDiv.innerHTML = `📊 ${coinName}の価格データを取得中...`;
            container.appendChild(loadingDiv);
        }
    }

    _removeLoadingMessage(canvas) {
        const container = canvas.parentElement;
        const loadingDiv = container?.querySelector('.loading-message');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    _showErrorMessage(canvas, coinName, error) {
        const container = canvas.parentElement;
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
                <div style="font-weight: bold; margin-bottom: 8px;">${coinName} 価格データを取得できませんでした</div>
                <div style="font-size: 14px; color: #666;">ネットワーク接続を確認してください</div>
            `;
            container.appendChild(errorDiv);
        }
    }

    // ===================================================================
    // データ処理（内部メソッド）
    // ===================================================================

    /**
     * 価格履歴を使った日次総合損益データを生成
     * @private
     */
    _generateHistoricalProfitTimeSeries(transactions, priceHistory) {
        const sortedTransactions = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
        const dailyProfitData = [];

        priceHistory.forEach(pricePoint => {
            const targetDate = pricePoint.date instanceof Date ? pricePoint.date : new Date(pricePoint.date);
            const price = pricePoint.price;

            let realizedProfit = 0;
            let totalQuantity = 0;
            let weightedAvgPrice = 0;
            let totalBought = 0;
            let totalSold = 0;

            sortedTransactions.forEach(tx => {
                const txDate = new Date(tx.date);

                if (txDate <= targetDate) {
                    if (tx.type === '買') {
                        const result = calculateWeightedAverage(totalQuantity, weightedAvgPrice, tx.quantity, tx.rate);
                        totalQuantity = result.totalQty;
                        weightedAvgPrice = result.weightedAvgPrice;
                        totalBought += tx.amount;
                    } else if (tx.type === '売') {
                        const sellProfit = calculateRealizedProfit(tx.amount, tx.quantity, weightedAvgPrice);
                        realizedProfit += sellProfit;
                        totalQuantity -= tx.quantity;
                        totalSold += tx.amount;

                        if (totalQuantity <= 0) {
                            totalQuantity = 0;
                            weightedAvgPrice = 0;
                        }
                    }
                }
            });

            const unrealizedProfit = totalQuantity > 0.00000001
                ? calculateUnrealizedProfit(totalQuantity, price, weightedAvgPrice)
                : 0;

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

    /**
     * 全銘柄の損益データを合算して統合損益推移を生成
     * @private
     */
    _generateCombinedProfitTimeSeries(allProfitData) {
        const allDates = new Set();
        Object.values(allProfitData).forEach(profitData => {
            profitData.forEach(point => {
                allDates.add(point.date.toDateString());
            });
        });

        const sortedDates = Array.from(allDates).sort((a, b) => new Date(a) - new Date(b));

        const combinedData = sortedDates.map(dateStr => {
            const targetDate = new Date(dateStr);
            let totalRealizedProfit = 0;
            let totalUnrealizedProfit = 0;
            let totalProfit = 0;
            let totalHoldingQuantity = 0;
            let totalCurrentValue = 0;

            Object.keys(allProfitData).forEach(coinName => {
                const profitData = allProfitData[coinName];
                const point = profitData.find(p => p.date.toDateString() === dateStr);

                if (point) {
                    totalRealizedProfit += point.realizedProfit || 0;
                    totalUnrealizedProfit += point.unrealizedProfit || 0;
                    totalProfit += point.totalProfit || 0;
                    totalHoldingQuantity += point.holdingQuantity || 0;
                    totalCurrentValue += (point.holdingQuantity || 0) * (point.currentPrice || 0);
                }
            });

            return {
                date: targetDate,
                realizedProfit: totalRealizedProfit,
                unrealizedProfit: totalUnrealizedProfit,
                totalProfit: totalProfit,
                holdingQuantity: totalHoldingQuantity,
                avgPrice: totalHoldingQuantity > 0 ? totalCurrentValue / totalHoldingQuantity : 0,
                currentPrice: 0
            };
        });

        return combinedData;
    }

    // ===================================================================
    // チャートオプション生成
    // ===================================================================

    _createCoinPriceChartOptions() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                title: { display: false },
                legend: { display: false }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day',
                        displayFormats: { day: 'MM/dd' }
                    }
                },
                y: {
                    beginAtZero: false,
                    ticks: {
                        callback: function (value) {
                            if (value < 0.001) return '¥' + value.toFixed(6);
                            if (value < 0.01) return '¥' + value.toFixed(4);
                            if (value < 1) return '¥' + value.toFixed(3);
                            return '¥' + value.toFixed(2);
                        }
                    }
                }
            }
        };
    }

    _createProfitChartOptions(title, profitData, canvasId, chartType = 'summary') {
        const coinNameMatch = canvasId ? canvasId.match(/^([a-z]+)-profit-chart$/) : null;
        const coinName = coinNameMatch ? coinNameMatch[1].toUpperCase() : 'COIN_NAME';

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, weight: 'bold' }
                },
                legend: {
                    display: false  // 単一データセットなので凡例を非表示
                },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const dataPoint = profitData[context.dataIndex];
                            const datasetLabel = context.dataset.label;

                            if (chartType === 'summary' && datasetLabel === '総合損益 (¥)') {
                                const formatValue = (val) => {
                                    const sign = val >= 0 ? '+' : '';
                                    return `${sign}¥${Math.round(val).toLocaleString()}`;
                                };
                                return [
                                    `${datasetLabel}: ${formatValue(dataPoint.totalProfit || 0)}`,
                                    `  実現: ${formatValue(dataPoint.realizedProfit || 0)}`,
                                    `  含み: ${formatValue(dataPoint.unrealizedProfit || 0)}`
                                ];
                            } else if (chartType === 'coin' && datasetLabel === '含み損益 (¥)') {
                                if (dataPoint.holdingQuantity !== undefined && dataPoint.avgPrice !== undefined) {
                                    return [
                                        `📅 ${(dataPoint.date instanceof Date ? dataPoint.date : new Date(dataPoint.date)).toLocaleDateString('ja-JP')}`,
                                        `💰 含み損益: ¥${Math.round(dataPoint.unrealizedProfit || 0).toLocaleString()}`,
                                        `📊 保有量: ${dataPoint.holdingQuantity.toFixed(6)} ${coinName}`,
                                        `📈 平均価格: ¥${Math.round(dataPoint.avgPrice).toLocaleString()}`,
                                        `💹 その日の価格: ¥${Math.round(dataPoint.currentPrice || 0).toLocaleString()}`
                                    ];
                                }
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
                    title: { display: true, text: '日付' }
                },
                y: {
                    display: true,
                    title: { display: true, text: '損益 (¥)' },
                    ticks: {
                        callback: function (value) {
                            if (Math.abs(value) >= 1000000) return '¥' + (value / 1000000).toFixed(1) + 'M';
                            if (Math.abs(value) >= 1000) return '¥' + (value / 1000).toFixed(0) + 'K';
                            return '¥' + value.toLocaleString();
                        }
                    },
                    // Y軸の範囲に余白を追加
                    grace: '15%'
                }
            },
            interaction: {
                intersect: false,
                mode: 'index'
            }
        };
    }

    _createMultiCoinProfitChartOptions(title) {
        const formatValue = (value) => {
            const sign = value >= 0 ? '+' : '';
            return `${sign}¥${Math.round(value).toLocaleString()}`;
        };

        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: true,
                    text: title,
                    font: { size: 16, weight: 'bold' },
                    color: '#2c3e50'
                },
                legend: {
                    display: true,
                    position: 'top',
                    labels: {
                        usePointStyle: true,
                        padding: 15,
                        font: { size: 11 }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed.y;
                            if (value === null) return null;
                            return `${context.dataset.label}: ${formatValue(value)}`;
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
                        font: { size: 12, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' }
                },
                y: {
                    display: true,
                    title: {
                        display: true,
                        text: '損益 (¥)',
                        font: { size: 12, weight: 'bold' }
                    },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    ticks: {
                        callback: function (value) {
                            return formatValue(value);
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
}

/**
 * チャート関連のDOM要素IDを管理するクラス
 * (注: toggleButtonとtitleは削除されたため、getCanvas()のみ使用)
 */
class ChartElementIds {
    static getCanvas() {
        return typeof isMobile === 'function' && isMobile() ? 'mobile-all-coinNames-profit-chart' : 'all-coinNames-profit-chart';
    }
}

// グローバルシングルトンインスタンスを作成（依存関係を解決後に初期化）
// 注: apiService と portfolioDataService が既に初期化されている前提
window.ChartService = ChartService;
window.ChartElementIds = ChartElementIds;
