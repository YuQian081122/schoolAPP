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

# 設置默認端口（Railway 會自動設置 PORT 環境變數）
export PORT=${PORT:-5005}

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
    MODEL_FILE=$(ls -t models/*.tar.gz | head -n 1)
    echo "✅ 找到現有模型: $MODEL_FILE"
  else
    echo "⚠️  本地未找到模型文件"
  fi
fi

# 如果還是沒有模型文件，嘗試訓練
if [ -z "$MODEL_FILE" ] && ! ls models/*.tar.gz 1> /dev/null 2>&1; then
  echo "⚠️  未找到模型文件，嘗試訓練..."
  echo "💡 注意：訓練可能需要較長時間且可能因記憶體不足而失敗"
  
  # 嘗試訓練，但如果失敗則繼續執行
  TRAIN_SUCCESS=false
  
  # 第一次嘗試：使用完整配置
  if rasa train --quiet --data data --config config.yml --domain domain.yml 2>&1; then
    TRAIN_SUCCESS=true
    echo "✅ 訓練成功完成！"
  else
    echo "⚠️  完整配置訓練失敗，嘗試使用更簡單的配置..."
    # 第二次嘗試：使用最小配置
    if rasa train --quiet --data data 2>&1; then
      TRAIN_SUCCESS=true
      echo "✅ 簡單配置訓練成功完成！"
    else
      echo "❌ 訓練失敗（可能是記憶體不足）"
      echo "⚠️  將嘗試啟動服務（如果沒有模型，服務可能會有限制）"
      TRAIN_SUCCESS=false
    fi
  fi
  
  # 檢查訓練後是否有模型文件
  if [ "$TRAIN_SUCCESS" = true ] || ls models/*.tar.gz 1> /dev/null 2>&1; then
    MODEL_FILE=$(ls -t models/*.tar.gz | head -n 1)
    echo "✅ 訓練後找到模型: $MODEL_FILE"
  else
    echo "⚠️  警告：沒有找到模型文件，服務可能無法正常工作"
    echo "💡 建議：確保 SUPABASE_MODEL_URL 環境變數正確設置"
  fi
fi

# 最終檢查模型文件
echo "=========================================="
if [ -n "$MODEL_FILE" ] && [ -f "$MODEL_FILE" ]; then
  echo "✅ 模型文件已準備: $MODEL_FILE"
  FILE_SIZE=$(du -h "$MODEL_FILE" | cut -f1)
  echo "   大小: $FILE_SIZE"
elif ls models/*.tar.gz 1> /dev/null 2>&1; then
  MODEL_FILE=$(ls -t models/*.tar.gz | head -n 1)
  echo "✅ 找到模型文件: $MODEL_FILE"
else
  echo "⚠️  警告：未找到模型文件，服務可能無法正常工作"
  echo "   將嘗試啟動服務，但可能會有功能限制"
fi
echo "=========================================="

# 優化記憶體使用 - 設置 TensorFlow 環境變數
export TF_FORCE_GPU_ALLOW_GROWTH=true
export TF_GPU_ALLOCATOR=cuda_malloc_async
export TF_CPP_MIN_LOG_LEVEL=2  # 減少 TensorFlow 日誌輸出
export OMP_NUM_THREADS=1  # 限制 OpenMP 線程
export MKL_NUM_THREADS=1  # 限制 MKL 線程
export NUMBA_NUM_THREADS=1  # 限制 Numba 線程

# Python 記憶體優化
export PYTHONHASHSEED=0
export PYTHONUNBUFFERED=1

# 限制 TensorFlow 記憶體使用（使用增量的記憶體分配）
export TF_FORCE_UNIFIED_MEMORY=0

echo "🔧 記憶體優化設置已應用"
echo "   - TensorFlow GPU 增長模式"
echo "   - 限制線程數量"
echo "   - 減少日誌輸出"
echo "=========================================="

# 啟動 Rasa 服務（即使訓練失敗也嘗試啟動）
echo "🚀 啟動 Rasa 服務器在端口 $PORT..."
echo "📡 CORS 已啟用: *"
echo "🌐 API 端點: http://0.0.0.0:$PORT"
echo "=========================================="

# 啟動服務（使用正確的參數格式）
# 注意：Rasa 3.x 使用 -i 或 --interface 指定主機，而不是 --host
rasa run --enable-api --cors "*" --port "$PORT" -i "0.0.0.0" || {
  echo "❌ 服務啟動失敗"
  echo "請檢查日誌以獲取更多信息"
  exit 1
}


