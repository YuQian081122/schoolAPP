#!/usr/bin/env python3
"""
Rasa Action Server 啟動腳本（Python 版本）
用於獨立部署 Action Server
"""
import os
import sys

# 設置工作目錄和 Python 路徑
WORKDIR = "/app"
os.chdir(WORKDIR)
sys.path.insert(0, WORKDIR)

# 設置端口
PORT = int(os.environ.get("PORT", 5055))

print("=" * 50)
print("🚀 Rasa Action Server 啟動")
print("=" * 50)
print(f"📂 工作目錄: {os.getcwd()}")
print(f"🔧 端口: {PORT}")
print(f"🔧 PYTHONPATH: {sys.path[0]}")
print("=" * 50)

# 檢查 actions 目錄
if not os.path.exists("actions"):
    print("❌ 錯誤: actions 目錄不存在")
    print(f"📂 當前目錄內容: {os.listdir('.')}")
    sys.exit(1)

# 嘗試導入 actions
try:
    print("🔍 檢查 actions 模塊...")
    from actions import actions
    print("✅ actions 模塊導入成功")
except Exception as e:
    print(f"⚠️  警告: actions 模塊導入可能有問題: {e}")
    print("繼續啟動...")

# 啟動 Action Server
print("🚀 啟動 Rasa Action Server...")
print("=" * 50)

try:
    # 使用 rasa-sdk 的標準啟動方式
    from rasa_sdk.endpoints import run
    
    # 啟動服務器
    run(
        actions="actions",
        port=PORT,
        cors="*"
    )
except ImportError as e:
    print(f"❌ 錯誤: 無法導入 rasa_sdk.endpoints: {e}")
    print("嘗試使用備用方法...")
    
    # 備用方法：直接使用 Sanic
    try:
        from sanic import Sanic
        from sanic_cors import CORS
        from rasa_sdk.executor import ActionExecutor
        
        app = Sanic("RasaActionServer")
        CORS(app)
        
        executor = ActionExecutor()
        executor.register_package("actions")
        
        @app.post("/webhook")
        async def webhook(request):
            from rasa_sdk import Tracker
            from rasa_sdk.executor import CollectingDispatcher
            
            data = request.json
            tracker = Tracker.from_dict(data.get("tracker", {}))
            dispatcher = CollectingDispatcher()
            
            action_name = data.get("next_action")
            if action_name:
                events = executor.run(action_name, dispatcher, tracker)
                return {"events": [e.as_dict() for e in events]}
            
            return {"events": []}
        
        @app.get("/health")
        async def health(request):
            return {"status": "ok"}
        
        app.run(host="0.0.0.0", port=PORT, debug=False)
    except Exception as e2:
        print(f"❌ 備用方法也失敗: {e2}")
        sys.exit(1)
