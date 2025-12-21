# Rasa Dockerfile for Zeabur / Cloud Platforms
FROM python:3.10-slim

# 設置工作目錄
WORKDIR /app

# 安裝系統依賴
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    wget \
    && rm -rf /var/lib/apt/lists/*

# 升級 pip、setuptools 和 wheel
RUN pip install --upgrade pip setuptools wheel

# 複製 requirements.txt
COPY rasa/requirements.txt /app/requirements.txt

# 安裝 Python 依賴
RUN pip install --no-cache-dir -r requirements.txt

# 複製 Rasa 項目文件
COPY rasa/ /app/rasa/

# 複製入口文件（如果需要）
COPY main.py /app/main.py
RUN chmod +x /app/main.py

# 設置工作目錄為 rasa
WORKDIR /app/rasa

# 創建模型目錄
RUN mkdir -p models/

# 確保 start.sh 有執行權限
RUN chmod +x /app/rasa/start.sh

# 設置環境變數（優化記憶體）
ENV TF_FORCE_GPU_ALLOW_GROWTH=true
ENV TF_CPP_MIN_LOG_LEVEL=2
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV NUMBA_NUM_THREADS=1
ENV PYTHONHASHSEED=0
ENV PYTHONUNBUFFERED=1

# 暴露端口（Zeabur 會自動設置 PORT 環境變數）
ENV PORT=8080
EXPOSE 8080

# 使用 start.sh 啟動（使用絕對路徑）
CMD ["/bin/bash", "/app/rasa/start.sh"]
