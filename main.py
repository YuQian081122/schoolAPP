#!/usr/bin/env python3
"""
Zeabur 入口文件 - 重定向到 Rasa 啟動腳本
這個文件是為了防止 Zeabur 自動檢測時嘗試運行不存在的 main.py
實際服務通過 Dockerfile 中的 CMD 命令啟動
"""
import subprocess
import sys
import os
import time

# 等待文件系統就緒（最多等待 10 秒）
rasa_dir = '/app/rasa'
start_script = '/app/rasa/start.sh'
max_wait = 10
waited = 0

while not os.path.exists(rasa_dir) and waited < max_wait:
    time.sleep(1)
    waited += 1

# 檢查目錄是否存在
if not os.path.exists(rasa_dir):
    print(f"錯誤: {rasa_dir} 目錄不存在", file=sys.stderr)
    print("請確保 Dockerfile 正確複製了 rasa 目錄", file=sys.stderr)
    sys.exit(1)

# 檢查 start.sh 是否存在
if not os.path.exists(start_script):
    print(f"錯誤: {start_script} 文件不存在", file=sys.stderr)
    sys.exit(1)

# 切換到 rasa 目錄
try:
    os.chdir(rasa_dir)
except OSError as e:
    print(f"錯誤: 無法切換到 {rasa_dir}: {e}", file=sys.stderr)
    sys.exit(1)

# 執行 start.sh
sys.exit(subprocess.run(['/bin/bash', 'start.sh']).returncode)
