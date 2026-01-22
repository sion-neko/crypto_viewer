# 暗号資産ポートフォリオビューアー - アーキテクチャと処理フロー解説

## 目次

1. [システム全体像](#システム全体像)
2. [主要な処理フロー](#主要な処理フロー)
3. [ファイル構成と役割](#ファイル構成と役割)
4. [データストレージ構造](#データストレージ構造)
5. [重要な処理ポイント](#重要な処理ポイント)
6. [UI/UX設計](#uiux設計)

---

## システム全体像

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
│  ┌──────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ main.js  │  │services/         │  │storage-utils.js  │   │
│  │イベント   │  │  api-service.js  │  │  CacheService    │   │
│  │ 処理     │  │  file-service.js │  │                  │   │
│  │          │  │  ui-service.js   │  │                  │   │
│  │          │  │  portfolio-data- │  │                  │   │
│  │          │  │    service.js    │  │                  │   │
│  └──────────┘  └──────────────────┘  └──────────────────┘   │
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

## 主要な処理フロー

### 1. CSVファイルのアップロードと解析

```
ユーザーがCSVファイルをドロップ/選択
    ↓
[main.js] handleFiles(files)
    │
    └→ [FileService] handleFiles(files)
        │
        ├→ parseCSVFile(file)
        │   └→ PapaParseでUTF-8解析
        │
        ├→ _processCSVData(data, fileName)
        │   ├→ GMO Coin形式を検出
        │   │   - "精算区分"列で判定（"取引所現物取引"を含む）
        │   └→ OKCoin Japan形式を検出
        │       - "取引銘柄"列で判定（"ステータス"が"全部約定"）
        │
        ├→ _mergeTransactionData(既存データ, 新データ)
        │   └→ 重複取引を検出（日時+銘柄+取引所+数量+金額+種別）
        │
        └→ [PortfolioDataService] analyzePortfolioData(transactions)
            └→ localStorage保存
```

#### データ変換例

**CSV入力 (GMOコイン形式):**
```csv
日時,銘柄名,精算区分,売買区分,約定数量,約定レート,日本円受渡金額,注文手数料
2024/01/15 10:30:45,BTC,取引所現物取引,買,0.01,5000000,50000,0
```

**変換後のJavaScriptオブジェクト:**
```javascript
{
  fileName: "GMO_取引履歴.csv",
  exchange: "GMO",
  coinName: "BTC",
  type: "買",
  quantity: 0.01,
  rate: 5000000,
  amount: 50000,
  fee: 0,
  date: "2024/01/15 10:30:45"
}
```

---

### 2. ポートフォリオ分析エンジン

```
[PortfolioDataService] analyzePortfolioData(transactions)
    ↓
銘柄ごとにグループ化 (BTC, ETH, XRPなど)
    ↓
各銘柄について計算ループ
    │
    ├→ 【買い取引の処理】
    │   ├─ 総投資額 += 金額
    │   ├─ 保有数量 += 数量
    │   └─ 加重平均購入単価を計算
    │       weightedRateSum += (購入単価 × 購入数量)
    │       totalBuyQuantity += 購入数量
    │       averagePurchaseRate = weightedRateSum / totalBuyQuantity
    │
    ├→ 【売り取引の処理】
    │   ├─ 売却収益 = 売却金額
    │   ├─ 売却コスト = 数量 × 平均購入単価
    │   ├─ 実現損益 += 売却収益 - 売却コスト
    │   └─ 保有数量 -= 数量
    │
    └→ 銘柄サマリーを生成
        {
          coinName: "BTC",
          holdingQuantity: 0.02,
          totalInvestment: 187000,
          currentHoldingInvestment: 113333,
          averagePurchaseRate: 5666667,
          realizedProfit: 6333,
          totalFees: 0,
          buyTransactionCount: 2,
          sellTransactionCount: 1
        }
```

#### 計算例

**取引履歴:**
```
1. BTC 買 0.01 @ 5,000,000円 (金額: 50,000円)
2. BTC 買 0.02 @ 6,000,000円 (金額: 120,000円)
3. BTC 売 0.01 @ 7,000,000円 (金額: 70,000円)
```

**計算結果:**
```javascript
// 買い1回目
totalInvestment = 50,000円
holdingQuantity = 0.01 BTC
weightedRateSum = 5,000,000 × 0.01 = 50,000
totalBuyQuantity = 0.01
averagePurchaseRate = 50,000 / 0.01 = 5,000,000円

// 買い2回目
totalInvestment = 50,000 + 120,000 = 170,000円
holdingQuantity = 0.03 BTC
weightedRateSum = 50,000 + (6,000,000 × 0.02) = 170,000
totalBuyQuantity = 0.03
averagePurchaseRate = 170,000 / 0.03 = 5,666,667円

// 売り1回目
sellRevenue = 70,000円
sellCost = 0.01 × 5,666,667 = 56,667円
realizedProfit = 70,000 - 56,667 = 13,333円
holdingQuantity = 0.02 BTC

// 最終結果
総投資額: 170,000円
実現損益: +13,333円
保有数量: 0.02 BTC
```

---

### 3. 価格データ取得

```
ユーザーが「価格を更新」ボタンをクリック
    ↓
[APIService] fetchCurrentPrices(coinNames)
    │
    ├→ 【個別キャッシュチェック】
    │   ├─ 各銘柄のキャッシュを確認 (price_btc, price_eth, ...)
    │   ├─ 30分以内のキャッシュがあれば使用
    │   └─ キャッシュにない銘柄をリストアップ
    │
    ├→ 【CoinGecko API 呼び出し】
    │   ├─ キャッシュにない銘柄のみAPI呼び出し
    │   ├─ URL: /api/v3/simple/price
    │   │   ?ids=bitcoin,ethereum&vs_currencies=jpy&include_last_updated_at=true
    │   └─ レスポンス:
    │       {
    │         "bitcoin": {"jpy": 7000000, "last_updated_at": 1705276800},
    │         "ethereum": {"jpy": 300000, "last_updated_at": 1705276800}
    │       }
    │
    ├→ 【個別キャッシュ保存】
    │   └─ 各銘柄ごとに30分キャッシュとして保存
    │
    └→ [PortfolioDataService] updateWithPrices(prices)
        ↓
    【含み損益の計算】
        │
        └→ 各銘柄について
            ├→ currentPrice = prices[coinName].price_jpy
            ├→ unrealizedProfit = (currentPrice - averagePurchaseRate) × holdingQuantity
            └→ totalProfit = realizedProfit + unrealizedProfit
```

#### API レート制限対策

```javascript
// APIService の戦略
- 個別銘柄キャッシュ: 30分有効（price_btc 形式）
- 429エラー時: キャッシュデータで続行（メタデータに記録）
- 複数銘柄を1回のAPIコールで取得
```

---

### 4. UI更新とナビゲーション

```
[UIService] displayDashboard(portfolioData)
    ↓
    ├→ 【タブ生成】
    │   [TabManager] createCoinSubTabs(portfolioData)
    │   ├→ "サマリー" タブ (固定)
    │   └→ 保有銘柄ごとにタブを動的生成
    │
    ├→ 【サマリータブの表示】
    │   [TableRenderer] renderPortfolioTable(portfolioData)
    │   ├→ デスクトップ版テーブル（ソート機能付き）
    │   └→ モバイル版カード
    │
    └→ 【各銘柄タブの表示】
        [TableRenderer] renderCoinDetailPage(summary, coinDetailData)
        ├→ 銘柄統計カード
        └→ 取引履歴テーブル
```

---

## ファイル構成と役割

### プロジェクト構造

```
crypto_viewer/
├── index.html              # メインHTML（UI構造）
├── style.css               # スタイルシート
├── config.js               # アプリケーション設定（AppConfig）
├── storage-utils.js        # CacheService、localStorage操作
├── main.js                 # エントリーポイント、イベントリスナー
└── services/
    ├── api-service.js         # APIService - CoinGecko API統合
    ├── portfolio-data-service.js  # PortfolioDataService - 損益計算
    ├── file-service.js        # FileService - CSV処理
    └── ui-service.js          # UIService - UI操作統合
```

### サービスクラスの責務

#### FileService (services/file-service.js)

**ファイル処理:**
- `handleFiles(files)` - 複数CSVファイルの一括処理
- `parseCSVFile(file)` - PapaParseによるUTF-8解析
- `_processCSVData(data, fileName)` - 取引所形式の自動検出と変換
- `_mergeTransactionData(existing, new)` - 重複排除とマージ

**データ管理:**
- `deleteFile(fileName)` - 特定ファイルの取引を削除
- `clearAllData()` - 全データの削除
- `displayLoadedFiles()` - 読み込み済みファイル一覧表示

#### PortfolioDataService (services/portfolio-data-service.js)

**分析エンジン:**
- `analyzePortfolioData(transactions)` - コアポートフォリオ計算
- `updateData(data)` - ポートフォリオデータ更新
- `updateWithPrices(prices)` - 現在価格で含み損益を計算

#### APIService (services/api-service.js)

**価格取得:**
- `fetchCurrentPrices(coinNames)` - CoinGecko APIから現在価格取得

**キャッシュ戦略:**
- 個別銘柄キャッシュ（30分有効）
- 429エラー時はキャッシュデータで続行

#### UIService (services/ui-service.js)

**メッセージ管理 (MessageManager):**
- `showSuccess(message)` - 成功トースト
- `showError(message)` - エラートースト
- `showWarning(message)` - 警告トースト
- `showInfo(message)` - 情報トースト

**タブ管理 (TabManager):**
- `switchMainTab(tabName)` - メインタブ切り替え
- `switchSubTab(subtabName)` - サブタブ切り替え
- `createCoinSubTabs(portfolioData)` - 動的タブ生成
- `switchToPreviousSubTab()` / `switchToNextSubTab()` - タブナビゲーション

**テーブル描画 (TableRenderer):**
- `renderPortfolioTable(portfolioData)` - ポートフォリオテーブル
- `renderCoinDetailPage(summary, coinDetailData)` - 銘柄詳細ページ

---

## データストレージ構造

### localStorage キー一覧

```javascript
// 取引データ
'rawTransactions'           // 全取引の生データ（重複検出用）
'portfolioData'             // 分析済みポートフォリオデータ
'loadedFileNames'           // 読み込み済みCSVファイル名リスト

// 価格データ
'price_[coinName]'          // 個別銘柄の現在価格（30分キャッシュ）
                            // 例: price_btc, price_eth
```

### データ構造詳細

#### rawTransactions
```javascript
[
  {
    fileName: "GMO_取引履歴.csv",
    exchange: "GMO",
    coinName: "BTC",
    type: "買",
    quantity: 0.01,
    rate: 5000000,
    amount: 50000,
    fee: 0,
    date: "2024/01/15 10:30:45"
  }
]
```

#### portfolioData
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
  coins: {
    BTC: {
      allTransactions: [...],
      buyTransactions: [...],
      sellTransactions: [...]
    }
  },
  lastUpdated: "2024-01-15T10:00:00.000Z"
}
```

#### price_[coinName]
```javascript
{
  price_jpy: 7000000,
  last_updated_at: 1705276800
}
```

---

## 重要な処理ポイント

### 1. 重複検出アルゴリズム

```javascript
// FileService._mergeTransactionData()
const isDuplicate = existingData.some(existingTx =>
  existingTx.date === newTx.date &&
  existingTx.coinName === newTx.coinName &&
  existingTx.exchange === newTx.exchange &&
  Math.abs(existingTx.quantity - newTx.quantity) < 0.00000001 &&
  Math.abs(existingTx.amount - newTx.amount) < 0.01 &&
  existingTx.type === newTx.type
);
```

**重複チェックの理由:**
- 同じCSVファイルを複数回アップロードした場合
- 月ごとのエクスポートで期間が重複している場合

---

### 2. 加重平均購入単価の計算

```javascript
// PortfolioDataService.analyzePortfolioData()

if (type === '買') {
  weightedRateSum += rate * quantity;
  totalBuyQuantity += quantity;
  averagePurchaseRate = weightedRateSum / totalBuyQuantity;
  holdingQuantity += quantity;
  totalInvestment += amount;
}
```

---

### 3. 実現損益の計算

```javascript
// PortfolioDataService.analyzePortfolioData()

if (type === '売') {
  const sellCost = averagePurchaseRate * quantity;
  const profit = amount - sellCost;
  realizedProfit += profit;
  holdingQuantity -= quantity;
}
```

---

### 4. 含み損益の計算

```javascript
// PortfolioDataService.updateWithPrices()

for (const item of portfolioData.summary) {
  if (prices[item.coinName] && item.holdingQuantity > 0) {
    const currentPrice = prices[item.coinName].price_jpy;
    item.currentPrice = currentPrice;
    item.currentValue = currentPrice * item.holdingQuantity;
    item.unrealizedProfit = (currentPrice - item.averagePurchaseRate) * item.holdingQuantity;
    item.totalProfit = item.realizedProfit + item.unrealizedProfit;
  }
}
```

---

## UI/UX設計

### タブナビゲーション

```
ダッシュボード
├── ポートフォリオタブ
│   ├── サマリーサブタブ
│   │   └── 銘柄別一覧テーブル
│   │
│   ├── BTCサブタブ (動的生成)
│   │   ├── 銘柄統計カード
│   │   └── 取引履歴テーブル
│   │
│   └── ... (他の保有銘柄)
│
└── 取引履歴タブ
    └── 全取引一覧テーブル
```

### レスポンシブデザイン

```
デスクトップ (> 768px):
- サイドバー + メインコンテンツの2カラムレイアウト
- テーブル形式で銘柄一覧表示
- ソート機能付き

モバイル (≤ 768px):
- サイドバーはハンバーガーメニュー
- カード形式で銘柄一覧表示
```

### キーボードショートカット

```
Ctrl + 1     → ポートフォリオタブ
Ctrl + 2     → 取引履歴タブ
Ctrl + S     → サマリーサブタブ
Ctrl + ←     → 前のサブタブ
Ctrl + →     → 次のサブタブ
```

---

## セキュリティとプライバシー

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
- 最終更新時刻

個人情報: 一切含まれない
```

---

## デプロイ方法

```bash
# 静的ファイルのみなので、任意のWebサーバーで動作

# ローカルで実行
# 1. index.html をブラウザで直接開く
# 2. または、簡易サーバーを起動
python -m http.server 8000
# → http://localhost:8000 でアクセス
```

---

## デバッグ方法

### ブラウザ開発者ツール

```javascript
// Console タブ
console.log('Portfolio Data:', cache.getPortfolioData());
console.log('Transactions:', cache.getRawTransactions());

// Application タブ > Local Storage
// 保存されている全データを確認可能

// Network タブ
// CoinGecko API のリクエスト/レスポンスを監視
```

---

## 今後の拡張可能性

### 対応取引所の追加

```javascript
// services/file-service.js の _processCSVData() に追加

if (row['新取引所固有の列名']) {
  const transaction = {
    fileName: fileName,
    exchange: '新取引所名',
    coinName: row['銘柄列'],
    type: row['売買列'],
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

### 新しい銘柄の追加

```javascript
// config.js の AppConfig.coinGeckoMapping に追加

coinGeckoMapping: {
  'BTC': 'bitcoin',
  'ETH': 'ethereum',
  // 新規追加
  'DOGE': 'dogecoin',
  'MATIC': 'matic-network'
}
```

---

**最終更新日:** 2025-01-22
