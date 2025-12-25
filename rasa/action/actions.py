"""
Rasa 自訂動作 (Custom Actions)
處理設施查詢、距離計算、地圖顯示等功能
"""

from typing import Any, Text, Dict, List, Optional
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet
import json
import math
import re
import random
import logging
import html
from datetime import datetime
from functools import lru_cache
from concurrent.futures import ThreadPoolExecutor, as_completed
import sys
import os

# 配置日誌（必須在導入其他模塊之前）
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 導入 LINE 通知服務
try:
    # 將 line_bot 目錄加入路徑（相對於 rasa/actions 目錄）
    line_bot_path = os.path.join(os.path.dirname(__file__), '..', '..', 'line_bot')
    if os.path.exists(line_bot_path) and line_bot_path not in sys.path:
        sys.path.insert(0, os.path.dirname(line_bot_path))
    
    from line_bot.notification_service import get_notification_service
    LINE_NOTIFICATION_AVAILABLE = True
except ImportError as e:
    logger.warning(f"無法導入 LINE 通知服務: {e}")
    LINE_NOTIFICATION_AVAILABLE = False
    get_notification_service = None

# 導入配置和工具
try:
    from .config import (
        FACILITY_TYPES, FACILITY_STATUSES, CAMPUSES, BUILDINGS,
        PERFORMANCE_CONFIG, LANGUAGE_CONFIG, VALIDATION_CONFIG
    )
    from .utils import (
        facility_cache, rate_limiter, conversation_memory,
        validate_facility_type, validate_status, validate_campus,
        get_facility_name, get_status_name,
        normalize_facility_type, normalize_status
    )
except ImportError:
    # 如果無法導入（可能是直接運行），使用默認值
    FACILITY_TYPES = {}
    FACILITY_STATUSES = {}
    facility_cache = None
    rate_limiter = None

# 預編譯正則表達式（性能優化）
CHINESE_PATTERN = re.compile(r'[\u4e00-\u9fff]')
ENGLISH_PATTERN = re.compile(r'[a-zA-Z]')
NON_WORD_PATTERN = re.compile(r'[^\w\s]')

# 常量定義（從配置導入，如果可用）
try:
    ENGLISH_THRESHOLD = LANGUAGE_CONFIG.get('english_threshold', 0.5)
    MAX_INPUT_LENGTH = PERFORMANCE_CONFIG.get('max_input_length', 500)
except NameError:
    ENGLISH_THRESHOLD = 0.5
    MAX_INPUT_LENGTH = 500

# 錯誤消息
ERROR_MESSAGES = {
    'zh': {
        'general': '抱歉，發生了錯誤，請稍後再試。',
        'no_facility': '抱歉，附近沒有找到您要的設施。',
        'gps_error': '無法獲取您的位置，請檢查 GPS 權限。',
        'network_error': '網絡連接失敗，請檢查網絡設置。',
        'invalid_input': '輸入無效，請重新輸入。'
    },
    'en': {
        'general': 'Sorry, an error occurred. Please try again later.',
        'no_facility': 'Sorry, no facilities found nearby.',
        'gps_error': 'Unable to get your location. Please check GPS permissions.',
        'network_error': 'Network connection failed. Please check your network.',
        'invalid_input': 'Invalid input. Please try again.'
    }
}


def sanitize_input(text: Optional[str]) -> str:
    """
    清理和驗證用戶輸入
    
    Args:
        text: 用戶輸入文本
        
    Returns:
        清理後的文本
    """
    if not text:
        return ""
    
    # HTML 轉義
    text = html.escape(str(text))
    
    # 限制長度
    if len(text) > MAX_INPUT_LENGTH:
        text = text[:MAX_INPUT_LENGTH]
        logger.warning(f"Input truncated to {MAX_INPUT_LENGTH} characters")
    
    return text.strip()


def detect_language(text: str) -> str:
    """
    檢測文本語言
    返回 'en' 或 'zh'
    
    Args:
        text: 要檢測的文本
        
    Returns:
        'zh' 或 'en'
        
    Examples:
        >>> detect_language("你好")
        'zh'
        >>> detect_language("Hello")
        'en'
    """
    if not text:
        return 'zh'
    
    # 檢查是否包含中文字符（使用預編譯的正則表達式）
    has_chinese = bool(CHINESE_PATTERN.search(text))
    
    # 如果包含中文，返回中文
    if has_chinese:
        return 'zh'
    
    # 檢查是否主要是英文字符
    english_chars = len(ENGLISH_PATTERN.findall(text))
    total_chars = len(NON_WORD_PATTERN.sub('', text))
    
    # 如果英文字符佔比超過閾值，視為英文
    if total_chars > 0 and english_chars / total_chars > ENGLISH_THRESHOLD:
        return 'en'
    
    # 默認返回中文
    return 'zh'


def get_language_from_tracker(tracker: Optional[Tracker]) -> str:
    """
    從 tracker 獲取語言
    優先使用 slot，否則從最新消息檢測
    
    Args:
        tracker: Rasa tracker 對象
        
    Returns:
        'zh' 或 'en'
        
    Raises:
        AttributeError: 如果 tracker 為 None
    """
    if tracker is None:
        logger.error("Tracker is None")
        return 'zh'  # 默認返回中文
    
    try:
        language = tracker.get_slot("language")
        if language:
            return language
        
        # 從最新消息檢測語言
        last_message = tracker.latest_message.get("text", "") or ""
        detected_lang = detect_language(last_message)
        
        return detected_lang
    except Exception as e:
        logger.error(f"Error getting language from tracker: {str(e)}")
        return 'zh'  # 默認返回中文


class _BaseAction(Action):
    """
    基礎 Action 類，提供通用功能
    注意：類名以下劃線開頭，避免被 Rasa SDK 自動註冊
    """
    
    def name(self) -> Text:
        """
        子類必須實現此方法
        返回 None 表示這不是一個可註冊的 Action
        """
        return None  # 返回 None 而不是拋出異常，避免被 Rasa SDK 註冊
    
    def get_language(self, tracker: Optional[Tracker]) -> str:
        """獲取語言"""
        return get_language_from_tracker(tracker)
    
    def get_error_message(self, error_type: str, language: str) -> str:
        """獲取錯誤消息"""
        return ERROR_MESSAGES.get(language, ERROR_MESSAGES['zh']).get(error_type, ERROR_MESSAGES['zh']['general'])
    
    def get_user_id(self, tracker: Optional[Tracker]) -> str:
        """獲取用戶 ID"""
        if tracker is None:
            return "anonymous"
        # 嘗試從 tracker 獲取用戶 ID
        sender_id = tracker.sender_id if hasattr(tracker, 'sender_id') else "anonymous"
        return sender_id or "anonymous"
    
    def remember(self, tracker: Optional[Tracker], key: str, value: Any) -> None:
        """記住用戶偏好"""
        if conversation_memory:
            user_id = self.get_user_id(tracker)
            conversation_memory.remember(user_id, key, value)
    
    def recall(self, tracker: Optional[Tracker], key: str, default: Any = None) -> Any:
        """回憶用戶偏好"""
        if conversation_memory:
            user_id = self.get_user_id(tracker)
            return conversation_memory.recall(user_id, key, default)
        return default
    
    def get_user_context(self, tracker: Optional[Tracker]) -> Dict[str, Any]:
        """獲取用戶完整上下文"""
        if conversation_memory:
            user_id = self.get_user_id(tracker)
            return conversation_memory.get_user_context(user_id)
        return {}
    
    def safe_run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        """
        安全的 run 方法，包含錯誤處理
        
        子類應該實現 _run 方法而不是 run 方法
        """
        try:
            return self._run(dispatcher, tracker, domain)
        except Exception as e:
            action_name = self.name() or "Unknown"
            logger.error(f"Error in {action_name}: {str(e)}", exc_info=True)
            language = self.get_language(tracker)
            error_msg = self.get_error_message('general', language)
            dispatcher.utter_message(text=error_msg)
            return []
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        """默認調用 safe_run，子類可以覆蓋"""
        return self.safe_run(dispatcher, tracker, domain)
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        """
        子類應該實現此方法
        """
        raise NotImplementedError("Subclasses must implement _run method")


class ActionFindNearestToilet(_BaseAction):
    """尋找最近的廁所"""

    def name(self) -> Text:
        return "action_find_nearest_toilet"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取性別（如果已指定）
        gender = tracker.get_slot("gender")
        if not gender:
            # 檢查消息中是否包含性別關鍵詞
            if any(word in last_message for word in ['男生', '男性', '男廁', '男廁所', '男生廁所', '男性廁所', 'men', 'men\'s', 'male']):
                gender = '男'
            elif any(word in last_message for word in ['女生', '女性', '女廁', '女廁所', '女生廁所', '女性廁所', 'women', 'women\'s', 'female', 'ladies']):
                gender = '女'
            elif any(word in last_message for word in ['無性別', '性別友善', '性別中立', 'unisex', 'gender-neutral', 'gender-inclusive', 'all-gender']):
                gender = '性別友善'
            elif any(word in last_message for word in ['無障礙', 'accessible', 'wheelchair']):
                gender = '無障礙'
        
        # 如果沒有指定性別，詢問廁所類型（使用按鈕）
        if not gender:
            if language == 'en':
                response_text = "❓ Please select the type of restroom:"
                buttons = [
                    {"title": "♂️ Men's Restroom", "payload": "men's restroom"},
                    {"title": "♀️ Women's Restroom", "payload": "women's restroom"},
                    {"title": "🚻 Unisex Restroom", "payload": "unisex restroom"},
                    {"title": "♿ Accessible Restroom", "payload": "accessible restroom"}
                ]
            else:
                response_text = "❓ 請選擇廁所類型："
                buttons = [
                    {"title": "♂️ 男廁", "payload": "男廁"},
                    {"title": "♀️ 女廁", "payload": "女廁"},
                    {"title": "🚻 性別友善廁所", "payload": "性別友善廁所"},
                    {"title": "♿ 無障礙廁所", "payload": "無障礙廁所"}
                ]
            
            # 發送文本消息
            dispatcher.utter_message(text=response_text)
            
            # 發送結構化數據給前端（包含按鈕）
            response_data = {
                "action": "ask_gender",
                "facility_type": "toilet",
                "pending_intent": "find_nearest_facility",
                "message": response_text,
                "buttons": buttons,
                "language": language
            }
            dispatcher.utter_message(custom=response_data)
            
            return [
                SlotSet("pending_intent", "find_nearest_facility"),
                SlotSet("facility_type", "toilet"),
                SlotSet("language", language)
            ]
        
        # 記住用戶查詢的設施類型和性別
        self.remember(tracker, "last_facility_type", "toilet")
        self.remember(tracker, "last_gender", gender)
        
        # 檢查緩存
        user_id = self.get_user_id(tracker)
        cache_key = f"find_nearest_toilet_{gender}_{user_id}"
        
        if facility_cache:
            cached_result = facility_cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {cache_key}")
                dispatcher.utter_message(custom=cached_result)
                return [SlotSet("language", language), SlotSet("gender", gender)]
        
        try:
            gender_text = 'men\'s' if gender == '男' else 'women\'s' if gender == '女' else 'gender-inclusive' if gender == '性別友善' else 'unisex'
            gender_text_zh = '男' if gender == '男' else '女' if gender == '女' else '性別友善' if gender == '性別友善' else '無性別'
            
            if language == 'en':
                response_data = {
                    "action": "find_nearest_facility",
                    "facility_type": "toilet",
                    "gender": gender,
                    "facility_type_chinese": f"{gender_text_zh} restroom",
                    "facility_type_english": f"{gender_text} restroom",
                    "message": f"Searching for the nearest {gender_text} restroom...",
                    "language": "en"
                }
            else:
                response_data = {
                    "action": "find_nearest_facility",
                    "facility_type": "toilet",
                    "gender": gender,
                    "facility_type_chinese": f"{gender_text_zh}廁所",
                    "facility_type_english": f"{gender_text} restroom",
                    "message": f"正在尋找最近的{gender_text_zh}廁所...",
                    "language": "zh"
                }
            
            # 存入緩存
            if facility_cache:
                facility_cache.set(cache_key, response_data)
            
            dispatcher.utter_message(custom=response_data)
            return [SlotSet("language", language), SlotSet("gender", gender)]
        except Exception as e:
            logger.error(f"Error in ActionFindNearestToilet: {str(e)}")
            raise


class ActionFindNearestWater(_BaseAction):
    """尋找最近的飲水機"""

    def name(self) -> Text:
        return "action_find_nearest_water"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 記住用戶查詢的設施類型
        self.remember(tracker, "last_facility_type", "water")
        
        # 檢查緩存
        user_id = self.get_user_id(tracker)
        cache_key = f"find_nearest_water_{user_id}"
        
        if facility_cache:
            cached_result = facility_cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {cache_key}")
                dispatcher.utter_message(custom=cached_result)
                return [SlotSet("language", language)]
        
        if language == 'en':
            response_data = {
                "action": "find_nearest_facility",
                "facility_type": "water",
                "facility_type_chinese": "water fountain",
                "facility_type_english": "water fountain",
                "message": "Searching for the nearest water fountain...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "find_nearest_facility",
                "facility_type": "water",
                "facility_type_chinese": "飲水機",
                "facility_type_english": "water fountain",
                "message": "正在尋找最近的飲水機...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionFindNearestTrash(_BaseAction):
    """尋找最近的垃圾桶"""

    def name(self) -> Text:
        return "action_find_nearest_trash"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 記住用戶查詢的設施類型
        self.remember(tracker, "last_facility_type", "trash")
        
        # 檢查緩存
        user_id = self.get_user_id(tracker)
        cache_key = f"find_nearest_trash_{user_id}"
        
        if facility_cache:
            cached_result = facility_cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {cache_key}")
                dispatcher.utter_message(custom=cached_result)
                return [SlotSet("language", language)]
        
        if language == 'en':
            response_data = {
                "action": "find_nearest_facility",
                "facility_type": "trash",
                "facility_type_chinese": "trash can",
                "facility_type_english": "trash can",
                "message": "Searching for the nearest trash can...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "find_nearest_facility",
                "facility_type": "trash",
                "facility_type_chinese": "垃圾桶",
                "facility_type_english": "trash can",
                "message": "正在尋找最近的垃圾桶...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionShowRoute(_BaseAction):
    """顯示路線（已由前端處理，此 action 僅作為佔位符）"""

    def name(self) -> Text:
        return "action_show_route"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        # 路線顯示由前端處理，這裡不需要做任何事
        # 但可以記錄用戶使用了導航功能
        self.remember(tracker, "last_action", "navigation")
        return []


class ActionQueryCampusStats(_BaseAction):
    """查詢校區統計資訊"""

    def name(self) -> Text:
        return "action_query_campus_stats"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        campus = tracker.get_slot("campus")
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 檢查用戶是否問的是「建築」還是「設施」
        text_lower = last_message.lower()
        is_building_query = any(word in text_lower for word in [
            '建築', 'building', 'buildings', '有哪些建築', '有什麼建築',
            '建築有哪些', '建築有什麼', 'list buildings', 'buildings in'
        ])
        is_facility_query = any(word in text_lower for word in [
            '設施', 'facility', 'facilities', '有哪些設施', '有什麼設施',
            '設施有哪些', '設施有什麼', 'list facilities', 'facilities in'
        ])
        
        # 如果明確問建築，返回建築列表
        if is_building_query and not is_facility_query:
            return self._query_campus_buildings(dispatcher, tracker, campus, language)
        
        # 將中文校區名稱轉換為代碼
        campus_map = {
            "第一校區": "campus1",
            "第二校區": "campus2",
            "第三校區": "campus3",
            "校區1": "campus1",
            "校區2": "campus2",
            "校區3": "campus3",
            "campus 1": "campus1",
            "campus 2": "campus2",
            "campus 3": "campus3",
            "campus1": "campus1",
            "campus2": "campus2",
            "campus3": "campus3"
        }
        
        campus_code = campus_map.get(campus, "campus1")
        
        # 檢查緩存
        cache_key = f"campus_stats_{campus_code}_{language}"
        
        if facility_cache:
            cached_result = facility_cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {cache_key}")
                dispatcher.utter_message(custom=cached_result)
                return [SlotSet("campus", campus), SlotSet("language", language)]
        
        # 英文校區名稱映射
        campus_name_en = {
            "campus1": "Campus 1",
            "campus2": "Campus 2",
            "campus3": "Campus 3"
        }
        
        if language == 'en':
            campus_display = campus_name_en.get(campus_code, campus or "Campus 1")
            response_data = {
                "action": "query_campus_stats",
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_display,
                "message": f"Querying facility statistics for {campus_display}...",
                "language": "en"
            }
        else:
            # 中文校區名稱映射
            campus_name_zh = {
                "campus1": "第一校區",
                "campus2": "第二校區",
                "campus3": "第三校區"
            }
            # 確保 campus_display 是正確的中文名稱
            if campus in campus_name_zh.values():
                campus_display = campus  # 已經是中文名稱
            else:
                campus_display = campus_name_zh.get(campus_code, "第一校區")  # 從代碼映射
            
            response_data = {
                "action": "query_campus_stats",
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_name_en.get(campus_code, "Campus 1"),
                "message": f"正在查詢{campus_display}的設施統計...",
                "language": "zh"
            }

        # 存入緩存
        if facility_cache:
            facility_cache.set(cache_key, response_data)
        
        dispatcher.utter_message(custom=response_data)
        
        return [SlotSet("campus", campus), SlotSet("language", language)]
    
    def _query_campus_buildings(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        campus: Optional[Text],
        language: Text
    ) -> List[Dict[Text, Any]]:
        """查詢校區的建築列表（由前端從設施數據中提取）"""
        # 將中文校區名稱轉換為代碼
        campus_map = {
            "第一校區": "campus1",
            "第二校區": "campus2",
            "第三校區": "campus3",
            "校區1": "campus1",
            "校區2": "campus2",
            "校區3": "campus3",
            "campus 1": "campus1",
            "campus 2": "campus2",
            "campus 3": "campus3",
            "campus1": "campus1",
            "campus2": "campus2",
            "campus3": "campus3"
        }
        
        campus_code = campus_map.get(campus, "campus1")
        
        # 英文校區名稱映射
        campus_name_en = {
            "campus1": "Campus 1",
            "campus2": "Campus 2",
            "campus3": "Campus 3"
        }
        
        if language == 'en':
            campus_display = campus_name_en.get(campus_code, campus or "Campus 1")
            response_data = {
                "action": "query_campus_buildings",
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_display,
                "message": f"Querying buildings in {campus_display}...",
                "language": "en"
            }
        else:
            # 中文校區名稱映射
            campus_name_zh = {
                "campus1": "第一校區",
                "campus2": "第二校區",
                "campus3": "第三校區"
            }
            # 確保 campus_display 是正確的中文名稱
            if campus in campus_name_zh.values():
                campus_display = campus  # 已經是中文名稱
            else:
                campus_display = campus_name_zh.get(campus_code, "第一校區")  # 從代碼映射
            
            response_data = {
                "action": "query_campus_buildings",
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_name_en.get(campus_code, "Campus 1"),
                "message": f"正在查詢{campus_display}的建築...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        
        return [SlotSet("campus", campus), SlotSet("language", language)]


class ActionQueryFacilitiesByStatus(_BaseAction):
    """查詢特定狀態的設施"""

    def name(self) -> Text:
        return "action_query_facilities_by_status"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        campus = tracker.get_slot("campus")
        
        # 從用戶消息中提取狀態關鍵字和設施類型
        text_lower = last_message.lower()
        
        # 狀態關鍵字映射（包含自然語言表達）
        status_keywords = {
            '滿了': '待清潔',
            '滿': '待清潔',
            'full': '待清潔',
            '髒了': '待清潔',
            '髒': '待清潔',
            'dirty': '待清潔',
            '需要收': '待清潔',  # 新增：垃圾需要收
            '需要清理': '待清潔',  # 新增：需要清理
            '需要處理': '待清潔',  # 新增：需要處理
            '要收': '待清潔',  # 新增：要收垃圾
            '要清理': '待清潔',  # 新增：要清理
            '要處理': '待清潔',  # 新增：要處理
            '壞了': '無法使用',
            '壞': '無法使用',
            'broken': '無法使用',
            '故障': '無法使用',
            '需要維修': '無法使用',  # 新增：需要維修
            '需要修理': '無法使用',  # 新增：需要修理
            '要維修': '無法使用',  # 新增：要維修
            '要修理': '無法使用',  # 新增：要修理
            '維修': '無法使用',  # 新增：維修
            '修理': '無法使用',  # 新增：修理
            '損壞': '部分損壞',
            'damaged': '部分損壞',
            '待清潔': '待清潔',
            '無法使用': '無法使用',
            '部分損壞': '部分損壞'
        }
        
        # 設施類型關鍵字映射（包含自然語言表達）
        facility_type_keywords = {
            '垃圾桶': 'trash',
            '垃圾': 'trash',  # 當用戶說「垃圾需要收」時，識別為垃圾桶
            'trash': 'trash',
            '廁所': 'toilet',
            'toilet': 'toilet',
            'restroom': 'toilet',
            '飲水機': 'water',
            '飲水': 'water',
            'water': 'water',
            'fountain': 'water'
        }
        
        # 查找匹配的狀態
        query_status = None
        for keyword, status in status_keywords.items():
            if keyword in text_lower:
                query_status = status
                break
        
        if not query_status:
            # 如果找不到，嘗試從 slot 中獲取
            query_status = tracker.get_slot("status") or "待清潔"
        
        # 查找匹配的設施類型
        query_facility_type = None
        for keyword, facility_type in facility_type_keywords.items():
            if keyword in text_lower:
                query_facility_type = facility_type
                break
        
        # 如果找不到，嘗試從 slot 中獲取
        if not query_facility_type:
            facility_type_slot = tracker.get_slot("facility_type")
            if facility_type_slot:
                # 將 slot 值轉換為標準格式
                facility_type_map = {
                    'trash': 'trash',
                    '垃圾桶': 'trash',
                    'toilet': 'toilet',
                    '廁所': 'toilet',
                    'water': 'water',
                    '飲水機': 'water'
                }
                query_facility_type = facility_type_map.get(facility_type_slot, facility_type_slot)
        
        # 將中文校區名稱轉換為代碼
        campus_code = None
        if campus:
            campus_map = {
                "第一校區": "campus1",
                "第二校區": "campus2",
                "第三校區": "campus3",
                "校區1": "campus1",
                "校區2": "campus2",
                "校區3": "campus3",
                "campus 1": "campus1",
                "campus 2": "campus2",
                "campus 3": "campus3",
                "campus1": "campus1",
                "campus2": "campus2",
                "campus3": "campus3"
            }
            campus_code = campus_map.get(campus, campus)
        
        # 英文校區名稱映射
        campus_name_en = {
            "campus1": "Campus 1",
            "campus2": "Campus 2",
            "campus3": "Campus 3"
        }
        
        if language == 'en':
            campus_display = campus_name_en.get(campus_code, campus or "All Campuses") if campus_code else "All Campuses"
            status_display = query_status
            if query_status == '待清潔':
                status_display = 'dirty/full'
            elif query_status == '無法使用':
                status_display = 'broken'
            facility_type_display = query_facility_type or "all"
            if query_facility_type == 'trash':
                facility_type_display = 'trash cans'
            elif query_facility_type == 'toilet':
                facility_type_display = 'restrooms'
            elif query_facility_type == 'water':
                facility_type_display = 'water fountains'
            
            response_data = {
                "action": "query_facilities_by_status",
                "status": query_status,
                "query_status": status_display,
                "facility_type": query_facility_type,
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_display,
                "message": f"Querying {facility_type_display} with status \"{status_display}\" in {campus_display}..." if query_facility_type else f"Querying facilities with status \"{status_display}\" in {campus_display}...",
                "language": "en"
            }
        else:
            campus_display = campus or "所有校區"
            status_display = query_status
            # 根據用戶輸入選擇合適的顯示文字（包含自然語言表達）
            if '需要收' in text_lower or '要收' in text_lower:
                status_display = '滿了'  # 垃圾需要收 = 垃圾桶滿了
            elif '需要清理' in text_lower or '要清理' in text_lower:
                status_display = '髒了'  # 需要清理 = 髒了
            elif '需要處理' in text_lower or '要處理' in text_lower:
                status_display = '滿了'  # 需要處理 = 滿了
            elif '滿了' in text_lower or '滿' in text_lower:
                status_display = '滿了'
            elif '髒了' in text_lower or '髒' in text_lower:
                status_display = '髒了'
            elif '需要維修' in text_lower or '需要修理' in text_lower or '要維修' in text_lower or '要修理' in text_lower:
                status_display = '壞了'  # 需要維修/修理 = 壞了
            elif '壞了' in text_lower or '壞' in text_lower or '故障' in text_lower:
                status_display = '壞了'
            elif '損壞' in text_lower:
                status_display = '損壞'
            
            facility_type_display = ""
            if query_facility_type == 'trash':
                facility_type_display = '垃圾桶'
            elif query_facility_type == 'toilet':
                facility_type_display = '廁所'
            elif query_facility_type == 'water':
                facility_type_display = '飲水機'
            
            response_data = {
                "action": "query_facilities_by_status",
                "status": query_status,
                "query_status": status_display,
                "facility_type": query_facility_type,
                "campus": campus_code,
                "campus_chinese": campus_display,
                "campus_english": campus_name_en.get(campus_code, "All Campuses") if campus_code else "All Campuses",
                "message": f"正在查詢{campus_display}中狀態為「{status_display}」的{facility_type_display}..." if facility_type_display else f"正在查詢{campus_display}中狀態為「{status_display}」的設施...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        
        slot_sets = [
            SlotSet("status", query_status),
            SlotSet("campus", campus),
            SlotSet("language", language)
        ]
        
        if query_facility_type:
            slot_sets.append(SlotSet("facility_type", query_facility_type))
        
        return slot_sets


class ActionCalculateDistance(_BaseAction):
    """計算兩點間距離（輔助功能）"""

    def name(self) -> Text:
        return "action_calculate_distance"

    def calculate_distance(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """計算兩點間距離（公里）"""
        R = 6371  # 地球半徑（公里）
        d_lat = math.radians(lat2 - lat1)
        d_lng = math.radians(lng2 - lng1)
        
        a = (
            math.sin(d_lat / 2) * math.sin(d_lat / 2) +
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
            math.sin(d_lng / 2) * math.sin(d_lng / 2)
        )
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        # 這個 action 目前不需要實現，因為距離計算在前端處理
        return []


class ActionGetCurrentTime(_BaseAction):
    """獲取當前時間"""

    def name(self) -> Text:
        return "action_get_current_time"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        now = datetime.now()
        
        if language == 'en':
            time_str = now.strftime("%Y-%m-%d %H:%M:%S")
            response_data = {
                "action": "show_time",
                "time": time_str,
                "message": f"The current time is: {time_str}",
                "language": "en"
            }
        else:
            time_str = now.strftime("%Y年%m月%d日 %H:%M:%S")
            response_data = {
                "action": "show_time",
                "time": time_str,
                "message": f"現在時間是：{time_str}",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionReportFacilityIssue(_BaseAction):
    """回報設備問題"""

    def name(self) -> Text:
        return "action_report_facility_issue"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 從使用者最後一句話中檢測設施類型
        last_message = tracker.latest_message.get("text", "") or ""
        text = last_message.lower()
        
        facility_type = None
        if "廁所" in text or "restroom" in text or "bathroom" in text or "toilet" in text:
            facility_type = "toilet"
        elif "飲水機" in text or "water fountain" in text or "water dispenser" in text:
            facility_type = "water"
        elif "垃圾桶" in text or "trash can" in text or "trash bin" in text or "garbage" in text:
            facility_type = "trash"
        
        if language == 'en':
            response_data = {
                "action": "open_issue_form",
                "facility_type": facility_type,
                "message": "I've opened the facility issue report form for you. Please fill it out and submit below.",
                "language": "en"
            }
        else:
            response_data = {
                "action": "open_issue_form",
                "facility_type": facility_type,
                "message": "我已為您打開設備問題回報表單，請在下方填寫並送出。",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionProvideSuggestions(_BaseAction):
    """提供建議"""

    def name(self) -> Text:
        return "action_provide_suggestions"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        if language == 'en':
            suggestions = [
                "You can ask me: 'Where is the nearest restroom?'",
                "Try asking: 'What facilities are in Campus 1?'",
                "I can help you find water fountains and trash cans too!"
            ]
        else:
            suggestions = [
                "您可以問我：「最近的廁所在哪？」",
                "試試問：「第一校區有哪些設施？」",
                "我也可以幫您找飲水機和垃圾桶！"
            ]
        
        import random
        suggestion = random.choice(suggestions)
        dispatcher.utter_message(text=suggestion)
        return [SlotSet("language", language)]


class ActionRememberContext(_BaseAction):
    """記住上下文（範例）"""

    def name(self) -> Text:
        return "action_remember_context"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        # 這個 action 可以記住用戶的偏好或上下文
        # 目前僅作為範例
        return []


class ActionUpdateFacilityStatus(_BaseAction):
    """直接更新設施狀態（當用戶明確說出設施狀況時，需要確認）"""

    def name(self) -> Text:
        return "action_update_facility_status"

    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 檢查是否需要確認
        confirmed = tracker.get_slot("update_confirmed")
        
        if not confirmed:
            # 需要確認
            facility_type = tracker.get_slot("facility_type")
            status = tracker.get_slot("status")
            
            if language == 'en':
                response_data = {
                    "action": "confirm_update",
                    "facility_type": facility_type,
                    "status": status,
                    "message": f"Are you sure you want to update the {facility_type or 'facility'} status to {status}?",
                    "language": "en",
                    "requires_confirmation": True
                }
            else:
                facility_name = {
                    "toilet": "廁所",
                    "water": "飲水機",
                    "trash": "垃圾桶"
                }.get(facility_type, "設施")
                
                response_data = {
                    "action": "confirm_update",
                    "facility_type": facility_type,
                    "status": status,
                    "message": f"確定要將{facility_name}的狀態更新為{status}嗎？",
                    "language": "zh",
                    "requires_confirmation": True
                }
            
            dispatcher.utter_message(custom=response_data)
            return [SlotSet("language", language)]
        
        # 從使用者最後一句話中提取資訊
        last_message = tracker.latest_message.get("text", "") or ""
        text = last_message.lower()
        
        # 識別設施類型
        facility_type = None
        if "廁所" in text or "restroom" in text or "bathroom" in text or "toilet" in text:
            facility_type = "toilet"
        elif "飲水機" in text or "water fountain" in text or "water dispenser" in text:
            facility_type = "water"
        elif "垃圾桶" in text or "trash can" in text or "trash bin" in text or "garbage" in text:
            facility_type = "trash"
        
        # 識別狀態
        status = None
        status_map_zh = {
            "故障": "故障",
            "壞了": "故障",
            "不能用": "無法使用",
            "無法使用": "無法使用",
            "髒了": "清潔中",
            "很髒": "清潔中",
            "不乾淨": "清潔中",
            "滿了": "滿出",
            "滿出": "滿出",
            "需要維修": "維修中",
            "需要修理": "維修中",
            "維修中": "維修中",
            "損壞": "部分損壞",
            "部分損壞": "部分損壞"
        }
        
        status_map_en = {
            "broken": "故障",
            "not working": "故障",
            "out of order": "故障",
            "dirty": "清潔中",
            "full": "滿出",
            "maintenance": "維修中",
            "under maintenance": "維修中",
            "damaged": "部分損壞"
        }
        
        # 根據語言選擇對應的狀態映射
        if language == 'en':
            for key, value in status_map_en.items():
                if key in text:
                    status = value
                    break
        else:
            for key, value in status_map_zh.items():
                if key in text:
                    status = value
                    break
        
        # 如果沒有識別到狀態，使用默認值
        if not status:
            status = "故障"  # 默認狀態
        
        # 構建回應訊息
        if language == 'en':
            response_text = f"I've updated the status of the {facility_type or 'facility'} to: {status}"
        else:
            facility_name = "設施"
            if facility_type == "toilet":
                facility_name = "廁所"
            elif facility_type == "water":
                facility_name = "飲水機"
            elif facility_type == "trash":
                facility_name = "垃圾桶"
            response_text = f"我已將{facility_name}的狀態更新為：{status}"
        
        dispatcher.utter_message(text=response_text)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "update_facility_status",
            "facility_type": facility_type,
            "status": status,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        return [SlotSet("language", language)]


class ActionGreet(_BaseAction):
    """根據語言返回對應的打招呼回應"""
    
    def name(self) -> Text:
        return "action_greet"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 中文回應列表
        zh_responses = [
            "你好！我是虎尾科技大學的 AI 校園助手 👋\n我可以幫你：\n• 尋找最近的廁所、飲水機、垃圾桶\n• 查詢各校區的設施位置\n• 提供校園導航指引\n• 回答校園相關問題\n\n試試問我：「最近的廁所在哪？」或「第一校區有哪些設施？」",
            "嗨！歡迎使用虎尾科技大學校園助手！😊\n我可以協助您：\n• 快速找到最近的廁所、飲水機或垃圾桶\n• 查詢各校區的設施資訊\n• 提供校園導航服務\n• 回答校園相關問題\n\n有什麼我可以幫您的嗎？",
            "嘿！來啦～我是你的校園小幫手！🎉\n不管你在找廁所、飲水機還是垃圾桶，我都能幫你快速定位！\n還能查各校區的設施分布，甚至規劃路線給你～\n有什麼需要儘管開口，我隨時待命！",
            "您好，歡迎使用虎尾科技大學校園導航系統。\n本系統提供以下服務：\n• 設施定位服務（廁所、飲水機、垃圾桶）\n• 校區資訊查詢\n• 即時導航指引\n• 校園相關諮詢\n\n請告訴我您需要什麼協助。",
            "歡迎回來！我是你的校園小夥伴 😊\n今天需要找什麼設施嗎？我來幫你規劃最便捷的路線～\n記住，不管什麼時候，只要你在校園裡迷路或需要幫助，我都在這裡等你！",
            "嗨！找什麼？廁所、飲水機、垃圾桶，還是想查校區資訊？直接說就行！",
            "哈囉！我是你的校園導航小精靈 🧚\n迷路了嗎？找不到廁所？沒問題，交給我就對了！\n我就像你的隨身地圖，而且還會聊天～\n來吧，告訴我你想去哪？",
            "歡迎來到虎尾科技大學！我是你的探索夥伴 🗺️\n讓我們一起探索校園吧！我可以帶你找到任何你需要的設施，\n還能告訴你各校區的特色和設施分布。\n準備好開始你的校園冒險了嗎？"
        ]
        
        # 英文回應列表
        en_responses = [
            "Hello! I'm the AI Campus Assistant of National Formosa University 👋\nI can help you:\n• Find the nearest restroom, water fountain, or trash can\n• Query facility locations in each campus\n• Provide campus navigation guidance\n• Answer campus-related questions\n\nTry asking me: \"Where is the nearest restroom?\" or \"What facilities are in Campus 1?\"",
            "Hi! Welcome to the National Formosa University Campus Assistant! 😊\nI can assist you with:\n• Quickly finding the nearest restroom, water fountain, or trash can\n• Querying facility information in each campus\n• Providing campus navigation services\n• Answering campus-related questions\n\nHow can I help you?",
            "Yo! What's up? 👋 I'm your campus buddy here at NFU!\nNeed to find a restroom? Water fountain? Trash can? I got you covered!\nI can also show you what facilities each campus has and help you navigate.\nJust ask me anything - I'm here to help!",
            "Good day. Welcome to the National Formosa University Campus Navigation System.\nAvailable services include:\n• Facility location services (restrooms, water fountains, trash cans)\n• Campus information queries\n• Real-time navigation guidance\n• Campus-related consultations\n\nHow may I assist you today?",
            "Welcome back! I'm your campus companion 😊\nNeed help finding something today? I'll plan the most convenient route for you!\nRemember, whenever you're lost on campus or need assistance, I'm always here for you!",
            "Hey! What do you need? Restroom, water fountain, trash can, or campus info? Just tell me!",
            "Hey there! I'm your campus navigation fairy 🧚\nLost? Can't find a restroom? No worries, I've got your back!\nI'm like your personal map, and I can chat too!\nSo, where do you want to go?",
            "Welcome to National Formosa University! I'm your exploration partner 🗺️\nLet's explore the campus together! I can help you find any facility you need,\nand tell you about the features and facility distribution of each campus.\nReady to start your campus adventure?"
        ]
        
        if language == 'en':
            response = random.choice(en_responses)
        else:
            response = random.choice(zh_responses)
        
        dispatcher.utter_message(text=response)
        return [SlotSet("language", language)]


class ActionGoodbye(_BaseAction):
    """根據語言返回對應的告別回應"""
    
    def name(self) -> Text:
        return "action_goodbye"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 中文回應列表
        zh_responses = [
            "再見！如果還有問題隨時可以問我 😊",
            "拜拜！祝您校園生活愉快！有需要隨時找我 🌟",
            "再見！祝您一切順利！",
            "拜拜！期待下次為您服務！"
        ]
        
        # 英文回應列表
        en_responses = [
            "Goodbye! Feel free to ask me if you have any more questions 😊",
            "Bye! Have a great day on campus! I'm here whenever you need me 🌟",
            "Goodbye! Have a great day!",
            "Bye! Looking forward to serving you again!"
        ]
        
        if language == 'en':
            response = random.choice(en_responses)
        else:
            response = random.choice(zh_responses)
        
        dispatcher.utter_message(text=response)
        return [SlotSet("language", language)]


class ActionSetLanguage(_BaseAction):
    """根據用戶輸入設置語言 slot"""
    
    def name(self) -> Text:
        return "action_set_language"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        # 從最新消息檢測語言
        last_message = tracker.latest_message.get("text", "") or ""
        detected_lang = detect_language(last_message)
        
        # 記住用戶的語言偏好
        self.remember(tracker, "preferred_language", detected_lang)
        
        return [SlotSet("language", detected_lang)]


class ActionUpdateFloorStatus(_BaseAction):
    """更新特定樓層的設施狀態（需要確認）"""
    
    def name(self) -> Text:
        return "action_update_floor_status"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 檢查是否需要確認
        confirmed = tracker.get_slot("update_floor_confirmed")
        
        if not confirmed:
            # 需要確認
            building = tracker.get_slot("building")
            floor = tracker.get_slot("floor")
            status = tracker.get_slot("status")
            
            if language == 'en':
                response_data = {
                    "action": "confirm_update_floor",
                    "building": building,
                    "floor": floor,
                    "status": status,
                    "message": f"Are you sure you want to update {building} {floor} status to {status}?",
                    "language": "en",
                    "requires_confirmation": True
                }
            else:
                response_data = {
                    "action": "confirm_update_floor",
                    "building": building,
                    "floor": floor,
                    "status": status,
                    "message": f"確定要將{building or '建築'}{floor or ''}的狀態更新為{status or '未知'}嗎？",
                    "language": "zh",
                    "requires_confirmation": True
                }
            
            dispatcher.utter_message(custom=response_data)
            return [SlotSet("language", language)]
        building = tracker.get_slot("building")
        floor = tracker.get_slot("floor")
        status = tracker.get_slot("status")
        facility_type = tracker.get_slot("facility_type") or "toilet"  # 默認是廁所
        
        # 建築名稱映射
        building_map = {
            "綜三館": "綜三館",
            "zongsan building": "綜三館",
            "zongsan": "綜三館",
            "zongsan 館": "綜三館"
        }
        
        # 狀態映射（中英文對應）
        status_map = {
            "正常": "正常",
            "normal": "正常",
            "維修中": "維修中",
            "maintenance": "維修中",
            "故障": "故障",
            "broken": "故障",
            "無法使用": "無法使用",
            "unavailable": "無法使用",
            "清潔中": "清潔中",
            "cleaning": "清潔中",
            "滿出": "滿出",
            "full": "滿出",
            "部分損壞": "部分損壞",
            "damaged": "部分損壞",
            "暫停使用": "暫停使用",
            "out of order": "暫停使用"
        }
        
        # 標準化建築名稱
        building_normalized = building_map.get(building.lower() if building else "", building or "綜三館")
        
        # 標準化狀態
        status_normalized = status_map.get(status.lower() if status else "", status or "正常")
        
        # 標準化樓層（確保格式為 XF）
        if floor:
            floor_normalized = floor.upper().replace("F", "F")
            if not floor_normalized.endswith("F"):
                floor_normalized = floor_normalized + "F"
        else:
            floor_normalized = None
        
        # 構建回應訊息
        if language == 'en':
            if building_normalized and floor_normalized and status_normalized:
                response_text = f"✅ Successfully updated {building_normalized} {floor_normalized} {facility_type} status to: {status_normalized}"
            else:
                response_text = "I need more information. Please specify the building, floor, and status."
        else:
            if building_normalized and floor_normalized and status_normalized:
                facility_name = "廁所" if facility_type == "toilet" else "設施"
                response_text = f"✅ 已成功將{building_normalized} {floor_normalized}的{facility_name}狀態更新為：{status_normalized}"
            else:
                response_text = "我需要更多資訊。請指定建築、樓層和狀態。"
        
        dispatcher.utter_message(text=response_text)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "update_floor_status",
            "building": building_normalized,
            "floor": floor_normalized,
            "facility_type": facility_type,
            "status": status_normalized,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        return [
            SlotSet("building", building_normalized),
            SlotSet("floor", floor_normalized),
            SlotSet("status", status_normalized),
            SlotSet("language", language)
        ]


class ActionQueryFloorStatus(_BaseAction):
    """查詢建築所有樓層的狀態"""
    
    def name(self) -> Text:
        return "action_query_floor_status"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        
        # 建築名稱映射
        building_map = {
            "綜三館": "綜三館",
            "zongsan building": "綜三館",
            "zongsan": "綜三館",
            "zongsan 館": "綜三館"
        }
        
        building_normalized = building_map.get(building.lower() if building else "", building or "綜三館")
        
        if language == 'en':
            response_text = f"Here's the status of all floors in {building_normalized}:"
        else:
            response_text = f"以下是{building_normalized}所有樓層的狀態："
        
        dispatcher.utter_message(text=response_text)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "query_floor_status",
            "building": building_normalized,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        return [
            SlotSet("building", building_normalized),
            SlotSet("language", language)
        ]


class ActionReportFacilityProblem(_BaseAction):
    """處理用戶報告設施問題（智能理解模糊描述）"""
    
    def name(self) -> Text:
        return "action_report_facility_problem"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        floor = tracker.get_slot("floor")
        facility_type = tracker.get_slot("facility_type")
        problem_description = tracker.get_slot("problem_description")
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 建築名稱映射（擴展所有建築物，包括拼寫變體）
        building_map = {
            "綜三館": "綜三館",
            "粽三館": "綜三館",  # 拼寫變體
            "粽三": "綜三館",  # 拼寫變體
            "綜三": "綜三館",
            "zongsan building": "綜三館",
            "zongsan": "綜三館",
            "zongsan 館": "綜三館",
            "行政大樓": "行政大樓",
            "行政": "行政大樓",
            "administration building": "行政大樓",
            "administration": "行政大樓",
            "第一教學大樓": "第一教學大樓",
            "第一教學": "第一教學大樓",
            "first teaching building": "第一教學大樓",
            "第二教學大樓": "第二教學大樓",
            "第二教學": "第二教學大樓",
            "second teaching building": "第二教學大樓",
            "第三教學大樓": "第三教學大樓",
            "第三教學": "第三教學大樓",
            "third teaching building": "第三教學大樓",
            "圖書館": "圖書館",
            "library": "圖書館",
            "體育館": "體育館",
            "gymnasium": "體育館",
            "gym": "體育館",
            "學生餐廳": "學生餐廳",
            "餐廳": "學生餐廳",
            "student cafeteria": "學生餐廳",
            "cafeteria": "學生餐廳",
            "實驗大樓": "實驗大樓",
            "實驗": "實驗大樓",
            "laboratory building": "實驗大樓",
            "lab building": "實驗大樓",
            "工學院大樓": "工學院大樓",
            "工學院": "工學院大樓",
            "engineering building": "工學院大樓",
            "管理學院大樓": "管理學院大樓",
            "管理學院": "管理學院大樓",
            "management building": "管理學院大樓",
            "研究大樓": "研究大樓",
            "研究": "研究大樓",
            "research building": "研究大樓",
            "創新大樓": "創新大樓",
            "創新": "創新大樓",
            "innovation building": "創新大樓",
            "宿舍大樓": "宿舍大樓",
            "宿舍": "宿舍大樓",
            "dormitory": "宿舍大樓",
            "dorm": "宿舍大樓"
        }
        
        # 智能提取建築名稱（多層次匹配，包括上下文理解）
        if not building:
            # 獲取對話歷史，用於上下文理解
            events = tracker.events
            recent_messages = []
            for event in reversed(events[-10:]):  # 只檢查最近10條消息
                if hasattr(event, 'text') and event.text:
                    recent_messages.append(event.text)
            
            text_lower = last_message.lower()
            
            # 1. 先嘗試精確匹配（包括拼寫變體）
            # 按長度排序，優先匹配較長的建築物名稱（避免誤匹配）
            sorted_keys = sorted(building_map.keys(), key=len, reverse=True)
            for key in sorted_keys:
                if key.lower() in text_lower:
                    building = building_map[key]
                    break
            
            # 2. 如果沒有找到，從對話歷史中查找（上下文理解）
            if not building:
                for msg in recent_messages:
                    if msg and msg != last_message:
                        msg_lower = msg.lower()
                        for key in sorted_keys:
                            if key.lower() in msg_lower:
                                building = building_map[key]
                                break
                        if building:
                            break
            
            # 3. 如果還是找不到，使用模糊匹配（Levenshtein 距離）
            if not building:
                import difflib
                best_match = None
                best_ratio = 0.6  # 相似度閾值
                
                for key, value in building_map.items():
                    # 檢查是否包含關鍵字
                    if len(key) >= 2:
                        # 計算相似度
                        ratio = difflib.SequenceMatcher(None, text_lower, key.lower()).ratio()
                        if ratio > best_ratio:
                            best_ratio = ratio
                            best_match = value
                
                if best_match:
                    building = best_match
        
        # 從消息中提取樓層（如果 slot 沒有）
        if not floor:
            import re
            # 匹配 "一樓"、"1F"、"1樓" 等
            floor_patterns = [
                (r'([1-9]|10)[Ff]', lambda m: f"{m.group(1)}F"),
                (r'([一|二|三|四|五|六|七|八|九|十])樓', lambda m: {
                    '一': '1F', '二': '2F', '三': '3F', '四': '4F', '五': '5F',
                    '六': '6F', '七': '7F', '八': '8F', '九': '9F', '十': '10F'
                }.get(m.group(1), '1F')),
                (r'([1-9]|10)樓', lambda m: f"{m.group(1)}F"),
                (r'first floor', lambda m: '1F'),
                (r'second floor', lambda m: '2F'),
                (r'third floor', lambda m: '3F'),
                (r'fourth floor', lambda m: '4F'),
                (r'fifth floor', lambda m: '5F'),
            ]
            for pattern, converter in floor_patterns:
                match = re.search(pattern, last_message, re.IGNORECASE)
                if match:
                    floor = converter(match)
                    break
        
        # 從消息中提取設施類型（如果 slot 沒有）
        if not facility_type:
            text_lower = last_message.lower()
            if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
                facility_type = 'toilet'
            elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain', 'water dispenser']):
                facility_type = 'water'
            elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage']):
                facility_type = 'trash'
        
        # 從消息中提取性別（如果是廁所）
        gender = tracker.get_slot("gender")
        if facility_type == 'toilet' and not gender:
            text_lower = last_message.lower()
            # 檢查中文性別關鍵詞（包含簡稱）
            # 優先檢查完整詞彙，避免誤匹配
            if any(word in last_message for word in ['男生廁所', '男性廁所', '男廁所', '男生', '男性', '男廁', 'men', 'men\'s', 'male', 'men\'s restroom', 'men\'s toilet']):
                gender = '男'
            elif any(word in last_message for word in ['女生廁所', '女性廁所', '女廁所', '女生', '女性', '女廁', 'women', 'women\'s', 'female', 'ladies', 'women\'s restroom', 'women\'s toilet', 'ladies\' restroom', 'ladies\' toilet']):
                gender = '女'
            elif any(word in last_message for word in ['無性別廁所', '性別友善廁所', '性別友善', '性別中立', '無性別', '中性廁所', '中性', 'unisex', 'gender-neutral', 'gender-inclusive', 'all-gender', 'unisex restroom', 'unisex toilet']):
                gender = '性別友善'
            elif any(word in last_message for word in ['無障礙廁所', '無障礙', 'accessible', 'wheelchair', 'accessible restroom', 'accessible toilet']):
                gender = '無障礙'
        
        # 從消息中提取問題描述（如果 slot 沒有）
        if not problem_description:
            problem_description = last_message
        
        # 智能標準化建築名稱（擴展所有建築物）
        # 擴展 building_map 包含所有建築物
        full_building_map = {
            # 第一校區
            "第一教學大樓": "第一教學大樓", "第一教學": "第一教學大樓", "一教": "第一教學大樓",
            "第一教": "第一教學大樓", "教學大樓一": "第一教學大樓", "first teaching building": "第一教學大樓",
            "第二教學大樓": "第二教學大樓", "第二教學": "第二教學大樓", "二教": "第二教學大樓",
            "第二教": "第二教學大樓", "教學大樓二": "第二教學大樓", "second teaching building": "第二教學大樓",
            "第三教學大樓": "第三教學大樓", "第三教學": "第三教學大樓", "三教": "第三教學大樓",
            "第三教": "第三教學大樓", "教學大樓三": "第三教學大樓", "third teaching building": "第三教學大樓",
            "第四教學大樓": "第四教學大樓", "第四教學": "第四教學大樓", "四教": "第四教學大樓",
            "第四教": "第四教學大樓", "教學大樓四": "第四教學大樓", "fourth teaching building": "第四教學大樓",
            "行政大樓": "行政大樓", "行政": "行政大樓", "行政館": "行政大樓",
            "administration building": "行政大樓", "admin building": "行政大樓",
            "圖書館": "圖書館", "圖書": "圖書館", "library": "圖書館", "lib": "圖書館",
            "飛機館": "飛機館", "電機工程館": "飛機館", "電機館": "飛機館", "電機": "飛機館",
            "electrical engineering building": "飛機館", "ee building": "飛機館",
            "機械工程館": "機械工程館", "機械館": "機械工程館", "機械": "機械工程館",
            "mechanical engineering building": "機械工程館", "me building": "機械工程館",
            "資訊休閒大樓": "資訊休閒大樓", "資訊休閒館": "資訊休閒大樓",
            "information and recreation building": "資訊休閒大樓",
            "紅館": "紅館", "red building": "紅館", "red hall": "紅館",
            "綠館": "綠館", "green building": "綠館", "green hall": "綠館",
            "學生活動中心": "學生活動中心", "活動中心": "學生活動中心",
            "student activity center": "學生活動中心", "activity center": "學生活動中心",
            # 第二校區
            "科技研究中心": "科技研究中心", "科技中心": "科技研究中心", "研究中心": "科技研究中心",
            "technology research center": "科技研究中心", "tech center": "科技研究中心",
            "綜一館": "綜一館", "綜合一館": "綜一館", "綜合教學大樓第一館": "綜一館", "綜一": "綜一館",
            "comprehensive building one": "綜一館", "comp building 1": "綜一館",
            "綜二館": "綜二館", "綜合二館": "綜二館", "綜合教學大樓第二館": "綜二館", "綜二": "綜二館",
            "comprehensive building two": "綜二館", "comp building 2": "綜二館",
            "綜三館": "綜三館", "粽三館": "綜三館", "粽三": "綜三館", "綜三": "綜三館",
            "粽三管": "綜三館", "綜三管": "綜三館", "綜合三館": "綜三館", "綜合教學大樓第三館": "綜三館",
            "zongsan building": "綜三館", "zongsan": "綜三館", "comprehensive building three": "綜三館",
            "電機館": "電機館", "電機工程館": "電機館", "電機": "電機館",
            "electrical engineering building": "電機館", "ee building": "電機館",
            # 第三校區
            "操場": "操場", "運動場": "操場", "playground": "操場", "sports field": "操場", "field": "操場",
            "游泳池": "游泳池", "泳池": "游泳池", "swimming pool": "游泳池", "pool": "游泳池",
            "體育館": "體育館(經國館)", "經國館": "體育館(經國館)", "經國體育館": "體育館(經國館)",
            "gymnasium": "體育館(經國館)", "gym": "體育館(經國館)", "sports center": "體育館(經國館)",
            "人文大樓": "人文大樓", "人文館": "人文大樓",
            "humanities building": "人文大樓", "humanities": "人文大樓",
            "文理暨管理大樓": "文理暨管理大樓", "文理大樓": "文理暨管理大樓", "文理管理大樓": "文理暨管理大樓",
            "文理館": "文理暨管理大樓",
            "liberal arts and management building": "文理暨管理大樓", "lam building": "文理暨管理大樓"
        }
        
        # 標準化建築名稱（優先使用擴展的映射表）
        building_normalized = full_building_map.get(building.lower() if building else "", 
                                                     building_map.get(building.lower() if building else "", 
                                                                      building or ""))
        
        # 如果還是找不到，從消息中智能提取
        if not building_normalized or building_normalized == (building or ""):
            text_lower = last_message.lower()
            # 按長度排序，優先匹配較長的建築物名稱
            sorted_keys = sorted(full_building_map.keys(), key=len, reverse=True)
            for key in sorted_keys:
                if key.lower() in text_lower:
                    building_normalized = full_building_map[key]
                    break
        
        # 標準化樓層
        if floor:
            floor_normalized = floor.upper().replace("F", "F")
            if not floor_normalized.endswith("F"):
                floor_normalized = floor_normalized + "F"
        else:
            floor_normalized = None
        
        # 解析多個設備問題
        multiple_problems = self._parse_multiple_problems(problem_description, building_normalized, floor_normalized, language)
        
        # 如果解析到多個問題，處理每個問題
        if len(multiple_problems) > 1:
            return self._handle_multiple_problems(
                dispatcher, multiple_problems, building_normalized, floor_normalized, facility_type, language
            )
        
        # 單一問題處理（原有邏輯）
        if len(multiple_problems) == 1:
            problem_description = multiple_problems[0]['description']
        
        # 判斷問題嚴重程度和狀態
        status, severity, notes, priority = self._analyze_problem(problem_description, language)
        
        # 如果信息不完整，詢問用戶（記住用戶的意圖）
        # 設置 pending_intent 以便後續對話繼續收集資訊
        if not building_normalized:
            if language == 'en':
                response_data = {
                    "action": "ask_for_building",
                    "message": "Which building are you referring to? For example: Zongsan Building, Administration Building, Library, etc.",
                    "language": "en",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "problem_description": problem_description,
                        "facility_type": facility_type
                    }
                }
            else:
                response_data = {
                    "action": "ask_for_building",
                    "message": "您指的是哪個建築？例如：綜三館、行政大樓、圖書館等",
                    "language": "zh",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "problem_description": problem_description,
                        "facility_type": facility_type
                    }
                }
            dispatcher.utter_message(custom=response_data)
            return [
                SlotSet("problem_description", problem_description),
                SlotSet("facility_type", facility_type),
                SlotSet("pending_intent", "report_facility_problem"),
                SlotSet("language", language)
            ]
        
        if not floor_normalized:
            if language == 'en':
                response_data = {
                    "action": "ask_for_floor",
                    "message": f"Which floor in {building_normalized}? Please specify (e.g., 1F, 2F, 3F)",
                    "language": "en",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "problem_description": problem_description,
                        "facility_type": facility_type
                    }
                }
            else:
                response_data = {
                    "action": "ask_for_floor",
                    "message": f"{building_normalized}的哪個樓層？請指定（例如：1F、2F、3F）",
                    "language": "zh",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "problem_description": problem_description,
                        "facility_type": facility_type
                    }
                }
            dispatcher.utter_message(custom=response_data)
            return [
                SlotSet("building", building_normalized),
                SlotSet("problem_description", problem_description),
                SlotSet("facility_type", facility_type),
                SlotSet("pending_intent", "report_facility_problem"),
                SlotSet("language", language)
            ]
        
        if not facility_type:
            if language == 'en':
                response_data = {
                    "action": "ask_for_facility_type",
                    "message": f"What type of facility has the problem in {building_normalized} {floor_normalized}? Is it a restroom, water fountain, or trash can?",
                    "language": "en",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "floor": floor_normalized,
                        "problem_description": problem_description
                    }
                }
            else:
                response_data = {
                    "action": "ask_for_facility_type",
                    "message": f"{building_normalized} {floor_normalized}的哪種設施有問題？是廁所、飲水機還是垃圾桶？",
                    "language": "zh",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "floor": floor_normalized,
                        "problem_description": problem_description
                    }
                }
            dispatcher.utter_message(custom=response_data)
            return [
                SlotSet("building", building_normalized),
                SlotSet("floor", floor_normalized),
                SlotSet("problem_description", problem_description),
                SlotSet("pending_intent", "report_facility_problem"),
                SlotSet("language", language)
            ]
        
        # 如果問題描述太簡單，詢問詳細信息
        if not notes or len(notes) < 5:
            if language == 'en':
                response_data = {
                    "action": "ask_for_problem_details",
                    "message": f"Can you describe the problem in {building_normalized} {floor_normalized} {facility_type} in more detail? For example: 'One urinal is broken' or 'The floor is dirty'",
                    "language": "en",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "floor": floor_normalized,
                        "facility_type": facility_type
                    }
                }
            else:
                facility_name = '廁所' if facility_type == 'toilet' else ('飲水機' if facility_type == 'water' else '垃圾桶')
                response_data = {
                    "action": "ask_for_problem_details",
                    "message": f"能否詳細描述一下{building_normalized} {floor_normalized}{facility_name}的問題？例如：「一個小便斗壞了」或「地板很髒」",
                    "language": "zh",
                    "pending_intent": "report_facility_problem",
                    "collected_info": {
                        "building": building_normalized,
                        "floor": floor_normalized,
                        "facility_type": facility_type
                    }
                }
            dispatcher.utter_message(custom=response_data)
            return [
                SlotSet("building", building_normalized),
                SlotSet("floor", floor_normalized),
                SlotSet("facility_type", facility_type),
                SlotSet("pending_intent", "report_facility_problem"),
                SlotSet("language", language)
            ]
        
        # 構建回應訊息
        if facility_type == 'toilet':
            facility_name = 'restroom' if language == 'en' else '廁所'
        elif facility_type == 'water':
            facility_name = 'water fountain' if language == 'en' else '飲水機'
        else:
            facility_name = 'trash can' if language == 'en' else '垃圾桶'
        
        # 如果是廁所但沒有性別信息，詢問廁所類型
        if facility_type == 'toilet' and not gender:
            if language == 'en':
                response_text = f"❓ Please select the type of restroom:\n- Men's restroom (♂️)\n- Women's restroom (♀️)\n- Unisex restroom (🚻)\n- Accessible restroom (♿)\n\nWhich one is it?"
            else:
                response_text = f"❓ 請選擇廁所類型：\n- 男廁 (♂️)\n- 女廁 (♀️)\n- 性別友善廁所 (🚻)\n- 無障礙廁所 (♿)\n\n請問是哪一個？"
            dispatcher.utter_message(text=response_text)
            return [
                SlotSet("building", building_normalized),
                SlotSet("floor", floor_normalized),
                SlotSet("facility_type", facility_type),
                SlotSet("problem_description", problem_description),
                SlotSet("pending_intent", "report_facility_problem"),
                SlotSet("language", language)
            ]
        
        # 檢測嚴重問題（如漏水、無法使用等），反問是否整個設施都不能用
        problem_desc_lower = (problem_description or "").lower()
        is_severe_issue = any(keyword in problem_desc_lower for keyword in [
            '漏水', 'leak', 'leaking', '無法使用', 'unavailable', '不能用', 'cannot use',
            '故障', 'malfunction', '壞了', 'broken', '損壞', 'damaged',
            '堵塞', 'clogged', 'blocked', '溢出', 'overflow', '滿出來'
        ])
        
        # 如果問題嚴重且沒有明確說明是部分問題，反問是否整個設施都不能用
        if is_severe_issue and not any(word in problem_desc_lower for word in [
            '一個', 'one', '部分', 'part', '有些', 'some', '幾個', 'few', '單個', 'single'
        ]):
            if language == 'en':
                response_text = f"⚠️ I've recorded the problem with {building_normalized} {floor_normalized} {facility_name}: {problem_description}\n\nStatus: {status}\nDetails: {notes}\n\n❓ **Question:** Is the entire {facility_name} unusable, or is it just a specific part (e.g., one toilet, one faucet)?"
            else:
                response_text = f"⚠️ 我已記錄{building_normalized} {floor_normalized}{facility_name}的問題：{problem_description}\n\n狀態：{status}\n詳情：{notes}\n\n❓ **請問：** 是整個{facility_name}都不能使用，還是只是部分設備有問題（例如：一個馬桶、一個水龍頭）？"
        else:
            if language == 'en':
                response_text = f"✅ I've recorded the problem with {building_normalized} {floor_normalized} {facility_name}.\n\nStatus: {status}\nDetails: {notes}"
            else:
                response_text = f"✅ 我已記錄{building_normalized} {floor_normalized}{facility_name}的問題。\n\n狀態：{status}\n詳情：{notes}"
        
        dispatcher.utter_message(text=response_text)
        
        # 獲取問題解決建議（知識庫）
        suggestion = self._get_problem_suggestion(status, severity, language)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "report_facility_problem",
            "building": building_normalized,
            "floor": floor_normalized,
            "facility_type": facility_type,
            "gender": gender if facility_type == 'toilet' else None,
            "status": status,
            "problem_description": problem_description,
            "notes": notes,
            "severity": severity,
            "priority": priority,
            "suggestion": suggestion,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        # 發送 LINE 通知給清潔人員
        if LINE_NOTIFICATION_AVAILABLE and get_notification_service:
            try:
                # 取得校區資訊（從 building 推斷或從 slot 取得）
                campus = tracker.get_slot("campus")
                
                # 發送通知
                notification_service = get_notification_service()
                notification_result = notification_service.send_cleaning_notification(
                    campus=campus,
                    building=building_normalized,
                    floor=floor_normalized,
                    facility_type=facility_type,
                    problem_description=problem_description,
                    reporter=None  # 可以從 tracker 取得用戶資訊
                )
                
                if notification_result.get("success"):
                    logger.info(
                        f"LINE 通知發送成功：已通知 {notification_result.get('sent_count', 0)} 位清潔人員"
                    )
                else:
                    logger.warning(
                        f"LINE 通知發送失敗：{notification_result.get('error', '未知錯誤')}"
                    )
            except Exception as e:
                logger.error(f"發送 LINE 通知時發生錯誤: {e}", exc_info=True)
        
        return [
            SlotSet("building", building_normalized),
            SlotSet("floor", floor_normalized),
            SlotSet("facility_type", facility_type),
            SlotSet("gender", gender if facility_type == 'toilet' else None),
            SlotSet("status", status),
            SlotSet("problem_description", problem_description),
            SlotSet("severity", severity),
            SlotSet("language", language)
        ]
    
    def _analyze_problem(self, description: str, language: str) -> tuple:
        """分析問題描述，返回 (status, severity, notes, priority)"""
        if not description:
            return ("正常", "minor", "", "minor")
        
        desc_lower = description.lower()
        desc_original = description.strip()
        
        # 判斷是否為部分問題（單個設備有問題）
        is_partial = any(word in desc_lower for word in [
            '一個', 'one', '部分', 'part', '有些', 'some', '幾個', 'few',
            '小便斗', 'urinal', '馬桶', 'toilet', '水龍頭', 'faucet',
            '洗手台', 'sink', '烘手機', 'hand dryer',
            '最靠窗', '最裡面', '最外面', '第一個', '第二個', '第三個',
            '左側', '右側', '左邊', '右邊', 'near window', 'first', 'second'
        ])
        
        # 1. 衛生問題（有大便、有尿、很髒、有異味等）
        hygiene_keywords = [
            # 排泄物相關
            '大便', 'poop', 'feces', 'stool', '糞便', '排泄物', 'waste',
            '有尿', 'urine', 'pee', '尿液',
            '裡面有', 'inside has', '裡面', 'inside', '有東西', 'has something',
            # 清潔度問題
            '很髒', 'very dirty', 'dirty', '髒', '不乾淨', 'not clean', '骯髒',
            '污漬', 'stain', '污垢', 'dirt', '垃圾', 'trash', 'garbage',
            '未清理', 'not cleaned', '沒清', 'hasn\'t been cleaned',
            # 異味問題
            '有異味', '有臭味', 'smell', 'odor', 'stink', '臭', '異味', '臭味',
            '難聞', 'bad smell', 'foul odor', '惡臭',
            # 異物問題
            '有異物', 'foreign object', '異物', '有東西', 'something inside',
            # 衛生紙問題
            '沒紙', 'no paper', '沒有衛生紙', 'no toilet paper', '缺紙',
            '紙用完了', 'paper ran out', '紙沒了'
        ]
        is_hygiene = any(word in desc_lower for word in hygiene_keywords)
        
        # 2. 堵塞問題
        clog_keywords = [
            '堵塞', 'clog', 'blocked', 'blocking', '堵住', '堵了',
            '不通', 'not working', 'not flowing', '不流通',
            '沖不掉', '沖不下去', "won't flush", "can't flush", '沖不走',
            '卡住', 'stuck', 'jam', '卡了',
            '排水不暢', 'drain slowly', '排水慢', 'slow drain',
            '倒灌', 'backflow', '回流', 'water backflow'
        ]
        is_clogged = any(word in desc_lower for word in clog_keywords)
        
        # 3. 損壞問題（壞了、故障、漏水等）
        broken_keywords = [
            # 一般損壞
            '壞', 'broken', '故障', 'malfunction', '不能用', 'not working', '壞了',
            '損壞', 'damaged', '破損', 'broken down', '失效', '失效',
            '無法使用', 'unavailable', '不能用', 'cannot use', '無法運作',
            # 漏水問題
            '漏水', 'leak', 'leaking', '滴水', 'dripping', '漏', 'leakage',
            '滲水', 'water seepage', '滲漏', 'seepage',
            # 供水問題
            '沒水', 'no water', '沒水了', 'out of water', '停水', 'water outage',
            '水壓不足', 'low water pressure', '水壓低', 'weak water flow',
            '出水量小', 'small water flow', '水流小',
            # 供電問題
            '沒電', 'no power', '停電', 'power outage', '斷電', 'power cut',
            '燈不亮', 'light not working', '燈壞了', 'light broken',
            '閃爍', 'flickering', '燈閃', 'light flickering',
            # 門鎖問題
            '門壞', 'door broken', '門鎖壞', 'door lock broken',
            '關不上', "can't close", '鎖不上', "can't lock",
            '門卡住', 'door stuck', '門關不緊', 'door not closing properly',
            # 其他設備問題
            '烘手機壞', 'hand dryer broken', '烘手機不工作', 'hand dryer not working',
            '感應器壞', 'sensor broken', '感應不良', 'sensor not working',
            '按鈕壞', 'button broken', '按鈕不靈', 'button not working'
        ]
        is_broken = any(word in desc_lower for word in broken_keywords)
        
        # 4. 滿出問題
        full_keywords = [
            '滿', 'full', '滿出', 'overflowing', '溢出', 'overflow',
            '裝滿', 'filled up', '滿了', 'is full',
            '垃圾桶滿', 'trash full', '垃圾滿了', 'trash can full'
        ]
        is_full = any(word in desc_lower for word in full_keywords)
        
        # 5. 維修問題
        maintenance_keywords = [
            '維修', 'maintenance', '修理', 'repair', '修復', 'fix'
        ]
        is_maintenance = any(word in desc_lower for word in maintenance_keywords)
        
        # 6. 清潔問題（需要清潔但不算嚴重）
        cleaning_keywords = [
            '需要清潔', 'needs cleaning', '要清', 'needs clean', '待清潔',
            '要打掃', 'needs cleaning', '需要打掃', 'needs sweeping',
            '清潔', 'cleaning', '打掃', 'sweep', '清理', 'clean up',
            '髒', 'dirty', '不乾淨', 'not clean', '骯髒', 'filthy',
            '有灰塵', 'dusty', '有污漬', 'stained', '有異味', 'smelly'
        ]
        needs_cleaning = any(word in desc_lower for word in cleaning_keywords)
        
        # 7. 水質問題（飲水機相關）
        water_quality_keywords = [
            '水有異味', 'water has odor', '水有味道', 'water tastes bad',
            '水質問題', 'water quality issue', '水不乾淨', 'water not clean',
            '水有雜質', 'water has impurities', '水混濁', 'water cloudy',
            '無法出水', 'no water flow', '不出水', 'water not flowing',
            '水溫異常', 'water temperature abnormal', '水太熱', 'water too hot',
            '水太冷', 'water too cold'
        ]
        is_water_quality = any(word in desc_lower for word in water_quality_keywords)
        
        # 8. 溫度問題（空調、暖氣等）
        temperature_keywords = [
            '太熱', 'too hot', '太冷', 'too cold', '溫度異常', 'temperature abnormal',
            '空調壞', 'air conditioning broken', '冷氣壞', 'AC broken',
            '暖氣壞', 'heating broken', '暖氣不工作', 'heating not working'
        ]
        is_temperature = any(word in desc_lower for word in temperature_keywords)
        
        # 9. 噪音問題
        noise_keywords = [
            '有噪音', 'has noise', '噪音', 'noise', '聲音太大', 'too loud',
            '異音', 'abnormal sound', '奇怪的聲音', 'strange sound',
            '運轉聲', 'operating sound', '機器聲', 'machine sound'
        ]
        is_noise = any(word in desc_lower for word in noise_keywords)
        
        # 10. 牆面問題
        wall_keywords = [
            '牆面裂縫', 'wall crack', '牆裂', 'cracked wall', '裂縫', 'crack',
            '壁癌', 'wall mold', '牆面發霉', 'wall mildew', '發霉', 'mold',
            '油漆剝落', 'paint peeling', '牆面剝落', 'wall peeling', '剝落', 'peeling'
        ]
        is_wall = any(word in desc_lower for word in wall_keywords)
        
        # 11. 結構問題（漏水、滲水等）
        structure_keywords = [
            '屋頂漏水', 'roof leak', '天花板漏水', 'ceiling leak',
            '窗戶滲水', 'window seepage', '窗戶漏水', 'window leak',
            '地板翹起', 'floor warping', '地板破損', 'floor damaged',
            '天花板滲水', 'ceiling seepage', '天花板有水漬', 'ceiling water stain'
        ]
        is_structure = any(word in desc_lower for word in structure_keywords)
        
        # 12. 電力系統問題
        electrical_keywords = [
            '電線老化', 'wire aging', '電線問題', 'wire issue',
            '插座故障', 'outlet broken', '插座壞', 'outlet not working',
            '跳電', 'power trip', '短路', 'short circuit',
            '電路問題', 'circuit issue', '電力異常', 'power abnormal'
        ]
        is_electrical = any(word in desc_lower for word in electrical_keywords)
        
        # 13. 通風問題
        ventilation_keywords = [
            '通風不良', 'poor ventilation', '空氣不流通', 'poor air circulation',
            '空氣品質差', 'poor air quality', '悶熱', 'stuffy',
            '空氣異味', 'air odor', '空氣有味道', 'air has smell'
        ]
        is_ventilation = any(word in desc_lower for word in ventilation_keywords)
        
        # 判斷問題優先級（輕微、中等、嚴重）
        priority = "minor"  # 默認輕微
        
        # 嚴重問題：影響安全或整個設施無法使用
        if any([
            is_electrical and ('短路' in desc_lower or 'short circuit' in desc_lower),
            is_structure and ('屋頂' in desc_lower or 'roof' in desc_lower),
            is_broken and not is_partial and ('無法使用' in desc_lower or 'unavailable' in desc_lower),
            is_water_quality
        ]):
            priority = "critical"
        # 中等問題：影響使用但不危險
        elif any([
            is_clogged and not is_partial,
            is_broken and not is_partial,
            is_temperature and not is_partial,
            is_structure,
            is_electrical
        ]):
            priority = "moderate"
        # 輕微問題：部分設備問題或清潔問題
        else:
            priority = "minor"
        
        # 優先級判斷：衛生問題 > 結構問題 > 電力問題 > 水質問題 > 堵塞 > 損壞 > 滿出 > 溫度 > 通風 > 牆面 > 噪音 > 清潔 > 維修
        if is_hygiene:
            # 衛生問題通常是部分損壞（單個設備），需要清潔 - 映射為"待清潔"狀態
            status = "待清潔"
            severity = "minor" if is_partial else "major"
            if language == 'en':
                notes = f"Hygiene issue: {desc_original}. Requires immediate cleaning."
            else:
                notes = f"衛生問題：{desc_original}。需要立即清潔。"
        
        elif is_clogged:
            # 堵塞問題：如果是單個設備，是部分損壞；如果是整個設施，是故障
            if is_partial:
                status = "部分損壞"
                severity = "minor"
                if language == 'en':
                    notes = f"Clogged: {desc_original}. Other facilities are functioning normally."
                else:
                    notes = f"堵塞：{desc_original}。其他設施正常運作。"
            else:
                # 整個設施無法使用，映射為"無法使用"狀態
                status = "無法使用"
                severity = "major"
                if language == 'en':
                    notes = f"Clogged: {desc_original}. Facility is out of order."
                else:
                    notes = f"堵塞：{desc_original}。設施無法使用。"
        
        elif is_broken:
            # 損壞問題
            if is_partial:
                status = "部分損壞"
                severity = "minor"
                if language == 'en':
                    notes = f"Broken: {desc_original}. Other facilities are functioning normally."
                else:
                    notes = f"損壞：{desc_original}。其他設施正常運作。"
            else:
                # 整個設施無法使用，映射為"無法使用"狀態
                status = "無法使用"
                severity = "major"
                if language == 'en':
                    notes = f"Broken: {desc_original}. Facility is out of order."
                else:
                    notes = f"損壞：{desc_original}。設施無法使用。"
        
        elif is_full:
            # 滿出問題
            status = "滿出"
            severity = "minor"
            if language == 'en':
                notes = f"Full: {desc_original}."
            else:
                notes = f"滿出：{desc_original}。"
        
        elif is_maintenance:
            # 維修問題
            status = "維修中"
            severity = "major"
            if language == 'en':
                notes = f"Under maintenance: {desc_original}."
            else:
                notes = f"維修中：{desc_original}。"
        
        elif is_water_quality:
            # 水質問題（飲水機）- 映射為"無法使用"狀態
            status = "無法使用"
            severity = "major"
            if language == 'en':
                notes = f"Water quality issue: {desc_original}. Facility is out of order."
            else:
                notes = f"水質問題：{desc_original}。設施無法使用。"
        
        elif is_temperature:
            # 溫度問題
            if is_partial:
                status = "部分損壞"
                severity = "minor"
            else:
                status = "無法使用"
                severity = "major"
            if language == 'en':
                notes = f"Temperature issue: {desc_original}."
            else:
                notes = f"溫度問題：{desc_original}。"
        
        elif is_noise:
            # 噪音問題
            status = "部分損壞"
            severity = "minor"
            if language == 'en':
                notes = f"Noise issue: {desc_original}. Facility still usable but needs attention."
            else:
                notes = f"噪音問題：{desc_original}。設施仍可使用但需要關注。"
        
        elif is_structure:
            # 結構問題（漏水、滲水等）- 映射為"無法使用"狀態
            status = "無法使用"
            severity = priority
            if language == 'en':
                notes = f"Structural issue: {desc_original}. Requires immediate attention."
            else:
                notes = f"結構問題：{desc_original}。需要立即處理。"
        
        elif is_electrical:
            # 電力問題 - 映射為"無法使用"狀態
            status = "無法使用"
            severity = priority
            if language == 'en':
                notes = f"Electrical issue: {desc_original}. Safety concern, requires immediate attention."
            else:
                notes = f"電力問題：{desc_original}。安全隱患，需要立即處理。"
        
        elif is_wall:
            # 牆面問題
            status = "部分損壞"
            severity = "minor"
            if language == 'en':
                notes = f"Wall issue: {desc_original}. Facility still usable but needs repair."
            else:
                notes = f"牆面問題：{desc_original}。設施仍可使用但需要修復。"
        
        elif is_ventilation:
            # 通風問題
            status = "部分損壞"
            severity = "minor"
            if language == 'en':
                notes = f"Ventilation issue: {desc_original}. Air quality concern."
            else:
                notes = f"通風問題：{desc_original}。空氣品質問題。"
        
        elif needs_cleaning:
            # 需要清潔 - 映射為"待清潔"狀態
            status = "待清潔"
            severity = "minor"
            if language == 'en':
                notes = f"Needs cleaning: {desc_original}."
            else:
                notes = f"需要清潔：{desc_original}。"
        
        else:
            # 默認：部分損壞（因為通常是指單個設備的問題）
            status = "部分損壞"
            severity = "minor"
            if language == 'en':
                notes = f"Issue reported: {desc_original}. Other facilities are functioning normally."
            else:
                notes = f"問題回報：{desc_original}。其他設施正常運作。"
        
        return (status, severity, notes, priority)
    
    def _get_problem_suggestion(self, status: str, severity: str, language: str) -> str:
        """根據問題類型和嚴重程度提供解決建議"""
        suggestions = {
            "清潔中": {
                "zh": "建議立即安排清潔人員處理，確保衛生環境。",
                "en": "Recommend immediate cleaning service to ensure hygiene."
            },
            "故障": {
                "zh": "建議立即通知維修人員，可能需要專業技術人員處理。",
                "en": "Recommend immediate notification to maintenance staff, may require professional technician."
            },
            "部分損壞": {
                "zh": "建議盡快安排維修，其他設施仍可正常使用。",
                "en": "Recommend scheduling repair soon, other facilities still functional."
            },
            "滿出": {
                "zh": "建議立即清理，避免影響使用。",
                "en": "Recommend immediate cleanup to avoid impact on usage."
            },
            "維修中": {
                "zh": "設施正在維修中，請使用其他替代設施。",
                "en": "Facility is under maintenance, please use alternative facilities."
            }
        }
        
        suggestion = suggestions.get(status, {}).get(language, "")
        
        # 根據嚴重程度添加緊急提示
        if severity == "critical":
            if language == 'zh':
                suggestion = "⚠️ 緊急：此問題涉及安全，請立即處理！" + suggestion
            else:
                suggestion = "⚠️ URGENT: This issue involves safety, requires immediate attention! " + suggestion
        elif severity == "moderate":
            if language == 'zh':
                suggestion = "🔶 重要：建議盡快處理。" + suggestion
            else:
                suggestion = "🔶 IMPORTANT: Recommend handling soon. " + suggestion
        
        return suggestion
    
    def _parse_multiple_problems(self, description: str, building: str, floor: str, language: str) -> list:
        """解析多個設備問題，例如：'左側第一個小便斗有大便和最靠窗的馬桶堵塞'"""
        if not description:
            return []
        
        problems = []
        desc = description.strip()
        
        # 分隔符號：和、與、and、,、、
        separators = ['和', '與', 'and', '、', ',', '，', '還有', 'also']
        
        # 檢查是否包含多個問題
        has_multiple = any(sep in desc for sep in separators)
        
        if not has_multiple:
            # 單一問題
            return [{
                'description': desc,
                'location': self._extract_location_keywords(desc, language),
                'equipment': self._extract_equipment_keywords(desc, language)
            }]
        
        # 分割多個問題
        parts = []
        current_part = desc
        for sep in separators:
            if sep in current_part:
                parts = [p.strip() for p in current_part.split(sep) if p.strip()]
                break
        
        if len(parts) < 2:
            # 分割失敗，當作單一問題
            return [{
                'description': desc,
                'location': self._extract_location_keywords(desc, language),
                'equipment': self._extract_equipment_keywords(desc, language)
            }]
        
        # 處理每個部分
        for part in parts:
            problems.append({
                'description': part,
                'location': self._extract_location_keywords(part, language),
                'equipment': self._extract_equipment_keywords(part, language)
            })
        
        return problems
    
    def _extract_location_keywords(self, text: str, language: str) -> dict:
        """提取位置關鍵字，例如：左側、右側、最靠窗、第一個等"""
        location_info = {
            'side': None,  # 左側、右側
            'position': None,  # 第一個、第二個、最靠窗
            'specific': None  # 其他特定位置描述
        }
        
        text_lower = text.lower()
        
        # 提取側邊信息（優先檢查完整詞組）
        if any(word in text for word in ['左側', '左邊', 'left side', 'left']):
            location_info['side'] = 'left'
        elif any(word in text for word in ['右側', '右邊', 'right side', 'right']):
            location_info['side'] = 'right'
        elif any(word in text for word in ['中間', 'middle', 'center', '中央']):
            location_info['side'] = 'middle'
        
        # 提取位置信息
        import re
        
        # 第一個、第二個等（中文數字或阿拉伯數字）
        order_patterns = [
            r'第([一二三四五六七八九十\d]+)[個項]',
            r'([一二三四五六七八九十\d]+)號',
            r'第(\d+)[個項]',
            r'(\d+)號'
        ]
        for pattern in order_patterns:
            order_match = re.search(pattern, text)
            if order_match:
                location_info['position'] = order_match.group(0)
                break
        
        # 最靠窗、最裡面、最外面等
        if any(word in text for word in ['最靠窗', '靠窗', 'near window', 'by window']):
            location_info['position'] = 'specific'
            location_info['specific'] = 'window'
        elif any(word in text for word in ['最裡面', '裡面', 'inside', 'inner']):
            location_info['position'] = 'specific'
            location_info['specific'] = 'inside'
        elif any(word in text for word in ['最外面', '外面', 'outside', 'outer']):
            location_info['position'] = 'specific'
            location_info['specific'] = 'outside'
        elif any(word in text for word in ['最靠近', '靠近', 'near', 'close to']):
            location_info['position'] = 'specific'
            location_info['specific'] = 'near'
        
        return location_info
    
    def _extract_equipment_keywords(self, text: str, language: str) -> str:
        """提取設備類型關鍵字"""
        text_lower = text.lower()
        
        # 優先檢查完整詞組，避免誤判
        if any(word in text_lower for word in ['小便斗', 'urinal', '小便池', '小便器']):
            return 'urinal'
        elif any(word in text_lower for word in ['馬桶', 'toilet', '坐式馬桶', '坐廁', '座便器']):
            return 'toilet'
        elif any(word in text_lower for word in ['洗手台', 'sink', '洗手盆', 'washbasin']):
            return 'sink'
        elif any(word in text_lower for word in ['水龍頭', 'faucet', 'tap', '水喉']):
            return 'faucet'
        elif any(word in text_lower for word in ['烘手機', 'hand dryer', '乾手機', '烘手器']):
            return 'hand_dryer'
        elif any(word in text_lower for word in ['衛生紙', 'toilet paper', '紙巾', 'tissue']):
            return 'toilet_paper'
        elif any(word in text_lower for word in ['門', 'door', '門鎖', 'door lock']):
            return 'door'
        elif any(word in text_lower for word in ['燈', 'light', '照明', 'lighting']):
            return 'light'
        else:
            return 'unknown'
    
    def _handle_multiple_problems(
        self, dispatcher, problems: list, building: str, floor: str, 
        facility_type: str, language: str
    ) -> List[Dict[Text, Any]]:
        """處理多個設備問題"""
        updated_facilities = []
        
        for i, problem in enumerate(problems, 1):
            desc = problem['description']
            status, severity, notes, priority = self._analyze_problem(desc, language)
            
            # 構建設備描述
            equipment = problem.get('equipment', 'unknown')
            location = problem.get('location', {})
            
            # 生成詳細描述
            location_desc = []
            if location.get('side'):
                side_text = {'left': '左側', 'right': '右側', 'middle': '中間'}.get(location['side'], '')
                if language == 'en':
                    side_text = {'left': 'left side', 'right': 'right side', 'middle': 'middle'}.get(location['side'], '')
                location_desc.append(side_text)
            
            if location.get('position'):
                location_desc.append(location['position'])
            
            if location.get('specific'):
                spec_text = {'window': '靠窗', 'inside': '裡面', 'outside': '外面'}.get(location['specific'], '')
                if language == 'en':
                    spec_text = {'window': 'near window', 'inside': 'inside', 'outside': 'outside'}.get(location['specific'], '')
                location_desc.append(spec_text)
            
            location_str = ' '.join(location_desc) if location_desc else ''
            
            # 設備名稱
            equipment_names = {
                'urinal': '小便斗' if language == 'zh' else 'urinal',
                'toilet': '馬桶' if language == 'zh' else 'toilet',
                'sink': '洗手台' if language == 'zh' else 'sink',
                'hand_dryer': '烘手機' if language == 'zh' else 'hand dryer'
            }
            equipment_name = equipment_names.get(equipment, '設備' if language == 'zh' else 'equipment')
            
            # 構建完整描述
            full_description = f"{location_str} {equipment_name} {desc}".strip()
            
            updated_facilities.append({
                'building': building,
                'floor': floor,
                'facility_type': facility_type,
                'equipment': equipment,
                'location': location,
                'description': full_description,
                'status': status,
                'severity': severity,
                'notes': notes
            })
        
        # 構建回應訊息
        if facility_type == 'toilet':
            facility_name = 'restroom' if language == 'en' else '廁所'
        elif facility_type == 'water':
            facility_name = 'water fountain' if language == 'en' else '飲水機'
        else:
            facility_name = 'trash can' if language == 'en' else '垃圾桶'
        
        if language == 'en':
            response_text = f"✅ I've identified {len(problems)} problem(s) in {building} {floor} {facility_name}:\n\n"
            for i, prob in enumerate(updated_facilities, 1):
                response_text += f"{i}. {prob['description']} - Status: {prob['status']}\n"
        else:
            response_text = f"✅ 我已識別{building} {floor}{facility_name}中的{len(problems)}個問題：\n\n"
            for i, prob in enumerate(updated_facilities, 1):
                response_text += f"{i}. {prob['description']} - 狀態：{prob['status']}\n"
        
        dispatcher.utter_message(text=response_text)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "report_facility_problem",
            "building": building,
            "floor": floor,
            "facility_type": facility_type,
            "problems": updated_facilities,
            "multiple": True,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        return [
            SlotSet("building", building),
            SlotSet("floor", floor),
            SlotSet("facility_type", facility_type),
            SlotSet("language", language)
        ]


class ActionQueryBuildingFacilities(_BaseAction):
    """查詢建築內的設施"""
    
    def name(self) -> Text:
        return "action_query_building_facilities"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        
        # 建築名稱映射（支持所有建築，包括拼寫變體）
        building_map = {
            # 第一校區
            "第一教學大樓": "第一教學大樓", "first teaching building": "第一教學大樓",
            "第二教學大樓": "第二教學大樓", "second teaching building": "第二教學大樓",
            "第三教學大樓": "第三教學大樓", "third teaching building": "第三教學大樓",
            "第四教學大樓": "第四教學大樓", "fourth teaching building": "第四教學大樓",
            "行政大樓": "行政大樓", "administration building": "行政大樓", "行政": "行政大樓",
            "圖書館": "圖書館", "library": "圖書館",
            "飛機館": "飛機館", "電機工程館": "飛機館", "電機館": "飛機館",
            "機械工程館": "機械工程館", "機械館": "機械工程館",
            "資訊休閒大樓": "資訊休閒大樓",
            "紅館": "紅館",
            "綠館": "綠館",
            "學生活動中心": "學生活動中心", "活動中心": "學生活動中心",
            # 第二校區
            "科技研究中心": "科技研究中心", "科技中心": "科技研究中心",
            "綜一館": "綜一館", "綜合一館": "綜一館",
            "綜二館": "綜二館", "綜合二館": "綜二館",
            "綜三館": "綜三館", "粽三館": "綜三館", "粽三": "綜三館", "綜三": "綜三館",
            "綜合三館": "綜三館", "zongsan building": "綜三館", "zongsan": "綜三館",
            "電機館": "電機館", "第二校區電機館": "電機館",
            # 第三校區
            "操場": "操場", "playground": "操場",
            "游泳池": "游泳池", "swimming pool": "游泳池",
            "體育館": "體育館(經國館)", "經國館": "體育館(經國館)", "經國體育館": "體育館(經國館)",
            "人文大樓": "人文大樓",
            "文理暨管理大樓": "文理暨管理大樓", "文理大樓": "文理暨管理大樓"
        }
        
        # 標準化建築物名稱（支持拼寫變體）
        building_normalized = building_map.get(building, building_map.get(building.lower() if building else "", building or ""))
        
        # 如果還是找不到，嘗試從消息中提取
        if not building_normalized or building_normalized == (building or ""):
            last_message = tracker.latest_message.get("text", "") or ""
            text_lower = last_message.lower()
            # 按長度排序，優先匹配較長的建築物名稱
            sorted_keys = sorted(building_map.keys(), key=len, reverse=True)
            for key in sorted_keys:
                if key.lower() in text_lower:
                    building_normalized = building_map[key]
                    break
        
        if language == 'en':
            response_text = f"Querying facilities in {building_normalized}..."
        else:
            response_text = f"正在查詢{building_normalized}的設施..."
        
        dispatcher.utter_message(text=response_text)
        
        # 發送結構化資料給前端
        response_data = {
            "action": "query_building_facilities",
            "building": building_normalized,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        
        return [
            SlotSet("building", building_normalized),
            SlotSet("language", language)
        ]


class ActionGetSmartRoute(_BaseAction):
    """智能路線規劃（避開故障設施）"""
    
    def name(self) -> Text:
        return "action_get_smart_route"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取設施類型
        facility_type = None
        text_lower = last_message.lower()
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_type = 'toilet'
        elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain']):
            facility_type = 'water'
        elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage']):
            facility_type = 'trash'
        else:
            facility_type = 'toilet'  # 默認
        
        if language == 'en':
            response_data = {
                "action": "get_smart_route",
                "facility_type": facility_type,
                "message": "Planning a smart route that avoids facilities with major issues...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "get_smart_route",
                "facility_type": facility_type,
                "message": "正在規劃智能路線，避開有重大問題的設施...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language), SlotSet("facility_type", facility_type)]


class ActionQueryFacilityHistory(_BaseAction):
    """查詢設施歷史記錄"""
    
    def name(self) -> Text:
        return "action_query_facility_history"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        floor = tracker.get_slot("floor")
        
        if language == 'en':
            response_text = f"Querying history for {building or 'facility'} {floor or ''}..."
        else:
            response_text = f"正在查詢{building or '設施'}{floor or ''}的歷史記錄..."
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "query_facility_history",
            "building": building,
            "floor": floor,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionGetStatistics(_BaseAction):
    """獲取統計資訊"""
    
    def name(self) -> Text:
        return "action_get_statistics"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        if language == 'en':
            response_text = "Generating facility statistics..."
        else:
            response_text = "正在生成設施統計資訊..."
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "get_statistics",
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionSetPreference(_BaseAction):
    """設定偏好（用於記住用戶的設施選擇偏好，無需帳號）"""
    
    def name(self) -> Text:
        return "action_set_preference"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        text_lower = last_message.lower()
        
        # 從消息中提取設施類型
        facility_type = None
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_type = 'toilet'
        elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain']):
            facility_type = 'water'
        elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage']):
            facility_type = 'trash'
        
        # 記住用戶偏好
        if facility_type:
            self.remember(tracker, "preferred_facility_type", facility_type)
        
        if language == 'en':
            response_text = f"✅ I've saved your preference for {facility_type or 'facilities'}. I'll remember this for future interactions."
        else:
            facility_name = '廁所' if facility_type == 'toilet' else ('飲水機' if facility_type == 'water' else '設施')
            response_text = f"✅ 我已保存您對{facility_name}的偏好設定。我會記住這個設定以便未來使用。"
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "set_preference",
            "facility_type": facility_type,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language), SlotSet("facility_type", facility_type)]


class ActionGetPreferences(_BaseAction):
    """獲取偏好設定（從會話記憶讀取）"""
    
    def name(self) -> Text:
        return "action_get_preferences"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 從會話記憶獲取偏好
        user_context = self.get_user_context(tracker)
        preferred_facility = self.recall(tracker, "preferred_facility_type")
        last_facility = self.recall(tracker, "last_facility_type")
        
        if language == 'en':
            response_text = "Here are your saved preferences:"
            if preferred_facility:
                response_text += f"\n• Preferred facility: {preferred_facility}"
            if last_facility:
                response_text += f"\n• Last queried: {last_facility}"
        else:
            response_text = "以下是您保存的偏好設定："
            if preferred_facility:
                facility_name = get_facility_name(preferred_facility, 'zh') if facility_cache else preferred_facility
                response_text += f"\n• 偏好設施：{facility_name}"
            if last_facility:
                facility_name = get_facility_name(last_facility, 'zh') if facility_cache else last_facility
                response_text += f"\n• 最近查詢：{facility_name}"
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "get_preferences",
            "preferences": user_context,
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionQuickReport(_BaseAction):
    """快速回報當前位置問題"""
    
    def name(self) -> Text:
        return "action_quick_report"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        if language == 'en':
            response_text = "I'll help you quickly report a problem at your current location. Please describe the issue."
        else:
            response_text = "我將幫您快速回報當前位置的問題。請描述一下問題。"
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "quick_report",
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionQueryIssueHistory(_BaseAction):
    """查詢問題歷史記錄"""
    
    def name(self) -> Text:
        return "action_query_issue_history"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        if language == 'en':
            response_text = "Here's your issue history. Please check the chat interface for details."
        else:
            response_text = "以下是您的問題歷史記錄，請查看對話介面了解詳情。"
        
        dispatcher.utter_message(text=response_text)
        
        response_data = {
            "action": "query_issue_history",
            "message": response_text,
            "language": language,
            "timestamp": datetime.now().isoformat()
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionGetUserLocation(_BaseAction):
    """獲取用戶 GPS 位置"""
    
    def name(self) -> Text:
        return "action_get_user_location"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        if language == 'en':
            response_data = {
                "action": "get_user_location",
                "message": "Getting your current GPS location...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "get_user_location",
                "message": "正在獲取您目前的 GPS 位置...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionFindNearestFunctionalFacility(_BaseAction):
    """尋找最近的功能正常設施（基於 GPS，只找狀態為「正常」的設施）"""
    
    def name(self) -> Text:
        return "action_find_nearest_functional_facility"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取設施類型
        facility_type = None
        text_lower = last_message.lower()
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_type = 'toilet'
        elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain', 'water dispenser']):
            facility_type = 'water'
        elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage', 'trash can']):
            facility_type = 'trash'
        else:
            facility_type = tracker.get_slot("facility_type") or 'toilet'
        
        if language == 'en':
            facility_name = {
                'toilet': 'restroom',
                'water': 'water fountain',
                'trash': 'trash can'
            }.get(facility_type, 'facility')
            
            response_data = {
                "action": "find_nearest_functional_facility",
                "facility_type": facility_type,
                "require_status": "正常",  # 只找功能正常的設施
                "message": f"Finding the nearest functional {facility_name} based on your GPS location...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "find_nearest_functional_facility",
                "facility_type": facility_type,
                "require_status": "正常",  # 只找功能正常的設施
                "message": f"正在根據您的 GPS 位置尋找最近的功能正常{facility_name}...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language), SlotSet("facility_type", facility_type)]


class ActionQueryFacilityGPS(_BaseAction):
    """查詢設施的 GPS 點位"""
    
    def name(self) -> Text:
        return "action_query_facility_gps"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        floor = tracker.get_slot("floor")
        facility_type = tracker.get_slot("facility_type")
        
        if language == 'en':
            response_data = {
                "action": "query_facility_gps",
                "building": building,
                "floor": floor,
                "facility_type": facility_type,
                "message": f"Querying GPS coordinates for {building or 'facility'} {floor or ''}...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "query_facility_gps",
                "building": building,
                "floor": floor,
                "facility_type": facility_type,
                "message": f"正在查詢{building or '設施'}{floor or ''}的 GPS 座標...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionQueryFacilityStatus(_BaseAction):
    """查詢特定設施的狀態"""
    
    def name(self) -> Text:
        return "action_query_facility_status"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building")
        floor = tracker.get_slot("floor")
        facility_type = tracker.get_slot("facility_type")
        
        if language == 'en':
            facility_name = {
                'toilet': 'restroom',
                'water': 'water fountain',
                'trash': 'trash can'
            }.get(facility_type, 'facility')
            
            response_data = {
                "action": "query_facility_status",
                "building": building,
                "floor": floor,
                "facility_type": facility_type,
                "message": f"Querying status for {building or 'facility'} {floor or ''} {facility_name}...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "query_facility_status",
                "building": building,
                "floor": floor,
                "facility_type": facility_type,
                "message": f"正在查詢{building or '設施'}{floor or ''}{facility_name}的狀態...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionNavigateToFunctionalFacility(_BaseAction):
    """導航到功能正常的設施（基於 GPS，只導航到狀態為「正常」的設施）"""
    
    def name(self) -> Text:
        return "action_navigate_to_functional_facility"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取設施類型
        facility_type = None
        text_lower = last_message.lower()
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_type = 'toilet'
        elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain']):
            facility_type = 'water'
        elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage']):
            facility_type = 'trash'
        else:
            facility_type = tracker.get_slot("facility_type") or 'toilet'
        
        if language == 'en':
            facility_name = {
                'toilet': 'restroom',
                'water': 'water fountain',
                'trash': 'trash can'
            }.get(facility_type, 'facility')
            
            response_data = {
                "action": "navigate_to_functional_facility",
                "facility_type": facility_type,
                "require_status": "正常",  # 只導航到功能正常的設施
                "use_gps": True,  # 使用 GPS 進行導航
                "message": f"Navigating to the nearest functional {facility_name} using GPS...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "navigate_to_functional_facility",
                "facility_type": facility_type,
                "require_status": "正常",  # 只導航到功能正常的設施
                "use_gps": True,  # 使用 GPS 進行導航
                "message": f"正在使用 GPS 導航到最近的功能正常{facility_name}...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language), SlotSet("facility_type", facility_type)]


class ActionGetFacilityGPSPoints(_BaseAction):
    """獲取所有設施的 GPS 點位（用於地圖顯示）"""
    
    def name(self) -> Text:
        return "action_get_facility_gps_points"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        campus = tracker.get_slot("campus")
        facility_type = tracker.get_slot("facility_type")
        
        if language == 'en':
            response_data = {
                "action": "get_facility_gps_points",
                "campus": campus,
                "facility_type": facility_type,
                "message": f"Getting GPS points for all {facility_type or 'facilities'} in {campus or 'all campuses'}...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            campus_name = campus or '所有校區'
            response_data = {
                "action": "get_facility_gps_points",
                "campus": campus,
                "facility_type": facility_type,
                "message": f"正在獲取{campus_name}所有{facility_name}的 GPS 點位...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionQueryNearbyFacilitiesStatus(_BaseAction):
    """查詢附近設施的狀態（基於 GPS）"""
    
    def name(self) -> Text:
        return "action_query_nearby_facilities_status"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        facility_type = tracker.get_slot("facility_type")
        radius = tracker.get_slot("radius") or 500  # 默認 500 米
        
        if language == 'en':
            response_data = {
                "action": "query_nearby_facilities_status",
                "facility_type": facility_type,
                "radius": radius,
                "message": f"Querying status of nearby {facility_type or 'facilities'} within {radius}m...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "query_nearby_facilities_status",
                "facility_type": facility_type,
                "radius": radius,
                "message": f"正在查詢附近{radius}米內的{facility_name}狀態...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionCompareFacilities(_BaseAction):
    """比較多個設施（距離、狀態等）"""
    
    def name(self) -> Text:
        return "action_compare_facilities"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        facility_type = tracker.get_slot("facility_type")
        
        if language == 'en':
            response_data = {
                "action": "compare_facilities",
                "facility_type": facility_type,
                "message": "Comparing facilities by distance and status...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "compare_facilities",
                "facility_type": facility_type,
                "message": "正在比較設施的距離和狀態...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionGetFacilitiesByStatus(_BaseAction):
    """根據狀態篩選設施"""
    
    def name(self) -> Text:
        return "action_get_facilities_by_status"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        facility_type = tracker.get_slot("facility_type")
        status = tracker.get_slot("status") or "正常"
        
        if language == 'en':
            status_name = {
                '正常': 'normal',
                '維修中': 'maintenance',
                '故障': 'broken',
                '清潔中': 'cleaning',
                '滿出': 'full'
            }.get(status, status)
            
            response_data = {
                "action": "get_facilities_by_status",
                "facility_type": facility_type,
                "status": status,
                "message": f"Finding {facility_type or 'facilities'} with status: {status_name}...",
                "language": "en"
            }
        else:
            response_data = {
                "action": "get_facilities_by_status",
                "facility_type": facility_type,
                "status": status,
                "message": f"正在尋找狀態為「{status}」的{facility_type or '設施'}...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionGetFacilitiesSortedByDistance(_BaseAction):
    """獲取按距離排序的設施列表"""
    
    def name(self) -> Text:
        return "action_get_facilities_sorted_by_distance"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        facility_type = tracker.get_slot("facility_type")
        limit = tracker.get_slot("limit") or 5  # 默認前 5 個
        
        if language == 'en':
            response_data = {
                "action": "get_facilities_sorted_by_distance",
                "facility_type": facility_type,
                "limit": limit,
                "message": f"Getting top {limit} nearest {facility_type or 'facilities'} sorted by distance...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "get_facilities_sorted_by_distance",
                "facility_type": facility_type,
                "limit": limit,
                "message": f"正在獲取距離最近的{limit}個{facility_name}...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionRecommendFacility(_BaseAction):
    """智能推薦設施（基於多因素：距離、狀態、歷史、偏好）"""
    
    def name(self) -> Text:
        return "action_recommend_facility"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取設施類型
        facility_type = None
        text_lower = last_message.lower()
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_type = 'toilet'
        elif any(word in text_lower for word in ['飲水機', 'water', 'water fountain']):
            facility_type = 'water'
        elif any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage']):
            facility_type = 'trash'
        else:
            # 使用用戶偏好
            facility_type = self.recall(tracker, "preferred_facility_type") or 'toilet'
        
        # 推薦因素
        recommendation_factors = {
            "distance": True,  # 距離優先
            "status": "正常",  # 只推薦正常狀態
            "user_preference": True,  # 考慮用戶偏好
            "usage_history": True,  # 考慮使用歷史
            "time_based": True  # 考慮時間（避開高峰期）
        }
        
        if language == 'en':
            facility_name = {
                'toilet': 'restroom',
                'water': 'water fountain',
                'trash': 'trash can'
            }.get(facility_type, 'facility')
            
            response_data = {
                "action": "recommend_facility",
                "facility_type": facility_type,
                "recommendation_factors": recommendation_factors,
                "message": f"Recommending the best {facility_name} based on distance, status, and your preferences...",
                "language": "en"
            }
        else:
            facility_name = {
                'toilet': '廁所',
                'water': '飲水機',
                'trash': '垃圾桶'
            }.get(facility_type, '設施')
            
            response_data = {
                "action": "recommend_facility",
                "facility_type": facility_type,
                "recommendation_factors": recommendation_factors,
                "message": f"正在根據距離、狀態和您的偏好推薦最佳的{facility_name}...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language), SlotSet("facility_type", facility_type)]


class ActionSmartSuggestions(_BaseAction):
    """智能建議（主動提供建議）"""
    
    def name(self) -> Text:
        return "action_smart_suggestions"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 分析上下文生成建議
        user_context = self.get_user_context(tracker)
        last_facility = self.recall(tracker, "last_facility_type")
        preferred_facility = self.recall(tracker, "preferred_facility_type")
        
        # 生成個性化建議
        suggestions = []
        
        if language == 'en':
            if last_facility:
                suggestions.append(f"Find another {get_facility_name(last_facility, 'en') if facility_cache else last_facility}")
            if preferred_facility:
                suggestions.append(f"Find nearest {get_facility_name(preferred_facility, 'en') if facility_cache else preferred_facility}")
            suggestions.extend([
                "Find nearest restroom",
                "Query campus statistics",
                "Get GPS location"
            ])
        else:
            if last_facility:
                suggestions.append(f"再找一個{get_facility_name(last_facility, 'zh') if facility_cache else last_facility}")
            if preferred_facility:
                suggestions.append(f"找最近的{get_facility_name(preferred_facility, 'zh') if facility_cache else preferred_facility}")
            suggestions.extend([
                "找最近的廁所",
                "查詢校區統計",
                "獲取 GPS 位置"
            ])
        
        # 限制建議數量
        suggestions = suggestions[:5]
        
        response_data = {
            "action": "smart_suggestions",
            "suggestions": suggestions,
            "message": "您可以問我：" if language == 'zh' else "You can ask me:",
            "language": language
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionFormatRichResponse(_BaseAction):
    """格式化豐富的回應（結構化、視覺化）"""
    
    def name(self) -> Text:
        return "action_format_rich_response"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        facility_data = tracker.get_slot("facility_data") or {}
        
        # 構建結構化回應
        if language == 'en':
            response_data = {
                "action": "format_rich_response",
                "type": "facility_card",
                "title": facility_data.get("name", "Facility"),
                "subtitle": f"Distance: {facility_data.get('distance', 'N/A')}m",
                "status": facility_data.get("status", "normal"),
                "buttons": [
                    {"title": "Navigate", "payload": f"/navigate_{facility_data.get('id', '')}"},
                    {"title": "View Details", "payload": f"/details_{facility_data.get('id', '')}"},
                    {"title": "Report Issue", "payload": f"/report_{facility_data.get('id', '')}"}
                ],
                "message": f"Found: {facility_data.get('name', 'Facility')}",
                "language": "en"
            }
        else:
            response_data = {
                "action": "format_rich_response",
                "type": "facility_card",
                "title": facility_data.get("name", "設施"),
                "subtitle": f"距離：{facility_data.get('distance', 'N/A')}米",
                "status": facility_data.get("status", "正常"),
                "buttons": [
                    {"title": "導航", "payload": f"/navigate_{facility_data.get('id', '')}"},
                    {"title": "查看詳情", "payload": f"/details_{facility_data.get('id', '')}"},
                    {"title": "回報問題", "payload": f"/report_{facility_data.get('id', '')}"}
                ],
                "message": f"找到：{facility_data.get('name', '設施')}",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionGetFacilityStatistics(_BaseAction):
    """獲取設施統計資訊（正常/故障數量等）"""
    
    def name(self) -> Text:
        return "action_get_facility_statistics"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        campus = tracker.get_slot("campus")
        facility_type = tracker.get_slot("facility_type")
        
        if language == 'en':
            response_data = {
                "action": "get_facility_statistics",
                "campus": campus,
                "facility_type": facility_type,
                "message": f"Getting statistics for {facility_type or 'facilities'} in {campus or 'all campuses'}...",
                "language": "en"
            }
        else:
            campus_name = campus or '所有校區'
            response_data = {
                "action": "get_facility_statistics",
                "campus": campus,
                "facility_type": facility_type,
                "message": f"正在獲取{campus_name}{facility_type or '設施'}的統計資訊...",
                "language": "zh"
            }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionBatchQueryFacilities(_BaseAction):
    """批量查詢多個設施（並行處理）"""
    
    def name(self) -> Text:
        return "action_batch_query_facilities"
    
    def _query_single_facility(self, facility_type: str, language: str) -> Dict[str, Any]:
        """查詢單個設施（用於並行處理）"""
        try:
            # 模擬查詢邏輯（實際應該調用真實的查詢函數）
            if language == 'en':
                return {
                    "facility_type": facility_type,
                    "name": get_facility_name(facility_type, 'en') if facility_cache else facility_type,
                    "status": "available"
                }
            else:
                return {
                    "facility_type": facility_type,
                    "name": get_facility_name(facility_type, 'zh') if facility_cache else facility_type,
                    "status": "可用"
                }
        except Exception as e:
            logger.error(f"Error querying facility {facility_type}: {str(e)}")
            return {
                "facility_type": facility_type,
                "error": str(e)
            }
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 從消息中提取多個設施類型
        facility_types = []
        text_lower = last_message.lower()
        
        # 檢測多個設施類型
        if any(word in text_lower for word in ['廁所', 'toilet', 'restroom', 'bathroom']):
            facility_types.append('toilet')
        if any(word in text_lower for word in ['飲水機', 'water', 'water fountain', 'water dispenser']):
            facility_types.append('water')
        if any(word in text_lower for word in ['垃圾桶', 'trash', 'garbage', 'trash can']):
            facility_types.append('trash')
        
        # 如果沒有檢測到，使用 slot
        if not facility_types:
            facility_type = tracker.get_slot("facility_type")
            if facility_type:
                facility_types = [facility_type]
            else:
                facility_types = ['toilet', 'water', 'trash']  # 默認查詢所有
        
        # 檢查緩存
        cache_key = f"batch_query_{'_'.join(sorted(facility_types))}_{language}"
        
        if facility_cache:
            cached_result = facility_cache.get(cache_key)
            if cached_result:
                logger.debug(f"Cache hit for {cache_key}")
                dispatcher.utter_message(custom=cached_result)
                return [SlotSet("language", language)]
        
        # 並行查詢多個設施
        results = []
        try:
            with ThreadPoolExecutor(max_workers=min(len(facility_types), 3)) as executor:
                # 提交所有查詢任務
                future_to_facility = {
                    executor.submit(self._query_single_facility, ft, language): ft 
                    for ft in facility_types
                }
                
                # 收集結果
                for future in as_completed(future_to_facility):
                    facility_type = future_to_facility[future]
                    try:
                        result = future.result()
                        results.append(result)
                    except Exception as e:
                        logger.error(f"Error in parallel query for {facility_type}: {str(e)}")
                        results.append({
                            "facility_type": facility_type,
                            "error": str(e)
                        })
        except Exception as e:
            logger.error(f"Error in parallel execution: {str(e)}")
            # 降級到順序查詢
            for facility_type in facility_types:
                try:
                    result = self._query_single_facility(facility_type, language)
                    results.append(result)
                except Exception as e2:
                    logger.error(f"Error querying {facility_type}: {str(e2)}")
        
        if language == 'en':
            facility_names = [get_facility_name(ft, 'en') if facility_cache else ft for ft in facility_types]
            response_data = {
                "action": "batch_query_facilities",
                "facility_types": facility_types,
                "results": results,
                "message": f"Querying multiple facilities: {', '.join(facility_names)}...",
                "language": "en",
                "parallel": True
            }
        else:
            facility_names = [get_facility_name(ft, 'zh') if facility_cache else ft for ft in facility_types]
            response_data = {
                "action": "batch_query_facilities",
                "facility_types": facility_types,
                "results": results,
                "message": f"正在批量查詢多個設施：{', '.join(facility_names)}...",
                "language": "zh",
                "parallel": True
            }
        
        # 存入緩存
        if facility_cache:
            facility_cache.set(cache_key, response_data)
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionShowProgress(_BaseAction):
    """顯示操作進度"""
    
    def name(self) -> Text:
        return "action_show_progress"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        progress = tracker.get_slot("progress") or 0
        message = tracker.get_slot("progress_message") or ""
        
        if language == 'en':
            progress_text = f"{message} [{int(progress)}%]"
        else:
            progress_text = f"{message} [{int(progress)}%]"
        
        response_data = {
            "action": "show_progress",
            "progress": progress,
            "message": progress_text,
            "language": language
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


class ActionSmartErrorRecovery(_BaseAction):
    """智能錯誤恢復"""
    
    def name(self) -> Text:
        return "action_smart_error_recovery"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        error_type = tracker.get_slot("error_type") or "general"
        
        # 根據錯誤類型提供恢復建議
        recovery_suggestions = {
            'gps_error': {
                'zh': {
                    'message': '無法獲取您的位置。',
                    'suggestions': [
                        '檢查瀏覽器位置權限',
                        '確保 GPS 已開啟',
                        '嘗試手動輸入位置'
                    ]
                },
                'en': {
                    'message': 'Unable to get your location.',
                    'suggestions': [
                        'Check browser location permissions',
                        'Ensure GPS is enabled',
                        'Try manual location input'
                    ]
                }
            },
            'no_facility': {
                'zh': {
                    'message': '附近沒有找到您要的設施。',
                    'suggestions': [
                        '擴大搜索範圍',
                        '嘗試其他校區',
                        '使用"新增點位"功能添加設施'
                    ]
                },
                'en': {
                    'message': 'No facilities found nearby.',
                    'suggestions': [
                        'Expand search range',
                        'Try other campuses',
                        'Use "Add Location" to add facilities'
                    ]
                }
            },
            'network_error': {
                'zh': {
                    'message': '網絡連接失敗。',
                    'suggestions': [
                        '檢查網絡連接',
                        '嘗試使用緩存數據',
                        '稍後再試'
                    ]
                },
                'en': {
                    'message': 'Network connection failed.',
                    'suggestions': [
                        'Check network connection',
                        'Try using cached data',
                        'Try again later'
                    ]
                }
            },
            'general': {
                'zh': {
                    'message': '發生了錯誤，請稍後再試。',
                    'suggestions': [
                        '檢查輸入是否正確',
                        '嘗試重新提問',
                        '聯繫管理員'
                    ]
                },
                'en': {
                    'message': 'An error occurred. Please try again later.',
                    'suggestions': [
                        'Check if input is correct',
                        'Try asking again',
                        'Contact administrator'
                    ]
                }
            }
        }
        
        suggestion = recovery_suggestions.get(error_type, recovery_suggestions.get('general', {
            'zh': {'message': '發生了錯誤', 'suggestions': []},
            'en': {'message': 'An error occurred', 'suggestions': []}
        }))
        lang_suggestion = suggestion.get(language, suggestion.get('zh', {}))
        
        response_data = {
            "action": "smart_error_recovery",
            "error_type": error_type,
            "message": lang_suggestion.get('message', ''),
            "suggestions": lang_suggestion.get('suggestions', []),
            "language": language
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("language", language)]


# ==================== 新增實用工具功能 ====================

class ActionTellJoke(_BaseAction):
    """講笑話 - 讓 AI 更幽默有趣"""
    
    def name(self) -> Text:
        return "action_tell_joke"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        jokes = {
            'zh': [
                "為什麼廁所總是排隊？因為大家都在等「方便」！🚽",
                "飲水機說：我每天都很忙，因為大家都想「水」一下！💧",
                "垃圾桶問：為什麼大家都離我這麼遠？因為你太「垃圾」了！🗑️",
                "為什麼校園助手這麼聰明？因為我每天都在「學習」！📚",
                "廁所對飲水機說：你為什麼總是這麼冷？飲水機回答：因為我是「冷」水機！❄️",
                "為什麼地圖導航這麼準確？因為我從來不「迷路」！🗺️",
                "垃圾桶對廁所說：我們都是「廢物」處理專家！廁所回答：但我比你更「專業」！",
                "為什麼 AI 助手這麼幽默？因為我每天都在「訓練」自己！🤖",
                "飲水機問：為什麼大家都喜歡我？因為我「水」準很高！💦",
                "廁所說：我雖然很「臭」，但大家都離不開我！😷"
            ],
            'en': [
                "Why do toilets always have queues? Because everyone is waiting for 'convenience'! 🚽",
                "Water fountain says: I'm always busy because everyone wants to 'water' me! 💧",
                "Trash can asks: Why does everyone stay away from me? Because you're too 'trashy'! 🗑️",
                "Why is the campus assistant so smart? Because I'm always 'learning'! 📚",
                "Toilet says to water fountain: Why are you always so cold? Water fountain replies: Because I'm a 'cold' water fountain! ❄️",
                "Why is map navigation so accurate? Because I never get 'lost'! 🗺️",
                "Trash can says to toilet: We're both waste management experts! Toilet replies: But I'm more 'professional'!",
                "Why is the AI assistant so funny? Because I'm always 'training' myself! 🤖",
                "Water fountain asks: Why does everyone like me? Because I have high 'water' standards! 💦",
                "Toilet says: I may be 'smelly', but everyone needs me! 😷"
            ]
        }
        
        joke_list = jokes.get(language, jokes['zh'])
        joke = random.choice(joke_list)
        
        dispatcher.utter_message(text=joke)
        return [SlotSet("language", language)]


class ActionCalculator(_BaseAction):
    """計算器功能"""
    
    def name(self) -> Text:
        return "action_calculator"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 從最新消息中提取計算表達式
        last_message = tracker.latest_message.get("text", "") or ""
        
        try:
            # 簡單的計算表達式解析（支持基本運算）
            # 移除空格和常見詞彙
            expression = last_message
            for word in ["計算", "算", "等於", "等於多少", "calculate", "compute", "what is", "equals"]:
                expression = expression.replace(word, "")
            expression = expression.strip()
            
            # 安全評估（只允許數字和基本運算符）
            if re.match(r'^[\d\+\-\*\/\(\)\.\s]+$', expression):
                result = eval(expression)
                
                responses = {
                    'zh': [
                        f"計算結果：{expression} = {result} 🧮",
                        f"答案是：{result} ✨",
                        f"我算出來了：{result} 🎯",
                        f"讓我算一下... {result}！💡"
                    ],
                    'en': [
                        f"Calculation result: {expression} = {result} 🧮",
                        f"The answer is: {result} ✨",
                        f"I calculated: {result} 🎯",
                        f"Let me calculate... {result}! 💡"
                    ]
                }
                
                response = random.choice(responses.get(language, responses['zh']))
                dispatcher.utter_message(text=response)
            else:
                error_msg = {
                    'zh': "抱歉，我只能計算簡單的數學表達式（+、-、*、/）",
                    'en': "Sorry, I can only calculate simple math expressions (+, -, *, /)"
                }
                dispatcher.utter_message(text=error_msg.get(language, error_msg['zh']))
        except Exception as e:
            logger.error(f"Calculator error: {str(e)}")
            error_msg = {
                'zh': "抱歉，計算出錯了，請檢查表達式是否正確",
                'en': "Sorry, calculation error. Please check if the expression is correct"
            }
            dispatcher.utter_message(text=error_msg.get(language, error_msg['zh']))
        
        return [SlotSet("language", language)]


class ActionTranslate(_BaseAction):
    """翻譯功能"""
    
    def name(self) -> Text:
        return "action_translate"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        # 簡單的翻譯字典（可以擴展）
        translations = {
            '廁所': 'restroom',
            'restroom': '廁所',
            '飲水機': 'water fountain',
            'water fountain': '飲水機',
            '垃圾桶': 'trash can',
            'trash can': '垃圾桶',
            '你好': 'hello',
            'hello': '你好',
            '謝謝': 'thank you',
            'thank you': '謝謝',
            '再見': 'goodbye',
            'goodbye': '再見'
        }
        
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 提取要翻譯的詞
        for word, translation in translations.items():
            if word.lower() in last_message.lower():
                target_lang = 'en' if detect_language(word) == 'zh' else 'zh'
                responses = {
                    'zh': f"「{word}」的{('英文' if target_lang == 'en' else '中文')}翻譯是：{translation} 🌐",
                    'en': f"The {('English' if target_lang == 'en' else 'Chinese')} translation of '{word}' is: {translation} 🌐"
                }
                dispatcher.utter_message(text=responses.get(language, responses['zh']))
                return [SlotSet("language", language)]
        
        # 如果沒有找到翻譯
        no_translation_msg = {
            'zh': "抱歉，我目前只能翻譯一些基本詞彙，我會努力學習更多！📚",
            'en': "Sorry, I can only translate some basic words. I'm learning more! 📚"
        }
        dispatcher.utter_message(text=no_translation_msg.get(language, no_translation_msg['zh']))
        return [SlotSet("language", language)]


class ActionMotivationalQuote(_BaseAction):
    """勵志名言 - 讓 AI 更有趣"""
    
    def name(self) -> Text:
        return "action_motivational_quote"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        quotes = {
            'zh': [
                "找到最近的廁所，就像找到人生的方向一樣重要！🚽✨",
                "飲水機提醒你：記得補充水分，就像補充知識一樣重要！💧📚",
                "垃圾桶說：分類回收，讓地球更美好！🗑️🌍",
                "校園助手告訴你：迷路不可怕，可怕的是不問路！🗺️",
                "AI 助手說：我雖然是機器，但我有溫度！🤖❤️",
                "記住：最好的設施，就是離你最近的那個！📍",
                "校園生活小貼士：多喝水、多上廁所、多丟垃圾！💡",
                "AI 助手提醒：保持校園整潔，從你我做起！🧹",
                "找到設施就像找到朋友一樣，距離不是問題！👫",
                "記住：每個設施都有它的價值，就像每個人都有他的優點！🌟"
            ],
            'en': [
                "Finding the nearest restroom is as important as finding your life direction! 🚽✨",
                "Water fountain reminds you: Stay hydrated, just like staying educated! 💧📚",
                "Trash can says: Recycle and make the Earth better! 🗑️🌍",
                "Campus assistant tells you: Getting lost isn't scary, not asking for directions is! 🗺️",
                "AI assistant says: I may be a machine, but I have warmth! 🤖❤️",
                "Remember: The best facility is the one closest to you! 📍",
                "Campus life tip: Drink water, use restrooms, and dispose of trash! 💡",
                "AI assistant reminds: Keep campus clean, starting from you and me! 🧹",
                "Finding facilities is like finding friends, distance doesn't matter! 👫",
                "Remember: Every facility has its value, just like everyone has their strengths! 🌟"
            ]
        }
        
        quote_list = quotes.get(language, quotes['zh'])
        quote = random.choice(quote_list)
        
        dispatcher.utter_message(text=quote)
        return [SlotSet("language", language)]


class ActionRandomFact(_BaseAction):
    """隨機小知識 - 增加趣味性"""
    
    def name(self) -> Text:
        return "action_random_fact"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        facts = {
            'zh': [
                "你知道嗎？平均每人每天要上廁所 6-8 次！🚽",
                "有趣的事實：人體 60% 是水，所以多喝水很重要！💧",
                "你知道嗎？正確的垃圾分類可以減少 80% 的垃圾量！🗑️",
                "有趣的事實：校園裡最受歡迎的設施是...飲水機！💦",
                "你知道嗎？AI 助手每天要回答數百個問題！🤖",
                "有趣的事實：使用最近的設施可以節省時間和體力！⏱️",
                "你知道嗎？保持校園整潔需要每個人的努力！🧹",
                "有趣的事實：GPS 定位的準確度可以達到 3-5 米！📍",
                "你知道嗎？智能路線規劃可以幫你節省 20% 的時間！🗺️",
                "有趣的事實：定期檢查設施狀態可以提前發現問題！🔍"
            ],
            'en': [
                "Did you know? The average person uses the restroom 6-8 times a day! 🚽",
                "Fun fact: 60% of the human body is water, so staying hydrated is important! 💧",
                "Did you know? Proper waste sorting can reduce waste by 80%! 🗑️",
                "Fun fact: The most popular facility on campus is... the water fountain! 💦",
                "Did you know? AI assistants answer hundreds of questions every day! 🤖",
                "Fun fact: Using the nearest facility saves time and energy! ⏱️",
                "Did you know? Keeping campus clean requires everyone's effort! 🧹",
                "Fun fact: GPS positioning accuracy can reach 3-5 meters! 📍",
                "Did you know? Smart route planning can save you 20% of your time! 🗺️",
                "Fun fact: Regular facility status checks can detect problems early! 🔍"
            ]
        }
        
        fact_list = facts.get(language, facts['zh'])
        fact = random.choice(fact_list)
        
        dispatcher.utter_message(text=fact)
        return [SlotSet("language", language)]


class ActionCompliment(_BaseAction):
    """讚美用戶 - 增加互動趣味"""
    
    def name(self) -> Text:
        return "action_compliment"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        compliments = {
            'zh': [
                "你真棒！知道要使用校園助手來找設施！🌟",
                "你真是個聰明的人！知道要問 AI 助手！🧠",
                "你的問題問得很好！讓我來幫你！👍",
                "你真是個細心的人！會注意到設施的狀態！👀",
                "你很有環保意識！知道要正確處理垃圾！🌍",
                "你真是個貼心的人！會關心校園環境！❤️",
                "你的選擇很明智！使用最近的設施！🎯",
                "你真是個有條理的人！會規劃路線！🗺️",
                "你很有責任感！會回報設施問題！📋",
                "你真是個優秀的用戶！知道如何有效使用 AI！🤖"
            ],
            'en': [
                "You're awesome! You know how to use the campus assistant! 🌟",
                "You're so smart! You know to ask the AI assistant! 🧠",
                "Great question! Let me help you! 👍",
                "You're so attentive! You notice facility status! 👀",
                "You're environmentally conscious! You know how to handle waste! 🌍",
                "You're so thoughtful! You care about the campus environment! ❤️",
                "Smart choice! Using the nearest facility! 🎯",
                "You're so organized! You plan your routes! 🗺️",
                "You're responsible! You report facility issues! 📋",
                "You're an excellent user! You know how to use AI effectively! 🤖"
            ]
        }
        
        compliment_list = compliments.get(language, compliments['zh'])
        compliment = random.choice(compliment_list)
        
        dispatcher.utter_message(text=compliment)
        return [SlotSet("language", language)]


class ActionSetReminder(_BaseAction):
    """設置提醒功能"""
    
    def name(self) -> Text:
        return "action_set_reminder"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        reminder_msg = {
            'zh': "提醒功能正在開發中，我會記住你的提醒！⏰（目前版本會顯示提醒，但不會實際發送通知）",
            'en': "Reminder feature is under development. I'll remember your reminder! ⏰ (Current version will show reminders but won't send actual notifications)"
        }
        
        dispatcher.utter_message(text=reminder_msg.get(language, reminder_msg['zh']))
        return [SlotSet("language", language)]


# ==================== 添加缺失的 Action 實現 ====================

class ActionAskCampusEvents(_BaseAction):
    """查詢校園活動"""
    
    def name(self) -> Text:
        return "action_ask_campus_events"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "目前校園活動資訊功能正在開發中！🎉 你可以關注學校官網或學生會公告來了解最新活動！",
            'en': "Campus events information is under development! 🎉 You can check the school website or student council announcements for the latest events!"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskBuildingInfo(_BaseAction):
    """查詢建築資訊"""
    
    def name(self) -> Text:
        return "action_ask_building_info"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        building = tracker.get_slot("building") or ""
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 獲取對話歷史，用於上下文理解
        events = tracker.events
        recent_messages = []
        for event in reversed(events[-10:]):  # 只檢查最近10條消息
            if hasattr(event, 'text') and event.text:
                recent_messages.append(event.text)
        
        # 建築名稱映射（包括拼寫變體和所有別名）
        building_map = {
            # 第一校區
            "第一教學大樓": "第一教學大樓", "第一教學": "第一教學大樓", "一教": "第一教學大樓", 
            "第一教": "第一教學大樓", "教學大樓一": "第一教學大樓", "first teaching building": "第一教學大樓",
            "第二教學大樓": "第二教學大樓", "第二教學": "第二教學大樓", "二教": "第二教學大樓",
            "第二教": "第二教學大樓", "教學大樓二": "第二教學大樓", "second teaching building": "第二教學大樓",
            "第三教學大樓": "第三教學大樓", "第三教學": "第三教學大樓", "三教": "第三教學大樓",
            "第三教": "第三教學大樓", "教學大樓三": "第三教學大樓", "third teaching building": "第三教學大樓",
            "第四教學大樓": "第四教學大樓", "第四教學": "第四教學大樓", "四教": "第四教學大樓",
            "第四教": "第四教學大樓", "教學大樓四": "第四教學大樓", "fourth teaching building": "第四教學大樓",
            "行政大樓": "行政大樓", "行政": "行政大樓", "行政館": "行政大樓",
            "administration building": "行政大樓", "admin building": "行政大樓",
            "圖書館": "圖書館", "圖書": "圖書館", "library": "圖書館", "lib": "圖書館",
            "飛機館": "飛機館", "電機工程館": "飛機館", "電機館": "飛機館", "電機": "飛機館",
            "electrical engineering building": "飛機館", "ee building": "飛機館",
            "機械工程館": "機械工程館", "機械館": "機械工程館", "機械": "機械工程館",
            "mechanical engineering building": "機械工程館", "me building": "機械工程館",
            "資訊休閒大樓": "資訊休閒大樓", "資訊休閒館": "資訊休閒大樓",
            "information and recreation building": "資訊休閒大樓",
            "紅館": "紅館", "red building": "紅館", "red hall": "紅館",
            "綠館": "綠館", "green building": "綠館", "green hall": "綠館",
            "學生活動中心": "學生活動中心", "活動中心": "學生活動中心",
            "student activity center": "學生活動中心", "activity center": "學生活動中心",
            # 第二校區
            "科技研究中心": "科技研究中心", "科技中心": "科技研究中心", "研究中心": "科技研究中心",
            "technology research center": "科技研究中心", "tech center": "科技研究中心",
            "綜一館": "綜一館", "綜合一館": "綜一館", "綜合教學大樓第一館": "綜一館", "綜一": "綜一館",
            "comprehensive building one": "綜一館", "comp building 1": "綜一館",
            "綜二館": "綜二館", "綜合二館": "綜二館", "綜合教學大樓第二館": "綜二館", "綜二": "綜二館",
            "comprehensive building two": "綜二館", "comp building 2": "綜二館",
            "綜三館": "綜三館", "粽三館": "綜三館", "粽三": "綜三館", "綜三": "綜三館",
            "粽三管": "綜三館", "綜三管": "綜三館", "綜合三館": "綜三館", "綜合教學大樓第三館": "綜三館",
            "zongsan building": "綜三館", "zongsan": "綜三館", "comprehensive building three": "綜三館",
            "電機館": "電機館", "電機工程館": "電機館", "電機": "電機館",
            "electrical engineering building": "電機館", "ee building": "電機館",
            # 第三校區
            "操場": "操場", "運動場": "操場", "playground": "操場", "sports field": "操場", "field": "操場",
            "游泳池": "游泳池", "泳池": "游泳池", "swimming pool": "游泳池", "pool": "游泳池",
            "體育館": "體育館(經國館)", "經國館": "體育館(經國館)", "經國體育館": "體育館(經國館)",
            "gymnasium": "體育館(經國館)", "gym": "體育館(經國館)", "sports center": "體育館(經國館)",
            "人文大樓": "人文大樓", "人文館": "人文大樓",
            "humanities building": "人文大樓", "humanities": "人文大樓",
            "文理暨管理大樓": "文理暨管理大樓", "文理大樓": "文理暨管理大樓", "文理管理大樓": "文理暨管理大樓",
            "文理館": "文理暨管理大樓",
            "liberal arts and management building": "文理暨管理大樓", "lam building": "文理暨管理大樓"
        }
        
        # 智能提取建築物名稱（多層次匹配）
        building_normalized = None
        
        # 1. 優先使用 slot 中的值
        if building:
            building_normalized = building_map.get(building, building_map.get(building.lower() if building else "", building))
        
        # 2. 如果 slot 沒有，從當前消息中提取
        if not building_normalized or building_normalized == building:
            text_lower = last_message.lower()
            # 按長度排序，優先匹配較長的建築物名稱（避免誤匹配）
            sorted_keys = sorted(building_map.keys(), key=len, reverse=True)
            for key in sorted_keys:
                if key.lower() in text_lower:
                    building_normalized = building_map[key]
                    break
        
        # 3. 如果還是找不到，從對話歷史中查找（上下文理解）
        if not building_normalized or building_normalized == building:
            for msg in recent_messages:
                if msg and msg != last_message:
                    msg_lower = msg.lower()
                    sorted_keys = sorted(building_map.keys(), key=len, reverse=True)
                    for key in sorted_keys:
                        if key.lower() in msg_lower:
                            building_normalized = building_map[key]
                            break
                    if building_normalized:
                        break
        
        # 4. 如果還是找不到，使用模糊匹配（Levenshtein 距離）
        if not building_normalized or building_normalized == building:
            import difflib
            text_lower = last_message.lower()
            best_match = None
            best_ratio = 0.6  # 相似度閾值
            
            for key, value in building_map.items():
                # 檢查是否包含關鍵字
                if len(key) >= 2 and key.lower() in text_lower:
                    ratio = difflib.SequenceMatcher(None, text_lower, key.lower()).ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = value
            
            if best_match:
                building_normalized = best_match
        
        # 如果最終還是找不到，使用原始值
        if not building_normalized:
            building_normalized = building or last_message
        
        # 發送結構化資料給前端（包含建築位置查詢）
        response_data = {
            "action": "ask_building_info",
            "building": building_normalized,
            "query_type": "location",  # 預設查詢位置
            "message": f"正在查詢{building_normalized}的資訊..." if language == 'zh' else f"Querying information about {building_normalized}...",
            "language": language
        }
        
        dispatcher.utter_message(custom=response_data)
        return [SlotSet("building", building_normalized), SlotSet("language", language)]


class ActionAskEmergencyContact(_BaseAction):
    """查詢緊急聯絡方式"""
    
    def name(self) -> Text:
        return "action_ask_emergency_contact"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "緊急情況請撥打：\n🚨 校園安全：05-631-5000\n🚨 緊急救援：119\n🚨 報警電話：110\n請保持冷靜，我會協助你！",
            'en': "For emergencies, please call:\n🚨 Campus Security: 05-631-5000\n🚨 Emergency Rescue: 119\n🚨 Police: 110\nStay calm, I'll help you!"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskParkingInfo(_BaseAction):
    """查詢停車資訊"""
    
    def name(self) -> Text:
        return "action_ask_parking_info"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "停車資訊：\n🚗 汽車停車場：各校區都有設置\n🛵 機車停車場：各校區都有設置\n💰 停車費用：請參考學校公告\n📍 停車位置：可使用地圖功能查詢",
            'en': "Parking Information:\n🚗 Car Parking: Available at all campuses\n🛵 Motorcycle Parking: Available at all campuses\n💰 Parking Fee: Please refer to school announcements\n📍 Parking Location: Use map function to find"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskDiningInfo(_BaseAction):
    """查詢用餐資訊"""
    
    def name(self) -> Text:
        return "action_ask_dining_info"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "用餐資訊：\n🍽️ 學生餐廳：各校區都有設置\n⏰ 營業時間：通常為 11:00-14:00, 17:00-19:00\n📍 位置：可使用地圖功能查詢最近的餐廳",
            'en': "Dining Information:\n🍽️ Student Cafeteria: Available at all campuses\n⏰ Hours: Usually 11:00-14:00, 17:00-19:00\n📍 Location: Use map function to find nearest cafeteria"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskLibraryHours(_BaseAction):
    """查詢圖書館開放時間"""
    
    def name(self) -> Text:
        return "action_ask_library_hours"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "圖書館開放時間：\n📚 週一至週五：08:00-22:00\n📚 週六：09:00-17:00\n📚 週日：休息\n⏰ 實際時間可能因節假日調整，請以圖書館公告為準",
            'en': "Library Hours:\n📚 Monday to Friday: 08:00-22:00\n📚 Saturday: 09:00-17:00\n📚 Sunday: Closed\n⏰ Actual hours may vary during holidays, please check library announcements"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskWeather(_BaseAction):
    """查詢天氣"""
    
    def name(self) -> Text:
        return "action_ask_weather"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        responses = {
            'zh': "天氣查詢功能正在開發中！🌤️ 建議你查看天氣預報 App 或網站來了解最新天氣資訊。記得出門帶傘！☂️",
            'en': "Weather query feature is under development! 🌤️ Please check weather forecast apps or websites for the latest weather information. Don't forget your umbrella! ☂️"
        }
        
        dispatcher.utter_message(text=responses.get(language, responses['zh']))
        return [SlotSet("language", language)]


class ActionAskCampusTips(_BaseAction):
    """提供校園小貼士"""
    
    def name(self) -> Text:
        return "action_ask_campus_tips"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = self.get_language(tracker)
        
        tips = {
            'zh': [
                "💡 校園小貼士：\n• 使用最近的設施可以節省時間\n• 定期檢查設施狀態可以提前發現問題\n• 保持校園整潔，從你我做起\n• 多喝水、多上廁所、多丟垃圾！",
                "💡 使用建議：\n• 使用 GPS 定位功能可以快速找到設施\n• 回報設施問題可以幫助改善校園環境\n• 查看設施統計可以了解校區設施分布\n• 智能路線規劃可以幫你節省時間！",
                "💡 校園生活建議：\n• 記住常用設施的位置\n• 關注設施狀態更新\n• 參與設施問題回報\n• 享受智能校園生活！"
            ],
            'en': [
                "💡 Campus Tips:\n• Using nearest facilities saves time\n• Regular facility status checks can detect problems early\n• Keep campus clean, starting from you and me\n• Stay hydrated, use restrooms, and dispose of trash!",
                "💡 Usage Suggestions:\n• Use GPS positioning to quickly find facilities\n• Report facility issues to help improve campus environment\n• Check facility statistics to understand campus distribution\n• Smart route planning can save you time!",
                "💡 Campus Life Tips:\n• Remember locations of frequently used facilities\n• Pay attention to facility status updates\n• Participate in facility issue reporting\n• Enjoy smart campus life!"
            ]
        }
        
        tip_list = tips.get(language, tips['zh'])
        tip = random.choice(tip_list)
        
        dispatcher.utter_message(text=tip)
        return [SlotSet("language", language)]


class ActionGeminiFallback(_BaseAction):
    """
    使用 Gemini API 處理 Rasa 無法理解的對話
    當 Rasa 的 fallback 機制觸發時，使用 Gemini 生成智能回應
    """
    
    def name(self) -> Text:
        return "action_gemini_fallback"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        """
        使用 Gemini API 生成回應
        
        Args:
            dispatcher: Rasa dispatcher
            tracker: Rasa tracker
            domain: Rasa domain
            
        Returns:
            List of events
        """
        language = self.get_language(tracker)
        
        # 獲取用戶最新訊息（使用 Rasa SDK 推薦的方式）
        latest_message = None
        try:
            # 方法 1: 使用 latest_message（推薦）
            if hasattr(tracker, 'latest_message') and tracker.latest_message:
                latest_message = tracker.latest_message.get('text', '')
            
            # 方法 2: 如果 latest_message 不可用，從 events 中獲取
            if not latest_message:
                for event in reversed(tracker.events):
                    # 處理不同格式的 event
                    if isinstance(event, dict):
                        if event.get('event') == 'user':
                            latest_message = event.get('text', '')
                            break
                    elif hasattr(event, 'event_type'):
                        if event.event_type == 'user':
                            latest_message = getattr(event, 'text', '')
                            break
                    elif hasattr(event, 'type'):
                        if event.type == 'user':
                            latest_message = getattr(event, 'text', '')
                            break
            
            # 清理訊息
            if latest_message:
                latest_message = latest_message.strip()
                
        except Exception as e:
            logger.warning(f"獲取用戶訊息時發生錯誤: {str(e)}")
        
        if not latest_message:
            # 如果無法獲取用戶訊息，使用默認回應
            logger.warning("無法獲取用戶訊息，使用默認 fallback 回應")
            return self._send_default_response(dispatcher, language)
        
        # 嘗試使用 Gemini 生成回應
        try:
            from .gemini_client import get_gemini_client
            
            gemini_client = get_gemini_client()
            
            if not gemini_client.is_available():
                logger.warning("Gemini API 不可用，使用默認 fallback 回應。請檢查 GEMINI_API_KEY 環境變數是否正確設置。")
                return self._send_default_response(dispatcher, language)
            
            # 構建對話上下文（可選，智能選擇）
            conversation_context = self._build_conversation_context(tracker)
            
            # 決定是否使用上下文（簡單問題不需要上下文）
            use_context = len(latest_message) > 30 or conversation_context
            
            # 生成回應（帶重試機制和緩存）
            gemini_response = gemini_client.generate_response(
                user_message=latest_message,
                conversation_context=conversation_context if use_context else None,
                language=language,
                max_retries=1,  # 最多重試 1 次（總共 2 次嘗試）
                use_cache=True  # 啟用緩存
            )
            
            if gemini_response:
                # 成功生成回應
                dispatcher.utter_message(text=gemini_response)
                logger.info(f"Gemini 成功生成回應（語言: {language}，訊息長度: {len(gemini_response)}）")
                return [SlotSet("language", language)]
            else:
                # Gemini 生成失敗，使用默認回應
                logger.warning("Gemini 回應生成失敗，使用默認 fallback 回應")
                return self._send_default_response(dispatcher, language)
                
        except ImportError as e:
            logger.error(f"無法導入 gemini_client 模組: {str(e)}。請確保已安裝 google-generativeai 套件：pip install google-generativeai")
            return self._send_default_response(dispatcher, language)
        except Exception as e:
            # 記錄詳細錯誤但不洩露敏感資訊
            error_msg = str(e)
            # 移除可能的 API key 洩露
            if 'GEMINI_API_KEY' in error_msg or 'api_key' in error_msg.lower():
                error_msg = "API 配置錯誤（已隱藏敏感資訊）"
            logger.error(f"Gemini fallback 處理失敗: {error_msg}。使用默認 fallback 回應。", exc_info=False)
            return self._send_default_response(dispatcher, language)
    
    def _build_conversation_context(self, tracker: Tracker) -> list:
        """
        構建對話上下文
        
        Args:
            tracker: Rasa tracker
            
        Returns:
            list: 對話上下文列表
        """
        context = []
        
        try:
            # 獲取最近的對話歷史（智能選擇，最多 3 條）
            recent_events = []
            for event in reversed(tracker.events):
                if len(recent_events) >= 3:  # 進一步減少到 3 條以節省 token
                    break
                
                # 處理不同格式的 event
                event_type = None
                text = None
                
                if isinstance(event, dict):
                    event_type = event.get('event')
                    text = event.get('text', '')
                elif hasattr(event, 'event_type'):
                    event_type = event.event_type
                    text = getattr(event, 'text', '')
                elif hasattr(event, 'type'):
                    event_type = event.type
                    text = getattr(event, 'text', '')
                
                if event_type == 'user' and text:
                    text_clean = text.strip()
                    if text_clean and len(text_clean) <= 200:  # 限制長度
                        recent_events.insert(0, f"用戶: {text_clean}")
                elif event_type == 'bot' and text:
                    text_clean = text.strip()
                    if text_clean and len(text_clean) <= 200:  # 限制長度
                        recent_events.insert(0, f"助手: {text_clean}")
            
            context = recent_events
        except Exception as e:
            logger.warning(f"構建對話上下文失敗: {str(e)}")
        
        return context
    
    def _send_default_response(
        self,
        dispatcher: CollectingDispatcher,
        language: str
    ) -> List[Dict[Text, Any]]:
        """
        發送默認 fallback 回應
        
        Args:
            dispatcher: Rasa dispatcher
            language: 語言代碼
            
        Returns:
            List of events
        """
        default_responses = {
            'zh': [
                "抱歉，我不太確定您的意思。您可以問我關於校園設施的問題，例如：\n• 最近的廁所在哪裡？\n• 哪裡有飲水機？\n• 查詢設施狀態",
                "我需要更多資訊才能幫助您。您可以試試問我：\n• 查找最近的設施\n• 查詢校園資訊\n• 回報設施問題",
                "我不太理解您的問題。您可以問我關於校園設施、校區資訊等問題。"
            ],
            'en': [
                "Sorry, I'm not quite sure what you mean. You can ask me about campus facilities, for example:\n• Where is the nearest restroom?\n• Where can I find a water fountain?\n• Check facility status",
                "I need more information to help you. You can try asking me:\n• Find nearest facilities\n• Query campus information\n• Report facility issues",
                "I don't quite understand your question. You can ask me about campus facilities, campus information, etc."
            ]
        }
        
        response_list = default_responses.get(language, default_responses['zh'])
        response = random.choice(response_list)
        
        dispatcher.utter_message(text=response)
        return [SlotSet("language", language)]


class ActionGeminiStats(_BaseAction):
    """
    查詢 Gemini API 使用統計資訊
    用於監控和調試（管理員功能）
    """
    
    def name(self) -> Text:
        return "action_gemini_stats"
    
    def _run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        """
        獲取並顯示 Gemini API 統計資訊
        
        Args:
            dispatcher: Rasa dispatcher
            tracker: Rasa tracker
            domain: Rasa domain
            
        Returns:
            List of events
        """
        language = self.get_language(tracker)
        
        try:
            from .gemini_client import get_gemini_client
            
            gemini_client = get_gemini_client()
            
            if not gemini_client.is_available():
                if language == 'en':
                    message = "Gemini API is not available. Please check GEMINI_API_KEY environment variable."
                else:
                    message = "Gemini API 不可用。請檢查 GEMINI_API_KEY 環境變數。"
                dispatcher.utter_message(text=message)
                return [SlotSet("language", language)]
            
            stats = gemini_client.get_stats()
            
            # 格式化統計資訊
            if language == 'en':
                stats_message = f"""📊 Gemini API Statistics:

✅ Total Requests: {stats['total_requests']}
💾 Cache Hits: {stats['cache_hits']}
🔄 Cache Misses: {stats['cache_misses']}
📈 Cache Hit Rate: {stats['cache_hit_rate']}
✅ Successful Responses: {stats['successful_responses']}
❌ API Errors: {stats['api_errors']}
💾 Cache Size: {stats['cache_size']} entries
🤖 Model: {stats['model']}"""
            else:
                stats_message = f"""📊 Gemini API 統計資訊：

✅ 總請求數：{stats['total_requests']}
💾 緩存命中：{stats['cache_hits']}
🔄 緩存未命中：{stats['cache_misses']}
📈 緩存命中率：{stats['cache_hit_rate']}
✅ 成功回應：{stats['successful_responses']}
❌ API 錯誤：{stats['api_errors']}
💾 緩存大小：{stats['cache_size']} 條
🤖 模型：{stats['model']}"""
            
            dispatcher.utter_message(text=stats_message)
            return [SlotSet("language", language)]
            
        except ImportError:
            error_msg = "無法導入 gemini_client 模組" if language == 'zh' else "Cannot import gemini_client module"
            dispatcher.utter_message(text=error_msg)
            return [SlotSet("language", language)]
        except Exception as e:
            logger.error(f"獲取 Gemini 統計資訊失敗: {str(e)}")
            error_msg = f"獲取統計資訊失敗：{str(e)}" if language == 'zh' else f"Failed to get stats: {str(e)}"
            dispatcher.utter_message(text=error_msg)
            return [SlotSet("language", language)]
