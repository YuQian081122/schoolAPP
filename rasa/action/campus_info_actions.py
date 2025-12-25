"""
校園資訊相關 Actions
包含：校園活動、建築資訊、緊急聯絡、停車資訊、餐廳資訊、圖書館開放時間、天氣、校園小貼士
"""

from typing import Any, Text, Dict, List, Optional
from rasa_sdk import Action, Tracker
from rasa_sdk.executor import CollectingDispatcher
from rasa_sdk.events import SlotSet
from datetime import datetime
import random
import logging

logger = logging.getLogger(__name__)

# 嘗試導入 _BaseAction（以下劃線開頭，避免被 Rasa SDK 註冊）
try:
    from .actions import _BaseAction as BaseAction
    BASE_ACTION_AVAILABLE = True
except ImportError:
    BASE_ACTION_AVAILABLE = False
    logger.warning("BaseAction not available, using Action directly")


def get_language_from_tracker(tracker: Tracker) -> str:
    """從 tracker 獲取語言"""
    if tracker is None:
        return 'zh'
    
    try:
        language = tracker.get_slot("language")
        if language:
            return language
        
        last_message = tracker.latest_message.get("text", "") or ""
        if not last_message:
            return 'zh'
        
        # 檢查是否包含中文字符
        import re
        chinese_pattern = re.compile(r'[\u4e00-\u9fff]')
        has_chinese = bool(chinese_pattern.search(last_message))
        
        return 'zh' if has_chinese else 'en'
    except Exception as e:
        logger.error(f"Error getting language: {str(e)}")
        return 'zh'


# 使用 BaseAction 如果可用，否則使用 Action
BaseActionClass = BaseAction if BASE_ACTION_AVAILABLE else Action


class ActionAskCampusEvents(BaseActionClass):
    """查詢校園活動"""
    
    def name(self) -> Text:
        return "action_ask_campus_events"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        try:
            language = get_language_from_tracker(tracker)
            
            # 模擬校園活動資料（專題展示用）
            events = [
                {"name": "校園導覽日", "date": "每月第一個週六", "location": "行政大樓"},
                {"name": "校園開放日", "date": "每學期初", "location": "各校區"},
                {"name": "設施體驗活動", "date": "不定期舉辦", "location": "各校區設施"}
            ] if language == 'zh' else [
                {"name": "Campus Tour Day", "date": "First Saturday of each month", "location": "Administration Building"},
                {"name": "Campus Open Day", "date": "Beginning of each semester", "location": "All Campuses"},
                {"name": "Facility Experience Event", "date": "Occasionally", "location": "Campus Facilities"}
            ]
            
            if language == 'en':
                response_text = "📅 **Campus Events:**\n\n"
                for event in events:
                    response_text += f"• **{event['name']}**\n  📍 Location: {event['location']}\n  📆 Date: {event['date']}\n\n"
                response_text += "💡 This is a demonstration project. For actual event information, please check the official campus website."
            else:
                response_text = "📅 **校園活動：**\n\n"
                for event in events:
                    response_text += f"• **{event['name']}**\n  📍 地點：{event['location']}\n  📆 時間：{event['date']}\n\n"
                response_text += "💡 這是專題展示系統。實際活動資訊請查閱校園官方網站。"
            
            dispatcher.utter_message(text=response_text)
            return [SlotSet("language", language)]
        except Exception as e:
            logger.error(f"Error in action_ask_campus_events: {str(e)}")
            error_msg = "抱歉，查詢校園活動時發生錯誤。" if get_language_from_tracker(tracker) == 'zh' else "Sorry, an error occurred while querying campus events."
            dispatcher.utter_message(text=error_msg)
            return []


class ActionAskBuildingInfo(Action):
    """查詢建築資訊"""
    
    def name(self) -> Text:
        return "action_ask_building_info"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        last_message = tracker.latest_message.get("text", "") or ""
        
        # 常見建築資訊
        buildings_info = {
            'zh': {
                '綜三館': '綜三館是校園內的主要建築之一，設有1-10樓，每層樓都有獨立的設施狀態管理。',
                '行政大樓': '行政大樓是校園的行政中心，提供各項行政服務。',
                '圖書館': '圖書館提供豐富的學習資源和安靜的學習環境。'
            },
            'en': {
                'Zongsan Building': 'Zongsan Building is one of the main buildings on campus, with floors 1-10, each with independent facility status management.',
                'Administration Building': 'The Administration Building is the administrative center of the campus, providing various administrative services.',
                'Library': 'The library provides rich learning resources and a quiet study environment.'
            }
        }
        
        info_dict = buildings_info[language]
        building_found = None
        
        for building_name in info_dict.keys():
            if building_name.lower() in last_message.lower():
                building_found = building_name
                break
        
        if building_found:
            response_text = f"🏢 **{building_found}**\n\n{info_dict[building_found]}"
        else:
            if language == 'en':
                response_text = "🏢 **Building Information**\n\nI can provide information about buildings on campus such as Zongsan Building, Administration Building, and Library. Which building would you like to know about?"
            else:
                response_text = "🏢 **建築資訊**\n\n我可以提供校園內建築的資訊，例如綜三館、行政大樓、圖書館等。您想了解哪個建築？"
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskEmergencyContact(Action):
    """查詢緊急聯絡資訊"""
    
    def name(self) -> Text:
        return "action_ask_emergency_contact"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        if language == 'en':
            response_text = """🚨 **Emergency Contacts:**\n\n
• **Campus Security:** 05-631-5000\n
• **Emergency Services:** 119 (Fire/Ambulance), 110 (Police)\n
• **Campus Health Center:** Please check official website\n
• **24/7 Emergency Hotline:** Available on campus\n\n
⚠️ **Important:** In case of emergency, call 119 or 110 immediately!\n\n
💡 This is a demonstration project. For actual emergency contacts, please refer to the official campus information."""
        else:
            response_text = """🚨 **緊急聯絡資訊：**\n\n
• **校園安全中心：** 05-631-5000\n
• **緊急服務：** 119（消防/救護）、110（警察）\n
• **校園健康中心：** 請查閱官方網站\n
• **24小時緊急熱線：** 校園內提供\n\n
⚠️ **重要提醒：** 如遇緊急情況，請立即撥打 119 或 110！\n\n
💡 這是專題展示系統。實際緊急聯絡資訊請查閱校園官方資料。"""
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskParkingInfo(Action):
    """查詢停車資訊"""
    
    def name(self) -> Text:
        return "action_ask_parking_info"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        if language == 'en':
            response_text = """🅿️ **Parking Information:**\n\n
• **Parking Lots:** Available in all three campuses\n
• **Parking Fees:** Free for students and staff (with valid ID)\n
• **Visitor Parking:** Limited spaces available\n
• **Disabled Parking:** Designated spaces near main entrances\n
• **Motorcycle Parking:** Designated areas in each campus\n\n
📍 **Parking Locations:**\n
- Campus 1: Near Administration Building\n
- Campus 2: Multiple locations\n
- Campus 3: Main parking area\n\n
💡 This is a demonstration project. For actual parking information, please check the official campus website."""
        else:
            response_text = """🅿️ **停車資訊：**\n\n
• **停車場：** 三個校區均有提供\n
• **停車費用：** 學生及教職員免費（需出示有效證件）\n
• **訪客停車：** 有限車位提供\n
• **無障礙停車：** 主要入口附近設有專用車位\n
• **機車停車：** 各校區設有專用區域\n\n
📍 **停車位置：**\n
- 第一校區：行政大樓附近\n
- 第二校區：多處停車場\n
- 第三校區：主要停車區\n\n
💡 這是專題展示系統。實際停車資訊請查閱校園官方網站。"""
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskDiningInfo(Action):
    """查詢餐廳資訊"""
    
    def name(self) -> Text:
        return "action_ask_dining_info"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        if language == 'en':
            response_text = """🍽️ **Dining Information:**\n\n
• **Student Cafeteria:** Available in all campuses\n
• **Operating Hours:** Monday-Friday 11:00-14:00, 17:00-19:00\n
• **Weekend Hours:** Limited service\n
• **Food Options:** Various cuisines available\n
• **Payment Methods:** Cash, student card, mobile payment\n\n
📍 **Dining Locations:**\n
- Campus 1: Main cafeteria\n
- Campus 2: Multiple dining options\n
- Campus 3: Student dining hall\n\n
💡 This is a demonstration project. For actual dining information and menus, please check the official campus website."""
        else:
            response_text = """🍽️ **餐廳資訊：**\n\n
• **學生餐廳：** 三個校區均有提供\n
• **營業時間：** 週一至週五 11:00-14:00, 17:00-19:00\n
• **週末營業：** 有限服務\n
• **餐點選擇：** 提供多樣化餐點\n
• **付款方式：** 現金、學生證、行動支付\n\n
📍 **餐廳位置：**\n
- 第一校區：主要餐廳\n
- 第二校區：多處用餐選擇\n
- 第三校區：學生餐廳\n\n
💡 這是專題展示系統。實際餐廳資訊及菜單請查閱校園官方網站。"""
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskLibraryHours(Action):
    """查詢圖書館開放時間"""
    
    def name(self) -> Text:
        return "action_ask_library_hours"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        if language == 'en':
            response_text = """📚 **Library Hours:**\n\n
• **Monday - Friday:** 8:00 AM - 10:00 PM\n
• **Saturday:** 9:00 AM - 6:00 PM\n
• **Sunday:** 10:00 AM - 6:00 PM\n
• **Holidays:** Closed (check announcements)\n
• **Exam Period:** Extended hours (check announcements)\n\n
📍 **Library Locations:**\n
- Main Library: Campus 1\n
- Branch Libraries: Campus 2, Campus 3\n\n
💡 This is a demonstration project. For actual library hours and services, please check the official library website."""
        else:
            response_text = """📚 **圖書館開放時間：**\n\n
• **週一至週五：** 08:00 - 22:00\n
• **週六：** 09:00 - 18:00\n
• **週日：** 10:00 - 18:00\n
• **國定假日：** 休館（請查閱公告）\n
• **考試期間：** 延長開放（請查閱公告）\n\n
📍 **圖書館位置：**\n
- 總圖書館：第一校區\n
- 分館：第二校區、第三校區\n\n
💡 這是專題展示系統。實際圖書館開放時間及服務請查閱圖書館官方網站。"""
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskWeather(Action):
    """查詢天氣資訊"""
    
    def name(self) -> Text:
        return "action_ask_weather"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        # 模擬天氣資訊（專題展示用）
        if language == 'en':
            response_text = """🌤️ **Weather Information:**\n\n
📍 **Location:** National Formosa University, Yunlin County\n
🌡️ **Current Weather:** Please check weather app for real-time information\n
📅 **Today's Forecast:** Sunny/Cloudy/Rainy (varies by season)\n\n
💡 **Tips:**\n
• Bring an umbrella during rainy season (May-September)\n
• Stay hydrated during hot summer days\n
• Wear appropriate clothing for the season\n\n
⚠️ **Note:** This is a demonstration project. For actual weather information, please check weather services or apps."""
        else:
            response_text = """🌤️ **天氣資訊：**\n\n
📍 **地點：** 國立虎尾科技大學，雲林縣\n
🌡️ **目前天氣：** 請查閱天氣應用程式獲取即時資訊\n
📅 **今日預報：** 晴天/多雲/雨天（依季節而異）\n\n
💡 **小貼士：**\n
• 雨季（5-9月）請攜帶雨具\n
• 炎熱夏日請注意補充水分\n
• 請依季節穿著適當衣物\n\n
⚠️ **注意：** 這是專題展示系統。實際天氣資訊請查閱天氣服務或應用程式。"""
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]


class ActionAskCampusTips(Action):
    """提供校園小貼士"""
    
    def name(self) -> Text:
        return "action_ask_campus_tips"
    
    def run(
        self,
        dispatcher: CollectingDispatcher,
        tracker: Tracker,
        domain: Dict[Text, Any],
    ) -> List[Dict[Text, Any]]:
        language = get_language_from_tracker(tracker)
        
        tips = [
            "使用 AI 助手快速找到最近的設施",
            "定期檢查設施狀態，選擇最佳設施使用",
            "回報設施問題有助於維護校園環境",
            "利用智能路線規劃功能節省時間",
            "三個校區都有豐富的設施資源"
        ] if language == 'zh' else [
            "Use AI assistant to quickly find nearest facilities",
            "Regularly check facility status to choose the best ones",
            "Reporting facility issues helps maintain campus environment",
            "Use smart route planning to save time",
            "All three campuses have rich facility resources"
        ]
        
        selected_tips = random.sample(tips, 3)
        
        if language == 'en':
            response_text = "💡 **Campus Tips:**\n\n"
            for i, tip in enumerate(selected_tips, 1):
                response_text += f"{i}. {tip}\n"
            response_text += "\n🌟 These tips will help you make the most of your campus experience!"
        else:
            response_text = "💡 **校園小貼士：**\n\n"
            for i, tip in enumerate(selected_tips, 1):
                response_text += f"{i}. {tip}\n"
            response_text += "\n🌟 這些小貼士能幫助您更好地享受校園生活！"
        
        dispatcher.utter_message(text=response_text)
        return [SlotSet("language", language)]

