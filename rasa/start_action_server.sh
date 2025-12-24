#!/bin/bash
# Rasa Action Server 啟動腳本（用於獨立部署）

# 確保在 rasa 目錄
SCRIPT_DIR="/app/rasa"
cd "$SCRIPT_DIR" || {
  echo "錯誤: 無法切換到目錄 $SCRIPT_DIR"
  exit 1
}

# 設置 Python 路徑，確保 actions 模塊可以被找到
export PYTHONPATH="${PYTHONPATH}:$SCRIPT_DIR"

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
echo "📡 Actions 目錄: $SCRIPT_DIR/actions"
echo "=========================================="

# 使用 rasa run actions 啟動 action server
rasa run actions --port "$PORT" --cors "*" || {
  echo "❌ Action Server 啟動失敗"
  echo "請檢查日誌以獲取更多信息"
  exit 1
}
