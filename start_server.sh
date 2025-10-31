#!/bin/bash

# ローカル実験用サーバー起動スクリプト
# Python 3の組み込みHTTPサーバーを使用

PORT=8000

echo "========================================"
echo "暗号資産ポートフォリオ分析 - ローカルサーバー"
echo "========================================"
echo ""
echo "サーバーを起動しています..."
echo "ポート: $PORT"
echo ""
echo "ブラウザで以下のURLにアクセスしてください:"
echo "  http://localhost:$PORT"
echo ""
echo "サーバーを停止するには Ctrl+C を押してください"
echo "========================================"
echo ""

# Python 3でHTTPサーバーを起動
python3 -m http.server $PORT
