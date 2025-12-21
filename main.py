#!/usr/bin/env python3
"""
Zeabur 入口文件 - 重定向到 Rasa 啟動腳本
如果 Zeabur 自動檢測並執行此文件，它會直接調用 start.sh
實際服務應該通過 Dockerfile 中的 CMD 命令啟動
"""
import subprocess
import sys
import os
import time

# 直接使用絕對路徑執行 start.sh（start.sh 內部會處理目錄切換）
start_script = '/app/rasa/start.sh'

# 等待文件系統就緒（最多等待 10 秒）
max_wait = 10
waited = 0

while not os.path.exists(start_script) and waited < max_wait:
    time.sleep(1)
    waited += 1

# 檢查 start.sh 是否存在
if not os.path.exists(start_script):
    print(f"錯誤: {start_script} 文件不存在", file=sys.stderr)
    print("請確保 Dockerfile 正確複製了 rasa 目錄", file=sys.stderr)
    sys.exit(1)

# 直接執行 start.sh（使用絕對路徑，不需要切換目錄）
# start.sh 內部會處理目錄切換
sys.exit(subprocess.run(['/bin/bash', start_script]).returncode)
