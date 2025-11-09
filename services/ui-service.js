// ===================================================================
// UI-SERVICE.JS - UI操作の統合管理
// ===================================================================

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
        });
        allContents.forEach(content => content.classList.remove('active'));

        // 選択されたサブタブをアクティブにする
        const targetButton = document.getElementById(`subtab-${subtabName}`);
        const targetContent = document.getElementById(`subtab-content-${subtabName}`);

        if (targetButton) {
            targetButton.classList.add('active');
        }

        if (targetContent) {
            targetContent.classList.add('active');
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

                // 損益に応じて色分け
                if (coinNameData.realizedProfit > 0) {
                    tabButton.style.borderColor = '#28a745';
                    tabButton.style.color = '#28a745';
                } else if (coinNameData.realizedProfit < 0) {
                    tabButton.style.borderColor = '#dc3545';
                    tabButton.style.color = '#dc3545';
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

                const coinNameDetailData = portfolioData.coins[coinNameData.coinName];
                if (coinNameDetailData && tableRenderer) {
                    tabContent.innerHTML = tableRenderer.renderCoinDetailPage(coinNameData, coinNameDetailData);
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
    renderCoinDetailPage(coinSummary, coinDetailData) {
        const profitColor = coinSummary.realizedProfit >= 0 ? '#27ae60' : '#e74c3c';
        const profitIcon = coinSummary.realizedProfit > 0 ? '📈' : coinSummary.realizedProfit < 0 ? '📉' : '➖';

        let html = `
            <!-- 銘柄サマリーカード -->
            <div style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; margin-bottom: 25px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <div style="text-align: center; margin-bottom: 15px;">
                    <h3 style="margin: 0; font-size: 24px; font-weight: 700; color: #1e293b;">${coinSummary.coinName} 詳細分析</h3>
                    <p style="margin: 5px 0 0 0; font-size: 14px; color: #64748b;">個別銘柄の取引履歴・統計・損益分析</p>
                </div>

                <!-- 損益カード -->
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; margin-bottom: 15px;">
                    <!-- 総合損益 -->
                    <div style="text-align: center; padding: 15px; background: ${coinSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : (coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? 'linear-gradient(135deg, #d4f1d4 0%, #a8e6a8 100%)' : 'linear-gradient(135deg, #fcd4d4 0%, #f8a8a8 100%)'}; border-radius: 8px; border: 3px solid ${coinSummary.totalSellAmount === 0 ? '#9ca3af' : (coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '#059669' : '#dc2626'};">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 700;">総合損益</div>
                        <div style="font-size: 20px; font-weight: 900; color: ${coinSummary.totalSellAmount === 0 ? '#6b7280' : (coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '#047857' : '#b91c1c'};">${coinSummary.totalSellAmount === 0 ? '⏳ 未確定' : profitIcon + ' ' + ((coinSummary.totalProfit || coinSummary.realizedProfit) >= 0 ? '+' : '') + '¥' + Math.round(coinSummary.totalProfit || coinSummary.realizedProfit).toLocaleString()}</div>
                    </div>

                    <!-- 実現損益 -->
                    <div style="text-align: center; padding: 15px; background: ${coinSummary.totalSellAmount === 0 ? 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)' : coinSummary.realizedProfit >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${coinSummary.totalSellAmount === 0 ? '#9ca3af' : coinSummary.realizedProfit >= 0 ? '#10b981' : '#ef4444'};">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">実現損益</div>
                        <div style="font-size: 18px; font-weight: 800; color: ${coinSummary.totalSellAmount === 0 ? '#6b7280' : coinSummary.realizedProfit >= 0 ? '#059669' : '#dc2626'};">${coinSummary.totalSellAmount === 0 ? '⏳ 未確定' : (coinSummary.realizedProfit >= 0 ? '+' : '') + '¥' + Math.round(coinSummary.realizedProfit).toLocaleString()}</div>
                    </div>

                    <!-- 含み損益 -->
                    <div style="text-align: center; padding: 15px; background: ${(coinSummary.unrealizedProfit || 0) >= 0 ? 'linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)' : 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)'}; border-radius: 8px; border: 2px solid ${(coinSummary.unrealizedProfit || 0) >= 0 ? '#10b981' : '#ef4444'};">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 600;">含み損益</div>
                        <div style="font-size: 18px; font-weight: 800; color: ${(coinSummary.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(coinSummary.unrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(coinSummary.unrealizedProfit || 0).toLocaleString()}</div>
                    </div>
                </div>

                <!-- 詳細統計 -->
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 15px;">
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">保有数量</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${parseFloat(coinSummary.holdingQuantity.toFixed(8))}</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #8b5cf6;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">平均購入レート</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinSummary.averagePurchaseRate.toLocaleString()}</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #f59e0b;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">総投資額</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinSummary.totalInvestment.toLocaleString()}</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #06b6d4;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">売却金額</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">¥${coinSummary.totalSellAmount.toLocaleString()}</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #84cc16;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">取引回数</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">買${coinSummary.buyTransactionCount}回・売${coinSummary.sellTransactionCount}回</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #ec4899;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在価格</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${coinSummary.currentPrice > 0 ? '¥' + coinSummary.currentPrice.toLocaleString() : '取得中...'}</div>
                    </div>
                    <div style="text-align: center; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #14b8a6;">
                        <div style="font-size: 12px; color: #64748b; margin-bottom: 4px; font-weight: 500;">現在評価額</div>
                        <div style="font-size: 16px; font-weight: 700; color: #1e293b;">${coinSummary.currentValue > 0 ? '¥' + Math.round(coinSummary.currentValue).toLocaleString() : '計算中...'}</div>
                    </div>
                </div>
            </div>

            <!-- チャートエリア -->
            <div style="margin-bottom: 25px; background: white; border: 1px solid #cbd5e1; border-radius: 12px; padding: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">
                <h4 style="margin: 0 0 15px 0; font-size: 16px; font-weight: 600; color: #1e293b;">📊 ${coinSummary.coinName} 価格チャート（過去30日）</h4>
                <div style="position: relative; height: 300px;">
                    <canvas id="${coinSummary.coinName.toLowerCase()}-chart-canvas" style="max-height: 300px;"></canvas>
                </div>
            </div>

            <!-- 取引履歴テーブル -->
            <div style="background: rgba(255, 255, 255, 0.95); padding: 25px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <h4 style="color: #2c3e50; margin-bottom: 20px;">📊 ${coinSummary.coinName} 全取引履歴（${coinDetailData.allTransactions.length}件）</h4>
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
        const sortedTransactions = [...coinDetailData.allTransactions].sort((a, b) => new Date(b.date) - new Date(a.date));

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
 * UIサービスクラス
 * 全てのUI操作を統合的に管理
 */
class UIService {
    constructor() {
        this.messageManager = new MessageManager();
        this.tabManager = new TabManager();
        this.tableRenderer = new TableRenderer();
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

    renderCoinDetailPage(coinSummary, coinDetailData) {
        return this.tableRenderer.renderCoinDetailPage(coinSummary, coinDetailData);
    }
}

// グローバルシングルトンインスタンスを作成
window.uiService = new UIService();

// 後方互換性のためのエクスポート
window.UIService = UIService;
window.MessageManager = MessageManager;
window.TabManager = TabManager;
window.TableRenderer = TableRenderer;
