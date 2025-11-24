// ========== UI-SERVICE.JS - UI操作の統合管理 ==========

/**
 * メッセージ管理クラス
 * 全てのメッセージ表示を統一的に処理
 */
class MessageManager {
    /**
     * メッセージを表示
     * @param {string} message - メッセージ内容
     * @param {string} type - メッセージタイプ ('success', 'error', 'warning', 'info')
     */
    show(message, type = 'success') {
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
            align-items: flex-start;
            gap: 8px;
            line-height: 1.4;
        `;

        toast.innerHTML = `
            <span>${icons[type] || icons.success}</span>
            <span style="white-space: pre-line;">${message}</span>
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

    showSuccess(message) {
        this.show(message, 'success');
    }

    showError(message) {
        this.show(message, 'error');
    }

    showWarning(message) {
        this.show(message, 'warning');
    }

    showInfo(message) {
        this.show(message, 'info');
    }
}

/**
 * タブ管理クラス
 * メインタブとサブタブの切り替えを管理
 */
class TabManager {
    /**
     * メインタブを切り替え
     * @param {string} tabName - タブ名 ('portfolio', 'trading')
     */
    switchMainTab(tabName) {
        // 全タブボタンのアクティブ状態をリセット
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        // 選択されたタブをアクティブに
        const tabButton = document.querySelector(`[onclick="switchTab('${tabName}')"]`);
        if (tabButton) {
            tabButton.classList.add('active');
        }

        const tabContent = document.getElementById(`tab-${tabName}`);
        if (tabContent) {
            tabContent.classList.add('active');
        }
    }

    /**
     * サブタブを切り替え
     * @param {string} subtabName - サブタブ名 ('summary', 'btc', 'eth', ...)
     */
    switchSubTab(subtabName) {
        // 全サブタブボタンのアクティブ状態をリセット
        const allButtons = document.querySelectorAll('.subtab-button');
        const allContents = document.querySelectorAll('.subtab-content');

        allButtons.forEach(btn => {
            btn.classList.remove('active');
            btn.style.backgroundColor = '';
            // 非アクティブボタンは損益の色を復元（data属性から）
            if (btn.dataset.profitColor) {
                btn.style.borderColor = btn.dataset.profitColor;
                btn.style.color = btn.dataset.profitColor;
            }
        });
        allContents.forEach(content => content.classList.remove('active'));

        // 選択されたサブタブをアクティブにする
        const targetButton = document.getElementById(`subtab-${subtabName}`);
        const targetContent = document.getElementById(`subtab-content-${subtabName}`);

        if (targetButton) {
            targetButton.classList.add('active');
            // アクティブボタンは青背景・白文字にするため、損益の色をクリア
            targetButton.style.borderColor = '';
            targetButton.style.color = '';
        }

        if (targetContent) {
            targetContent.classList.add('active');
        }

        // 個別銘柄タブの場合、チャートを自動描画
        if (subtabName !== 'summary' && typeof window.renderCoinProfitChart === 'function') {
            const coinName = subtabName.toUpperCase();
            // DOM準備後にチャートを描画
            setTimeout(() => {
                window.renderCoinProfitChart(coinName);
            }, 100);
        }
    }

    /**
     * 前のサブタブに移動
     */
    switchToPreviousSubTab() {
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

    /**
     * 次のサブタブに移動
     */
    switchToNextSubTab() {
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

    /**
     * 銘柄別サブタブを生成
     * @param {object} portfolioData - ポートフォリオデータ
     * @param {TableRenderer} tableRenderer - テーブルレンダラー
     */
    createCoinSubTabs(portfolioData, tableRenderer) {
        if (!portfolioData || !portfolioData.summary || portfolioData.summary.length === 0) {
            console.error('❌ Invalid portfolio data for subtab creation');
            return;
        }

        const subtabNav = document.getElementById('subtab-nav');
        const coinNameContainer = document.getElementById('coinName-subtabs-container');

        if (!subtabNav || !coinNameContainer) {
            console.error('❌ Required DOM elements not found');
            return;
        }

        // 既存の銘柄サブタブをクリア
        subtabNav.querySelectorAll('.coinName-subtab').forEach(tab => tab.remove());
        coinNameContainer.innerHTML = '';

        // 実現損益で降順ソート
        const sortedCoinNames = [...portfolioData.summary].sort((a, b) => b.realizedProfit - a.realizedProfit);

        sortedCoinNames.forEach((coinNameData) => {
            try {
                if (!coinNameData || !coinNameData.coinName) {
                    console.error('❌ Invalid coin data:', coinNameData);
                    return;
                }

                // サブタブボタンを作成
                const tabButton = document.createElement('button');
                tabButton.className = 'subtab-button coinName-subtab';
                tabButton.id = `subtab-${coinNameData.coinName.toLowerCase()}`;
                tabButton.textContent = coinNameData.coinName;
                tabButton.onclick = () => this.switchSubTab(coinNameData.coinName.toLowerCase());

                // 損益に応じて色分け（data属性に保存して切り替え時に復元できるようにする）
                let profitColor = '';
                if (coinNameData.realizedProfit > 0) {
                    profitColor = '#10b981'; // 緑色（より洗練された緑）
                    tabButton.style.borderColor = profitColor;
                    tabButton.style.color = profitColor;
                } else if (coinNameData.realizedProfit < 0) {
                    profitColor = '#ef4444'; // 赤色（より洗練された赤）
                    tabButton.style.borderColor = profitColor;
                    tabButton.style.color = profitColor;
                }
                // data属性に色を保存
                if (profitColor) {
                    tabButton.dataset.profitColor = profitColor;
                }

                // ホバー効果
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
                tabContent.id = `subtab-content-${coinNameData.coinName.toLowerCase()}`;

                if (tableRenderer) {
                    tabContent.innerHTML = tableRenderer.renderCoinDetailPage(coinNameData);
                } else {
                    tabContent.innerHTML = `<div>詳細データが見つかりません: ${coinNameData.coinName}</div>`;
                }

                coinNameContainer.appendChild(tabContent);

            } catch (error) {
                console.error(`❌ Error creating subtab for ${coinNameData?.coinName || 'unknown'}:`, error);
            }
        });
    }
}

/**
 * テーブルレンダラークラス
 * 全てのテーブル・カード描画を管理
 */
class TableRenderer {
    /**
     * ポートフォリオテーブルを描画
     * @param {object} portfolioData - ポートフォリオデータ
     * @param {boolean} isMobile - モバイルデバイスかどうか
     * @returns {string} HTMLマークアップ
     */
    renderPortfolioTable(portfolioData, isMobile = false) {
        if (isMobile) {
            return this._renderMobilePortfolioCards(portfolioData);
        }
        return this._renderDesktopPortfolioTable(portfolioData);
    }

    /**
     * 取引履歴テーブルを描画
     * @param {object} portfolioData - ポートフォリオデータ
     * @param {boolean} isMobile - モバイルデバイスかどうか
     * @returns {string} HTMLマークアップ
     */
    renderTradingHistoryTable(portfolioData, isMobile = false) {
        if (isMobile) {
            return this._renderMobileTradingCards(portfolioData);
        }
        return this._renderDesktopTradingHistoryTable(portfolioData);
    }

    /**
     * 個別銘柄詳細ページを描画
     * @param {object} coinSummary - 銘柄サマリーデータ
     * @param {object} coinDetailData - 銘柄詳細データ
     * @returns {string} HTMLマークアップ
     */
    renderCoinDetailPage(coinSummary) {
        const profitColor = coinSummary.realizedProfit >= 0 ? '#27ae60' : '#e74c3c';
        const profitIcon = coinSummary.realizedProfit > 0 ? '📈' : coinSummary.realizedProfit < 0 ? '📉' : '➖';

        // 価格フォーマット関数
        const formatPrice = (price) => {
            if (price >= 1) {
                // 1円以上は整数表示
                return '¥' + Math.round(price).toLocaleString();
            } else if (price > 0) {
                // 1円未満は10^-3単位で表示
                const mantissa = (price * 1000).toFixed(3);
                return `¥${mantissa}×10<sup>-3</sup>`;
            }
            return '取得中...';
        };

        // 価格比較の計算
        const currentPrice = coinSummary.currentPrice;
        const avgPrice = coinSummary.averagePurchaseRate;
        const isHigher = currentPrice > avgPrice;
        const priceDiff = currentPrice - avgPrice;
        const diffPercent = avgPrice > 0 ? ((priceDiff / avgPrice) * 100).toFixed(1) : 0;

        let html = `
            <!-- 銘柄サマリーカード -->
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b;">${coinSummary.coinName} 詳細分析</h3>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">個別銘柄の取引履歴・統計・損益分析</p>
                </div>

                <!-- 重要指標（大きく表示） -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 15px; margin-bottom: 20px;">
                    <!-- 総合損益 -->
                    <div style="text-align: center; padding: 20px; background: ${(coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 10px; border: 2px solid ${(coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '#86efac' : '#fca5a5'}; box-shadow: 0 2px 6px ${(coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};">
                        <div class="text-label-caps">総合損益</div>
                        <div style="font-size: 24px; font-weight: 800; color: ${(coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '#059669' : '#dc2626'}; line-height: 1.2;">${(coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '+' : ''}¥${Math.round(coinSummary.totalProfit || coinSummary.realizedProfit).toLocaleString()}</div>
                    </div>

                    <!-- 実現損益 -->
                    <div style="text-align: center; padding: 20px; background: ${coinSummary.realizedProfit >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 10px; border: 2px solid ${coinSummary.realizedProfit >= 0 ? '#86efac' : '#fca5a5'}; box-shadow: 0 2px 6px ${coinSummary.realizedProfit >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};">
                        <div class="text-label-caps">実現損益</div>
                        <div style="font-size: 24px; font-weight: 800; color: ${coinSummary.realizedProfit >= 0 ? '#059669' : '#dc2626'}; line-height: 1.2;">${coinSummary.realizedProfit >= 0 ? '+' : ''}¥${Math.round(coinSummary.realizedProfit).toLocaleString()}</div>
                    </div>

                    <!-- 含み損益 -->
                    <div style="text-align: center; padding: 20px; background: ${(coinSummary.unrealizedProfit || 0) >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 10px; border: 2px solid ${(coinSummary.unrealizedProfit || 0) >= 0 ? '#86efac' : '#fca5a5'}; box-shadow: 0 2px 6px ${(coinSummary.unrealizedProfit || 0) >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};">
                        <div class="text-label-caps">含み損益</div>
                        <div style="font-size: 24px; font-weight: 800; color: ${(coinSummary.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'}; line-height: 1.2;">${(coinSummary.unrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(coinSummary.unrealizedProfit || 0).toLocaleString()}</div>
                    </div>
                </div>

                <!-- 価格情報（やや強調） -->
                <div style="margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid #e5e7eb;">
                    <div style="text-align: center; padding: 20px; background: ${isHigher ? '#f0fdf4' : '#fef2f2'}; border-radius: 8px; border: 2px solid ${isHigher ? '#86efac' : '#fca5a5'}; max-width: 450px; margin: 0 auto;">
                        <div style="font-size: 11px; color: #6b7280; margin-bottom: 8px; font-weight: 600;">価格</div>
                        <div style="font-size: 20px; font-weight: 700; color: #111827; line-height: 1.4;">
                            ${currentPrice > 0 ? formatPrice(currentPrice) : '取得中...'} <span style="color: #9ca3af; font-weight: 400;">/</span> ${formatPrice(avgPrice)}
                        </div>
                        <div style="font-size: 10px; color: #9ca3af; margin-top: 6px; letter-spacing: 0.3px;">現在価格 / 平均購入価格</div>
                        ${currentPrice > 0 ? `
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed ${isHigher ? '#86efac' : '#fca5a5'};">
                            <div style="font-size: 14px; font-weight: 600; color: ${isHigher ? '#059669' : '#dc2626'};">
                                ${isHigher ? '▲' : '▼'} ${isHigher ? '+' : ''}${diffPercent}%
                            </div>
                            <div style="font-size: 10px; color: #9ca3af; margin-top: 2px;">平均購入価格との差</div>
                        </div>
                        ` : ''}
                    </div>
                </div>

                <!-- その他の情報（控えめに表示） -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px;">
                    <div class="stat-card">
                        <div class="text-label-xs">現在評価額</div>
                        <div class="text-value-md">${coinSummary.currentValue > 0 ? '¥' + Math.round(coinSummary.currentValue).toLocaleString() : '計算中...'}</div>
                    </div>
                    <div class="stat-card">
                        <div class="text-label-xs">保有数量</div>
                        <div class="text-value-md">${parseFloat(coinSummary.holdingQuantity.toFixed(8))}</div>
                    </div>
                    <div class="stat-card">
                        <div class="text-label-xs">総投資額</div>
                        <div class="text-value-md">¥${coinSummary.totalInvestment.toLocaleString()}</div>
                    </div>
                    <div class="stat-card">
                        <div class="text-label-xs">売却金額</div>
                        <div class="text-value-md">¥${coinSummary.totalSellAmount.toLocaleString()}</div>
                    </div>
                    <div class="stat-card">
                        <div class="text-label-xs">取引回数</div>
                        <div class="text-value-md">買${coinSummary.buyTransactionCount}回・売${coinSummary.sellTransactionCount}回</div>
                    </div>
                </div>
            </div>

            <!-- 銘柄チャート -->
            <div style="background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #1e293b;">📈 ${coinSummary.coinName} 含み損益推移（過去1か月）</h3>
                    <button onclick="renderCoinProfitChart('${coinSummary.coinName}')" style="padding: 8px 16px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500;">
                        チャート更新
                    </button>
                </div>
                <div style="height: 350px; position: relative;">
                    <canvas id="${coinSummary.coinName.toLowerCase()}-profit-chart" style="max-height: 350px;"></canvas>
                </div>
            </div>

            <!-- 取引履歴テーブル -->
            <div class="info-box">
        `;

        // rawTransactionsから該当銘柄の取引を取得
        const transactions = getTransactionsByCoin(coinSummary.coinName);

        html += `
                <h4 class="text-section-title">📊 ${coinSummary.coinName} 全取引履歴（${transactions.all.length}件）</h4>
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr class="table-header-bg">
                                <th class="table-cell-left">日時</th>
                                <th class="table-cell-center">売買</th>
                                <th class="table-cell-right">数量</th>
                                <th class="table-cell-right">レート</th>
                                <th class="table-cell-right">金額</th>
                                <th class="table-cell-center">取引所</th>
                            </tr>
                        </thead>
                        <tbody>
        `;

        // 取引履歴を日付順に並び替え（新しい順）
        const sortedTransactions = [...transactions.all].sort((a, b) => new Date(b.date) - new Date(a.date));

        sortedTransactions.forEach(tx => {
            const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
            const typeBg = tx.type === '買' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';

            html += `
                <tr style="background-color: ${typeBg};">
                    <td class="table-cell-plain">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                    <td style="border: 1px solid #dee2e6; padding: 12px; text-align: center; color: ${typeColor}; font-weight: bold; font-size: 0.95rem;">${tx.type}</td>
                    <td class="table-cell-mono">${parseFloat(tx.quantity.toFixed(8))}</td>
                    <td class="table-cell-mono">¥${tx.rate.toLocaleString()}</td>
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

        return html;
    }

    // ===================================================================
    // 内部メソッド（デスクトップ版）
    // ===================================================================

    _renderDesktopPortfolioTable(portfolioData) {
        // portfolio.jsのgeneratePortfolioTable関数と同じロジック
        // 詳細は省略（既存のコードをそのまま移植）
        return generatePortfolioTable(portfolioData);
    }

    _renderDesktopTradingHistoryTable(portfolioData) {
        // portfolio.jsのgenerateTradingHistoryTable関数と同じロジック
        // 詳細は省略（既存のコードをそのまま移植）
        return generateTradingHistoryTable(portfolioData);
    }

    // ===================================================================
    // 内部メソッド（モバイル版）
    // ===================================================================

    _renderMobilePortfolioCards(portfolioData) {
        // portfolio.jsのgenerateMobilePortfolioCards関数と同じロジック
        // 詳細は省略（既存のコードをそのまま移植）
        return generateMobilePortfolioCards(portfolioData);
    }

    _renderMobileTradingCards(portfolioData) {
        // portfolio.jsのgenerateMobileTradingCards関数と同じロジック
        // 詳細は省略（既存のコードをそのまま移植）
        return generateMobileTradingCards(portfolioData);
    }
}

/**
 * 進捗バー管理クラス
 * 長時間かかる処理の進捗を表示
 */
class ProgressManager {
    constructor() {
        this.modal = null;
        this.overlay = null;
        this.isVisible = false;
    }

    /**
     * 進捗バーを表示
     * @param {string} title - タイトル
     * @param {number} total - 全体の数
     * @param {string} subtitle - サブタイトル（オプション）
     */
    show(title = '処理中...', total = 100, subtitle = '') {
        if (this.isVisible) {
            return;
        }

        // オーバーレイ作成
        this.overlay = document.createElement('div');
        this.overlay.id = 'progress-overlay';
        this.overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 9998;
            opacity: 0;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(this.overlay);

        // モーダル作成
        this.modal = document.createElement('div');
        this.modal.id = 'progress-modal';
        this.modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            z-index: 9999;
            min-width: 400px;
            max-width: 90vw;
            opacity: 0;
            transition: opacity 0.3s;
        `;

        this.modal.innerHTML = `
            <h3 id="progress-title" style="margin: 0 0 10px 0; font-size: 18px; color: #1e293b;">${title}</h3>
            <p id="progress-subtitle" style="margin: 0 0 20px 0; color: #64748b; font-size: 14px;">${subtitle}</p>
            <div style="margin: 20px 0;">
                <div style="background: #e0e0e0; height: 8px; border-radius: 4px; overflow: hidden;">
                    <div id="progress-bar" style="background: linear-gradient(90deg, #3b82f6, #2563eb); height: 100%; width: 0%; transition: width 0.3s;"></div>
                </div>
            </div>
            <p id="progress-text" style="margin: 10px 0 0 0; color: #475569; font-size: 14px;">準備中...</p>
            <p id="progress-info" style="margin: 10px 0 0 0; color: #94a3b8; font-size: 12px;">
                API制限対策のため、3秒間隔で取得しています
            </p>
        `;

        document.body.appendChild(this.modal);

        // アニメーション開始
        setTimeout(() => {
            this.overlay.style.opacity = '1';
            this.modal.style.opacity = '1';
        }, 10);

        this.isVisible = true;
        this.total = total;
    }

    /**
     * 進捗を更新
     * @param {number} current - 現在の進捗
     * @param {number} total - 全体の数
     * @param {string} message - メッセージ
     */
    update(current, total, message = '') {
        if (!this.isVisible) {
            return;
        }

        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');

        if (progressBar && progressText) {
            const percentage = Math.min(100, Math.round((current / total) * 100));
            progressBar.style.width = `${percentage}%`;

            if (message) {
                progressText.textContent = message;
            } else {
                progressText.textContent = `${current} / ${total}`;
            }
        }
    }

    /**
     * サブタイトルを更新
     * @param {string} subtitle - 新しいサブタイトル
     */
    updateSubtitle(subtitle) {
        if (!this.isVisible) {
            return;
        }

        const subtitleElement = document.getElementById('progress-subtitle');
        if (subtitleElement) {
            subtitleElement.textContent = subtitle;
        }
    }

    /**
     * 進捗バーを非表示
     */
    hide() {
        if (!this.isVisible) {
            return;
        }

        // フェードアウト
        if (this.modal) {
            this.modal.style.opacity = '0';
        }
        if (this.overlay) {
            this.overlay.style.opacity = '0';
        }

        // 削除
        setTimeout(() => {
            if (this.modal && this.modal.parentNode) {
                this.modal.parentNode.removeChild(this.modal);
            }
            if (this.overlay && this.overlay.parentNode) {
                this.overlay.parentNode.removeChild(this.overlay);
            }
            this.modal = null;
            this.overlay = null;
            this.isVisible = false;
        }, 300);
    }
}

/**
 * UIサービスクラス
 * 全てのUI操作を統合的に管理
 */
class UIService {
    constructor() {
        this.messageManager = new MessageManager();
        this.tabManager = new TabManager();
        this.tableRenderer = new TableRenderer();
        this.progress = new ProgressManager();
    }

    // メッセージ管理への委譲
    showMessage(message, type) {
        this.messageManager.show(message, type);
    }

    showSuccess(message) {
        this.messageManager.showSuccess(message);
    }

    showError(message) {
        this.messageManager.showError(message);
    }

    showWarning(message) {
        this.messageManager.showWarning(message);
    }

    showInfo(message) {
        this.messageManager.showInfo(message);
    }

    // タブ管理への委譲
    switchMainTab(tabName) {
        this.tabManager.switchMainTab(tabName);
    }

    switchSubTab(subtabName) {
        this.tabManager.switchSubTab(subtabName);
    }

    switchToPreviousSubTab() {
        this.tabManager.switchToPreviousSubTab();
    }

    switchToNextSubTab() {
        this.tabManager.switchToNextSubTab();
    }

    createCoinSubTabs(portfolioData) {
        this.tabManager.createCoinSubTabs(portfolioData, this.tableRenderer);
    }

    // テーブル描画への委譲
    renderPortfolioTable(portfolioData, isMobile) {
        return this.tableRenderer.renderPortfolioTable(portfolioData, isMobile);
    }

    renderTradingHistoryTable(portfolioData, isMobile) {
        return this.tableRenderer.renderTradingHistoryTable(portfolioData, isMobile);
    }

    renderCoinDetailPage(coinSummary) {
        return this.tableRenderer.renderCoinDetailPage(coinSummary);
    }
}

// グローバルシングルトンインスタンスを作成
window.uiService = new UIService();

// 後方互換性のためのエクスポート
window.UIService = UIService;
window.MessageManager = MessageManager;
window.TabManager = TabManager;
window.TableRenderer = TableRenderer;
window.ProgressManager = ProgressManager;
