#!/bin/bash
# Rasa Action Server 啟動腳本（用於獨立部署）

# 設置工作目錄
WORKDIR="/app"
cd "$WORKDIR" || {
  echo "錯誤: 無法切換到目錄 $WORKDIR"
  exit 1
}

# 設置 Python 路徑，確保 actions 模塊可以被找到
export PYTHONPATH="${PYTHONPATH}:$WORKDIR"

# 設置默認端口（Zeabur 會自動設置 PORT 環境變數）
export PORT=${PORT:-5055}

# 調試信息
echo "=========================================="
echo "🚀 Rasa Action Server 啟動腳本"
echo "=========================================="
echo "📂 當前工作目錄: $(pwd)"
echo "🔧 PORT: $PORT"
echo "🔧 PYTHONPATH: $PYTHONPATH"
echo "=========================================="

# 檢查 actions 目錄是否存在
if [ ! -d "actions" ]; then
  echo "❌ 錯誤: actions 目錄不存在"
  echo "📂 當前目錄內容:"
  ls -la
  exit 1
fi

# 檢查 actions 模塊是否可以導入
echo "🔍 檢查 actions 模塊..."
python3 -c "import sys; sys.path.insert(0, '.'); from actions import actions" 2>&1
if [ $? -ne 0 ]; then
  echo "⚠️  警告: actions 模塊導入可能有問題，但繼續啟動..."
fi

# 啟動 Action Server
echo "🚀 啟動 Rasa Action Server 在端口 $PORT..."
echo "📡 Actions 目錄: $WORKDIR/actions"
echo "=========================================="

# 使用 rasa-sdk 啟動 action server
# rasa-sdk 3.5.17 提供了命令行工具
# 檢查是否有 rasa-sdk 命令
if command -v rasa-sdk > /dev/null 2>&1; then
  echo "使用 rasa-sdk 命令啟動..."
  rasa-sdk --port "$PORT" --cors "*" --actions actions
elif python3 -m rasa_sdk > /dev/null 2>&1; then
  echo "使用 python -m rasa_sdk 啟動..."
  python3 -m rasa_sdk --port "$PORT" --cors "*" --actions actions
else
  echo "使用 Python 直接啟動..."
  # 直接使用 Python 啟動 Sanic 服務器
  python3 << EOF
import sys
import os
sys.path.insert(0, '/app')

from sanic import Sanic
from sanic.response import json as sanic_json
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.endpoints import endpoint_app

# 創建 Sanic 應用
app = Sanic("RasaActionServer")

# 註冊 rasa-sdk 端點
app.blueprint(endpoint_app)

# 設置 CORS
@app.middleware('response')
async def add_cors_headers(request, response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type'

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5055))
    app.run(host='0.0.0.0', port=port, debug=False)
EOF
fi
