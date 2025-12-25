#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Rasa Action Server 啟動腳本（Python 版本）
用於獨立部署 Action Server
"""
import os
import sys
import io

# 設置 Windows 終端編碼（如果可能）
if os.name == 'nt':  # Windows
    try:
        # 嘗試設置 UTF-8 編碼
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except:
        pass

# 設置工作目錄和 Python 路徑
# 如果是 Windows 本地開發，使用當前腳本所在目錄
if os.name == 'nt':  # Windows
    WORKDIR = os.path.dirname(os.path.abspath(__file__))
else:  # Linux/Docker
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

# 檢查 action 目錄
if not os.path.exists("action"):
    print("❌ 錯誤: action 目錄不存在")
    print(f"📂 當前目錄內容: {os.listdir('.')}")
    sys.exit(1)

# 嘗試導入 action
try:
    print("🔍 檢查 action 模塊...")
    from action import actions
    print("✅ action 模塊導入成功")
except Exception as e:
    print(f"⚠️  警告: action 模塊導入可能有問題: {e}")
    print("繼續啟動...")

# 啟動 Action Server
print("🚀 啟動 Rasa Action Server...")
print("=" * 50)

# 嘗試使用標準的 rasa-sdk 啟動方式
use_fallback = False
try:
    # 嘗試多種可能的導入路徑
    try:
        from rasa_sdk.endpoint import run
    except ImportError:
        try:
            from rasa_sdk.endpoints import run
        except ImportError:
            # 如果都失敗，使用備用方法
            raise ImportError("無法導入 rasa_sdk.endpoint 或 rasa_sdk.endpoints")
    
    print("[INFO] 使用標準 Rasa SDK 啟動方式")
    # 啟動服務器（這會阻塞，如果成功不會返回）
    run(
        actions="action",
        port=PORT,
        cors="*"
    )
except (ImportError, Exception) as e:
    print(f"[WARN] 標準啟動方式失敗: {e}")
    print("[INFO] 嘗試使用備用方法（自定義 Sanic 實現）...")
    use_fallback = True

# 如果標準方法失敗，使用備用方法
if use_fallback:
    # 備用方法：直接使用 Sanic
    try:
        from sanic import Sanic
        from sanic_cors import CORS
        from rasa_sdk.executor import ActionExecutor
        
        app = Sanic("RasaActionServer")
        CORS(app)
        
        executor = ActionExecutor()
        executor.register_package("action")
        
        # 添加調試端點
        @app.get("/")
        async def root(request):
            from sanic.response import json
            return json({
                "status": "ok",
                "message": "Rasa Action Server is running",
                "endpoints": ["/webhook", "/health"]
            })
        
        @app.post("/webhook")
        async def webhook(request):
            from rasa_sdk import Tracker
            from rasa_sdk.executor import CollectingDispatcher
            from rasa_sdk.interfaces import ActionExecutionRejection
            from sanic.response import json
            
            try:
                data = request.json
                print(f"[INFO] 收到 webhook 請求: {list(data.keys()) if data else 'None'}")
                
                if not data:
                    return json({"error": "Empty request body"}, status=400)
                
                # 首先嘗試使用 ActionExecutor 的標準 run 方法（Rasa SDK 3.x 標準方式）
                try:
                    # 確保數據格式正確（Rasa SDK 3.x 期望的格式）
                    # 如果數據已經包含 tracker 和 next_action，直接使用
                    if "tracker" in data and "next_action" in data:
                        # 使用 ActionExecutor.run() 標準方法處理請求
                        # 在 Rasa SDK 3.x 中，run() 方法接收完整的請求數據
                        result = executor.run(data)
                        print(f"[OK] ActionExecutor.run() 成功，返回結果類型: {type(result)}")
                        
                        # 如果返回的是事件列表，直接返回
                        if isinstance(result, list):
                            events_dict = []
                            for event in result:
                                if hasattr(event, 'as_dict'):
                                    events_dict.append(event.as_dict())
                                elif isinstance(event, dict):
                                    events_dict.append(event)
                                else:
                                    events_dict.append({"event": str(event)})
                            print(f"[INFO] 返回 {len(events_dict)} 個事件（標準方法）")
                            return json({"events": events_dict})
                        elif isinstance(result, dict):
                            # 如果返回的是字典，直接返回
                            print(f"[INFO] 返回字典結果（標準方法）")
                            return json(result)
                        else:
                            print(f"[WARN] ActionExecutor.run() 返回未知類型: {type(result)}")
                            # 繼續使用備用方法
                    else:
                        print("[WARN] 請求數據格式不完整，跳過標準方法")
                        raise ValueError("請求數據格式不完整")
                except Exception as e:
                    print(f"[WARN] ActionExecutor.run() 失敗: {e}")
                    import traceback
                    print(f"[DEBUG] 錯誤詳情: {traceback.format_exc()}")
                    print(f"[INFO] 嘗試使用備用方法處理請求...")
                
                # 備用方法：手動處理請求（如果標準方法失敗）
                # 構建 tracker 數據（Rasa 3.x 格式）
                tracker_dict = data.get("tracker", {})
                if not tracker_dict:
                    print("[WARN] 請求中沒有 tracker 數據，嘗試從其他字段構建...")
                    # 嘗試從請求的其他字段構建基本的 tracker
                    sender_id = data.get("sender_id", "default")
                    tracker_dict = {
                        "sender_id": sender_id,
                        "events": [],
                        "latest_message": {
                            "text": data.get("message", ""),
                            "intent": data.get("intent", {}),
                            "entities": data.get("entities", [])
                        },
                        "slots": data.get("slots", {}),
                        "paused": False,
                        "followup_action": None,
                        "active_loop": {},
                        "latest_action_name": None
                    }
                    print(f"[INFO] 構建的 tracker_dict keys: {list(tracker_dict.keys())}")
                
                # 確保 tracker 有必要的字段（Rasa 3.x 需要的字段）
                if "sender_id" not in tracker_dict:
                    tracker_dict["sender_id"] = data.get("sender_id", "default")
                
                # 確保有 events 字段
                if "events" not in tracker_dict:
                    tracker_dict["events"] = []
                
                # 確保有 latest_message 字段
                if "latest_message" not in tracker_dict:
                    tracker_dict["latest_message"] = {
                        "text": data.get("message", ""),
                        "intent": {},
                        "entities": []
                    }
                
                # 構建 tracker
                try:
                    tracker = Tracker.from_dict(tracker_dict)
                except Exception as e:
                    # 如果 from_dict 失敗，嘗試手動構建必要的字段
                    print(f"[WARN] Tracker.from_dict 失敗: {e}")
                    print(f"[INFO] Tracker 數據 keys: {list(tracker_dict.keys())}")
                    # 設置默認值
                    if "sender_id" not in tracker_dict:
                        tracker_dict["sender_id"] = "default"
                    if "events" not in tracker_dict:
                        tracker_dict["events"] = []
                    try:
                        tracker = Tracker.from_dict(tracker_dict)
                    except Exception as e2:
                        print(f"[ERROR] 無法構建 Tracker: {e2}")
                        return json({"error": f"Failed to create tracker: {str(e2)}"}, status=400)
                
                dispatcher = CollectingDispatcher()
                
                # 獲取要執行的動作（Rasa 3.x 使用 next_action 字段）
                action_name = data.get("next_action")
                if not action_name:
                    print("[WARN] 沒有 next_action，返回空事件")
                    return json({"events": [], "responses": []})

                # 前端/診斷用的 Action Server 連線檢查會用 action_listen（它是 Rasa 內建動作，不應由 Action Server 執行）
                # 為了讓健康檢查不誤判，這裡直接回 200。
                if action_name in {"action_listen", "action_session_start"}:
                    print(f"[INFO] 忽略內建動作: {action_name}（回傳空 events/responses）")
                    return json({"events": [], "responses": []})
                
                print(f"🔧 準備執行動作: {action_name}")
                print(f"📊 已註冊的動作數量: {len(executor.actions)}")
                
                # 執行動作 - 優先從 action 模塊直接獲取類
                try:
                    # 方法1：直接從 action 模塊獲取 Action 類（最可靠）
                    import action.actions as actions_module
                    import types
                    
                    # 根據 action_name 構建類名（例如 action_greet -> ActionGreet）
                    # 移除 action_ 前綴，然後轉換為駝峰命名
                    class_name_parts = action_name.replace('action_', '').split('_')
                    class_name = ''.join(word.capitalize() for word in class_name_parts)
                    class_name = f"Action{class_name}"
                    
                    print(f"🔍 嘗試從 action.actions 模塊獲取類: {class_name}")
                    
                    # 嘗試獲取類
                    action_class = None
                    if hasattr(actions_module, class_name):
                        candidate = getattr(actions_module, class_name)
                        if isinstance(candidate, type):
                            action_class = candidate
                            print(f"✅ 找到 Action 類: {class_name}")
                    
                    # 如果沒找到，嘗試從 action 包的 __init__.py 獲取（因為它導出了所有類）
                    if not action_class:
                        try:
                            from action import actions
                            if hasattr(actions, class_name):
                                candidate = getattr(actions, class_name)
                                if isinstance(candidate, type):
                                    action_class = candidate
                                    print(f"✅ 從 action 包找到 Action 類: {class_name}")
                        except Exception as e:
                            print(f"⚠️ 從 action 包獲取類失敗: {e}")
                    
                    # 如果還是沒找到，嘗試從 executor.actions 獲取
                    if not action_class and action_name in executor.actions:
                        action_item = executor.actions[action_name]
                        print(f"📦 Executor 中的 Action 類型: {type(action_item)}")
                        
                        # 如果是方法，嘗試獲取類
                        if isinstance(action_item, types.MethodType):
                            # 從方法獲取類
                            if hasattr(action_item, '__self__'):
                                action_class = action_item.__self__.__class__
                            elif hasattr(action_item, '__qualname__'):
                                qualname = action_item.__qualname__
                                if '.' in qualname:
                                    method_class_name = qualname.split('.')[0]
                                    try:
                                        action_class = getattr(actions_module, method_class_name, None)
                                    except:
                                        pass
                        elif isinstance(action_item, type):
                            action_class = action_item
                    
                    if not action_class:
                        print(f"❌ 動作 '{action_name}' 未找到")
                        print(f"📋 可用的動作: {list(executor.actions.keys())[:20]}...")  # 顯示前20個
                        return json({"error": f"Action '{action_name}' not found"}, status=404)
                    
                    # 實例化並執行動作
                    print(f"🔨 實例化 Action 類: {action_class.__name__}")
                    action_instance = action_class()
                    events = action_instance.run(dispatcher, tracker, {})
                    
                    print(f"✅ 動作執行成功，返回 {len(events) if events else 0} 個事件")
                    
                    # 將事件轉換為字典格式
                    events_dict = []
                    if events:
                        for event in events:
                            if hasattr(event, 'as_dict'):
                                events_dict.append(event.as_dict())
                            elif hasattr(event, '__dict__'):
                                # 如果事件沒有 as_dict 方法，嘗試手動構建
                                event_dict = {
                                    "event": event.__class__.__name__.lower(),
                                    "timestamp": getattr(event, 'timestamp', None),
                                }
                                # 添加其他屬性
                                for k, v in event.__dict__.items():
                                    if not k.startswith('_'):
                                        event_dict[k] = v
                                events_dict.append(event_dict)
                            elif isinstance(event, dict):
                                # 如果事件是字典，直接使用
                                events_dict.append(event)
                            else:
                                # 最後的備用方案
                                events_dict.append({"event": str(event)})
                    
                    responses = getattr(dispatcher, "messages", []) or []
                    print(f"📤 返回 {len(events_dict)} 個事件，{len(responses)} 個回應")
                    return json({"events": events_dict, "responses": responses})
                    
                except ActionExecutionRejection as e:
                    print(f"❌ Action 執行被拒絕: {e}")
                    return json({"error": str(e)}, status=400)
                except Exception as e:
                    import traceback
                    error_msg = f"Error executing action '{action_name}': {str(e)}\n{traceback.format_exc()}"
                    print(f"❌ {error_msg}")
                    return json({"error": error_msg}, status=500)
                    
            except Exception as e:
                import traceback
                error_msg = f"Error processing webhook: {str(e)}\n{traceback.format_exc()}"
                print(f"❌ {error_msg}")
                return json({"error": error_msg}, status=500)
        
        @app.get("/health")
        async def health(request):
            from sanic.response import json
            return json({"status": "ok"})
        
        # 打印所有註冊的路由（兼容不同版本的 Sanic）
        print("=" * 50)
        print("[INFO] 已註冊的路由:")
        try:
            # 嘗試新版本 Sanic 的路由結構
            if hasattr(app.router, 'routes_all'):
                for route in app.router.routes_all.values():
                    # 檢查是否有 handlers 屬性（舊版本）
                    if hasattr(route, 'handlers'):
                        for handler in route.handlers:
                            methods = getattr(handler, 'methods', ['GET'])
                            uri = getattr(handler, 'uri', getattr(route, 'path', 'unknown'))
                            print(f"  {methods} {uri}")
                    # 新版本直接使用 route 的屬性
                    elif hasattr(route, 'path'):
                        methods = getattr(route, 'methods', ['GET'])
                        path = getattr(route, 'path', 'unknown')
                        print(f"  {methods} {path}")
            # 嘗試其他方式獲取路由
            elif hasattr(app.router, 'routes'):
                for route in app.router.routes:
                    methods = getattr(route, 'methods', ['GET'])
                    path = getattr(route, 'path', 'unknown')
                    print(f"  {methods} {path}")
            else:
                print("  [無法列出路由]")
        except Exception as route_error:
            print(f"  [路由列表錯誤: {route_error}]")
        print("=" * 50)
        print(f"[INFO] 服務器將在 http://0.0.0.0:{PORT} 啟動")
        print("=" * 50)
        
        app.run(host="0.0.0.0", port=PORT, debug=False)
    except Exception as e2:
        print(f"❌ 備用方法也失敗: {e2}")
        sys.exit(1)

