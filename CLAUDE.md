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
- 新規開発は必ずサービスクラスを使用（レガシーコードは使用禁止）
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
- エラーは`console.error()`で出力されます

## アーキテクチャ

### ファイル構成と責務

```
crypto_viewer/
├── index.html          # メインHTML（UI構造）
├── style.css           # スタイルシート
├── config.js           # アプリケーション設定、定数管理（AppConfig）
├── storage-utils.js    # CacheService、localStorage操作、計算ユーティリティ
├── main.js             # エントリーポイント、CSV処理、初期化
├── portfolio.js        # ポートフォリオ分析エンジン、PortfolioDataService
├── api.js              # レガシーAPI関数（段階的に廃止予定）
├── charts.js           # レガシーチャート関数（段階的に廃止予定）
├── cache-viewer.html   # 開発用キャッシュ状態表示ツール
└── services/           # サービスレイヤー（新アーキテクチャ）
    ├── api-service.js     # APIService - CoinGecko API統合
    ├── chart-service.js   # ChartService - チャート描画・管理
    ├── file-service.js    # FileService - CSV処理・ファイル管理
    └── ui-service.js      # UIService - UI操作統合（MessageManager、TabManager、TableRenderer）
```

**重要**: 現在、レガシーコード（api.js、charts.js）と新サービスレイヤー（services/）が共存しています。新機能追加時は必ずサービスクラスを使用してください。

### モジュール間の関係（新アーキテクチャ）

```
【サービスレイヤー - 推奨】

services/api-service.js (APIService)
  ├→ fetchCurrentPrices(coinNames) : 現在価格取得（キャッシュ優先）
  ├→ fetchPriceHistory(coinName, days) : 価格履歴取得
  └→ fetchMultiplePriceHistories(coinNames) : 複数銘柄の価格履歴並列取得

services/chart-service.js (ChartService)
  ├→ renderPortfolioProfitChart(portfolioData, mode) : ポートフォリオチャート描画
  ├→ renderCoinChart(coinName) : 個別銘柄価格チャート
  ├→ destroyChart(canvasId) : チャート破棄
  └→ 内部: _generateHistoricalProfitTimeSeries(), _generateCombinedProfitTimeSeries()

services/file-service.js (FileService)
  ├→ handleFiles(files) : CSVファイルアップロード処理
  ├→ parseCSVFile(file) : CSV解析（PapaParse使用）
  └→ 内部: _processCSVData(), _mergeTransactionData()

services/ui-service.js (UIService)
  ├→ MessageManager : トースト通知管理
  │   └→ showSuccess(), showError(), showWarning(), showInfo()
  ├→ TabManager : タブ切り替え管理
  │   ├→ switchMainTab(tabName)
  │   ├→ switchSubTab(subtabName)
  │   └→ createCoinSubTabs(portfolioData)
  └→ TableRenderer : テーブル/カード描画
      ├→ renderPortfolioTable(portfolioData, isMobile)
      ├→ renderTradingHistoryTable(portfolioData, isMobile)
      └→ renderCoinDetailPage(coinSummary, coinDetailData)

【コアレイヤー】

storage-utils.js
  ├→ CacheService : キャッシュ管理（localStorage操作）
  │   ├→ get(key), set(key, value, ttl)
  │   ├→ clearPriceCache(), clearAll()
  │   └→ getStorageStats()
  ├→ cacheKeys : キャッシュキー生成
  │   ├→ priceHistory(coinName)
  │   ├→ currentPrices(coinNames)
  │   └→ chartData(coinName, days)
  └→ 計算ユーティリティ
      ├→ calculateWeightedAverage()
      ├→ calculateRealizedProfit()
      └→ calculateUnrealizedProfit()

portfolio.js
  ├→ PortfolioDataService : ポートフォリオデータ管理
  │   ├→ getData(), updateData(data)
  │   ├→ getSortState(), setSortState(field, direction)
  │   └→ clearCache()
  ├→ analyzePortfolioData(transactions) : 損益計算エンジン
  ├→ sortPortfolioData(field, direction) : ソート機能
  └→ displayDashboard(portfolioData) : ダッシュボード初期化

config.js
  └→ AppConfig : 読み取り専用グローバル設定
      ├→ coinGeckoMapping : 銘柄マッピング
      ├→ cacheDurations : キャッシュ有効期限
      └→ coinColors : チャート色設定

【レガシーレイヤー - 段階的廃止予定】

api.js, charts.js
  └→ 下位互換性のため保持（新規開発では使用禁止）
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

### 1. サービスレイヤーアーキテクチャ（新規開発必須）

**全ての新規開発はサービスクラスを使用してください。レガシーコード（api.js、charts.js）は使用禁止です。**

#### サービスインスタンスの初期化順序

```javascript
// 1. 基本サービス（依存関係なし）
window.cache = new CacheService();                          // storage-utils.js
window.portfolioDataService = new PortfolioDataService();   // portfolio.js

// 2. APIサービス（CacheServiceに依存）
window.apiService = new APIService(cache, AppConfig);       // services/api-service.js

// 3. UIサービス（依存関係なし）
window.uiService = new UIService();                         // services/ui-service.js

// 4. チャートサービス（APIService、PortfolioDataServiceに依存）
window.chartService = new ChartService(apiService, portfolioDataService, AppConfig);  // services/chart-service.js

// 5. ファイルサービス（PortfolioDataService、UIServiceに依存）
window.fileService = new FileService(portfolioDataService, uiService);  // services/file-service.js
```

#### サービス使用例

```javascript
// 価格取得
const prices = await apiService.fetchCurrentPrices(['BTC', 'ETH']);

// チャート描画
await chartService.renderPortfolioProfitChart(portfolioData, 'combined');

// メッセージ表示
uiService.showSuccess('処理が完了しました');
uiService.showError('エラーが発生しました');

// タブ切り替え
uiService.switchSubTab('btc');

// ポートフォリオデータ管理
const data = portfolioDataService.getData();
portfolioDataService.updateData(newData);

// キャッシュ管理
cache.set('key', value, 30 * 60 * 1000);  // 30分キャッシュ
const cached = cache.get('key');
```

### 2. 変数名規則
**重要**: `symbol` → `coinName` に統一しました。
- ✅ 正: `coinName`, `coinNameData`, `COIN_NAME_MAPPING`
- ❌ 誤: `symbol`, `symbolData`, `SYMBOL_MAPPING`（古い命名）

### 3. キャッシュキー管理（storage-utils.js）
全てのキャッシュキーは`storage-utils.js`の`window.cacheKeys`オブジェクトで一元管理：
```javascript
cacheKeys.priceHistory(coinName)       // 例: "btc_price_history_30d"
cacheKeys.currentPrices(coinNames)     // 例: "prices_btc_eth_sol"
cacheKeys.chartData(coinName, days)    // 例: "chart_BTC_30days"
```

### 4. 開発用ツール

#### cache-viewer.html
キャッシュの状態を可視化する開発用ツール。ブラウザで直接開いて使用。

**主な機能**:
- localStorage内の全キャッシュデータを表示
- キャッシュサイズ、有効期限の確認
- 配列データをテーブル形式で表示
- 個別キャッシュの削除・全クリア

**使用方法**:
```bash
# ブラウザで直接開く
open cache-viewer.html
```

### 5. CSV解析（main.js / FileService）
GMOコイン、OKCoin Japanの2つの形式をサポート：
```javascript
processCSVData(data, fileName)
  ├→ GMO形式: "精算区分"列で判定
  └→ OKJ形式: "取引銘柄"列で判定
```

**重複検出**: 日時・銘柄・取引所・数量・金額が完全一致する取引を除外

### 6. 損益計算アルゴリズム（portfolio.js）

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

### 7. API制限対策（APIService）

CoinGecko無料プラン制限（Demo Plan）:
- **30回/分** （実測値、安全マージン込みで10-20回/分推奨）
- **月間10,000コール**
- キャッシュ戦略:
  - 現在価格: 30分キャッシュ（個別銘柄ごと）
  - 価格履歴: 蓄積型キャッシュ（24時間ごとに差分更新、無期限保存）
- フォールバック: 価格履歴キャッシュから現在価格を推定
- レート制限: RateLimiterクラスによる自動管理（waitIfNeeded()）
- 自動リトライ: 429エラー時は指数バックオフ（10秒→20秒→40秒待機）
- 差分更新: 価格履歴は必要な日数分のみ取得して既存データとマージ
- 期限切れキャッシュ利用: 429エラー時は古いキャッシュも活用
- 進捗バー: 長時間処理時はモーダル型進捗バーを表示

```javascript
// APIService.fetchCurrentPrices() の処理フロー
apiService.fetchCurrentPrices(coinNames)
  1. 個別銘柄キャッシュ確認（30分有効）
  2. 価格履歴キャッシュから現在価格を推定を試行
  3. CoinGecko API呼び出し（RateLimiterでレート制限管理）
  4. 個別銘柄ごとにキャッシュに保存

// APIService.fetchPriceHistory() の処理フロー（蓄積型キャッシュ）
apiService.fetchPriceHistory(coinName, options)
  1. 蓄積キャッシュから既存データを取得
  2. 更新が必要かチェック（24時間経過？）
  3. 差分取得日数を計算（最終更新日からの経過日数）
  4. CoinGecko API呼び出し（差分日数のみ）
  5. 既存データと新規データをマージ（重複排除）
  6. 無期限キャッシュとして保存
```

### 8. チャート描画（ChartService）

表示モード:
- **combined**: 全銘柄の合計損益推移（メインモード）
- ~~**individual**: 各銘柄の個別損益推移~~ （削除済み - 最近のリファクタリングで廃止）

```javascript
// ChartService使用例
await chartService.renderPortfolioProfitChart(portfolioData, 'combined')
  → apiService.fetchMultiplePriceHistories(coinNames) : 並列取得
  → _generateHistoricalProfitTimeSeries() : 日次損益データ生成
  → displayProfitChart() : Chart.jsで描画

// 個別銘柄チャート
await chartService.renderCoinChart('BTC')
  → apiService.fetchChartData('BTC', 30)
  → Chart.jsで価格推移チャートを描画
```

**Chart.jsインスタンス管理**: `chartService.chartInstances[canvasId]`で一元管理

## データ構造

### localStorage キー一覧

```javascript
// 取引データ
'rawTransactions'              // 全取引（重複検出用）
'portfolioData'                // 分析済みポートフォリオデータ
'loadedFileNames'              // 読み込み済みCSVファイル名

// 価格データ（storage-utils.jsのcacheKeys参照）
'price_[coinName]'             // 個別銘柄の現在価格（30分キャッシュ）
'[coinName]_price_history_30d' // 価格履歴（蓄積型、24時間ごとに差分更新、無期限保存）
'chart_[coinName]_30days'      // チャートデータ（6時間キャッシュ）

// 設定
'portfolioChartMode'           // チャート表示モード (combined - individualは廃止)
'cache_metadata'               // キャッシュメタデータ
'sortState'                    // テーブルソート状態
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

### 対応銘柄（config.js: AppConfig.coinGeckoMapping）

```javascript
AppConfig.coinGeckoMapping = {
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
1. `config.js`の`AppConfig.coinGeckoMapping`にCoinGecko IDを追加
2. （オプション）`AppConfig.coinColors`に色を追加

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

## アーキテクチャ移行の現状

### レガシーコードからサービスレイヤーへの移行

このプロジェクトは段階的にサービス指向アーキテクチャに移行中です。

#### 移行済み

✅ **UIService**: メッセージ表示、タブ管理、テーブル描画を統合
- MessageManager: トースト通知
- TabManager: タブ切り替え、銘柄サブタブ生成
- TableRenderer: ポートフォリオ・取引履歴テーブル描画

✅ **APIService**: CoinGecko API呼び出しをカプセル化
- 現在価格取得（キャッシュ優先）
- 価格履歴取得
- 複数銘柄の並列取得

✅ **ChartService**: Chart.js チャート描画を統合
- ポートフォリオ損益チャート（combined/individual）
- 個別銘柄価格チャート
- チャートインスタンス管理

✅ **FileService**: CSV処理を統合
- ファイルアップロード処理
- CSV解析（PapaParse）
- 重複検出・マージ

#### 移行中・未移行

⚠️ **レガシーコード**: api.js、charts.js
- 下位互換性のため保持
- 新規開発では使用禁止
- 将来的に削除予定

#### 移行時の注意点

1. **既存コードの修正時**:
   - 可能な限りサービスクラスに移行
   - レガシー関数の呼び出しを見つけたらサービスメソッドに置き換え

2. **新機能追加時**:
   - 必ずサービスクラスを使用
   - グローバル関数の追加は禁止

3. **依存関係の管理**:
   - サービスはコンストラクタで依存を受け取る
   - グローバル変数への直接アクセスは避ける

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
console.log(document.getElementById('btc-chart-canvas'));

// 2. ChartServiceインスタンス確認
console.log(window.chartService);
console.log(chartService.chartInstances);

// 3. APIServiceキャッシュ確認
const coinNames = ['BTC', 'ETH'];
const cacheKey = cacheKeys.currentPrices(coinNames);
console.log(cache.get(cacheKey));

// 4. ストレージ統計確認
console.log(cache.getStorageStats());

// 5. ポートフォリオデータ確認
console.log(portfolioDataService.getData());

// 6. キャッシュビューアを使用（推奨）
// → cache-viewer.html をブラウザで開く
```

### localStorageのクリーンアップ

```javascript
// CacheService経由（推奨）

// 全キャッシュクリア
cache.clearAll();

// 価格データのみクリア
const count = cache.clearPriceCache();
console.log(`${count}件のキャッシュを削除しました`);

// ストレージ統計確認
const stats = cache.getStorageStats();
console.log(`総容量: ${stats.totalSizeMB}MB, 使用率: ${(stats.usageRatio * 100).toFixed(1)}%`);

// 特定のキャッシュ削除
cache.delete(cacheKeys.priceHistory('BTC'));

// レガシー関数（非推奨）
// clearAllData();  // ← 使用禁止
// clearPriceData();  // ← 使用禁止
```

## トラブルシューティング

### 価格が取得できない
- **原因**: API制限（30回/分、月間10,000コール）
- **対策**:
  - 自動リトライが発動している場合は待機（10秒→20秒→40秒）
  - キャッシュから自動表示されるまで待機
  - 月間制限に達した場合は翌月まで待機

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

1. **新規開発は必ずサービスクラスを使用**
   - ✅ 正: `apiService.fetchCurrentPrices()`
   - ❌ 誤: `fetchCurrentPrices()`（レガシー関数）
   - ✅ 正: `uiService.showSuccess()`
   - ❌ 誤: `showSuccessMessage()`（レガシー関数）

2. **変数名は`coinName`を使用**（`symbol`は古い命名）

3. **データアクセスはサービスクラス経由**
   - ポートフォリオデータ: `portfolioDataService.getData()`
   - キャッシュ: `cache.get(key)` / `cache.set(key, value, ttl)`
   - API: `apiService.fetchCurrentPrices(coinNames)`
   - UI: `uiService.showSuccess(message)`

4. **キャッシュキーは`window.cacheKeys`を使用**
   - `cacheKeys.priceHistory(coinName)`
   - `cacheKeys.currentPrices(coinNames)`
   - `cacheKeys.chartData(coinName, days)`

5. **Chart.jsインスタンスは`chartService.chartInstances[canvasId]`で管理**

6. **設定値は`AppConfig`（config.js）から取得**
   - `AppConfig.coinGeckoMapping['BTC']`
   - `AppConfig.cacheDurations.CURRENT_PRICES`
   - `AppConfig.coinColors['BTC']`

7. **サービス初期化の依存関係順序を守る**
   - 基本: cache, portfolioDataService
   - 次: apiService (cacheに依存)
   - 次: uiService
   - 次: chartService (apiService, portfolioDataServiceに依存)
   - 最後: fileService (portfolioDataService, uiServiceに依存)

## 最近の主要な変更（2週間以内）

### アーキテクチャの大幅リファクタリング

1. **サービスレイヤーの導入**
   - オブジェクト指向設計への移行
   - APIService, ChartService, FileService, UIService を新設
   - グローバル関数からクラスメソッドへの移行

2. **データ管理の統一**
   - PortfolioDataService の導入（クラスベース）
   - CacheService による一元管理
   - グローバル変数依存の削減

3. **コード整理** (最新のコミット群)
   - 未使用コードの削除（Phase 1-4で段階的に実施）
   - 重複コードの共通化（サービスクラスへ一元化）
   - 巨大関数の分割（displayDashboard等をヘルパー関数に分割）
   - インラインスタイルのCSS化
   - 銘柄名を `symbol` → `coinName` に統一

4. **UI/UX改善**
   - ミニマルで洗練されたデザインに刷新
   - トースト通知システムの導入（MessageManager）
   - サイドバーとデータ管理UIの改善

5. **開発ツール追加**
   - [cache-viewer.html](cache-viewer.html) の追加（キャッシュ可視化ツール）

6. **API制限対策の強化**
   - RateLimiterクラスの導入（自動レート制限管理）
   - 蓄積型キャッシュシステム（価格履歴は差分更新で永続化）
   - 個別銘柄キャッシュ方式への変更（より細かい制御）
   - 期限切れキャッシュのフォールバック機能

### 削除された機能

- ❌ カード表示（テーブル表示のみに統一）
- ❌ 自動価格更新（手動更新のみ）
- ❌ individualチャートモード（combinedモードに統一）
- ❌ 未使用の委譲ラッパー関数（executePriceHistoryApi等）
- ❌ destroyChartSafely関数とwindow.chartInstances（ChartServiceに統合）

### 破壊的変更

⚠️ レガシー関数の非推奨化:
- `fetchCurrentPrices()` → `apiService.fetchCurrentPrices()`
- `showSuccessMessage()` → `uiService.showSuccess()`
- `clearAllData()` → `cache.clearAll()`

## 参考資料

- CoinGecko API: https://www.coingecko.com/en/api
- Chart.js: https://www.chartjs.org/
- PapaParse: https://www.papaparse.com/
