// ===================================================================
// PORTFOLIO.JS - Portfolio analysis, calculations, and display
// ===================================================================

// Global variables for portfolio state (use window object to avoid conflicts)
if (!window.appPortfolioState) {
    window.appPortfolioState = {
        currentPortfolioData: null,
        currentSortField: 'realizedProfit',
        currentSortDirection: 'desc'
    };
}

// 後方互換性のためのエイリアス
let currentPortfolioData = window.appPortfolioState.currentPortfolioData;
let currentSortField = window.appPortfolioState.currentSortField;
let currentSortDirection = window.appPortfolioState.currentSortDirection;

// ===================================================================
// PORTFOLIO ANALYSIS FUNCTIONS
// ===================================================================

// ポートフォリオ分析（損益計算強化版）
function analyzePortfolioData(transactions) {
    const symbolData = {};

    transactions.forEach(tx => {
        if (!symbolData[tx.symbol]) {
            symbolData[tx.symbol] = {
                totalBuyAmount: 0,
                totalSellAmount: 0,
                totalQuantity: 0,
                totalFees: 0,
                buyTransactions: [],
                sellTransactions: [],
                totalBuyQuantity: 0,
                totalSellQuantity: 0,
                weightedRateSum: 0,
                allTransactions: []
            };
        }

        const data = symbolData[tx.symbol];
        data.allTransactions.push(tx);

        if (tx.type === '買') {
            data.totalBuyAmount += tx.amount;
            data.totalBuyQuantity += tx.quantity;
            data.weightedRateSum += tx.rate * tx.quantity;
            data.buyTransactions.push(tx);
        } else if (tx.type === '売') {
            data.totalSellAmount += tx.amount;
            data.totalSellQuantity += tx.quantity;
            data.sellTransactions.push(tx);
        }

        data.totalQuantity += tx.type === '買' ? tx.quantity : -tx.quantity;
        data.totalFees += tx.fee;
    });

    // 各銘柄の統計・損益計算
    const portfolioSummary = [];
    let totalInvestment = 0;
    let totalRealizedProfit = 0;
    let totalFees = 0;

    Object.keys(symbolData).forEach(symbol => {
        const data = symbolData[symbol];
        const averagePurchaseRate = data.totalBuyQuantity > 0 ?
            data.weightedRateSum / data.totalBuyQuantity : 0;

        // 現在の保有分の投資額（平均購入レートベース）
        const currentHoldingInvestment = data.totalQuantity > 0 ?
            data.totalQuantity * averagePurchaseRate : 0;

        // 実現損益計算（売却時の損益）
        let realizedProfit = 0;
        if (data.totalSellQuantity > 0 && averagePurchaseRate > 0) {
            // 売却金額 - 売却分の平均購入コスト
            const soldCost = data.totalSellQuantity * averagePurchaseRate;
            realizedProfit = data.totalSellAmount - soldCost;
        }

        // 投資効率計算
        const investmentEfficiency = data.totalBuyAmount > 0 ?
            (realizedProfit / data.totalBuyAmount) * 100 : 0;

        const summary = {
            symbol,
            holdingQuantity: data.totalQuantity,
            totalInvestment: data.totalBuyAmount,
            currentHoldingInvestment,
            averagePurchaseRate,
            totalFees: data.totalFees,
            buyTransactionCount: data.buyTransactions.length,
            sellTransactionCount: data.sellTransactions.length,
            totalSellAmount: data.totalSellAmount,
            realizedProfit,
            investmentEfficiency,
            // 表示用の損益ステータス
            profitStatus: realizedProfit > 0 ? 'profit' : realizedProfit < 0 ? 'loss' : 'neutral'
        };

        totalInvestment += summary.totalInvestment;
        totalRealizedProfit += realizedProfit;
        totalFees += summary.totalFees;
        portfolioSummary.push(summary);
    });

    // 全体統計（総合損益対応）
    const portfolioStats = {
        totalInvestment,
        totalRealizedProfit,
        totalFees,
        overallProfitMargin: totalInvestment > 0 ? (totalRealizedProfit / totalInvestment) * 100 : 0,
        symbolCount: portfolioSummary.length,
        profitableSymbols: portfolioSummary.filter(s => s.realizedProfit > 0).length,
        lossSymbols: portfolioSummary.filter(s => s.realizedProfit < 0).length,
        // 総合損益関連の統計（価格更新後に計算される）
        totalUnrealizedProfit: 0,
        totalProfit: totalRealizedProfit,
        totalProfitableSymbols: 0,
        totalLossSymbols: 0,
        overallTotalProfitMargin: 0
    };

    return {
        summary: portfolioSummary,
        stats: portfolioStats,
        symbols: symbolData,
        lastUpdated: new Date().toISOString()
    };
}

// ===================================================================
// TABLE SORTING FUNCTIONS
// ===================================================================

// テーブルソート機能
function sortTable(field) {
    if (!currentPortfolioData) return;

    // 同じフィールドクリック時は方向を逆転
    if (currentSortField === field) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        // 新しいフィールドの場合は降順から開始
        currentSortField = field;
        currentSortDirection = 'desc';
    }

    sortPortfolioData(field, currentSortDirection);

    // テーブル再描画
    const tableContainer = document.getElementById('portfolio-table-container');
    tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);
}

// ポートフォリオデータソート
function sortPortfolioData(field, direction) {
    if (!currentPortfolioData || !currentPortfolioData.summary) return;

    currentPortfolioData.summary.sort((a, b) => {
        let aVal, bVal;

        // フィールド値取得
        switch (field) {
            case 'symbol':
                aVal = a.symbol;
                bVal = b.symbol;
                break;
            case 'averagePurchaseRate':
                aVal = a.averagePurchaseRate;
                bVal = b.averagePurchaseRate;
                break;
            case 'totalInvestment':
                aVal = a.totalInvestment;
                bVal = b.totalInvestment;
                break;
            case 'heldInvestment':
                aVal = a.currentHoldingInvestment;
                bVal = b.currentHoldingInvestment;
                break;
            case 'currentPrice':
                aVal = a.currentPrice || 0;
                bVal = b.currentPrice || 0;
                break;
            case 'currentValue':
                aVal = a.currentValue || 0;
                bVal = b.currentValue || 0;
                break;
            case 'realizedProfit':
                aVal = a.realizedProfit;
                bVal = b.realizedProfit;
                break;
            case 'unrealizedProfit':
                aVal = a.unrealizedProfit || 0;
                bVal = b.unrealizedProfit || 0;
                break;
            case 'totalProfit':
                aVal = a.totalProfit || a.realizedProfit;
                bVal = b.totalProfit || b.realizedProfit;
                break;
            default:
                return 0;
        }

        // ソート実行
        if (field === 'symbol') {
            // 文字列ソート
            if (direction === 'asc') {
                return aVal.localeCompare(bVal);
            } else {
                return bVal.localeCompare(aVal);
            }
        } else {
            // 数値ソート
            if (direction === 'asc') {
                return aVal - bVal;
            } else {
                return bVal - aVal;
            }
        }
    });

    updateSortIndicators(field, direction);
}

// ソートアイコン取得
function getSortIcon(field) {
    if (currentSortField === field) {
        return currentSortDirection === 'asc' ? '▲' : '▼';
    }
    return '';
}

// ソート方向表示更新
function updateSortIndicators(activeField, direction) {
    const fields = ['symbol', 'holdingQuantity', 'averagePurchaseRate', 'totalInvestment',
        'currentPrice', 'currentValue', 'totalSellAmount', 'realizedProfit',
        'unrealizedProfit', 'realizedProfit', 'totalProfit'];

    fields.forEach(field => {
        const indicator = document.getElementById(`sort-${field}`);
        if (indicator) {
            if (field === activeField) {
                indicator.textContent = direction === 'asc' ? '▲' : '▼';
                indicator.style.color = '#3498db';
            } else {
                indicator.textContent = '';
                indicator.style.color = '';
            }
        }
    });
}

// ===================================================================
// DASHBOARD AND DISPLAY FUNCTIONS
// ===================================================================

// ダッシュボード表示（タブシステム版）
function displayDashboard(portfolioData) {
    if (typeof debugLog === 'function') {
        debugLog('🚀 displayDashboard called');
        debugLog('📊 Portfolio data summary:', portfolioData?.summary?.length || 0, 'symbols');
    }

    // グローバル変数に保存
    window.appPortfolioState.currentPortfolioData = portfolioData;
    currentPortfolioData = portfolioData;
    window.currentPortfolioData = portfolioData; // グローバルアクセス用

    // デフォルトソート（実現損益降順）
    sortPortfolioData('realizedProfit', 'desc');

    // 旧表示エリアを非表示
    document.getElementById('dashboardArea').style.display = 'none';

    // タブコンテナを表示
    document.getElementById('tabContainer').style.display = 'block';

    // ポートフォリオテーブル表示
    const tableContainer = document.getElementById('portfolio-table-container');
    tableContainer.innerHTML = generatePortfolioTable(currentPortfolioData);

    // 価格データは手動更新のみとし、自動復元は行わない
    if (typeof updatePriceStatus === 'function') {
        updatePriceStatus('価格データなし - 手動更新してください');
    }

    // 取引履歴テーブル表示
    const tradingContainer = document.getElementById('trading-history-container');
    tradingContainer.innerHTML = generateTradingHistoryTable(portfolioData);

    // 銘柄別サブタブ作成
    if (typeof debugLog === 'function') {
        debugLog('🔄 About to create symbol subtabs...');
    }
    try {
        createSymbolSubtabs(portfolioData);
        if (typeof debugLog === 'function') {
            debugLog('✅ Symbol subtabs creation completed');
        }
    } catch (error) {
        console.error('❌ Error in createSymbolSubtabs:', error);
    }

    // サマリータブを明示的にアクティブに設定
    setTimeout(() => {
        if (typeof debugLog === 'function') {
            debugLog('🔄 Setting summary tab as active...');
        }
        switchSubtab('summary');

        // 事前キャッシュは全銘柄チャート描画で一括処理するため削除
    }, 50);

    updateDataStatus(portfolioData);

    // アップロード成功後はダッシュボードページに切り替え
    showPage('dashboard');

    // 全銘柄の損益推移チャートを描画（DOM準備完了後）
    setTimeout(() => {
        // 保存されたチャートモードを復元
        const savedMode = localStorage.getItem('portfolioChartMode') || 'combined';
        window.portfolioChartMode = savedMode;

        // ボタンとタイトルの初期状態を設定
        setTimeout(() => {
            if (typeof window.toggleChartMode === 'function') {
                // 一度切り替えて正しい状態にする
                const currentMode = window.portfolioChartMode;
                window.portfolioChartMode = currentMode === 'combined' ? 'individual' : 'combined';
                window.toggleChartMode();
            } else {
                console.warn('⚠️ toggleChartMode function not available');
            }
        }, 100);

        // チャートを描画（デスクトップ・モバイル両対応）
        if (typeof renderAllSymbolsProfitChart === 'function') {
            if (typeof debugLog === 'function') {
                debugLog('🎨 Rendering all symbols profit chart after dashboard setup');
            }
            renderAllSymbolsProfitChart();
        }
    }, 800); // DOM要素の準備を待つため少し短縮
}

// データ状態更新
function updateDataStatus(portfolioData) {
    const statusElement = document.getElementById('data-status');
    const managementElement = document.getElementById('data-management');

    if (portfolioData && portfolioData.summary.length > 0) {
        const stats = portfolioData.stats;
        // 総合損益を優先表示（含み損益込み）
        const displayProfit = stats.totalProfit || stats.totalRealizedProfit;
        const profitColor = displayProfit >= 0 ? '#27ae60' : '#e74c3c';
        const profitIcon = displayProfit > 0 ? '📈' : displayProfit < 0 ? '📉' : '➖';

        statusElement.innerHTML = `
            <div style="color: #27ae60; font-weight: 600;">✅ データあり</div>
            <div style="margin-top: 5px; font-size: 0.8rem;">
                ${stats.symbolCount}銘柄<br>
                投資額: ¥${stats.totalInvestment.toLocaleString()}<br>
                <span style="color: ${profitColor}; font-weight: 600;">
                    ${profitIcon} ¥${Math.round(displayProfit).toLocaleString()}
                </span>
                ${stats.totalUnrealizedProfit !== undefined ? `<br><span style="font-size: 0.7rem; color: #6c757d;">実現+含み損益</span>` : ''}
            </div>
        `;
        managementElement.style.display = 'block';
    } else {
        statusElement.innerHTML = `<div style="color: #7f8c8d;">データなし</div>`;
        managementElement.style.display = 'none';
    }
}

// ===================================================================
// SUBTAB CREATION AND MANAGEMENT
// ===================================================================

// 銘柄別サブタブ生成（復活版）
function createSymbolSubtabs(portfolioData) {
    if (typeof debugLog === 'function') {
        debugLog('🔄 createSymbolSubtabs called');
    }

    // ポートフォリオデータの詳細チェック
    if (!portfolioData) {
        console.error('❌ portfolioData is null or undefined');
        return;
    }

    if (!portfolioData.summary) {
        console.error('❌ portfolioData.summary is missing');
        return;
    }

    if (!Array.isArray(portfolioData.summary)) {
        console.error('❌ portfolioData.summary is not an array:', typeof portfolioData.summary);
        return;
    }

    if (portfolioData.summary.length === 0) {
        console.error('❌ portfolioData.summary is empty');
        return;
    }

    if (typeof debugLog === 'function') {
        debugLog('📊 Portfolio data valid:', {
            summaryLength: portfolioData.summary.length,
            symbols: portfolioData.summary.map(s => s.symbol),
            hasSymbolsData: !!portfolioData.symbols
        });
    }

    const subtabNav = document.getElementById('subtab-nav');
    const symbolContainer = document.getElementById('symbol-subtabs-container');

    if (!subtabNav || !symbolContainer) {
        console.error('❌ Required DOM elements not found:', {
            subtabNav: !!subtabNav,
            symbolContainer: !!symbolContainer,
            subtabNavExists: document.getElementById('subtab-nav') !== null,
            symbolContainerExists: document.getElementById('symbol-subtabs-container') !== null
        });
        return;
    }

    if (typeof debugLog === 'function') {
        debugLog('✅ DOM elements found');
    }

    // 既存の銘柄サブタブをクリア
    subtabNav.querySelectorAll('.symbol-subtab').forEach(tab => tab.remove());
    symbolContainer.innerHTML = '';

    // 銘柄別サブタブを生成
    if (portfolioData && portfolioData.summary) {
        if (typeof debugLog === 'function') {
            debugLog('📈 Creating subtabs for symbols:', portfolioData.summary.map(s => s.symbol));
        }

        // 実現損益で降順ソート
        const sortedSymbols = [...portfolioData.summary].sort((a, b) => b.realizedProfit - a.realizedProfit);
        if (typeof debugLog === 'function') {
            debugLog('🔢 Sorted symbols:', sortedSymbols.map(s => s.symbol));
        }

        sortedSymbols.forEach((symbolData, index) => {
            try {
                if (typeof debugLog === 'function') {
                    debugLog(`🏷️ Creating subtab ${index + 1}/${sortedSymbols.length} for ${symbolData.symbol}`);
                }

                // symbolDataの妥当性チェック
                if (!symbolData || !symbolData.symbol) {
                    console.error(`❌ Invalid symbolData at index ${index}:`, symbolData);
                    return;
                }

                // サブタブボタンを作成
                const tabButton = document.createElement('button');
                tabButton.className = 'subtab-button symbol-subtab';
                tabButton.id = `subtab-${symbolData.symbol.toLowerCase()}`;
                tabButton.textContent = symbolData.symbol;
                tabButton.onclick = () => switchSubtab(symbolData.symbol.toLowerCase());

                // 損益に応じて色分け（非選択時のスタイル）
                if (symbolData.realizedProfit > 0) {
                    tabButton.style.borderColor = '#28a745';
                    tabButton.style.color = '#28a745';
                } else if (symbolData.realizedProfit < 0) {
                    tabButton.style.borderColor = '#dc3545';
                    tabButton.style.color = '#dc3545';
                }

                // ホバー効果とアクティブ状態のスタイルを追加
                tabButton.addEventListener('mouseenter', function () {
                    if (!this.classList.contains('active')) {
                        this.style.backgroundColor = 'rgba(52, 152, 219, 0.1)';
                    }
                });

                tabButton.addEventListener('mouseleave', function () {
                    if (!this.classList.contains('active')) {
                        this.style.backgroundColor = '';
                    }
                });

                subtabNav.appendChild(tabButton);

                // サブタブコンテンツを作成
                const tabContent = document.createElement('div');
                tabContent.className = 'subtab-content';
                tabContent.id = `subtab-content-${symbolData.symbol.toLowerCase()}`;

                // generateSymbolDetailPageの存在確認
                if (typeof generateSymbolDetailPage === 'function') {
                    const symbolDetailData = portfolioData.symbols[symbolData.symbol];
                    if (symbolDetailData) {
                        tabContent.innerHTML = generateSymbolDetailPage(symbolData, symbolDetailData);
                    } else {
                        console.warn(`⚠️ No detailed data found for ${symbolData.symbol}`);
                        tabContent.innerHTML = `<div>詳細データが見つかりません: ${symbolData.symbol}</div>`;
                    }
                } else {
                    console.error('❌ generateSymbolDetailPage function not found');
                    tabContent.innerHTML = `<div>詳細ページ生成関数が見つかりません</div>`;
                }

                symbolContainer.appendChild(tabContent);
                if (typeof debugLog === 'function') {
                    debugLog(`✅ Created subtab for ${symbolData.symbol}`);
                }

            } catch (error) {
                console.error(`❌ Error creating subtab for ${symbolData?.symbol || 'unknown'}:`, error);
            }
        });

        if (typeof debugLog === 'function') {
            debugLog(`🎉 Created ${sortedSymbols.length} symbol subtabs`);

            // デバッグ: 作成されたタブの確認
            setTimeout(() => {
                const createdTabs = subtabNav.querySelectorAll('.symbol-subtab');
                const createdContents = symbolContainer.querySelectorAll('.subtab-content');

                debugLog(`🔍 Final tab count check:`);
                debugLog(`  - Expected: ${sortedSymbols.length}`);
                debugLog(`  - Tab buttons: ${createdTabs.length}`);
                debugLog(`  - Tab contents: ${createdContents.length}`);

                if (createdTabs.length === 0) {
                    console.error('❌ No tabs were created! Checking DOM state...');
                    debugLog('DOM subtab-nav:', subtabNav);
                    debugLog('DOM symbol-container:', symbolContainer);
                    debugLog('subtab-nav innerHTML:', subtabNav.innerHTML);
                } else {
                    debugLog('✅ Tabs created successfully:');
                    createdTabs.forEach(tab => debugLog(`  - ${tab.textContent} (${tab.id})`));
                }
            }, 100);
        }

    } else {
        console.error('❌ No portfolio data or summary available');
        if (typeof debugLog === 'function') {
            debugLog('Debug info:', {
                portfolioData: !!portfolioData,
                summary: portfolioData?.summary,
                summaryType: typeof portfolioData?.summary,
                summaryLength: portfolioData?.summary?.length
            });
        }
    }

    // 最終確認: タブが作成されなかった場合の警告
    setTimeout(() => {
        const finalTabCount = subtabNav.querySelectorAll('.symbol-subtab').length;
        if (finalTabCount === 0 && portfolioData?.summary?.length > 0) {
            console.error('🚨 CRITICAL: No symbol tabs were created despite having portfolio data!');
            if (typeof debugLog === 'function') {
                debugLog('Attempting recovery...');
            }

            // 復旧試行
            try {
                createSymbolSubtabs(portfolioData);
            } catch (recoveryError) {
                console.error('❌ Recovery attempt failed:', recoveryError);
            }
        }
    }, 200);
}

// ===================================================================
// TABLE GENERATION FUNCTIONS
// ===================================================================

// モバイル用ポートフォリオカード生成
function generateMobilePortfolioCards(portfolioData) {
    const stats = portfolioData.stats;

    // サマリーカード
    let html = `
        <div class="table-card" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px solid #3b82f6;">
            <div class="card-header">📊 ポートフォリオサマリー（${stats.symbolCount}銘柄）</div>
            <div class="card-row">
                <span class="card-label">総合損益</span>
                <span class="card-value" style="color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}
                    (${stats.overallTotalProfitMargin >= 0 ? '+' : ''}${stats.overallTotalProfitMargin.toFixed(1)}%)
                </span>
            </div>
            <div class="card-row">
                <span class="card-label">投資額</span>
                <span class="card-value">¥${Math.abs(stats.totalInvestment).toLocaleString()}</span>
            </div>
            <div class="card-row">
                <span class="card-label">実現損益</span>
                <span class="card-value" style="color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}
                </span>
            </div>
            <div class="card-row">
                <span class="card-label">含み損益</span>
                <span class="card-value" style="color: ${stats.totalUnrealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                    ${stats.totalUnrealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit).toLocaleString()}
                </span>
            </div>
        </div>
    `;

    // 各銘柄のカード
    if (portfolioData.summary) {
        portfolioData.summary.forEach((row, index) => {
            const totalProfit = (row.realizedProfit || 0) + (row.unrealizedProfit || 0);
            const profitMargin = row.totalInvestment !== 0 ? ((totalProfit / Math.abs(row.totalInvestment)) * 100) : 0;

            html += `
                <div class="table-card">
                    <div class="card-header" style="color: ${totalProfit >= 0 ? '#059669' : '#dc2626'};">
                        ${row.symbol}
                        <span style="float: right; font-size: 0.9rem;">
                            ${totalProfit >= 0 ? '+' : ''}¥${Math.round(totalProfit).toLocaleString()}
                        </span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">保有量</span>
                        <span class="card-value">${parseFloat(row.holdingQuantity || 0).toFixed(6)}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">投資額</span>
                        <span class="card-value">¥${Math.abs(row.totalInvestment).toLocaleString()}</span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">実現損益</span>
                        <span class="card-value" style="color: ${row.realizedProfit >= 0 ? '#059669' : '#dc2626'};">
                            ${row.realizedProfit >= 0 ? '+' : ''}¥${Math.round(row.realizedProfit).toLocaleString()}
                        </span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">含み損益</span>
                        <span class="card-value" style="color: ${row.unrealizedProfit >= 0 ? '#059669' : '#dc2626'};">
                            ${row.unrealizedProfit >= 0 ? '+' : ''}¥${Math.round(row.unrealizedProfit || 0).toLocaleString()}
                        </span>
                    </div>
                    <div class="card-row">
                        <span class="card-label">損益率</span>
                        <span class="card-value" style="color: ${profitMargin >= 0 ? '#059669' : '#dc2626'};">
                            ${profitMargin >= 0 ? '+' : ''}${profitMargin.toFixed(1)}%
                        </span>
                    </div>
                    ${row.currentPrice ? `
                        <div class="card-row">
                            <span class="card-label">現在価格</span>
                            <span class="card-value">¥${row.currentPrice.toLocaleString()}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });
    }

    // 損益チャートをモバイル版にも追加
    html += `
        <div class="table-card" style="background: white; border: 1px solid #cbd5e1;">
            <div class="card-header">
                <span id="mobile-chart-title">📈 ポートフォリオ総合損益推移（過去1か月）</span>
                <div style="float: right; display: flex; gap: 4px;">
                    <button id="mobile-chart-mode-toggle" onclick="toggleChartMode()" style="padding: 4px 8px; background: #10b981; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;" title="個別表示に切り替え">
                        個別
                    </button>
                    <button onclick="renderAllSymbolsProfitChart()" style="padding: 4px 8px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">
                        更新
                    </button>
                </div>
            </div>
            <div style="height: 300px; padding: 10px; position: relative;">
                <canvas id="mobile-all-symbols-profit-chart" style="max-height: 300px;"></canvas>
            </div>
        </div>
    `;

    // チャート描画は displayDashboard 関数で一元管理するため、ここでは実行しない

    return `<div class="mobile-card-table">${html}</div>`;
}

// ポートフォリオテーブル生成（損益計算版）
function generatePortfolioTable(portfolioData) {
    if (isMobile()) {
        return generateMobilePortfolioCards(portfolioData);
    }
    const stats = portfolioData.stats;
    const profitColor = stats.totalRealizedProfit >= 0 ? '#27ae60' : '#e74c3c';

    let html = `
        <!-- ポートフォリオサマリー -->
        <div style="margin-bottom: 25px; background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;">
            <div style="text-align: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">📊 ポートフォリオサマリー（${stats.symbolCount}銘柄）</h3>
            </div>

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px;">
                <!-- 総合損益（最優先表示） -->
                <div style="text-align: center; padding: 12px; background: ${stats.totalProfit >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${stats.totalProfit >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">総合損益</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 600;">${stats.overallTotalProfitMargin >= 0 ? '+' : ''}${stats.overallTotalProfitMargin.toFixed(1)}%</div>
                    <div style="font-size: 10px; color: #64748b; margin-top: 1px; font-weight: 500;">実現+含み損益</div>
                </div>

                <!-- 投資額 -->
                <div style="text-align: center; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">投資額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${Math.abs(stats.totalInvestment).toLocaleString()}</div>
                </div>

                <!-- 実現損益 -->
                <div style="text-align: center; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid ${stats.totalRealizedProfit >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">実現損益</div>
                    <div style="font-size: 16px; font-weight: 700; color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}</div>
                </div>

                <!-- 含み損益 -->
                <div style="text-align: center; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid ${(stats.totalUnrealizedProfit || 0) >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">含み損益</div>
                    <div style="font-size: 16px; font-weight: 700; color: ${(stats.totalUnrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(stats.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit || 0).toLocaleString()}</div>
                </div>

                <!-- 総合損益の銘柄数 -->
                <div style="text-align: center; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #6366f1;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">損益状況</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">利益${stats.totalProfitableSymbols || 0}・損失${stats.totalLossSymbols || 0}</div>
                </div>

                <!-- 手数料 -->
                <div style="text-align: center; padding: 12px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #64748b;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">手数料</div>
                    <div style="font-size: 16px; font-weight: 700; color: #475569;">¥${stats.totalFees.toLocaleString()}</div>
                </div>
            </div>
        </div>

        <!-- 1か月の損益推移チャート -->
        <div style="margin-bottom: 25px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;" id="chart-title">📈 ポートフォリオ総合損益推移（過去1か月）</h3>
                <div style="display: flex; gap: 8px;">
                    <button id="chart-mode-toggle" onclick="toggleChartMode()" style="padding: 8px 16px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;" title="各銘柄を個別に表示">
                        個別表示
                    </button>
                    <button onclick="renderAllSymbolsProfitChart()" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                        チャート更新
                    </button>
                </div>
            </div>
            <div style="height: 400px; position: relative;">
                <canvas id="all-symbols-profit-chart" style="max-height: 400px;"></canvas>
            </div>
        </div>

        <!-- 銘柄別詳細テーブル -->
        <table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; margin-bottom: 30px; width: 100%; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); background: white;">
            <thead>
                <tr style="background-color: #e8f5e8;">
                    <th onclick="sortTable('symbol')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: left; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">銘柄 <span id="sort-symbol">${getSortIcon('symbol')}</span></th>
                    <th onclick="sortTable('currentPrice')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">現在価格 <span id="sort-currentPrice">${getSortIcon('currentPrice')}</span></th>
                    <th onclick="sortTable('averagePurchaseRate')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">平均購入レート <span id="sort-averagePurchaseRate">${getSortIcon('averagePurchaseRate')}</span></th>
                    <th onclick="sortTable('currentValue')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">評価額 <span id="sort-currentValue">${getSortIcon('currentValue')}</span></th>
                    <th onclick="sortTable('heldInvestment')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">保有分購入額 <span id="sort-heldInvestment">${getSortIcon('heldInvestment')}</span></th>
                    <th onclick="sortTable('totalInvestment')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">合計購入額 <span id="sort-totalInvestment">${getSortIcon('totalInvestment')}</span></th>
                    <th onclick="sortTable('unrealizedProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">含み損益 <span id="sort-unrealizedProfit">${getSortIcon('unrealizedProfit')}</span></th>
                    <th onclick="sortTable('realizedProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">実現損益 <span id="sort-realizedProfit" style="color: #3498db;">${getSortIcon('realizedProfit')}</span></th>
                    <th onclick="sortTable('totalProfit')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: right; font-weight: 600; font-size: 0.9rem; color: #2c3e50;">総合損益 <span id="sort-totalProfit">${getSortIcon('totalProfit')}</span></th>
                </tr>
            </thead>
            <tbody>
    `;

    portfolioData.summary.forEach(item => {
        const profitColor = item.realizedProfit > 0 ? '#27ae60' : item.realizedProfit < 0 ? '#e74c3c' : '#6c757d';
        const profitBg = item.realizedProfit > 0 ? 'rgba(39, 174, 96, 0.05)' : item.realizedProfit < 0 ? 'rgba(231, 76, 60, 0.05)' : '';

        html += `
            <tr style="transition: all 0.2s ease; ${profitBg ? `background-color: ${profitBg};` : ''}" onmouseover="this.style.backgroundColor='rgba(74, 144, 226, 0.08)'; this.style.transform='translateY(-1px)'" onmouseout="this.style.backgroundColor='${profitBg}'; this.style.transform=''">
                <td style="padding: 12px; font-weight: bold; color: #2196F3; border-bottom: 1px solid #f1f3f4;">${item.symbol}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem;">${item.currentPrice > 0 ? '¥' + item.currentPrice.toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem;">¥${item.averagePurchaseRate.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem;">${item.currentValue > 0 ? '¥' + item.currentValue.toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem;">¥${item.currentHoldingInvestment.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem;">¥${item.totalInvestment.toLocaleString()}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem; color: ${(item.unrealizedProfit || 0) >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: ${Math.abs(item.unrealizedProfit || 0) > 0 ? 'bold' : 'normal'};">${(item.unrealizedProfit || 0) !== 0 ? '¥' + Math.round(item.unrealizedProfit || 0).toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem; color: ${profitColor}; font-weight: ${Math.abs(item.realizedProfit) > 0 ? 'bold' : 'normal'};">${item.realizedProfit !== 0 ? '¥' + Math.round(item.realizedProfit).toLocaleString() : '-'}</td>
                <td style="padding: 12px; text-align: right; border-bottom: 1px solid #f1f3f4; font-size: 0.9rem; color: ${(item.totalProfit || item.realizedProfit) >= 0 ? '#27ae60' : '#e74c3c'}; font-weight: ${Math.abs(item.totalProfit || item.realizedProfit) > 0 ? 'bold' : 'normal'};">${(item.totalProfit || item.realizedProfit) !== 0 ? '¥' + Math.round(item.totalProfit || item.realizedProfit).toLocaleString() : '-'}</td>
            </tr>
        `;
    });

    html += `
            </tbody>
        </table>
    `;

    // チャートを非同期で描画（DOM更新後）
    setTimeout(() => {
        renderProfitChart(portfolioData);
    }, 100);

    return html;
}

// モバイル用取引履歴カード生成
function generateMobileTradingCards(portfolioData) {
    const allTransactions = [];
    Object.values(portfolioData.symbols).forEach(symbolData => {
        allTransactions.push(...symbolData.buyTransactions, ...symbolData.sellTransactions);
    });

    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = '';
    allTransactions.slice(0, 50).forEach((tx, index) => {
        const date = new Date(tx.date);
        const typeColor = tx.type === '買い' ? '#059669' : '#dc2626';
        const typeIcon = tx.type === '買い' ? '📈' : '📉';

        html += `
            <div class="table-card">
                <div class="card-header" style="color: ${typeColor};">
                    ${typeIcon} ${tx.symbol} - ${tx.type}
                    <span style="float: right; font-size: 0.8rem; color: #7f8c8d;">
                        ${date.getMonth() + 1}/${date.getDate()}
                    </span>
                </div>
                <div class="card-row">
                    <span class="card-label">数量</span>
                    <span class="card-value">${parseFloat(tx.quantity || 0).toFixed(6)}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">単価</span>
                    <span class="card-value">¥${(tx.rate || 0).toLocaleString()}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">総額</span>
                    <span class="card-value">¥${Math.abs(tx.amount || 0).toLocaleString()}</span>
                </div>
                <div class="card-row">
                    <span class="card-label">手数料</span>
                    <span class="card-value">¥${(tx.fee || 0).toLocaleString()}</span>
                </div>
            </div>
        `;
    });

    return `<div class="mobile-card-table">${html}</div>`;
}

// 取引履歴テーブル生成
function generateTradingHistoryTable(portfolioData) {
    if (isMobile()) {
        return generateMobileTradingCards(portfolioData);
    }
    const allTransactions = [];
    Object.values(portfolioData.symbols).forEach(symbolData => {
        allTransactions.push(...symbolData.buyTransactions, ...symbolData.sellTransactions);
    });

    // 日付順にソート
    allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    let html = `
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h4 style="color: #2c3e50; margin-bottom: 20px;">全取引履歴（新しい順）</h4>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">日時</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">銘柄</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">売買</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">数量</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">レート</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">金額</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">取引所</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    allTransactions.slice(0, 50).forEach(tx => { // 最新50件のみ表示
        const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
        html += `
            <tr>
                <td style="border: 1px solid #dee2e6; padding: 12px; font-size: 0.9rem;">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; font-weight: bold;">${tx.symbol}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; color: ${typeColor}; font-weight: bold;">${tx.type}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">${tx.quantity.toFixed(8)}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">¥${tx.rate.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right;">¥${tx.amount.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-size: 0.85rem;">${tx.exchange}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
            ${allTransactions.length > 50 ? `<p style="color: #7f8c8d; text-align: center; margin-top: 15px;">※最新50件のみ表示（全${allTransactions.length}件）</p>` : ''}
        </div>
    `;
    return html;
}

// 個別銘柄詳細ページ生成
function generateSymbolDetailPage(symbolSummary, symbolData) {
    const profitColor = symbolSummary.realizedProfit >= 0 ? '#27ae60' : '#e74c3c';
    const profitIcon = symbolSummary.realizedProfit > 0 ? '📈' : symbolSummary.realizedProfit < 0 ? '📉' : '➖';

    let html = `
        <!-- 銘柄サマリーカード -->
        <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b;">${symbolSummary.symbol} 詳細分析</h3>
                <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">個別銘柄の取引履歴・統計・損益分析</p>
            </div>

            <!-- 損益カード（1行目） -->
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
                <!-- 総合損益 -->
                <div style="text-align: center; padding: 15px; background: ${symbolSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : (symbolSummary.totalProfit || symbolSummary.realizedProfit) >= 0 ? 'linear-gradient(135deg, #d4f1d4 0%, #a8e6a8 100%)' : 'linear-gradient(135deg, #fcd4d4 0%, #f8a8a8 100%)'}; border-radius: 8px; border: 3px solid ${symbolSummary.totalSellAmount === 0 ? '#9ca3af' : (symbolSummary.totalProfit || symbolSummary.realizedProfit) >= 0 ? '#059669' : '#dc2626'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 700;">総合損益</div>
                    <div style="font-size: 20px; font-weight: 900; color: ${symbolSummary.totalSellAmount === 0 ? '#6b7280' : (symbolSummary.totalProfit || symbolSummary.realizedProfit) >= 0 ? '#047857' : '#b91c1c'};">${symbolSummary.totalSellAmount === 0 ? '⏳ ' : profitIcon + ' '}${symbolSummary.totalSellAmount === 0 ? '未確定' : ((symbolSummary.totalProfit || symbolSummary.realizedProfit) >= 0 ? '+' : '') + '¥' + Math.round(symbolSummary.totalProfit || symbolSummary.realizedProfit).toLocaleString()}</div>
                </div>

                <!-- 実現損益 -->
                <div style="text-align: center; padding: 15px; background: ${symbolSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : symbolSummary.realizedProfit >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${symbolSummary.totalSellAmount === 0 ? '#9ca3af' : symbolSummary.realizedProfit >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">実現損益</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${symbolSummary.totalSellAmount === 0 ? '#6b7280' : symbolSummary.realizedProfit >= 0 ? '#059669' : '#dc2626'};">${symbolSummary.totalSellAmount === 0 ? '⏳ 未確定' : (symbolSummary.realizedProfit >= 0 ? '+' : '') + '¥' + Math.round(symbolSummary.realizedProfit).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 600;">${symbolSummary.totalSellAmount === 0 ? '' : (symbolSummary.investmentEfficiency >= 0 ? '+' : '') + symbolSummary.investmentEfficiency.toFixed(1) + '%'}</div>
                </div>

                <!-- 含み損益 -->
                <div style="text-align: center; padding: 15px; background: ${(symbolSummary.unrealizedProfit || 0) >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${(symbolSummary.unrealizedProfit || 0) >= 0 ? '#10b981' : '#ef4444'};">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">含み損益</div>
                    <div style="font-size: 18px; font-weight: 800; color: ${(symbolSummary.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(symbolSummary.unrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(symbolSummary.unrealizedProfit || 0).toLocaleString()}</div>
                    <div style="font-size: 11px; color: #64748b; margin-top: 2px; font-weight: 600;">${symbolSummary.currentHoldingInvestment > 0 ? ((symbolSummary.unrealizedProfit || 0) >= 0 ? '+' : '') + (((symbolSummary.unrealizedProfit || 0) / symbolSummary.currentHoldingInvestment) * 100).toFixed(1) + '%' : ''}</div>
                </div>
            </div>

            <!-- 詳細統計（2行目） -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
                <!-- 保有数量 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">保有数量</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${parseFloat(symbolSummary.holdingQuantity.toFixed(8))}</div>
                </div>

                <!-- 平均購入レート -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #8b5cf6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">平均購入レート</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${symbolSummary.averagePurchaseRate.toLocaleString()}</div>
                </div>

                <!-- 総投資額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">総投資額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${symbolSummary.totalInvestment.toLocaleString()}</div>
                </div>

                <!-- 売却金額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #06b6d4;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">売却金額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${symbolSummary.totalSellAmount.toLocaleString()}</div>
                </div>

                <!-- 取引回数 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #84cc16;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">取引回数</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">買${symbolSummary.buyTransactionCount}回・売${symbolSummary.sellTransactionCount}回</div>
                </div>

                <!-- 現在価格 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #ec4899;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在価格</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${symbolSummary.currentPrice > 0 ? '¥' + symbolSummary.currentPrice.toLocaleString() : '取得中...'}</div>
                </div>

                <!-- 現在評価額 -->
                <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #14b8a6;">
                    <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在評価額</div>
                    <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${symbolSummary.currentValue > 0 ? '¥' + Math.round(symbolSummary.currentValue).toLocaleString() : '計算中...'}</div>
                </div>
            </div>
        </div>

        <!-- 総合損益推移チャート（全銘柄対応） -->
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-bottom: 25px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <h4 style="color: #2c3e50; margin: 0;">📈 ${symbolSummary.symbol} 総合損益推移チャート（過去1か月・日次）</h4>
                <button onclick="renderSymbolProfitChart('${symbolSummary.symbol}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                    チャート更新
                </button>
            </div>
            <p style="color: #6c757d; font-size: 0.9rem; margin-bottom: 20px;">
                💡 ${symbolSummary.symbol}の過去1か月の価格変動に基づく日次総合損益推移<br>
                🟢 実線: 総合損益（実現+含み） | 🔵 点線: 実現損益のみ | 🟡 点線: 含み損益のみ<br>
                📊 価格データ: CoinGecko API（日次更新・キャッシュ対応）<br>
                ⚡ 対応銘柄: BTC, ETH, SOL, XRP, ADA, DOGE, ASTR, XTZ, XLM, SHIB, PEPE, SUI, DAI
            </p>
            <div style="height: 400px; position: relative;">
                <canvas id="${symbolSummary.symbol.toLowerCase()}-profit-chart" style="max-height: 400px;"></canvas>
            </div>
        </div>

        <!-- 取引履歴テーブル -->
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <h4 style="color: #2c3e50; margin-bottom: 20px;">📊 ${symbolSummary.symbol} 全取引履歴（${symbolData.allTransactions.length}件）</h4>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa;">
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: left; font-weight: 600; color: #495057;">日時</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">売買</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">数量</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">レート</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-weight: 600; color: #495057;">金額</th>
                            <th style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-weight: 600; color: #495057;">取引所</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

    // 取引履歴を日付順に並び替え（新しい順）
    const sortedTransactions = [...symbolData.allTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

    sortedTransactions.forEach(tx => {
        const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
        const typeBg = tx.type === '買' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';

        html += `
            <tr style="background-color: ${typeBg};">
                <td style="border: 1px solid #dee2e6; padding: 12px; font-size: 0.9rem;">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; color: ${typeColor}; font-weight: bold; font-size: 0.95rem;">${tx.type}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace;">${parseFloat(tx.quantity.toFixed(8))}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace;">¥${tx.rate.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: right; font-family: monospace; font-weight: 600;">¥${tx.amount.toLocaleString()}</td>
                <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; font-size: 0.85rem; font-weight: 600;">${tx.exchange}</td>
            </tr>
        `;
    });

    html += `
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // 全銘柄にチャートを追加
    html += `
        <!-- ${symbolSummary.symbol}価格チャート -->
        <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin-top: 25px;">
            <h4 style="color: #2c3e50; margin-bottom: 20px;">📈 ${symbolSummary.symbol} 価格チャート（30日間）</h4>
            <div id="${symbolSummary.symbol.toLowerCase()}-chart-container" style="position: relative; height: 400px; background: white; border-radius: 8px;">
                <canvas id="${symbolSummary.symbol.toLowerCase()}-chart-canvas"></canvas>
            </div>
        </div>
    `;

    return html;
}

// ===================================================================
// PROFIT CHART FUNCTIONS
// ===================================================================

// 直近1か月の損益推移データを計算
function calculateMonthlyProfitData(portfolioData) {
    const today = new Date();
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(today.getMonth() - 1);

    // 全取引を日付順でソート
    const allTransactions = [];
    Object.values(portfolioData.symbols).forEach(symbolData => {
        allTransactions.push(...symbolData.allTransactions);
    });
    allTransactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // 日別の損益を計算
    const dailyData = {};
    let cumulativeProfit = 0;

    // 1か月前から今日まで、1日ずつ処理
    for (let d = new Date(oneMonthAgo); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];

        // その日の取引を処理
        const dayTransactions = allTransactions.filter(tx => {
            const txDate = new Date(tx.date).toISOString().split('T')[0];
            return txDate === dateStr;
        });

        let dayProfit = 0;
        dayTransactions.forEach(tx => {
            if (tx.type === '売') {
                // 売却時の損益（簡易計算）
                const avgRate = tx.averagePurchaseRate || 0;
                if (avgRate > 0) {
                    dayProfit += (tx.rate - avgRate) * tx.quantity;
                }
            }
        });

        cumulativeProfit += dayProfit;
        dailyData[dateStr] = cumulativeProfit;
    }

    return dailyData;
}

// 損益チャートを描画
function renderProfitChart(portfolioData) {
    const canvas = document.getElementById('profitChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // 既存のチャートを破棄
    if (window.profitChartInstance) {
        window.profitChartInstance.destroy();
    }

    const dailyData = calculateMonthlyProfitData(portfolioData);
    const dates = Object.keys(dailyData).sort();
    const profits = dates.map(date => dailyData[date]);

    // 現在の総合損益も追加（最新の点として）
    const currentTotalProfit = portfolioData.stats.totalProfit || portfolioData.stats.totalRealizedProfit || 0;
    const today = new Date().toISOString().split('T')[0];
    if (!dailyData[today]) {
        dates.push(today);
        profits.push(currentTotalProfit);
    }

    window.profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates.map(date => {
                const d = new Date(date);
                return `${d.getMonth() + 1}/${d.getDate()}`;
            }),
            datasets: [{
                label: '総合損益 (¥)',
                data: profits,
                borderColor: profits[profits.length - 1] >= 0 ? '#10b981' : '#ef4444',
                backgroundColor: profits[profits.length - 1] >= 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: profits.map(p => p >= 0 ? '#10b981' : '#ef4444'),
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    borderColor: '#64748b',
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            const value = context.parsed.y;
                            const sign = value >= 0 ? '+' : '';
                            return `損益: ${sign}¥${Math.round(value).toLocaleString()}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 11
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(0, 0, 0, 0.05)',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#64748b',
                        font: {
                            size: 11
                        },
                        callback: function (value) {
                            return value >= 0 ? '+¥' + Math.abs(value).toLocaleString() : '-¥' + Math.abs(value).toLocaleString();
                        }
                    },
                    beginAtZero: true
                }
            }
        }
    });
}