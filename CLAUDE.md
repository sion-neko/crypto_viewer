# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

このファイルは、このリポジトリでコードを操作する際のClaude Code (claude.ai/code) へのガイダンスを提供します。

## プロジェクト概要

暗号資産ポートフォリオの分析を行うシングルページWebアプリケーションです。HTML、CSS、JavaScriptで構築されたクライアントサイドのみのアプリケーションで、CSV取引履歴ファイルを処理してポートフォリオ分析を生成します。

## 主要アーキテクチャ

### シングルファイル構造
- アプリケーション全体が `index.html` に含まれています
- ビルドプロセスやパッケージ管理は不要
- 全ての依存関係はCDNから読み込み

### コアコンポーネント
1. **CSVパーサー**: PapaParse ライブラリを使用して日本の取引所のCSVエクスポートを処理
2. **ポートフォリオ分析**: `analyzePortfolioData()` - 実現・含み損益、手数料、保有量を計算
3. **データストレージ**: 取引データとポートフォリオ状態の永続化にlocalStorageを使用
4. **価格統合**: リアルタイム価格データと含み損益のためのCoinGecko API統合
5. **チャート可視化**: 価格チャートとポートフォリオ可視化のためのChart.js統合

### データフロー
```
CSVファイル → parseCSVFile() → mergeTransactionData() → analyzePortfolioData() → displayDashboard()
```

## 外部依存関係 (CDN)

- **Chart.js**: データ可視化と価格チャート
- **Chart.js date-fns adapter**: 時系列チャートサポート
- **PapaParse**: 適切な日本語エンコーディングサポートによるCSV解析

## 主要関数

### データ処理
- `parseCSVFile(file)`: UTF-8エンコーディングでのCSV解析処理
- `analyzePortfolioData(transactions)`: コアポートフォリオ計算エンジン
- `mergeTransactionData(existingData, newData)`: 重複取引の防止

### API統合
- `fetchCurrentPrices()`: リアルタイム価格のためのCoinGecko API呼び出し
- `updatePortfolioWithPrices()`: 含み損益計算の更新
- `SYMBOL_MAPPING`: 取引シンボルをCoinGecko IDにマッピング

### UI管理
- `displayDashboard(portfolioData)`: メインダッシュボードレンダリング
- `switchTab()`: タブナビゲーションシステム
- タブ構造: ポートフォリオ（銘柄別サブタブ付き）→ 取引履歴 → 価格チャート

## データ永続化

全データはlocalStorageに保存されます：
- `rawTransactions`: 重複検出のための元取引データ
- `portfolioData`: 分析済みポートフォリオ統計とサマリー

## 銘柄サポート

アプリケーションには取引シンボル（BTC、ETHなど）をCoinGecko API IDにマッピングする`SYMBOL_MAPPING`オブジェクトが含まれています。新しい暗号資産のサポートを追加する場合は、このマッピングを更新してください。

## 日本語ローカライゼーション

UI全体が日本語（jaロケール）です。全てのテキスト、数値フォーマット、日付処理は日本の慣例に従っています。

## 開発ワークフロー

### テスト・実行方法
- ブラウザで `index.html` を直接開くだけで実行可能
- ビルドプロセスやパッケージ管理は不要
- npm、webpack、その他のビルドツールは必要ありません

### デバッグ
- ブラウザの開発者ツールでコンソールログとネットワークタブを確認
- localStorageデータは開発者ツールのApplicationタブで確認可能