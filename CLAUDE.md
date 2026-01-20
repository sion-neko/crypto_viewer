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

## 開発方針

### コーディング規約
- コードは簡潔に書く
- 必要のないエラー処理はしない（ロジック的にnullが来ないのであればnullチェックは不要）
- 新規開発は必ずサービスクラスを使用
- 変数名は`coinName`を使用（`symbol`は古い命名）
- コメントは簡潔に、自明なコードにはコメント不要

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

## アーキテクチャ

### ファイル構成と責務

```
crypto_viewer/
├── index.html              # メインHTML（UI構造）
├── style.css               # スタイルシート
├── config.js               # アプリケーション設定（AppConfig）
├── storage-utils.js        # CacheService、localStorage操作、計算ユーティリティ
├── main.js                 # エントリーポイント、イベントリスナー、初期化
└── services/               # サービスレイヤー
    ├── api-service.js         # APIService - CoinGecko API統合
    ├── portfolio-data-service.js  # PortfolioDataService - 損益計算エンジン
    ├── file-service.js        # FileService - CSV処理・ファイル管理
    └── ui-service.js          # UIService - UI操作統合（MessageManager、TabManager、TableRenderer）
```

### モジュール間の依存関係

```
config.js (AppConfig) ─────────────────────────────────────────────┐
                                                                    │
storage-utils.js (CacheService, cacheKeys) ────────────────────────┤
                                                                    │
services/portfolio-data-service.js (PortfolioDataService) ─────────┤
    └→ analyzePortfolioData(), updateData(), updateWithPrices()    │
                                                                    │
services/api-service.js (APIService) ──────────────────────────────┤
    └→ fetchCurrentPrices()                                        │
                                                                    │
services/ui-service.js (UIService) ────────────────────────────────┤
    ├→ MessageManager: showSuccess/Error/Warning/Info()            │
    ├→ TabManager: switchMainTab(), switchSubTab()                 │
    └→ TableRenderer: renderPortfolioTable(), renderCoinDetailPage()│
                                                                    │
services/file-service.js (FileService) ────────────────────────────┤
    └→ handleFiles(), parseCSVFile(), deleteFile()                 │
                                                                    │
main.js ←──────────────────────────────────────────────────────────┘
    └→ イベントリスナー設定、キーボードショートカット
```

### サービスインスタンスの初期化順序

```javascript
// storage-utils.js で初期化
window.cache = new CacheService();
window.cacheKeys = { currentPrice: (coinName) => `price_${coinName.toLowerCase()}` };

// services/api-service.js で初期化
window.apiService = new APIService(window.cache, AppConfig);

// services/ui-service.js で初期化
window.uiService = new UIService();

// services/portfolio-data-service.js で初期化（依存なし）
// PortfolioDataService はクラスをエクスポートするのみ

// services/file-service.js で初期化（最後）
window.fileService = new FileService(portfolioDataService, uiService);
```

### データフロー

```
1. CSV読み込み
   CSVファイル → fileService.handleFiles()
   → parseCSVFile() → _processCSVData() → _mergeTransactionData()
   → portfolioDataService.analyzePortfolioData()
   → localStorage保存

2. ダッシュボード表示
   localStorage → uiService.displayDashboard()
   → tableRenderer.renderPortfolioTable()
   → tabManager.createCoinSubTabs()

3. 価格更新
   ボタンクリック → apiService.fetchCurrentPrices()
   → portfolioDataService.updateWithPrices()
   → テーブル再描画
```

## 重要な実装ポイント

### 1. サービス使用例

```javascript
// 価格取得
const prices = await apiService.fetchCurrentPrices(['BTC', 'ETH']);

// メッセージ表示
uiService.showSuccess('処理が完了しました');
uiService.showError('エラーが発生しました');

// タブ切り替え
uiService.switchMainTab('portfolio');
uiService.switchSubTab('btc');

// ポートフォリオデータ管理
const portfolioData = portfolioDataService.analyzePortfolioData(transactions);
portfolioDataService.updateWithPrices(prices);

// キャッシュ管理
cache.set('key', value, 30 * 60 * 1000);  // 30分キャッシュ
const cached = cache.get('key');
const portfolioData = cache.getPortfolioData();
```

### 2. CSV解析（FileService）
GMOコイン、OKCoin Japanの2つの形式をサポート：
```javascript
_processCSVData(data, fileName)
  ├→ GMO形式: "精算区分"列で判定（"取引所現物取引"を含む）
  └→ OKJ形式: "取引銘柄"列で判定（"ステータス"が"全部約定"）
```

**重複検出**: 日時・銘柄・取引所・数量・金額・種別が完全一致する取引を除外

### 3. 損益計算アルゴリズム（PortfolioDataService）

```javascript
analyzePortfolioData(transactions)

  各銘柄について:
    買い取引:
      - 加重平均購入単価を更新（weightedRateSum / totalBuyQuantity）
      - 総投資額を累積

    売り取引:
      - 実現損益 = 売却金額 - (売却数量 × 平均購入単価)
      - 保有数量を減少

    含み損益: updateWithPrices()で計算
      = (現在価格 - 平均購入単価) × 保有数量
    総合損益: 実現損益 + 含み損益
```

### 4. API制限対策（APIService）

CoinGecko無料プラン制限:
- **30回/分**、**月間10,000コール**
- キャッシュ戦略:
  - 現在価格: 30分キャッシュ（個別銘柄ごと `price_btc` 形式）
- 429エラー時: キャッシュデータで続行（メタデータに記録）

```javascript
// fetchCurrentPrices() の処理フロー
1. 個別銘柄キャッシュ確認（30分有効）
2. キャッシュにない銘柄はCoinGecko API呼び出し
3. 個別銘柄ごとにキャッシュ保存
4. 429エラー時はキャッシュデータで続行
```

## データ構造

### localStorage キー一覧

```javascript
// 取引データ
'rawTransactions'              // 全取引（重複検出用）
'portfolioData'                // 分析済みポートフォリオデータ
'loadedFileNames'              // 読み込み済みCSVファイル名

// 価格データ
'price_[coinName]'             // 個別銘柄の現在価格（30分キャッシュ）
```

### portfolioData 構造

```javascript
{
  summary: [
    {
      coinName: "BTC",
      holdingQuantity: 0.02,
      totalInvestment: 187000,
      currentHoldingInvestment: 113333,
      averagePurchaseRate: 5666667,
      totalFees: 0,
      buyTransactionCount: 2,
      sellTransactionCount: 1,
      totalSellAmount: 60000,
      realizedProfit: 6333,
      // 価格更新後に追加
      currentPrice: 7000000,
      currentValue: 140000,
      unrealizedProfit: 26667,
      totalProfit: 33000
    }
  ],
  stats: {
    totalInvestment: 187000,
    totalRealizedProfit: 6333,
    totalFees: 0,
    coinNameCount: 1,
    totalUnrealizedProfit: 26667,
    totalProfit: 33000,
    totalProfitableCoinNames: 1,
    totalLossCoinNames: 0,
    overallTotalProfitMargin: 17.64
  },
  coins: { /* 銘柄ごとの集計データ */ },
  lastUpdated: "2024-01-01T00:00:00.000Z"
}
```

## 銘柄サポート

### 対応銘柄（config.js: AppConfig.coinGeckoMapping）

```javascript
'BTC', 'ETH', 'SOL', 'XRP', 'ADA', 'DOGE',
'ASTR', 'XTZ', 'XLM', 'SHIB', 'PEPE', 'SUI', 'DAI'
```

**新規銘柄追加方法**:
1. `config.js`の`AppConfig.coinGeckoMapping`にCoinGecko IDを追加
2. （オプション）`AppConfig.coinColors`に色を追加

## UI構造

### タブシステム

```
ダッシュボード
├─ ポートフォリオタブ
│   ├─ サマリーサブタブ（全銘柄統計）
│   ├─ BTCサブタブ（動的生成）
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

`services/file-service.js`の`_processCSVData()`に判定ロジックを追加:

```javascript
// 新取引所形式
if (row['新取引所固有の列名']) {
  const transaction = {
    fileName: fileName,
    exchange: '新取引所名',
    coinName: row['銘柄列'],
    type: row['売買列'], // '買' or '売'
    amount: parseFloat(row['金額列']?.replace(/,/g, '') || 0),
    quantity: parseFloat(row['数量列']?.replace(/,/g, '') || 0),
    fee: parseFloat(row['手数料列']?.replace(/,/g, '') || 0),
    date: row['日時列'],
    rate: parseFloat(row['レート列']?.replace(/,/g, '') || 0)
  };
  if (transaction.quantity > 0) {
    transactions.push(transaction);
  }
}
```

### localStorageのクリーンアップ

```javascript
// CacheService経由
cache.clearAll();                    // 全キャッシュクリア
cache.clearPriceCache();             // 価格データのみクリア
cache.delete(cacheKeys.currentPrice('BTC'));  // 特定のキャッシュ削除

// ファイルサービス経由
fileService.clearAllData();          // 確認ダイアログ付きで全データクリア
fileService.deleteFile('file.csv');  // 特定ファイルの取引を削除
```

## 重要な注意事項

1. **データアクセスはサービスクラス経由**
   - ポートフォリオデータ: `cache.getPortfolioData()`
   - 取引データ: `cache.getRawTransactions()`
   - キャッシュ: `cache.get(key)` / `cache.set(key, value, ttl)`
   - API: `apiService.fetchCurrentPrices(coinNames)`
   - UI: `uiService.showSuccess(message)`

2. **変数名は`coinName`を使用**（`symbol`は古い命名）

3. **設定値は`AppConfig`（config.js）から取得**
   - `AppConfig.coinGeckoMapping['BTC']`
   - `AppConfig.cacheDurations.CURRENT_PRICES`
   - `AppConfig.coinColors['BTC']`

## 参考資料

- CoinGecko API: https://www.coingecko.com/en/api
- Chart.js: https://www.chartjs.org/
- PapaParse: https://www.papaparse.com/
