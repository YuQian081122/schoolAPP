#!/bin/bash
set -e

# 確保在 rasa 目錄
cd "$(dirname "$0")" || cd rasa || exit 1

# 檢查是否有模型文件
if ls models/*.tar.gz 1> /dev/null 2>&1; then
  MODEL_FILE=$(ls -t models/*.tar.gz | head -n 1)
  echo "找到現有模型: $MODEL_FILE"
  echo "跳過訓練，直接啟動服務..."
else
  echo "未找到模型文件，開始訓練..."
  # 使用更輕量的訓練配置以節省內存
  rasa train --quiet --data data --config config.yml --domain domain.yml || {
    echo "訓練失敗，嘗試使用更簡單的配置..."
    rasa train --quiet --data data
  }
fi

# 啟動 Rasa 服務
echo "啟動 Rasa 服務器在端口 $PORT..."
rasa run --enable-api --cors "*" --port "$PORT"
