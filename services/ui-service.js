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
        const tabButtons = document.querySelectorAll('.tab-button');
        const tabButton = Array.from(tabButtons).find(btn => {
            const onclick = btn.getAttribute('onclick');
            return onclick && onclick.includes(`'${tabName}'`);
        });
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

        // チャート機能は無効化されました
        // if (subtabName !== 'summary' && typeof window.renderCoinProfitChart === 'function') {
        //     const coinName = subtabName.toUpperCase();
        //     setTimeout(() => {
        //         window.renderCoinProfitChart(coinName);
        //     }, 100);
        // }
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
        return this._renderCoinSummarySection(coinSummary) +
            this._renderCoinChartSection(coinSummary) +
            this._renderCoinTransactionsTable(coinSummary);
    }

    // ========== 個別銘柄詳細ページ生成ヘルパー ==========

    /**
     * 価格フォーマット（1円未満対応）
     * @private
     */
    _formatPriceDisplay(price) {
        if (price >= 1) {
            return '¥' + Math.round(price).toLocaleString();
        } else if (price > 0) {
            const mantissa = (price * 1000).toFixed(3);
            return `¥${mantissa}×10<sup>-3</sup>`;
        }
        return '取得中...';
    }

    /**
     * 銘柄サマリーセクション生成（損益・価格・統計）
     * @private
     */
    _renderCoinSummarySection(coinSummary) {
        const currentPrice = coinSummary.currentPrice;
        const avgPrice = coinSummary.averagePurchaseRate;
        const isHigher = currentPrice > avgPrice;
        const diffPercent = avgPrice > 0 ? (((currentPrice - avgPrice) / avgPrice) * 100).toFixed(1) : 0;
        const formatPrice = this._formatPriceDisplay.bind(this);

        return `
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
        `;
    }

    /**
     * 銘柄チャートセクション生成
     * @private
     */
    _renderCoinChartSection(coinSummary) {
        return `
            <!-- チャート機能は無効化されました -->
        `;
    }

    /**
     * 取引履歴テーブル生成
     * @private
     */
    _renderCoinTransactionsTable(coinSummary) {
        const transactions = getTransactionsByCoin(coinSummary.coinName);
        const sortedTransactions = [...transactions.all].sort((a, b) => new Date(b.date) - new Date(a.date));

        let tableRows = '';
        sortedTransactions.forEach(tx => {
            const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
            const typeBg = tx.type === '買' ? 'rgba(40, 167, 69, 0.1)' : 'rgba(220, 53, 69, 0.1)';

            tableRows += `
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

        return `
            <!-- 取引履歴テーブル -->
            <div class="info-box">
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
                            ${tableRows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ===================================================================
    // ポートフォリオテーブル生成ヘルパー（デスクトップ版）
    // ===================================================================

    _renderPortfolioSummarySection(stats, coinsWithPrice, hasPriceData) {
        return `
        <!-- ポートフォリオサマリー（統合版） -->
        <div style="margin-bottom: 25px; background: #ffffff; border: 1px solid #d1d5db; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="margin-bottom: 16px; border-bottom: 1px solid #e5e7eb; padding-bottom: 12px;">
                <h3 style="margin: 0; font-size: 16px; font-weight: 600; color: #1f2937;">ポートフォリオサマリー（${stats.coinNameCount}銘柄）</h3>
            </div>

            <!-- 統計情報 -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 10px; margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid #e5e7eb;">
                <!-- 総合損益 -->
                <div style="text-align: center; padding: 12px; background: ${stats.totalProfit >= 0 ? '#f0fdf4' : '#fef2f2'}; border-radius: 6px; border: 1px solid ${stats.totalProfit >= 0 ? '#86efac' : '#fca5a5'};">
                    <div style="font-size: 11px; color: #6b7280; margin-bottom: 4px; font-weight: 500;">総合損益</div>
                    <div style="font-size: 17px; font-weight: 700; color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}</div>
                    <div style="font-size: 10px; color: #6b7280; margin-top: 2px;">${stats.overallTotalProfitMargin >= 0 ? '+' : ''}${stats.overallTotalProfitMargin.toFixed(1)}%</div>
                </div>
            </div>

            ${hasPriceData ? `
            <!-- 現在価格一覧 -->
            <div>
                <div style="margin-bottom: 10px;">
                    <div class="text-value-md">現在価格</div>
                    <div style="font-size: 11px; color: #6b7280;">CoinGecko API</div>
                </div>
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px;">
                    ${coinsWithPrice.map(item => {
            const priceChange = item.currentPrice && item.averagePurchaseRate ?
                ((item.currentPrice - item.averagePurchaseRate) / item.averagePurchaseRate * 100) : 0;
            const isPositive = priceChange >= 0;
            const bgColor = isPositive ? '#f0fdf4' : '#fef2f2';
            const borderColor = isPositive ? '#86efac' : '#fca5a5';
            return `
                            <div style="padding: 12px; background: ${bgColor}; border: 1px solid ${borderColor}; border-radius: 6px; cursor: pointer; transition: all 0.2s ease;" onclick="window.uiService.switchSubTab('${item.coinName.toLowerCase()}')" onmouseover="this.style.backgroundColor='${isPositive ? '#dcfce7' : '#fee2e2'}'; this.style.borderColor='#3b82f6'" onmouseout="this.style.backgroundColor='${bgColor}'; this.style.borderColor='${borderColor}'">
                                <div style="font-size: 12px; font-weight: 600; color: #6b7280; margin-bottom: 6px;">${item.coinName}</div>
                                <div style="font-size: 18px; font-weight: 700; color: #111827; margin-bottom: 4px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">¥${item.currentPrice.toLocaleString()}</div>
                                <div style="font-size: 13px; color: #6b7280; margin-bottom: 6px; padding-bottom: 6px; border-bottom: 1px solid #e5e7eb;">平均 ¥${item.averagePurchaseRate.toLocaleString()}</div>
                                <div style="font-size: 12px; font-weight: 600; color: ${isPositive ? '#059669' : '#dc2626'};">
                                    ${isPositive ? '▲' : '▼'} ${isPositive ? '+' : ''}${priceChange.toFixed(2)}%
                                </div>
                            </div>
                        `;
        }).join('')}
                </div>
            </div>
            ` : `
            <!-- 価格データなし -->
            <div style="padding: 16px; background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px;">
                <div style="font-size: 13px; font-weight: 600; color: #92400e; margin-bottom: 4px;">価格データがありません</div>
                <div style="font-size: 12px; color: #78350f; margin-bottom: 10px;">価格更新ボタンをクリックして最新価格を取得してください</div>
                <button onclick="window.uiService.fetchCurrentPrices()" style="background: #3b82f6; color: white; border: none; padding: 7px 14px; border-radius: 4px; cursor: pointer; font-weight: 500; font-size: 12px; transition: background 0.2s;" onmouseover="this.style.background='#2563eb'" onmouseout="this.style.background='#3b82f6'">
                    価格を更新
                </button>
            </div>
            `}
        </div>
    `;
    }

    _renderPortfolioTableHeader() {
        return `
        <!-- 銘柄別詳細テーブル -->
        <div style="overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 30px;">
            <table class="portfolio-table" border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse; width: 100%; min-width: 800px; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); background: white;">
            <colgroup>
                <col style="width: 100px;">  <!-- 銘柄 -->
                <col class="w-130">  <!-- 現在価格 -->
                <col class="w-140">  <!-- 平均購入レート -->
                <col class="w-120">  <!-- 評価額 -->
                <col class="w-130">  <!-- 合計購入額 -->
                <col class="w-130">  <!-- 含み損益 -->
                <col class="w-130">  <!-- 実現損益 -->
                <col class="w-140">  <!-- 総合損益 -->
            </colgroup>
            <thead>
                <tr style="background-color: #f9fafb;">
                    <th onclick="window.uiService.sortTable('coinName')" style="cursor: pointer; user-select: none; position: relative; padding: 15px 12px; text-align: left; font-weight: 600; font-size: 0.9rem; color: #374151;">銘柄 <span id="sort-coinName">${window.uiService.getSortIcon('coinName')}</span></th>
                    <th onclick="window.uiService.sortTable('currentPrice')" class="table-sortable">現在価格 <span id="sort-currentPrice">${window.uiService.getSortIcon('currentPrice')}</span></th>
                    <th onclick="window.uiService.sortTable('averagePurchaseRate')" class="table-sortable">平均購入レート <span id="sort-averagePurchaseRate">${window.uiService.getSortIcon('averagePurchaseRate')}</span></th>
                    <th onclick="window.uiService.sortTable('currentValue')" class="table-sortable">評価額 <span id="sort-currentValue">${window.uiService.getSortIcon('currentValue')}</span></th>
                    <th onclick="window.uiService.sortTable('totalInvestment')" class="table-sortable">合計購入額 <span id="sort-totalInvestment">${window.uiService.getSortIcon('totalInvestment')}</span></th>
                    <th onclick="window.uiService.sortTable('unrealizedProfit')" class="table-sortable">含み損益 <span id="sort-unrealizedProfit">${window.uiService.getSortIcon('unrealizedProfit')}</span></th>
                    <th onclick="window.uiService.sortTable('realizedProfit')" class="table-sortable">実現損益 <span id="sort-realizedProfit" style="color: #3b82f6;">${window.uiService.getSortIcon('realizedProfit')}</span></th>
                    <th onclick="window.uiService.sortTable('totalProfit')" class="table-sortable">総合損益 <span id="sort-totalProfit">${window.uiService.getSortIcon('totalProfit')}</span></th>
                </tr>
            </thead>
            <tbody>
    `;
    }

    _renderPortfolioTableBody(portfolioData) {
        const stats = portfolioData.stats;
        let html = '';

        portfolioData.summary.forEach(item => {
            const profitColor = item.realizedProfit > 0 ? '#27ae60' : item.realizedProfit < 0 ? '#e74c3c' : '#6c757d';
            const profitBg = item.realizedProfit > 0 ? 'rgba(39, 174, 96, 0.05)' : item.realizedProfit < 0 ? 'rgba(231, 76, 60, 0.05)' : '';

            html += `
                <tr style="transition: all 0.2s ease; ${profitBg ? `background-color: ${profitBg};` : ''}" onmouseover="this.style.backgroundColor='#f9fafb'" onmouseout="this.style.backgroundColor='${profitBg ? profitBg : 'transparent'}'">
                    <td onclick="window.uiService.switchSubTab('${item.coinName.toLowerCase()}')" style="padding: 12px; font-weight: 600; color: #3b82f6; border-bottom: 1px solid #e5e7eb; cursor: pointer;" title="クリックして${item.coinName}の詳細を表示">${item.coinName}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #111827; font-weight: 700;">${item.currentPrice > 0 ? '¥' + item.currentPrice.toLocaleString() : '-'}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">¥${item.averagePurchaseRate.toLocaleString()}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">${item.currentValue > 0 ? '¥' + item.currentValue.toLocaleString() : '-'}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: #374151;">¥${item.totalInvestment.toLocaleString()}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${(item.unrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'}; font-weight: ${Math.abs(item.unrealizedProfit || 0) > 0 ? '600' : 'normal'};">${(item.unrealizedProfit || 0) !== 0 ? '¥' + Math.round(item.unrealizedProfit || 0).toLocaleString() : '-'}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${profitColor}; font-weight: ${Math.abs(item.realizedProfit) > 0 ? '600' : 'normal'};">${item.realizedProfit !== 0 ? '¥' + Math.round(item.realizedProfit).toLocaleString() : '-'}</td>
                    <td style="padding: 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.9rem; color: ${(item.totalProfit || item.realizedProfit) >= 0 ? '#059669' : '#dc2626'}; font-weight: ${Math.abs(item.totalProfit || item.realizedProfit) > 0 ? '600' : 'normal'};">${(item.totalProfit || item.realizedProfit) !== 0 ? '¥' + Math.round(item.totalProfit || item.realizedProfit).toLocaleString() : '-'}</td>
                </tr>
            `;
        });

        html += `
            </tbody>
            <tfoot>
                <tr style="background-color: #f3f4f6; font-weight: 600; border-top: 2px solid #d1d5db;">
                    <td style="padding: 15px 12px; text-align: left; font-weight: 700; color: #1f2937; border-bottom: 1px solid #e5e7eb;">合計</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; color: #6b7280;">-</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: #374151;">¥${Math.abs(stats.totalInvestment).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${(stats.totalUnrealizedProfit || 0) >= 0 ? '#059669' : '#dc2626'};">${(stats.totalUnrealizedProfit || 0) >= 0 ? '+' : ''}¥${Math.round(stats.totalUnrealizedProfit || 0).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${stats.totalRealizedProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalRealizedProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalRealizedProfit).toLocaleString()}</td>
                    <td style="padding: 15px 12px; text-align: right; border-bottom: 1px solid #e5e7eb; font-size: 0.95rem; font-weight: 700; color: ${stats.totalProfit >= 0 ? '#059669' : '#dc2626'};">${stats.totalProfit >= 0 ? '+' : ''}¥${Math.round(stats.totalProfit).toLocaleString()}</td>
                </tr>
            </tfoot>
        </table>
        </div>
    `;

        return html;
    }

    _renderDesktopPortfolioTable(portfolioData) {
        const stats = portfolioData.stats;
        const coinsWithPrice = portfolioData.summary.filter(item => item.currentPrice > 0);
        const hasPriceData = coinsWithPrice.length > 0;

        return this._renderPortfolioSummarySection(stats, coinsWithPrice, hasPriceData) +
            this._renderPortfolioTableHeader() +
            this._renderPortfolioTableBody(portfolioData);
    }

    _renderDesktopTradingHistoryTable(portfolioData) {
        const allTransactions = window.cache.getRawTransactions();
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = `
        <div class="info-box">
            <h4 class="text-section-title">全取引履歴（新しい順） - 全${allTransactions.length}件</h4>
            <div class="scroll-x">
                <table class="trading-history-table" style="width: 100%; min-width: 700px; border-collapse: collapse;">
                    <thead>
                        <tr class="table-header-bg">
                            <th class="table-cell-left">日時</th>
                            <th class="table-cell-left">銘柄</th>
                            <th class="table-cell-center">売買</th>
                            <th class="table-cell-right">数量</th>
                            <th class="table-cell-right">レート</th>
                            <th class="table-cell-right">金額</th>
                            <th class="table-cell-center">取引所</th>
                        </tr>
                    </thead>
                    <tbody>
    `;

        allTransactions.slice(0, 50).forEach(tx => {
            const typeColor = tx.type === '買' ? '#28a745' : '#dc3545';
            html += `
                <tr>
                    <td class="table-cell-plain">${new Date(tx.date).toLocaleString('ja-JP')}</td>
                    <td style="border: 1px solid #dee2e6; padding: 12px; font-weight: bold;">${tx.coinName}</td>
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

    // ===================================================================
    // ポートフォリオテーブル生成ヘルパー（モバイル版）
    // ===================================================================

    _renderMobilePortfolioCards(portfolioData) {
        const stats = portfolioData.stats;

        let html = `
        <div class="table-card" style="background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%); border: 2px solid #3b82f6;">
            <div class="card-header">📊 ポートフォリオサマリー（${stats.coinNameCount}銘柄）</div>
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

        if (portfolioData.summary) {
            portfolioData.summary.forEach((row, index) => {
                const totalProfit = (row.realizedProfit || 0) + (row.unrealizedProfit || 0);
                const profitMargin = row.totalInvestment !== 0 ? ((totalProfit / Math.abs(row.totalInvestment)) * 100) : 0;

                html += `
                    <div class="table-card" onclick="window.uiService.switchSubTab('${row.coinName.toLowerCase()}')" style="cursor: pointer;" title="タップして${row.coinName}の詳細を表示">
                        <div class="card-header" style="color: ${totalProfit >= 0 ? '#059669' : '#dc2626'};">
                            ${row.coinName}
                            <span style="float: right; font-size: 0.9rem;">
                                ${totalProfit >= 0 ? '+' : ''}¥${Math.round(totalProfit).toLocaleString()}
                            </span>
                        </div>
                        ${row.currentPrice ? `
                            <div class="card-row" style="background: #f9fafb; padding: 12px; margin: -8px -8px 8px -8px; border-radius: 4px; border-left: 3px solid #3b82f6;">
                                <span class="card-label" style="color: #6b7280; font-weight: 600; font-size: 0.85rem;">現在価格</span>
                                <span class="card-value" style="color: #111827; font-weight: 700; font-size: 1.1rem; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">¥${row.currentPrice.toLocaleString()}</span>
                            </div>
                        ` : ''}
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
                    </div>
                `;
            });
        }

        return `<div class="mobile-card-table">${html}</div>`;
    }

    _renderMobileTradingCards(portfolioData) {
        const allTransactions = window.cache.getRawTransactions();
        allTransactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        let html = '';
        allTransactions.slice(0, 50).forEach((tx, index) => {
            const date = new Date(tx.date);
            const typeColor = tx.type === '買い' ? '#059669' : '#dc2626';
            const typeIcon = tx.type === '買い' ? '📈' : '📉';

            html += `
                <div class="table-card">
                    <div class="card-header" style="color: ${typeColor};">
                        ${typeIcon} ${tx.coinName} - ${tx.type}
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
        // ソート状態管理（UI状態として管理）
        this.sortField = 'realizedProfit';
        this.sortDirection = 'desc';
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

    // ========== PORTFOLIO UI HELPER FUNCTIONS (migrated from portfolio.js) ==========

    /**
     * ポートフォリオ表示を更新（共通処理）
     * @param {object|null} portfolioData - ポートフォリオデータ（省略可）
     * @param {string|null} message - 成功メッセージ（省略可）
     */
    refreshPortfolioDisplay(portfolioData = null, message = null) {
        const portfolioDataService = window.portfolioDataService;

        // ポートフォリオデータが渡された場合、PortfolioDataServiceを更新
        if (portfolioData) {
            portfolioDataService.updateData(portfolioData);
        }

        // 現在のソート順を維持してテーブル再描画
        const sortState = this.getSortState();
        this.sortPortfolioData(sortState.field, sortState.direction);

        // ソート後のデータを取得
        const sortedData = window.cache.getPortfolioData();

        const tableContainer = document.getElementById('portfolio-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = this.tableRenderer._renderDesktopPortfolioTable(sortedData);
        }

        // サマリー部分も更新（総合損益反映のため）
        this.updateDataStatus(sortedData);

        // 銘柄別サブタブを再生成（価格更新を反映）
        try {
            this.createCoinSubTabs(sortedData);
        } catch (error) {
            console.error('❌ Error regenerating coin subtabs:', error);
        }

        // 成功メッセージ表示
        if (message) {
            this.showSuccess(message);
        }

        // 価格ステータス更新
        this.displayPriceDataStatus();
    }

    // ========== SORT STATE MANAGEMENT ==========

    /**
     * 現在のソート状態を取得
     * @returns {object} {field, direction}
     */
    getSortState() {
        return {
            field: this.sortField,
            direction: this.sortDirection
        };
    }

    /**
     * ソート状態を更新
     * @param {string} field - ソートフィールド
     * @param {string} direction - ソート方向 ('asc' or 'desc')
     */
    setSortState(field, direction) {
        this.sortField = field;
        this.sortDirection = direction;
    }

    // ========== TABLE SORTING ==========

    sortTable(field) {
        const portfolioDataService = window.portfolioDataService;
        const currentData = window.cache.getPortfolioData();
        if (!currentData) return;

        const sortState = this.getSortState();
        let newDirection;

        // 同じフィールドクリック時は方向を逆転
        if (sortState.field === field) {
            newDirection = sortState.direction === 'asc' ? 'desc' : 'asc';
        } else {
            // 新しいフィールドの場合は降順から開始
            newDirection = 'desc';
        }

        // ソート状態を更新
        this.setSortState(field, newDirection);

        this.sortPortfolioData(field, newDirection);

        // ソート後のデータを取得（sortPortfolioDataで変更されたデータ）
        const sortedData = window.cache.getPortfolioData();

        // テーブル再描画
        const tableContainer = document.getElementById('portfolio-table-container');
        if (tableContainer) {
            tableContainer.innerHTML = this.tableRenderer._renderDesktopPortfolioTable(sortedData);
        }
    }

    sortPortfolioData(field, direction) {
        const portfolioDataService = window.portfolioDataService;
        const currentData = window.cache.getPortfolioData();
        if (!currentData || !currentData.summary) return;

        currentData.summary.sort((a, b) => {
            let aVal, bVal;

            // フィールド値取得
            switch (field) {
                case 'coinName':
                    aVal = a.coinName;
                    bVal = b.coinName;
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
            if (field === 'coinName') {
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

        // ソート後のデータをキャッシュに保存（価格情報を含むため直接保存）
        const dataToSave = JSON.parse(JSON.stringify(currentData));
        window.cache.setPortfolioData(dataToSave);

        this.updateSortIndicators(field, direction);
    }

    getSortIcon(field) {
        const sortState = this.getSortState();
        if (sortState.field === field) {
            return sortState.direction === 'asc' ? '▲' : '▼';
        }
        return '';
    }

    updateSortIndicators(activeField, direction) {
        const fields = ['coinName', 'holdingQuantity', 'averagePurchaseRate', 'totalInvestment',
            'currentPrice', 'currentValue', 'totalSellAmount', 'realizedProfit',
            'unrealizedProfit', 'totalProfit'];

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

    // ========== PRICE UPDATE (wrapper around APIService) ==========

    async fetchCurrentPrices() {
        try {
            const portfolioDataService = window.portfolioDataService;
            const currentPortfolioData = window.cache.getPortfolioData();

            if (!currentPortfolioData) {
                throw new Error('ポートフォリオデータが見つかりません。先にCSVファイルをアップロードしてください。');
            }

            if (!currentPortfolioData.summary || currentPortfolioData.summary.length === 0) {
                throw new Error('ポートフォリオサマリーデータが見つかりません');
            }

            const portfolioCoinNames = currentPortfolioData.summary.map(item => item.coinName);

            this.showInfo('価格データを取得中...');
            const prices = await window.apiService.fetchCurrentPrices(portfolioCoinNames);

            // エラー情報をチェック
            if (prices._metadata?.errors && prices._metadata.errors.length > 0) {
                this.showWarning(`価格取得中にエラーが発生しました: ${prices._metadata.errors[0].message}`);
            }

            // 部分的成功をチェック
            if (prices._metadata?.isPartialSuccess) {
                const uncachedCount = prices._metadata.uncachedCoins?.length || 0;
                this.showWarning(`API制限のため、${uncachedCount}銘柄はキャッシュから取得しました`);
            }

            portfolioDataService.updateWithPrices(prices);

            // 価格更新後のデータを取得
            const updatedPortfolioData = window.cache.getPortfolioData();

            const validCoinNames = prices._metadata?.coinNames || [];
            let message = `価格更新完了: ${validCoinNames.length}銘柄`;

            if (prices._metadata?.source === 'price_history_cache') {
                message = `キャッシュから表示: ${validCoinNames.length}銘柄\n価格履歴データより`;
            } else if (prices._metadata?.lastUpdate) {
                const cacheDate = new Date(prices._metadata.lastUpdate);
                const cacheTimeStr = cacheDate.toLocaleString('ja-JP', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: 'numeric'
                });
                message = `価格更新完了: ${validCoinNames.length}銘柄\n${cacheTimeStr}保存`;
            }

            this.refreshPortfolioDisplay(null, message);

        } catch (error) {
            console.error('価格取得エラー:', error);
            this.showError(`価格取得失敗: ${error.message}`);
            this.displayPriceDataStatus('取得失敗');
        }
    }

    // ========== DASHBOARD DISPLAY ==========

    async displayDashboard(portfolioData) {
        this._initializeDashboardData(portfolioData);
        this._toggleDashboardDisplay();
        await this._renderDashboardTables(portfolioData);
        this._finalizeDashboardSetup(portfolioData);
    }

    _initializeDashboardData(portfolioData) {
        const portfolioDataService = window.portfolioDataService;
        portfolioDataService.updateData(portfolioData);
        this.setSortState('realizedProfit', 'desc');
        this.sortPortfolioData('realizedProfit', 'desc');
    }

    _toggleDashboardDisplay() {
        document.getElementById('dashboardArea').style.display = 'none';
        document.getElementById('tabContainer').style.display = 'block';
    }

    async _renderDashboardTables(portfolioData) {
        const portfolioDataService = window.portfolioDataService;
        const tableContainer = document.getElementById('portfolio-table-container');
        const currentData = window.cache.getPortfolioData();
        tableContainer.innerHTML = this.tableRenderer._renderDesktopPortfolioTable(currentData);

        const coinNames = portfolioData.summary.map(item => item.coinName);
        const cacheTimestamps = [];
        const cachedPriceData = {};

        for (const coinName of coinNames) {
            // 1. 個別銘柄キャッシュ（currentPrice）から取得を試行
            const currentPriceCacheKey = window.cacheKeys.currentPrice(coinName);
            const cachedCurrentPrice = window.cache.get(currentPriceCacheKey);
            if (cachedCurrentPrice) {
                const rawData = window.cache.storage.getItem(currentPriceCacheKey);
                if (rawData) {
                    const parsedData = JSON.parse(rawData);
                    cacheTimestamps.push(parsedData.timestamp);
                    cachedPriceData[coinName] = cachedCurrentPrice;
                    continue;
                }
            }

            // 2. 価格履歴キャッシュ（priceHistory）から最新価格を取得
            const priceHistoryCacheKey = window.cacheKeys.priceHistory(coinName);
            const historyValue = window.cache.get(priceHistoryCacheKey);
            if (historyValue) {
                const priceData = historyValue?.data || historyValue;
                if (priceData && Array.isArray(priceData) && priceData.length > 0) {
                    const latestPrice = priceData[priceData.length - 1].price;
                    cachedPriceData[coinName] = {
                        price_jpy: latestPrice,
                        last_updated_at: Date.now() / 1000
                    };
                    // 価格履歴のタイムスタンプを取得
                    const historyRawData = window.cache.storage.getItem(priceHistoryCacheKey);
                    if (historyRawData) {
                        const historyParsed = JSON.parse(historyRawData);
                        cacheTimestamps.push(historyParsed.timestamp || Date.now());
                    }
                }
            }
        }

        if (Object.keys(cachedPriceData).length > 0) {
            const pricesObject = {};
            for (const [coinName, priceData] of Object.entries(cachedPriceData)) {
                pricesObject[coinName] = priceData;
            }
            pricesObject._metadata = { lastUpdate: Math.min(...cacheTimestamps) };

            portfolioDataService.updateWithPrices(pricesObject);

            // ソート状態を維持して再ソート
            const sortState = this.getSortState();
            this.sortPortfolioData(sortState.field, sortState.direction);

            // ソート後のデータを取得
            const sortedData = window.cache.getPortfolioData();

            tableContainer.innerHTML = this.tableRenderer._renderDesktopPortfolioTable(sortedData);

            this.displayPriceDataStatus();
        } else {
            // キャッシュがない場合は価格取得を待つ
            this.displayPriceDataStatus('価格データ取得中...');

            try {
                await this.fetchCurrentPrices();
                this.displayPriceDataStatus('取得完了');
            } catch (error) {
                console.error('初期価格取得エラー:', error);
                this.displayPriceDataStatus('取得失敗');
            }
        }

        const tradingContainer = document.getElementById('trading-history-container');
        tradingContainer.innerHTML = this.tableRenderer._renderDesktopTradingHistoryTable(portfolioData);
    }

    _finalizeDashboardSetup(portfolioData) {
        try {
            this.createCoinSubTabs(portfolioData);
        } catch (error) {
            console.error('❌ Error in createCoinNameSubtabs:', error);
        }

        setTimeout(() => {
            this.switchSubTab('summary');
        }, 50);

        this.updateDataStatus(portfolioData);
        showPage('dashboard');
    }

    updateDataStatus(portfolioData) {
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
                ${stats.coinNameCount}銘柄<br>
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

    /**
     * 価格データの状態を表示（個別銘柄キャッシュ対応版）
     * @param {string|null} message - カスタムメッセージ（省略時は自動計算）
     */
    displayPriceDataStatus(message = null) {
        const statusElement = document.getElementById('price-update-status');
        if (!statusElement) return;

        if (message) {
            statusElement.textContent = message;
            return;
        }

        // ポートフォリオデータから銘柄リストを取得
        const portfolioData = window.cache.getPortfolioData();
        if (!portfolioData || !portfolioData.summary) {
            statusElement.textContent = '価格データなし';
            statusElement.style.color = '#6c757d';
            statusElement.title = '価格データを取得してください';
            return;
        }

        const coinNames = portfolioData.summary.map(item => item.coinName);

        // 個別銘柄キャッシュを確認（最も古いキャッシュのタイムスタンプを取得）
        let oldestUpdateTime = null;
        let cachedCount = 0;

        for (const coinName of coinNames) {
            const cacheKey = cacheKeys.currentPrice(coinName);
            const rawCacheData = localStorage.getItem(cacheKey);

            if (rawCacheData) {
                try {
                    const cacheData = JSON.parse(rawCacheData);
                    if (cacheData.timestamp) {
                        cachedCount++;
                        if (!oldestUpdateTime || cacheData.timestamp < oldestUpdateTime) {
                            oldestUpdateTime = cacheData.timestamp;
                        }
                    }
                } catch (e) {
                    // キャッシュ読み込みエラー
                }
            }
        }

        if (cachedCount > 0 && oldestUpdateTime) {
            const lastUpdate = new Date(oldestUpdateTime);
            const timeStr = lastUpdate.toLocaleString('ja-JP');
            const ageMinutes = Math.round((Date.now() - oldestUpdateTime) / 1000 / 60);

            statusElement.textContent = `${cachedCount}/${coinNames.length}銘柄 | ${timeStr} (${ageMinutes}分前)`;

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
}

// グローバルシングルトンインスタンスを作成
window.uiService = new UIService();

// 後方互換性のためのエクスポート
window.UIService = UIService;
window.MessageManager = MessageManager;
window.TabManager = TabManager;
window.TableRenderer = TableRenderer;
window.ProgressManager = ProgressManager;
