#!/bin/bash
# 移除 set -e，允許在訓練失敗時繼續執行

# 確保在 rasa 目錄
cd "$(dirname "$0")" || cd rasa || exit 1

# 設置 Python 路徑，確保 actions 模塊可以被找到
export PYTHONPATH="${PYTHONPATH}:$(pwd)"

# 設置默認端口（Railway 會自動設置 PORT 環境變數）
export PORT=${PORT:-5005}

# 調試信息：環境變數和目錄
echo "=========================================="
echo "🚀 Rasa 服務啟動腳本"
echo "=========================================="
echo "📂 當前工作目錄: $(pwd)"
echo "🔧 PORT: $PORT"
echo "🔧 PYTHONPATH: $PYTHONPATH"
echo "🔧 SUPABASE_MODEL_URL: ${SUPABASE_MODEL_URL:-未設置}"
echo "🔧 MODEL_DOWNLOAD_URL: ${MODEL_DOWNLOAD_URL:-未設置}"
echo "🔧 VOLUME_MODEL_PATH: ${VOLUME_MODEL_PATH:-未設置}"
echo "=========================================="
