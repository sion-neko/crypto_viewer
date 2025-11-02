# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

このファイルは、このリポジトリでコードを操作する際のClaude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

暗号資産ポートフォリオ分析を行うシングルページWebアプリケーション。HTML、CSS、JavaScriptのみで構築されたクライアントサイドアプリケーションで、CSV取引履歴ファイルを処理してポートフォリオ分析を生成します。

**重要な特徴:**
- ビルドプロセス不要（CDNから全依存関係をロード）
- サーバーレス（ブラウザで直接実行可能）
- データは完全にlocalStorageで管理（プライバシー重視）
- 日本語UI（GMOコイン、OKCoin Japan対応）

## 開発・テスト方法

### 実行方法
```bash
# ブラウザで直接開く
open index.html

# または簡易サーバーを起動
python -m http.server 8000
# → http://localhost:8000 でアクセス
```

**注意**: ビルドツール不要。npm、webpack等は使用しません。

### デバッグ
- ブラウザの開発者ツール (F12) でコンソールログとネットワークタブを確認
- localStorageデータは開発者ツールのApplicationタブで確認可能
- エラーは`console.error()`で出力されます

## アーキテクチャ

### ファイル構成と責務

```
crypto_viewer/
├── index.html          # メインHTML（UI構造+CSS）
├── main.js             # ファイル処理、CSV解析、UIナビゲーション
├── portfolio.js        # ポートフォリオ分析エンジン、テーブル生成
├── api.js              # CoinGecko API統合、価格取得
├── charts.js           # Chart.js チャート描画、履歴データ処理
├── cache-keys.js       # キャッシュキー生成の一元管理
└── style.css           # スタイル（index.htmlから分離予定）
```

### モジュール間の関係

```
main.js (Entry Point)
  ├→ parseCSVFile() → portfolio.js: analyzePortfolioData()
  ├→ displayDashboard() → portfolio.js
  └→ UI Events → switchTab(), switchSubtab()

portfolio.js
  ├→ analyzePortfolioData() : 損益計算エンジン
  ├→ generatePortfolioTable() : テーブル/カード生成
  ├→ createCoinNameSubtabs() : 銘柄別タブ動的生成
  └→ sortPortfolioData() : ソート機能

api.js
  ├→ fetchCurrentPrices() : CoinGecko API呼び出し
  ├→ updatePortfolioWithPrices() : 含み損益計算
  └→ キャッシュ管理 (30分)

charts.js
  ├→ fetchCoinNamePriceHistory() : 過去30日の価格取得
  ├→ renderAllCoinNamesProfitChart() : 全銘柄損益チャート
  ├→ renderCoinNameProfitChart(coinName) : 個別銘柄チャート
  └→ キャッシュ管理 (24時間)

cache-keys.js
  └→ キャッシュキー生成関数の集約
```

### データフロー

```
1. CSV読み込み
   CSVファイル → parseCSVFile() → processCSVData()
   → mergeTransactionData() → analyzePortfolioData()
   → localStorage保存

2. ダッシュボード表示
   localStorage → displayDashboard()
   → generatePortfolioTable() / createCoinNameSubtabs()

3. 価格更新
   ボタンクリック → fetchCurrentPrices()
   → updatePortfolioWithPrices() → テーブル再描画

4. チャート描画
   サブタブ切り替え → renderCoinNameProfitChart()
   → fetchCoinNamePriceHistory() → displayProfitChart()
```

## 重要な実装ポイント

### 1. 変数名規則（最近の変更）
**重要**: `symbol` → `coinName` に統一しました。
- ✅ 正: `coinName`, `coinNameData`, `COIN_NAME_MAPPING`
- ❌ 誤: `symbol`, `symbolData`, `SYMBOL_MAPPING`（古い命名）

### 2. グローバル変数管理
グローバル変数の衝突を避けるため、`window.app*`オブジェクトに集約：
```javascript
// portfolio.js
window.appPortfolioState = {
    currentPortfolioData: null,
    currentSortField: 'realizedProfit',
    currentSortDirection: 'desc'
};

// api.js
window.appPriceData = {
    currentPrices: {},
    lastPriceUpdate: null
};

// charts.js
window.appChartData = {
    historicalData: {},
    profitChartInstance: null
};
```

### 3. キャッシュキー管理（cache-keys.js）
全てのキャッシュキーは`cache-keys.js`で一元管理：
```javascript
getPriceHistoryCacheKey(coinName, days)  // 例: "btc_price_history_30d"
getCurrentPricesCacheKey(coinNames)      // 例: "prices_btc_eth_sol"
getChartDataCacheKey(coinName, days)     // 例: "chart_BTC_30days"
```

### 4. CSV解析（main.js）
GMOコイン、OKCoin Japanの2つの形式をサポート：
```javascript
processCSVData(data, fileName)
  ├→ GMO形式: "精算区分"列で判定
  └→ OKJ形式: "取引銘柄"列で判定
```

**重複検出**: 日時・銘柄・取引所・数量・金額が完全一致する取引を除外

### 5. 損益計算アルゴリズム（portfolio.js）

```javascript
analyzePortfolioData(transactions)

  各銘柄について:
    買い取引:
      - 加重平均購入単価を更新
      - 総投資額を累積

    売り取引:
      - 実現損益 = 売却金額 - (売却数量 × 平均購入単価)
      - 保有数量を減少

    含み損益: (現在価格 - 平均購入単価) × 保有数量
    総合損益: 実現損益 + 含み損益
```

### 6. API制限対策（api.js）

CoinGecko無料プラン制限:
- 50回/分
- キャッシュ: 現在価格30分、履歴24時間
- フォールバック: 価格履歴キャッシュから現在価格を推定

```javascript
fetchCurrentPrices()
  1. 価格履歴キャッシュから推定を試行
  2. 永続化キャッシュ確認 (30分)
  3. API呼び出し
```

### 7. チャート描画（charts.js）

2つの表示モード:
- **combined**: 全銘柄の合計損益推移
- **individual**: 各銘柄の個別損益推移

```javascript
renderAllCoinNamesProfitChart()
  → 複数銘柄の価格履歴を並列取得
  → generateHistoricalProfitTimeSeries() で損益データ生成
  → モードに応じてチャート描画
```

**重要**: `renderCoinNameProfitChart()`は重複実行防止フラグ付き（2秒間）

## データ構造

### localStorage キー一覧

```javascript
// 取引データ
'rawTransactions'              // 全取引（重複検出用）
'portfolioData'                // 分析済みポートフォリオデータ
'loadedFileNames'              // 読み込み済みCSVファイル名

// 価格データ（cache-keys.js参照）
'prices_[coinNames]'           // 現在価格（30分キャッシュ）
'[coinName]_price_history_30d' // 価格履歴（24時間キャッシュ）
'chart_[coinName]_30days'      // チャートデータ（6時間キャッシュ）

// 設定
'portfolioChartMode'           // チャート表示モード (combined/individual)
'cache_metadata'               // キャッシュメタデータ
```

### portfolioData 構造

```javascript
{
  summary: [
    {
      coinName: "BTC",
      holdingQuantity: 0.02,
      totalInvestment: 187000,
      averagePurchaseRate: 5666667,
      realizedProfit: 6333,
      unrealizedProfit: 26667,
      totalProfit: 33000,
      currentPrice: 7000000,
      currentValue: 140000
    }
  ],
  stats: {
    totalInvestment: 187000,
    totalRealizedProfit: 6333,
    totalUnrealizedProfit: 26667,
    totalProfit: 33000,
    coinNameCount: 1,
    profitableCoinNames: 1,
    lossCoinNames: 0
  },
  coins: {
    BTC: {
      allTransactions: [...],
      buyTransactions: [...],
      sellTransactions: [...]
    }
  }
}
```

## 銘柄サポート

### 対応銘柄（api.js: COIN_NAME_MAPPING）

```javascript
window.COIN_NAME_MAPPING = {
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
```

**新規銘柄追加方法**:
1. `api.js`の`COIN_NAME_MAPPING`にCoinGecko IDを追加
2. （オプション）`charts.js`の`COIN_NAME_COLORS`に色を追加

## UI構造

### タブシステム

```
ダッシュボード
├─ ポートフォリオタブ
│   ├─ サマリーサブタブ（全銘柄統計）
│   ├─ BTCサブタブ（動的生成）
│   ├─ ETHサブタブ（動的生成）
│   └─ ... (保有銘柄ごと)
└─ 取引履歴タブ（全取引一覧）
```

### キーボードショートカット

```
Ctrl+1   : ポートフォリオタブ
Ctrl+2   : 取引履歴タブ
Ctrl+S   : サマリーサブタブ
Ctrl+←   : 前のサブタブ
Ctrl+→   : 次のサブタブ
```

実装: `main.js`の`initializeKeyboardShortcuts()`

### レスポンシブ対応

- デスクトップ (>768px): テーブル表示
- モバイル (≤768px): カード表示

判定: `isMobile()`（main.js）

## 外部依存関係（CDN）

```html
<!-- Chart.js -->
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns/..."></script>

<!-- PapaParse -->
<script src="https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js"></script>
```

## よくあるタスク

### 新しい取引所のCSV形式を追加

1. `main.js`の`processCSVData()`に判定ロジックを追加
2. 列名マッピングを定義
3. トランザクションオブジェクト生成

```javascript
// processCSVData() に追加
if (row['新取引所固有の列名']) {
  const transaction = {
    exchange: '新取引所名',
    coinName: row['銘柄列'],
    type: row['売買列'], // '買' or '売'
    amount: parseFloat(row['金額列']),
    quantity: parseFloat(row['数量列']),
    fee: parseFloat(row['手数料列']),
    date: row['日時列'],
    rate: parseFloat(row['レート列'])
  };
  transactions.push(transaction);
}
```

### チャート表示のデバッグ

```javascript
// 1. Canvas要素の存在確認
console.log(document.getElementById('btc-profit-chart'));

// 2. データ取得状況確認
console.log(window.appChartData.historicalData['BTC']);

// 3. Chart.jsインスタンス確認
console.log(window.chartInstances);

// 4. キャッシュ状況確認
console.log(getPriceDataStatus());
```

### localStorageのクリーンアップ

```javascript
// 全データクリア
clearAllData();

// 価格データのみクリア
clearPriceData();

// 古い価格データの自動削除（起動時実行）
autoCleanupOldPriceData();
```

## トラブルシューティング

### 価格が取得できない
- **原因**: API制限（50回/分）
- **対策**: 30分待つ、またはキャッシュから再表示

### チャートが表示されない
- **原因**: 価格履歴未取得、Canvas要素未生成
- **対策**: サブタブ切り替え時の`renderCoinNameProfitChart()`実行確認

### CSVが読み込めない
- **原因**: フォーマット不一致、エンコーディング問題
- **対策**: `processCSVData()`のログ確認、UTF-8エンコーディング確認

### 重複データが登録される
- **原因**: `mergeTransactionData()`の判定条件不一致
- **対策**: 重複判定条件（日時・銘柄・数量・金額）を確認

## 重要な注意事項

1. **変数名は`coinName`を使用**（`symbol`は古い命名）
2. **グローバル変数は`window.app*`に集約**
3. **キャッシュキーは`cache-keys.js`の関数を使用**
4. **Chart.jsインスタンスは`window.chartInstances[canvasId]`で管理**
5. **API呼び出しは必ずキャッシュチェック後**

## 参考資料

- 詳細アーキテクチャ: `ARCHITECTURE.md`
- CoinGecko API: https://www.coingecko.com/en/api
- Chart.js: https://www.chartjs.org/
- PapaParse: https://www.papaparse.com/
