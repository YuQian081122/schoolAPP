"""
對話記錄模組
記錄所有用戶消息和 AI 回覆到文件
"""

import json
import os
from datetime import datetime
from pathlib import Path
import threading

# 對話記錄文件
LOG_DIR = Path(__file__).parent.parent / "conversation_logs"
LOG_DIR.mkdir(exist_ok=True)

# 線程鎖，確保線程安全
_log_lock = threading.Lock()

# 當天日誌文件
def get_log_file():
    """獲取當天的日誌文件路徑"""
    today = datetime.now().strftime("%Y%m%d")
    return LOG_DIR / f"conversations_{today}.jsonl"


def log_user_message(sender_id, message, metadata=None):
    """記錄用戶消息"""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "type": "user",
        "sender_id": sender_id,
        "message": message,
        "metadata": metadata or {}
    }
    
    _write_log(log_entry)


def log_bot_response(sender_id, response_text, response_data=None, metadata=None):
    """記錄 AI 回覆"""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "type": "bot",
        "sender_id": sender_id,
        "response_text": response_text,
        "response_data": response_data,
        "metadata": metadata or {}
    }
    
    _write_log(log_entry)


def log_action_executed(sender_id, action_name, action_data=None):
    """記錄執行的 Action"""
    log_entry = {
        "timestamp": datetime.now().isoformat(),
        "type": "action",
        "sender_id": sender_id,
        "action_name": action_name,
        "action_data": action_data or {}
    }
    
    _write_log(log_entry)


def _write_log(entry):
    """寫入日誌（線程安全）"""
    with _log_lock:
        log_file = get_log_file()
        try:
            with open(log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(entry, ensure_ascii=False) + '\n')
        except Exception as e:
            print(f"⚠️ 寫入對話日誌失敗: {e}")


def get_conversations(date=None, sender_id=None, limit=None):
    """讀取對話記錄"""
    if date:
        log_file = LOG_DIR / f"conversations_{date}.jsonl"
    else:
        log_file = get_log_file()
    
    if not log_file.exists():
        return []
    
    conversations = []
    try:
        with open(log_file, 'r', encoding='utf-8') as f:
            for line in f:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                    if sender_id is None or entry.get('sender_id') == sender_id:
                        conversations.append(entry)
                except json.JSONDecodeError:
                    continue
    except Exception as e:
        print(f"⚠️ 讀取對話日誌失敗: {e}")
    
    if limit:
        conversations = conversations[-limit:]
    
    return conversations


def get_all_conversation_files():
    """獲取所有對話日誌文件"""
    return sorted(LOG_DIR.glob("conversations_*.jsonl"), reverse=True)

