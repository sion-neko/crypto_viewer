# 暗号資産ポートフォリオビューアー - アーキテクチャと処理フロー解説

## 📋 目次

1. [システム全体像](#システム全体像)
2. [主要な処理フロー](#主要な処理フロー)
3. [ファイル構成と役割](#ファイル構成と役割)
4. [データストレージ構造](#データストレージ構造)
5. [重要な処理ポイント](#重要な処理ポイント)
6. [UI/UX設計](#uiux設計)

---

## 📊 システム全体像

このアプリケーションは、暗号資産の取引履歴CSVを読み込んで、ポートフォリオ分析を行うWebアプリケーションです。

```
┌─────────────────────────────────────────────────────────────┐
│                     ユーザー                                 │
│              (ブラウザでindex.htmlを開く)                     │
└────────────┬────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────┐
│              index.html (UI + CSS)                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │ main.js  │  │portfolio │  │  api.js  │  │charts.js │     │
│  │ファイル   │  │   .js    │  │ 価格取得 │   │チャート  │     │
│  │  処理     │  │  分析    │  │          │  │          │     │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │
└─────────────┬───────────────────────────────────────────────┘
              │
              ▼
      ┌───────────────┐        ┌──────────────┐
      │ localStorage  │        │ CoinGecko API│
      │  データ永続化  │        │  価格データ   │
      └───────────────┘        └──────────────┘
```

### 技術スタック

- **フロントエンド**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **CSV解析**: PapaParse
- **チャート**: Chart.js + chartjs-adapter-date-fns
- **API**: CoinGecko API (暗号資産価格データ)
- **ストレージ**: localStorage (ブラウザ内データ永続化)
- **デプロイ**: 静的ファイルのみ、サーバー不要

---

## 🔄 主要な処理フロー

### 1️⃣ CSVファイルのアップロードと解析

```
ユーザーがCSVファイルをドロップ/選択
    ↓
[main.js] handleFiles(files)
    │
    ├→ 各ファイルに対してループ処理
    │
    ├→ parseCSVFile(file)
    │   └→ PapaParseでUTF-8解析
    │       - 改行コード自動検出
    │       - エンコーディング対応
    │
    ├→ processCSVData(data, fileName)
    │   ├→ GMO Coin形式を検出
    │   │   - ヘッダー: "取引日時", "銘柄", "取引区分"...
    │   ├→ OKCoin Japan形式を検出
    │   │   - ヘッダー: "注文ID", "通貨ペア", "売買"...
    │   └→ 取引データ配列に変換
    │       {
    │         timestamp: "2024/01/15 10:30:45",
    │         symbol: "BTC",
    │         side: "買",
    │         amount: 0.01,
    │         price: 5000000,
    │         fee: 5000
    │       }
    │
    ├→ mergeTransactionData(既存データ, 新データ)
    │   ├→ 重複取引を検出（日時+銘柄+数量+価格）
    │   │   - 同じファイルを再度アップロードした場合の対策
    │   └→ 重複を除外してマージ
    │       - 日時でソート（古い順）
    │
    └→ localStorage.setItem('rawTransactions')
        └→ localStorage.setItem('loadedFileNames')
            └→ showPage('dashboard')
                └→ analyzePortfolioData() へ
```

#### データ変換例

**CSV入力:**
```csv
取引日時,銘柄,取引区分,数量,約定価格,手数料
2024/01/15 10:30:45,BTC,買,0.01,5000000,5000
```

**変換後のJavaScriptオブジェクト:**
```javascript
{
  timestamp: "2024/01/15 10:30:45",
  symbol: "BTC",
  side: "買",
  amount: 0.01,
  price: 5000000,
  fee: 5000
}
```

---

### 2️⃣ ポートフォリオ分析エンジン

```
[portfolio.js] analyzePortfolioData(transactions)
    ↓
銘柄ごとにグループ化 (BTC, ETH, XRPなど)
    ↓
各銘柄について計算ループ
    │
    ├→ 【買い取引の処理】
    │   ├─ 総投資額 += (数量 × 単価) + 手数料
    │   ├─ 保有数量 += 数量
    │   └─ 加重平均購入単価を計算
    │       averageRate = ((averageRate × 既存保有量) + (購入単価 × 購入数量))
    │                     / (既存保有量 + 購入数量)
    │
    ├→ 【売り取引の処理】
    │   ├─ 売却収益 = (数量 × 売却単価) - 手数料
    │   ├─ 売却コスト = 数量 × 平均購入単価
    │   ├─ 実現損益 += 売却収益 - 売却コスト
    │   └─ 保有数量 -= 数量
    │
    ├→ 【統計計算】
    │   ├─ 投資効率 = (実現損益 / 総投資額) × 100
    │   ├─ 含み損益 = 0 (価格更新前)
    │   └─ 合計損益 = 実現損益 + 含み損益
    │
    └→ 銘柄サマリーを生成
        {
          symbol: "BTC",
          holdings: 0.05,           // 保有数量
          totalInvestment: 250000,  // 総投資額
          averageRate: 5000000,     // 平均購入単価
          realizedProfit: 50000,    // 実現損益
          unrealizedProfit: 0,      // 含み損益（価格更新前）
          totalProfit: 50000,       // 合計損益
          efficiency: 20.0,         // 投資効率(%)
          transactions: [...]       // 取引履歴
        }
```

#### 全体サマリー統計の生成

```javascript
{
  totalInvestment: 全銘柄の投資額合計,
  totalRealizedProfit: 全銘柄の実現損益合計,
  totalUnrealizedProfit: 全銘柄の含み損益合計,
  totalProfit: 実現損益 + 含み損益,
  profitableCount: 利益が出ている銘柄数,
  lossCount: 損失が出ている銘柄数,
  bySymbol: {
    BTC: {...},
    ETH: {...},
    XRP: {...}
  }
}
```

#### 計算例

**取引履歴:**
```
1. BTC 買 0.01 @ 5,000,000円 (手数料: 5,000円)
2. BTC 買 0.02 @ 6,000,000円 (手数料: 12,000円)
3. BTC 売 0.01 @ 7,000,000円 (手数料: 7,000円)
```

**計算結果:**
```javascript
// 買い1回目
totalInvestment = 0.01 × 5,000,000 + 5,000 = 55,000円
holdings = 0.01 BTC
averageRate = 5,000,000円

// 買い2回目
totalInvestment = 55,000 + (0.02 × 6,000,000 + 12,000) = 187,000円
holdings = 0.03 BTC
averageRate = (5,000,000 × 0.01 + 6,000,000 × 0.02) / 0.03 = 5,666,667円

// 売り1回目
sellRevenue = 0.01 × 7,000,000 - 7,000 = 63,000円
sellCost = 0.01 × 5,666,667 = 56,667円
realizedProfit = 63,000 - 56,667 = 6,333円
holdings = 0.02 BTC

// 最終結果
総投資額: 187,000円
実現損益: +6,333円
保有数量: 0.02 BTC
投資効率: 6,333 / 187,000 × 100 = 3.39%
```

---

### 3️⃣ 価格データ取得とリアルタイム更新

```
ユーザーが「価格を更新」ボタンをクリック
    ↓
[api.js] fetchCurrentPrices()
    │
    ├→ 【キャッシュチェック】
    │   ├─ localStorage から現在価格を取得
    │   ├─ 最終更新時刻をチェック (30分以内?)
    │   └─ YES: キャッシュされた価格を返す
    │       NO: API呼び出しへ進む
    │
    ├→ 【保有銘柄の特定】
    │   ├─ portfolioData から保有銘柄リストを取得
    │   │   例: ["BTC", "ETH", "XRP"]
    │   └─ SYMBOL_MAPPING で CoinGecko ID に変換
    │       BTC → bitcoin
    │       ETH → ethereum
    │       XRP → ripple
    │
    ├→ 【CoinGecko API 呼び出し】
    │   ├─ レート制限: 50回/分
    │   ├─ リクエスト間隔: 1.2秒
    │   ├─ URL: /api/v3/simple/price
    │   │   ?ids=bitcoin,ethereum,ripple
    │   │   &vs_currencies=jpy
    │   └─ レスポンス:
    │       {
    │         "bitcoin": {"jpy": 7000000},
    │         "ethereum": {"jpy": 300000},
    │         "ripple": {"jpy": 80}
    │       }
    │
    ├→ 【価格データの保存】
    │   ├─ localStorage.setItem('currentPrices', priceData)
    │   └─ localStorage.setItem('lastPriceUpdate', timestamp)
    │       └─ 30分間キャッシュとして有効
    │
    └→ updatePortfolioWithPrices(priceData)
        ↓
    【含み損益の計算】
        ↓
    各銘柄について
        │
        ├→ 現在価格を取得
        │   currentPrice = priceData[symbol]
        │
        ├→ 含み損益を計算
        │   unrealizedProfit = (currentPrice - averageRate) × holdings
        │
        │   例: BTC
        │   現在価格: 7,000,000円
        │   平均購入単価: 5,666,667円
        │   保有数量: 0.02 BTC
        │   含み損益 = (7,000,000 - 5,666,667) × 0.02 = +26,667円
        │
        ├→ 合計損益を更新
        │   totalProfit = realizedProfit + unrealizedProfit
        │
        │   例: 実現損益 6,333円 + 含み損益 26,667円 = 33,000円
        │
        └→ portfolioData を更新
            └→ displayDashboard() で再表示
```

#### API レート制限対策

```javascript
// api.js の定数
const RATE_LIMIT = 50;              // 50回/分まで
const INTERVAL = 1200;              // 1.2秒間隔でリクエスト
const CACHE_DURATION = 1800;        // 30分キャッシュ (秒)
const HISTORY_CACHE_DURATION = 86400; // 24時間キャッシュ (秒)

// 最適化機能
- 30分間のキャッシュで無駄な呼び出しを削減
- 複数銘柄を1回のAPIコールで取得 (ids=bitcoin,ethereum,ripple)
- 過去価格データから現在価格を推定 (tryGetPricesFromHistory)
- エラー時の自動リトライ機能
```

---

### 4️⃣ チャート生成処理

```
[charts.js] renderAllSymbolsProfitChart()
    ↓
各保有銘柄について
    │
    ├→ 【価格履歴の取得】
    │   fetchSymbolPriceHistory(symbol)
    │   ├→ キャッシュチェック (24時間以内?)
    │   │   └→ YES: localStorage から取得
    │   │       NO: API呼び出し
    │   │
    │   ├→ CoinGecko API 呼び出し
    │   │   URL: /coins/{id}/market_chart
    │   │        ?vs_currency=jpy&days=30
    │   │   レスポンス:
    │   │   {
    │   │     "prices": [
    │   │       [1705276800000, 7000000],  // [timestamp, price]
    │   │       [1705363200000, 7100000],
    │   │       ...
    │   │     ]
    │   │   }
    │   │
    │   └→ localStorage に24時間キャッシュ
    │       key: `${symbol}_price_history_30d`
    │
    ├→ 【損益チャートデータの生成】
    │   createProfitChart(symbol, priceHistory)
    │   │
    │   └→ 各日付ごとに累積損益を計算
    │       日付1: 実現損益 + (価格1 - 平均購入単価) × 保有数量
    │       日付2: 実現損益 + (価格2 - 平均購入単価) × 保有数量
    │       日付3: 実現損益 + (価格3 - 平均購入単価) × 保有数量
    │       ...
    │
    │   例: BTC
    │   実現損益: 6,333円
    │   保有数量: 0.02 BTC
    │   平均購入単価: 5,666,667円
    │
    │   1/15の価格: 7,000,000円
    │   → 損益 = 6,333 + (7,000,000 - 5,666,667) × 0.02 = 33,000円
    │
    │   1/16の価格: 7,200,000円
    │   → 損益 = 6,333 + (7,200,000 - 5,666,667) × 0.02 = 37,000円
    │
    └→ 【チャート描画】
        renderChart(symbol, chartData)
        └→ Chart.js で折れ線グラフを生成
            {
              labels: ['1/15', '1/16', '1/17', ...],
              datasets: [{
                label: 'BTC 損益推移',
                data: [33000, 37000, 35000, ...],
                borderColor: 'rgb(75, 192, 192)',
                tension: 0.1
              }]
            }
```

#### チャート表示モード

```javascript
// 2つの表示モード
1. 個別モード: 各銘柄ごとのチャートを別々に表示
2. 統合モード: 全銘柄の損益を合算したチャートを表示

// ユーザーはボタンで切り替え可能
toggleChartMode() {
  const mode = mode === 'combined' ? 'individual' : 'combined';
  localStorage.setItem('portfolioChartMode', mode);
  // チャートを再描画
}
```

---

### 5️⃣ UI更新とナビゲーション

```
displayDashboard(portfolioData)
    ↓
    ├→ 【タブ生成】
    │   createSymbolSubtabs(portfolioData)
    │   ├→ "サマリー" タブ (固定)
    │   └→ 保有銘柄ごとにタブを動的生成
    │       例: BTC, ETH, XRP, SOL...
    │
    ├→ 【サマリータブの表示】
    │   ├→ 統計カード表示
    │   │   ┌─────────────────┐ ┌─────────────────┐
    │   │   │  総投資額        │ │  総損益          │
    │   │   │  ¥187,000       │ │  +¥33,000       │
    │   │   └─────────────────┘ └─────────────────┘
    │   │   ┌─────────────────┐ ┌─────────────────┐
    │   │   │  実現損益        │ │  含み損益        │
    │   │   │  +¥6,333        │ │  +¥26,667       │
    │   │   └─────────────────┘ └─────────────────┘
    │   │
    │   ├→ デスクトップ版テーブル
    │   │   generatePortfolioTable(portfolioData)
    │   │   - ソート機能付き
    │   │   - クリックで昇順/降順切り替え
    │   │
    │   ├→ モバイル版カード
    │   │   generateMobilePortfolioCards(portfolioData)
    │   │   - レスポンシブレイアウト
    │   │   - タップで詳細表示
    │   │
    │   └→ 損益推移チャート
    │       renderAllSymbolsProfitChart()
    │
    └→ 【各銘柄タブの表示】
        generateSymbolDetailPage(summary, transactions)
        ├→ 銘柄統計カード
        │   ┌─────────────────────────────────────┐
        │   │  BTC                                │
        │   │  保有数量: 0.02 BTC                  │
        │   │  平均購入単価: ¥5,666,667            │
        │   │  総投資額: ¥187,000                  │
        │   │  実現損益: +¥6,333                   │
        │   │  含み損益: +¥26,667                  │
        │   │  合計損益: +¥33,000                  │
        │   │  投資効率: +3.39%                    │
        │   └─────────────────────────────────────┘
        │
        ├→ 取引履歴テーブル
        │   - この銘柄の全取引を時系列表示
        │   - 日時、売買、数量、価格、手数料
        │
        ├→ 損益推移チャート
        │   renderSymbolProfitChart(symbol)
        │   - 30日間の損益推移
        │
        └→ 価格チャート
            displaySymbolChart(symbol)
            - 30日間の価格推移
```

---

## 🗂️ ファイル構成と役割

### プロジェクト構造

```
crypto_viewer/
├── index.html          # メインHTMLファイル（UI + CSS含む）
├── main.js             # ファイル処理、CSV解析、UI管理
├── portfolio.js        # ポートフォリオ分析エンジン
├── api.js              # CoinGecko API統合
├── charts.js           # チャート生成と可視化
├── CLAUDE.md           # プロジェクト概要（AI向けガイド）
└── ARCHITECTURE.md     # このファイル（アーキテクチャ解説）
```

### main.js の責務

**ファイル処理:**
- `handleFiles(files)` - 複数CSVファイルの一括処理
- `parseCSVFile(file)` - PapaParseによるUTF-8解析
- `processCSVData(data, fileName)` - 取引所形式の自動検出と変換
- `mergeTransactionData(existing, new)` - 重複排除とマージ

**UI管理:**
- `showPage(pageId)` - ページ切り替え（dashboard/upload）
- `switchTab(tabName)` - メインタブ切り替え
- `switchSubtab(subtabName)` - 銘柄サブタブ切り替え
- `setupKeyboardShortcuts()` - キーボードショートカット設定

**データ管理:**
- `clearAllData()` - 全データの削除
- `clearPriceData()` - 価格キャッシュのクリア
- `loadPortfolioData()` - localStorageからデータ読み込み
- `showToast(message, type)` - 通知表示

### portfolio.js の責務

**分析エンジン:**
- `analyzePortfolioData(transactions)` - コアポートフォリオ計算
- `calculateMonthlyProfitData(portfolioData)` - 月次損益集計

**UI生成:**
- `displayDashboard(portfolioData)` - ダッシュボード全体の描画
- `generatePortfolioTable(portfolioData)` - デスクトップ版テーブル
- `generateMobilePortfolioCards(portfolioData)` - モバイル版カード
- `createSymbolSubtabs(portfolioData)` - 動的タブ生成
- `generateSymbolDetailPage(summary, transactions)` - 銘柄詳細ページ
- `generateTradingHistoryTable(transactions)` - 取引履歴テーブル

**ソート機能:**
- `sortPortfolioData(field, direction)` - テーブルソート

### api.js の責務

**価格取得:**
- `fetchCurrentPrices()` - CoinGecko APIから現在価格取得
- `updatePortfolioWithPrices()` - 含み損益の計算と更新
- `tryGetPricesFromHistory()` - 過去データからの価格推定

**キャッシュ管理:**
- `getCachedData(key, duration)` - キャッシュ取得
- `setCachedData(key, value, duration)` - キャッシュ保存
- `getCachedDataWithMetadata()` - メタデータ付きキャッシュ

**シンボルマッピング:**
```javascript
const SYMBOL_MAPPING = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  'XRP': 'ripple',
  'SOL': 'solana',
  // ... 他の銘柄
};
```

### charts.js の責務

**チャート生成:**
- `renderAllSymbolsProfitChart()` - 全銘柄損益チャート
- `renderSymbolProfitChart(symbol)` - 個別銘柄損益チャート
- `displaySymbolChart(symbol)` - 価格チャート表示
- `createProfitChart(symbol, priceHistory)` - 損益データ計算
- `renderChart(symbol, chartData)` - Chart.js描画

**データ取得:**
- `fetchSymbolPriceHistory(symbol)` - 30日分の価格履歴取得

**キャッシュ管理:**
- `cleanupOldCache()` - 古いキャッシュの自動削除

**表示切り替え:**
- `toggleChartMode()` - 統合/個別モード切り替え

---

## 💾 データストレージ構造

### localStorage キー一覧

```javascript
// 取引データ
'rawTransactions'           // 全取引の生データ（重複検出用）
'portfolioData'             // 分析済みポートフォリオデータ
'loadedFileNames'           // 読み込み済みCSVファイル名リスト

// 価格データ
'currentPrices'             // 現在価格（30分キャッシュ）
'lastPriceUpdate'           // 最終価格更新時刻
'prices_[symbols]'          // グループ化された価格キャッシュ

// 過去データ
'[SYMBOL]_price_history_30d'  // 30日分の価格履歴（24時間キャッシュ）
                              // 例: BTC_price_history_30d

// 設定
'portfolioChartMode'        // チャート表示モード (combined/individual)
'cache_metadata'            // キャッシュメタデータ
```

### データ構造詳細

#### rawTransactions
```javascript
[
  {
    timestamp: "2024/01/15 10:30:45",
    symbol: "BTC",
    side: "買",
    amount: 0.01,
    price: 5000000,
    fee: 5000
  },
  {
    timestamp: "2024/01/16 14:20:30",
    symbol: "ETH",
    side: "買",
    amount: 0.5,
    price: 300000,
    fee: 1500
  }
  // ... 他の取引
]
```

#### portfolioData
```javascript
{
  // 全体統計
  totalInvestment: 187000,          // 総投資額
  totalRealizedProfit: 6333,        // 総実現損益
  totalUnrealizedProfit: 26667,     // 総含み損益
  totalProfit: 33000,               // 合計損益
  profitableCount: 2,               // 利益銘柄数
  lossCount: 0,                     // 損失銘柄数

  // 銘柄別データ
  bySymbol: {
    BTC: {
      symbol: "BTC",
      holdings: 0.02,                 // 保有数量
      totalInvestment: 187000,        // 投資額
      averageRate: 5666667,           // 平均購入単価
      realizedProfit: 6333,           // 実現損益
      unrealizedProfit: 26667,        // 含み損益
      totalProfit: 33000,             // 合計損益
      efficiency: 3.39,               // 投資効率(%)
      currentPrice: 7000000,          // 現在価格
      transactions: [...]             // 取引履歴
    },
    ETH: {
      // ... 同様の構造
    }
  }
}
```

#### currentPrices
```javascript
{
  BTC: 7000000,
  ETH: 300000,
  XRP: 80,
  SOL: 15000
}
```

#### [SYMBOL]_price_history_30d
```javascript
{
  data: [
    [1705276800000, 7000000],  // [Unixタイムスタンプ(ms), 価格(円)]
    [1705363200000, 7100000],
    [1705449600000, 6950000],
    // ... 30日分
  ],
  timestamp: "2024-01-15T10:00:00.000Z"  // キャッシュ保存時刻
}
```

#### loadedFileNames
```javascript
[
  "GMO_取引履歴_2024_01.csv",
  "GMO_取引履歴_2024_02.csv",
  "OKJ_取引履歴_2024_01.csv"
]
```

---

## 🔑 重要な処理ポイント

### 1. 重複検出アルゴリズム

```javascript
// main.js の mergeTransactionData()
function isDuplicate(t1, t2) {
  return t1.timestamp === t2.timestamp &&
         t1.symbol === t2.symbol &&
         t1.amount === t2.amount &&
         t1.price === t2.price;
}

// 使用例
const merged = [...existingTransactions];
for (const newTx of newTransactions) {
  const isDup = existingTransactions.some(existing =>
    isDuplicate(existing, newTx)
  );
  if (!isDup) {
    merged.push(newTx);
  }
}
```

**重複チェックの理由:**
- 同じCSVファイルを複数回アップロードした場合
- 月ごとのエクスポートで期間が重複している場合

---

### 2. 加重平均購入単価の計算

```javascript
// portfolio.js の analyzePortfolioData()

// 新規購入時の平均単価更新
if (side === '買') {
  const newTotalCost = (averageRate * holdings) + (price * amount);
  const newTotalAmount = holdings + amount;
  averageRate = newTotalCost / newTotalAmount;

  holdings += amount;
  totalInvestment += (price * amount) + fee;
}
```

**計算例:**
```
既存: 0.01 BTC @ 5,000,000円
追加: 0.02 BTC @ 6,000,000円

新平均 = (5,000,000 × 0.01 + 6,000,000 × 0.02) / (0.01 + 0.02)
      = (50,000 + 120,000) / 0.03
      = 5,666,667円
```

---

### 3. 実現損益の計算

```javascript
// portfolio.js の analyzePortfolioData()

if (side === '売') {
  const sellRevenue = (price * amount) - fee;  // 売却収益
  const sellCost = averageRate * amount;       // 売却コスト
  const profit = sellRevenue - sellCost;       // 損益

  realizedProfit += profit;
  holdings -= amount;
}
```

**計算例:**
```
平均購入単価: 5,666,667円
売却: 0.01 BTC @ 7,000,000円
手数料: 7,000円

売却収益 = 0.01 × 7,000,000 - 7,000 = 63,000円
売却コスト = 0.01 × 5,666,667 = 56,667円
実現損益 = 63,000 - 56,667 = +6,333円
```

---

### 4. 含み損益の計算

```javascript
// api.js の updatePortfolioWithPrices()

for (const symbol in portfolioData.bySymbol) {
  const summary = portfolioData.bySymbol[symbol];
  const currentPrice = priceData[symbol];

  if (currentPrice && summary.holdings > 0) {
    // 含み損益 = (現在価格 - 平均購入単価) × 保有数量
    summary.unrealizedProfit =
      (currentPrice - summary.averageRate) * summary.holdings;

    // 合計損益 = 実現損益 + 含み損益
    summary.totalProfit =
      summary.realizedProfit + summary.unrealizedProfit;

    // 現在価格を保存
    summary.currentPrice = currentPrice;
  }
}
```

**計算例:**
```
現在価格: 7,000,000円
平均購入単価: 5,666,667円
保有数量: 0.02 BTC

含み損益 = (7,000,000 - 5,666,667) × 0.02
        = 1,333,333 × 0.02
        = +26,667円
```

---

### 5. APIレート制限の実装

```javascript
// api.js の fetchCurrentPrices()

const RATE_LIMIT = 50;       // 50回/分
const INTERVAL = 1200;       // 1.2秒間隔

// バッチ処理でAPI呼び出し数を削減
const symbolGroups = [];
for (let i = 0; i < symbols.length; i += 10) {
  symbolGroups.push(symbols.slice(i, i + 10));
}

// 各グループを順次処理（レート制限を遵守）
for (const group of symbolGroups) {
  const ids = group.map(s => SYMBOL_MAPPING[s]).join(',');
  const response = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=jpy`
  );

  // 次のリクエストまで待機
  await new Promise(resolve => setTimeout(resolve, INTERVAL));
}
```

**最適化ポイント:**
- 複数銘柄を1回のAPIコールで取得
- 30分間のキャッシュで重複リクエストを削減
- 過去データからの価格推定機能

---

### 6. キャッシュの有効期限管理

```javascript
// api.js の getCachedData()

function getCachedData(key, maxAgeSeconds) {
  const cached = localStorage.getItem(key);
  if (!cached) return null;

  const data = JSON.parse(cached);
  const now = Date.now();
  const age = (now - data.timestamp) / 1000;  // 秒単位

  if (age > maxAgeSeconds) {
    // キャッシュ期限切れ
    localStorage.removeItem(key);
    return null;
  }

  return data.value;
}
```

**キャッシュ期限:**
- 現在価格: 30分 (1800秒)
- 価格履歴: 24時間 (86400秒)
- チャートデータ: 6時間 (21600秒)

---

### 7. チャート損益データの生成

```javascript
// charts.js の createProfitChart()

function createProfitChart(symbol, priceHistory) {
  const summary = portfolioData.bySymbol[symbol];
  const profitData = [];

  for (const [timestamp, price] of priceHistory) {
    // その時点での含み損益を計算
    const unrealized = (price - summary.averageRate) * summary.holdings;

    // 実現損益 + 含み損益
    const totalProfit = summary.realizedProfit + unrealized;

    profitData.push({
      x: new Date(timestamp),
      y: totalProfit
    });
  }

  return profitData;
}
```

**計算例 (BTC):**
```
実現損益: 6,333円
保有数量: 0.02 BTC
平均購入単価: 5,666,667円

1/15の価格 7,000,000円:
  含み損益 = (7,000,000 - 5,666,667) × 0.02 = 26,667円
  合計損益 = 6,333 + 26,667 = 33,000円

1/16の価格 7,200,000円:
  含み損益 = (7,200,000 - 5,666,667) × 0.02 = 30,667円
  合計損益 = 6,333 + 30,667 = 37,000円

→ チャート: [33000, 37000, ...]
```

---

## 🎨 UI/UX設計

### ページ構造

```
┌─────────────────────────────────────────────────────────┐
│  サイドバー               メインコンテンツ                │
│  ┌──────────┐           ┌─────────────────────────┐     │
│  │ナビゲーション│          │ ダッシュボード / アップロード│   │
│  │- Dashboard│          │                         │     │
│  │- Upload   │          │                         │     │
│  ├──────────┤           │                         │     │
│  │データ管理  │          │                         │     │
│  │- 価格更新  │          │                         │     │
│  │- データ削除│          │                         │     │
│  └──────────┘           └─────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### タブナビゲーション

```
ダッシュボード
├── ポートフォリオタブ
│   ├── サマリーサブタブ
│   │   ├── 統計カード (4枚)
│   │   ├── 損益推移チャート
│   │   └── 銘柄別一覧テーブル
│   │
│   ├── BTCサブタブ (動的生成)
│   │   ├── 銘柄統計カード
│   │   ├── 損益推移チャート
│   │   ├── 取引履歴テーブル
│   │   └── 価格チャート
│   │
│   ├── ETHサブタブ (動的生成)
│   └── ... (他の保有銘柄)
│
└── 取引履歴タブ
    └── 全取引一覧テーブル
```

### レスポンシブデザイン

```css
/* デスクトップ (> 768px) */
- サイドバー + メインコンテンツの2カラムレイアウト
- テーブル形式で銘柄一覧表示
- ソート機能付き

/* モバイル (≤ 768px) */
- サイドバーは上部に配置
- カード形式で銘柄一覧表示
- タップで詳細表示
```

### カラースキーム

```css
/* 利益/損失の視覚化 */
.profit-positive { color: #10b981; }  /* 緑: 利益 */
.profit-negative { color: #ef4444; }  /* 赤: 損失 */
.profit-zero     { color: #6b7280; }  /* 灰: ゼロ */

/* カード背景 */
background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

---

## ⌨️ キーボードショートカット

```javascript
// main.js の setupKeyboardShortcuts()

Ctrl + 1     → ダッシュボードページへ移動
Ctrl + 2     → アップロードページへ移動
Ctrl + S     → サマリータブへ移動
Ctrl + ←     → 前のサブタブへ移動
Ctrl + →     → 次のサブタブへ移動
```

**実装例:**
```javascript
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey) {
    switch(e.key) {
      case '1':
        e.preventDefault();
        showPage('dashboard');
        break;
      case '2':
        e.preventDefault();
        showPage('upload');
        break;
      case 's':
        e.preventDefault();
        switchSubtab('summary');
        break;
      case 'ArrowLeft':
        e.preventDefault();
        navigateToPreviousSubtab();
        break;
      case 'ArrowRight':
        e.preventDefault();
        navigateToNextSubtab();
        break;
    }
  }
});
```

---

## 🔐 セキュリティとプライバシー

### データの取り扱い

```
✅ 全てのデータはブラウザ内（localStorage）に保存
✅ サーバーへのアップロード一切なし
✅ 外部送信されるのは価格データ取得のAPIリクエストのみ
✅ 取引履歴や個人情報は外部に送信されない
```

### CoinGecko API

```
送信データ:
- 銘柄シンボル (例: bitcoin, ethereum)
- 通貨単位 (jpy)

受信データ:
- 現在価格
- 過去価格履歴

個人情報: 一切含まれない
```

---

## 📱 対応ブラウザ

```
✅ Chrome 90+
✅ Firefox 88+
✅ Safari 14+
✅ Edge 90+

要件:
- localStorage サポート
- ES6+ JavaScript サポート
- Fetch API サポート
```

---

## 🚀 デプロイ方法

```bash
# 静的ファイルのみなので、任意のWebサーバーで動作

# ローカルで実行
# 1. index.html をブラウザで直接開く
# 2. または、簡易サーバーを起動
python -m http.server 8000
# → http://localhost:8000 でアクセス

# GitHub Pages にデプロイ
# 1. リポジトリをGitHubにプッシュ
# 2. Settings > Pages でブランチを選択
# 3. 公開URLでアクセス可能
```

---

## 🐛 デバッグ方法

### ブラウザ開発者ツール

```javascript
// Console タブ
console.log('Portfolio Data:', portfolioData);
console.log('Transactions:', rawTransactions);

// Application タブ > Local Storage
// 保存されている全データを確認可能

// Network タブ
// CoinGecko API のリクエスト/レスポンスを監視
```

### よくある問題

**1. 価格が取得できない**
```
原因: API レート制限に到達
対策: 30分待ってから再試行
```

**2. CSVが読み込めない**
```
原因: フォーマットが対応していない
対策: GMO Coin または OKCoin Japan のエクスポート形式を確認
```

**3. チャートが表示されない**
```
原因: 価格履歴データが未取得
対策: 「価格を更新」ボタンをクリック
```

---

## 📚 今後の拡張可能性

### 対応取引所の追加

```javascript
// main.js の processCSVData() に追加

if (headers.includes('新取引所固有のヘッダー')) {
  // 新しいフォーマットの解析ロジック
  return parseNewExchangeFormat(data);
}
```

### 新しい銘柄の追加

```javascript
// api.js の SYMBOL_MAPPING に追加

const SYMBOL_MAPPING = {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  // 新規追加
  'DOGE': 'dogecoin',
  'MATIC': 'matic-network'
};
```

### データエクスポート機能

```javascript
// 将来的な実装候補

function exportToCSV() {
  const csv = generateCSV(portfolioData);
  downloadFile(csv, 'portfolio_export.csv');
}

function exportToJSON() {
  const json = JSON.stringify(portfolioData, null, 2);
  downloadFile(json, 'portfolio_export.json');
}
```

---

## 🎓 学習リソース

### 使用ライブラリ

- [Chart.js](https://www.chartjs.org/) - チャート描画
- [PapaParse](https://www.papaparse.com/) - CSV解析
- [CoinGecko API](https://www.coingecko.com/en/api) - 価格データ

### JavaScript基礎

- localStorage API
- Fetch API
- ES6+ モジュール構文
- 非同期処理 (async/await)

---

## 📄 ライセンスと利用規約

このプロジェクトはオープンソースです。自由に改変・利用可能です。

**CoinGecko API の利用規約:**
- 無料プラン: 50回/分
- 商用利用の場合は有料プランを検討

---

## 👥 貢献者向けガイド

### コードスタイル

```javascript
// 関数名: キャメルケース
function calculateProfit() {}

// 定数: 大文字スネークケース
const RATE_LIMIT = 50;

// コメント: 日本語でOK
// この関数は損益を計算します
```

### コミットメッセージ

```
feat: 新機能追加
fix: バグ修正
docs: ドキュメント更新
style: コードスタイル修正
refactor: リファクタリング
test: テスト追加
chore: その他の変更
```

---

## 📞 サポート

問題が発生した場合:
1. ブラウザのコンソールでエラーを確認
2. localStorageのデータを確認
3. GitHub Issues で報告

---

**最終更新日:** 2025-10-21
