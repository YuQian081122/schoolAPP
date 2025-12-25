#!/bin/bash
# 移除 set -e，允許在訓練失敗時繼續執行

# 確保在 rasa 目錄（使用絕對路徑更可靠）
SCRIPT_DIR="/app/rasa"
cd "$SCRIPT_DIR" || {
  echo "錯誤: 無法切換到目錄 $SCRIPT_DIR"
  exit 1
}

# 設置 Python 路徑，確保 actions 模塊可以被找到
export PYTHONPATH="${PYTHONPATH}:$SCRIPT_DIR"

# 設置默認端口（Zeabur 會自動設置 PORT 環境變數）
export PORT=${PORT:-5005}

# ====== Action Server (cloud) wiring ======
# 本專案在 Zeabur 會將 Rasa 與 Action Server 分開部署。
# Rasa 的 action_endpoint 需要指向 Action Server 的 /webhook。
#
# 注意：Rasa 3.5.x 的 endpoints.yml 內插在某些環境可能不生效（會把 ${...} 當成字串），
# 因此這裡在啟動時直接把 endpoints.yml 生成成「確定的 URL」以避免雲端連線失敗。
#
# Zeabur 會自動注入互相連線用的 host（例如 RASA_ACTION_SERVER_HOST），
# 若你也有手動設 ACTION_SERVER_URL，會優先使用手動設定。
ACTION_SERVER_BASE_URL=""
if [ -n "${ACTION_SERVER_URL:-}" ]; then
  ACTION_SERVER_BASE_URL="$ACTION_SERVER_URL"
elif [ -n "${RASA_ACTION_SERVER_HOST:-}" ]; then
  ACTION_SERVER_BASE_URL="$RASA_ACTION_SERVER_HOST"
fi

if [ -n "$ACTION_SERVER_BASE_URL" ]; then
  # 若只有 host（沒有 http/https），補上 https://
  case "$ACTION_SERVER_BASE_URL" in
    http://*|https://*) ;;
    *) ACTION_SERVER_BASE_URL="https://$ACTION_SERVER_BASE_URL" ;;
  esac

  # 移除尾端 /
  ACTION_SERVER_BASE_URL="${ACTION_SERVER_BASE_URL%/}"

  echo "🔗 雲端模式：設定 action server -> ${ACTION_SERVER_BASE_URL}/webhook"
  cat > endpoints.yml <<EOF
action_endpoint:
  url: "${ACTION_SERVER_BASE_URL}/webhook"

tracker_store:
  type: InMemoryTrackerStore
EOF
fi

# 調試信息：環境變數和目錄
echo "=========================================="
echo "🚀 Rasa 服務啟動腳本"
echo "=========================================="
echo "📂 當前工作目錄: $(pwd)"
echo "🔧 PORT: $PORT"
echo "🔧 SUPABASE_MODEL_URL: ${SUPABASE_MODEL_URL:-未設置}"
echo "🔧 MODEL_DOWNLOAD_URL: ${MODEL_DOWNLOAD_URL:-未設置}"
echo "🔧 VOLUME_MODEL_PATH: ${VOLUME_MODEL_PATH:-未設置}"
echo "=========================================="

# 初始化模型文件變數
MODEL_FILE=""

# 優先檢查 Supabase Storage URL 並下載模型
if [ -n "$SUPABASE_MODEL_URL" ]; then
  echo "📥 檢測到 SUPABASE_MODEL_URL，準備從 Supabase Storage 下載模型"
  echo "📍 URL: $SUPABASE_MODEL_URL"
  MODEL_NAME=$(basename "$SUPABASE_MODEL_URL")
  mkdir -p models/
  echo "📂 下載目標: models/$MODEL_NAME"
  
  # 嘗試使用 wget 或 curl 下載（使用內置超時選項，更兼容）
  if command -v wget > /dev/null 2>&1; then
    echo "📥 使用 wget 下載（超時 600 秒，重試 3 次）..."
    if wget --timeout=600 --tries=3 --retry-connrefused -O "models/$MODEL_NAME" "$SUPABASE_MODEL_URL" 2>&1; then
      echo "✅ 模型從 Supabase Storage 下載成功: models/$MODEL_NAME"
      MODEL_FILE="models/$MODEL_NAME"
    else
      echo "❌ wget 下載失敗（超時或網絡錯誤）"
    fi
  elif command -v curl > /dev/null 2>&1; then
    echo "📥 使用 curl 下載（超時 600 秒，重試 3 次）..."
    if curl -L --max-time 600 --connect-timeout 30 --retry 3 --retry-delay 5 -f -o "models/$MODEL_NAME" "$SUPABASE_MODEL_URL" 2>&1; then
      echo "✅ 模型從 Supabase Storage 下載成功: models/$MODEL_NAME"
      MODEL_FILE="models/$MODEL_NAME"
    else
      echo "❌ curl 下載失敗（超時或網絡錯誤）"
    fi
  else
    echo "❌ 未找到 wget 或 curl，無法下載模型"
  fi
  
  if [ -n "$MODEL_FILE" ] && [ -f "$MODEL_FILE" ]; then
    FILE_SIZE=$(du -h "$MODEL_FILE" | cut -f1)
    echo "✅ 模型文件已下載: $MODEL_FILE (大小: $FILE_SIZE)"
    echo "⏭️  跳過訓練，直接啟動服務..."
  else
    echo "⚠️  模型下載失敗或文件不存在"
  fi
fi

# 如果 Supabase 下載失敗，嘗試其他 URL
if [ -z "$MODEL_FILE" ] && [ -n "$MODEL_DOWNLOAD_URL" ]; then
  echo "📥 嘗試從 MODEL_DOWNLOAD_URL 下載模型: $MODEL_DOWNLOAD_URL"
  MODEL_NAME=$(basename "$MODEL_DOWNLOAD_URL")
  mkdir -p models/
  if command -v wget > /dev/null 2>&1; then
    wget --timeout=600 --tries=3 --retry-connrefused -O "models/$MODEL_NAME" "$MODEL_DOWNLOAD_URL" 2>&1
  elif command -v curl > /dev/null 2>&1; then
    curl -L --max-time 600 --connect-timeout 30 --retry 3 --retry-delay 5 -f -o "models/$MODEL_NAME" "$MODEL_DOWNLOAD_URL" 2>&1
  fi
  
  if [ -f "models/$MODEL_NAME" ]; then
    echo "✅ 模型下載成功: models/$MODEL_NAME"
    MODEL_FILE="models/$MODEL_NAME"
  fi
fi

# 檢查是否使用 Volume 存儲模型
if [ -z "$MODEL_FILE" ] && [ -n "$VOLUME_MODEL_PATH" ] && [ -f "$VOLUME_MODEL_PATH" ]; then
  echo "📦 從 Volume 載入模型: $VOLUME_MODEL_PATH"
  MODEL_NAME=$(basename "$VOLUME_MODEL_PATH")
  mkdir -p models/
  cp "$VOLUME_MODEL_PATH" "models/$MODEL_NAME"
  echo "✅ 模型已從 Volume 複製到 models/$MODEL_NAME"
  MODEL_FILE="models/$MODEL_NAME"
fi

# 檢查本地是否已有模型文件
if [ -z "$MODEL_FILE" ]; then
  echo "📂 檢查本地模型目錄..."
  mkdir -p models/
  if ls models/*.tar.gz 1> /dev/null 2>&1; then
    MODEL_FILE=$(ls -t models/*.tar.gz | head -n1)
    echo "✅ 找到本地模型文件: $MODEL_FILE"
  else
    echo "⚠️  本地模型目錄中沒有找到 .tar.gz 文件"
  fi
fi

# 如果沒有找到模型，嘗試訓練
if [ -z "$MODEL_FILE" ]; then
  echo "⚠️  沒有找到任何模型文件，嘗試訓練模型..."
  # 檢查訓練數據是否存在
  if [ -f "data/nlu.yml" ] && [ -f "data/rules.yml" ] && [ -f "domain.yml" ] && [ -f "config.yml" ]; then
    echo "📚 訓練數據存在，開始訓練模型..."
    rasa train || {
      echo "⚠️  訓練失敗，嘗試繼續啟動服務（可能沒有模型）"
    }
    # 訓練完成後，選擇最新模型
    if ls models/*.tar.gz 1> /dev/null 2>&1; then
      MODEL_FILE=$(ls -t models/*.tar.gz | head -n1)
      echo "✅ 訓練完成，最新模型: $MODEL_FILE"
    fi
  else
    echo "❌ 訓練數據不完整，無法訓練模型"
    echo "請確保 data/nlu.yml, data/rules.yml, domain.yml, config.yml 存在"
  fi
fi

# 設置內存優化（避免 OOM）
export TF_FORCE_GPU_ALLOW_GROWTH=true
export TF_CPP_MIN_LOG_LEVEL=2
export OMP_NUM_THREADS=1
export MKL_NUM_THREADS=1
export NUMBA_NUM_THREADS=1
export PYTHONHASHSEED=0
export PYTHONUNBUFFERED=1

# 啟動 Rasa 服務
echo "=========================================="
echo "🚀 啟動 Rasa 服務器在端口 $PORT..."
echo "📡 CORS 已啟用: *"
echo "🌐 API 端點: http://0.0.0.0:$PORT"
echo "=========================================="

# 啟動服務（使用標準的 Rasa 啟動命令格式）
# Rasa 默認會監聽所有接口（0.0.0.0），無需指定 -i 參數
# Rasa 3.5.17 使用標準的 rasa run 命令
# 如果要使用內聯動作，確保：
# 1. actions 目錄在 PYTHONPATH 中（已在上面設置）
# 2. endpoints.yml 中不設置 action_endpoint（已正確配置）
# 3. 直接使用標準的 rasa run 命令即可
rasa run --port "$PORT" --enable-api --cors "*" || {
  echo "❌ 服務啟動失敗"
  echo "請檢查日誌以獲取更多信息"
  exit 1
}
