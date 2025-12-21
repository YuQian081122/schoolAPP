#!/usr/bin/env python3
"""
Zeabur 入口文件 - 重定向到 Rasa 啟動腳本
這個文件是為了防止 Zeabur 自動檢測時嘗試運行不存在的 main.py
實際服務通過 Dockerfile 中的 CMD 命令啟動
"""
import subprocess
import sys
import os

# 切換到 rasa 目錄
os.chdir('/app/rasa')

# 執行 start.sh
sys.exit(subprocess.run(['/bin/bash', 'start.sh']).returncode)
