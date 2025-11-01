#!/bin/bash

# ローカル実験用サーバー起動スクリプト
# Python 3の組み込みHTTPサーバーを使用

PORT=8000
AUTO_OPEN=${1:-"yes"}  # デフォルトでブラウザを開く

# スクリプトのディレクトリに移動（常にプロジェクトルートから起動）
cd "$(dirname "$0")"

# index.htmlの存在チェック
if [ ! -f "index.html" ]; then
    echo "エラー: index.htmlが見つかりません"
    echo "このスクリプトはプロジェクトのルートディレクトリから実行してください"
    exit 1
fi

echo "========================================"
echo "暗号資産ポートフォリオ分析 - ローカルサーバー"
echo "========================================"
echo ""
echo "サーバーを起動しています..."
echo "ポート: $PORT"
echo "ディレクトリ: $(pwd)"
echo ""
echo "ブラウザで以下のURLにアクセスしてください:"
echo "  http://localhost:$PORT"
echo "  または"
echo "  http://localhost:$PORT/index.html"
echo ""
echo "サーバーを停止するには Ctrl+C を押してください"
echo "========================================"
echo ""

# ブラウザを自動的に開く
if [ "$AUTO_OPEN" = "yes" ]; then
    sleep 2
    if command -v xdg-open > /dev/null; then
        xdg-open "http://localhost:$PORT" 2>/dev/null &
    elif command -v open > /dev/null; then
        open "http://localhost:$PORT" 2>/dev/null &
    else
        echo "注: ブラウザを手動で開いてください"
    fi
fi

# Python 3でHTTPサーバーを起動
python3 -m http.server $PORT
