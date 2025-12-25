"""
Gemini API 客戶端模組
封裝 Google Gemini API 調用，提供安全的 API key 管理和錯誤處理
優化版本：包含緩存、提示詞優化、響應質量提升等功能
"""

import os
import logging
import time
import hashlib
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from collections import OrderedDict
import google.generativeai as genai

logger = logging.getLogger(__name__)


class ResponseCache:
    """
    響應緩存類
    用於緩存常見問題的回應，減少 API 調用
    """
    
    def __init__(self, max_size: int = 100, ttl: int = 3600):
        """
        初始化緩存
        
        Args:
            max_size: 最大緩存條目數
            ttl: 緩存過期時間（秒）
        """
        self.cache: OrderedDict = OrderedDict()
        self.timestamps: Dict[str, datetime] = {}
        self.max_size = max_size
        self.ttl = ttl
    
    def _generate_key(self, message: str, language: str) -> str:
        """生成緩存鍵"""
        key_string = f"{language}:{message.strip().lower()}"
        return hashlib.md5(key_string.encode('utf-8')).hexdigest()
    
    def get(self, message: str, language: str) -> Optional[str]:
        """
        獲取緩存回應
        
        Args:
            message: 用戶訊息
            language: 語言代碼
            
        Returns:
            緩存回應，如果不存在或已過期則返回 None
        """
        key = self._generate_key(message, language)
        
        if key not in self.cache:
            return None
        
        # 檢查是否過期
        if key in self.timestamps:
            if datetime.now() - self.timestamps[key] > timedelta(seconds=self.ttl):
                del self.cache[key]
                del self.timestamps[key]
                return None
        
        # 更新訪問順序（LRU）
        response = self.cache.pop(key)
        self.cache[key] = response
        return response
    
    def set(self, message: str, language: str, response: str) -> None:
        """
        設置緩存回應
        
        Args:
            message: 用戶訊息
            language: 語言代碼
            response: API 回應
        """
        key = self._generate_key(message, language)
        
        # 如果緩存已滿，刪除最舊的條目
        if len(self.cache) >= self.max_size:
            oldest_key = next(iter(self.cache))
            del self.cache[oldest_key]
            if oldest_key in self.timestamps:
                del self.timestamps[oldest_key]
        
        self.cache[key] = response
        self.timestamps[key] = datetime.now()
    
    def clear(self) -> None:
        """清空緩存"""
        self.cache.clear()
        self.timestamps.clear()


class GeminiClient:
    """
    Gemini API 客戶端（優化版）
    負責與 Google Gemini API 通信，包含緩存、提示詞優化等功能
    """
    
    def __init__(self):
        """初始化 Gemini 客戶端"""
        self.api_key = os.getenv('GEMINI_API_KEY')
        self.model_name = os.getenv('GEMINI_MODEL', 'gemini-2.0-flash-exp')
        self.is_configured = False
        
        # 初始化緩存
        cache_size = int(os.getenv('GEMINI_CACHE_SIZE', '100'))
        cache_ttl = int(os.getenv('GEMINI_CACHE_TTL', '3600'))
        self.cache = ResponseCache(max_size=cache_size, ttl=cache_ttl)
        
        # 統計資訊
        self.stats = {
            'total_requests': 0,
            'cache_hits': 0,
            'cache_misses': 0,
            'api_errors': 0,
            'successful_responses': 0
        }
        
        if self.api_key:
            try:
                genai.configure(api_key=self.api_key)
                self.is_configured = True
                logger.info(f"Gemini API 客戶端初始化成功（模型: {self.model_name}）")
            except Exception as e:
                logger.error(f"Gemini API 配置失敗: {str(e)}")
                self.is_configured = False
        else:
            logger.warning("GEMINI_API_KEY 環境變數未設置，Gemini 功能將無法使用")
    
    def is_available(self) -> bool:
        """
        檢查 Gemini API 是否可用
        
        Returns:
            bool: 如果 API key 已設置且配置成功則返回 True
        """
        return self.is_configured and self.api_key is not None
    
    def generate_response(
        self,
        user_message: str,
        conversation_context: Optional[list] = None,
        language: str = 'zh',
        max_retries: int = 2,
        use_cache: bool = True
    ) -> Optional[str]:
        """
        生成回應（帶重試機制和緩存）
        
        Args:
            user_message: 用戶訊息
            conversation_context: 對話上下文（可選）
            language: 語言代碼 ('zh' 或 'en')
            max_retries: 最大重試次數（用於處理配額限制）
            use_cache: 是否使用緩存（默認 True）
            
        Returns:
            str: Gemini 生成的回應，如果失敗則返回 None
        """
        if not self.is_available():
            logger.warning("Gemini API 不可用，無法生成回應")
            return None
        
        # 驗證輸入
        if not user_message or not user_message.strip():
            logger.warning("用戶訊息為空，無法生成回應")
            return None
        
        # 清理和限制輸入長度
        user_message = user_message.strip()
        if len(user_message) > 500:  # 限制輸入長度
            user_message = user_message[:500]
            logger.warning("用戶訊息過長，已截斷至 500 字符")
        
        # 檢查緩存（僅對簡單問題使用緩存，不包含上下文）
        if use_cache and not conversation_context:
            cached_response = self.cache.get(user_message, language)
            if cached_response:
                self.stats['cache_hits'] += 1
                logger.debug(f"從緩存獲取回應（語言: {language}）")
                return cached_response
        
        self.stats['cache_misses'] += 1
        self.stats['total_requests'] += 1
        
        for attempt in range(max_retries + 1):
            try:
                # 構建系統提示詞
                system_prompt = self._build_system_prompt(language)
                
                # 構建完整提示詞
                full_prompt = self._build_prompt(
                    system_prompt,
                    user_message,
                    conversation_context,
                    language
                )
                
                # 獲取模型
                model = genai.GenerativeModel(self.model_name)
                
                # 根據語言和問題類型優化生成配置
                generation_config = self._get_optimized_generation_config(language, user_message)
                
                # 生成回應
                response = model.generate_content(
                    full_prompt,
                    generation_config=generation_config
                )
                
                if response and response.text:
                    response_text = response.text.strip()
                    
                    # 驗證和清理回應
                    response_text = self._validate_and_clean_response(response_text, language)
                    
                    if response_text:
                        # 保存到緩存（僅對簡單問題）
                        if use_cache and not conversation_context:
                            self.cache.set(user_message, language, response_text)
                        
                        self.stats['successful_responses'] += 1
                        logger.info(f"Gemini API 回應生成成功（長度: {len(response_text)} 字符）")
                        return response_text
                    else:
                        logger.warning("Gemini API 回應驗證失敗")
                        return None
                else:
                    logger.warning("Gemini API 返回空回應")
                    return None
                    
            except Exception as e:
                error_msg = str(e)
                
                # 處理配額限制（429 錯誤）
                if "429" in error_msg or "quota" in error_msg.lower() or "Quota exceeded" in error_msg:
                    self.stats['api_errors'] += 1
                    if attempt < max_retries:
                        # 嘗試從錯誤訊息中提取重試延遲時間
                        retry_delay = self._extract_retry_delay(error_msg)
                        logger.warning(
                            f"Gemini API 配額限制，等待 {retry_delay} 秒後重試 "
                            f"({attempt + 1}/{max_retries + 1})"
                        )
                        time.sleep(retry_delay)
                        continue
                    else:
                        logger.error("Gemini API 配額限制，已達最大重試次數")
                        return None
                
                # 處理認證錯誤（401/403）- 不重試
                if "401" in error_msg or "403" in error_msg or "API_KEY_INVALID" in error_msg:
                    logger.error("Gemini API 認證失敗，請檢查 API key 是否有效")
                    return None
                
                # 處理其他錯誤
                # 移除可能的 API key 洩露
                if self.api_key and self.api_key in error_msg:
                    error_msg = error_msg.replace(self.api_key, '[REDACTED]')
                
                logger.error(f"Gemini API 調用失敗: {error_msg}")
                
                # 對於非配額錯誤，不重試，直接返回
                # 配額錯誤已經在上面處理了（會 continue 重試）
                return None
        
        return None
    
    def _extract_retry_delay(self, error_msg: str) -> float:
        """
        從錯誤訊息中提取重試延遲時間
        
        Args:
            error_msg: 錯誤訊息
            
        Returns:
            float: 重試延遲時間（秒），默認 16 秒
        """
        try:
            # 嘗試從錯誤訊息中提取 retry_delay
            if "retry_delay" in error_msg.lower():
                import re
                # 查找類似 "seconds: 15" 的模式
                match = re.search(r'seconds[:\s]+(\d+(?:\.\d+)?)', error_msg)
                if match:
                    return float(match.group(1)) + 1.0  # 加 1 秒緩衝
        except Exception:
            pass
        
        # 默認延遲時間
        return 16.0
    
    def _build_system_prompt(self, language: str) -> str:
        """
        構建優化的系統提示詞（包含 few-shot examples）
        
        Args:
            language: 語言代碼
            
        Returns:
            str: 系統提示詞
        """
        if language == 'en':
            return """You are a helpful and friendly campus assistant chatbot for National Formosa University (NFU).

Your primary role is to help students and visitors:
- Find campus facilities (restrooms, water fountains, trash cans)
- Answer questions about campus information
- Provide navigation and directions
- Assist with general campus inquiries

Guidelines:
- Keep responses concise, friendly, and helpful (under 200 words)
- If asked about facilities, suggest using the map feature
- If you don't know specific information, politely redirect to relevant resources
- Maintain a warm, professional tone
- Use emojis sparingly and appropriately

Example good responses:
User: "Where is the nearest restroom?"
You: "I can help you find the nearest restroom! Please use the map feature on the right side, or tell me your current location and I'll guide you there. 🚻"

User: "What's the weather today?"
You: "I don't have real-time weather information, but I recommend checking a weather app or website for the latest forecast. Is there anything else about campus facilities I can help with? 🌤️"

Remember: Be helpful, concise, and always try to guide users to useful resources."""
        else:
            return """你是一個友善且專業的校園助手聊天機器人，服務於國立虎尾科技大學（NFU）。

你的主要職責是幫助學生和訪客：
- 查找校園設施（廁所、飲水機、垃圾桶）
- 回答校園相關問題
- 提供導航和路線指引
- 協助一般校園查詢

回應指南：
- 保持回應簡潔、友善且有用（200 字以內）
- 如果詢問設施，建議使用右側地圖功能
- 如果不知道具體資訊，禮貌地引導到相關資源
- 保持溫暖、專業的語調
- 適度使用表情符號

良好回應範例：
用戶：「最近的廁所在哪裡？」
你：「我可以幫你找最近的廁所！請使用右側的地圖功能，或告訴我你目前的位置，我會為你指引。🚻」

用戶：「今天天氣如何？」
你：「我沒有即時天氣資訊，建議你查看天氣預報 App 或網站。還有其他關於校園設施的問題我可以協助嗎？🌤️」

記住：要友善、簡潔，並始終引導用戶使用有用的資源。"""
    
    def _build_prompt(
        self,
        system_prompt: str,
        user_message: str,
        conversation_context: Optional[list],
        language: str
    ) -> str:
        """
        構建優化的完整提示詞（智能上下文管理）
        
        Args:
            system_prompt: 系統提示詞
            user_message: 用戶訊息
            conversation_context: 對話上下文
            language: 語言代碼
            
        Returns:
            str: 完整提示詞
        """
        prompt_parts = [system_prompt]
        
        # 智能添加對話上下文（優化版本）
        if conversation_context:
            # 過濾和壓縮上下文
            filtered_context = self._filter_and_compress_context(conversation_context, language)
            
            if filtered_context:
                if language == 'en':
                    prompt_parts.append("\n\nRecent conversation context:")
                else:
                    prompt_parts.append("\n\n最近的對話上下文：")
                
                for ctx in filtered_context:
                    prompt_parts.append(f"- {ctx}")
        
        # 添加用戶訊息（優化格式）
        if language == 'en':
            prompt_parts.append(f"\n\nUser question: {user_message}")
            prompt_parts.append("\n\nPlease provide a concise and helpful response:")
        else:
            prompt_parts.append(f"\n\n用戶問題：{user_message}")
            prompt_parts.append("\n\n請提供簡潔且有用的回應：")
        
        return "\n".join(prompt_parts)
    
    def _filter_and_compress_context(
        self,
        conversation_context: List[str],
        language: str
    ) -> List[str]:
        """
        過濾和壓縮對話上下文，只保留相關內容
        
        Args:
            conversation_context: 原始上下文列表
            language: 語言代碼
            
        Returns:
            List[str]: 過濾後的上下文列表
        """
        if not conversation_context:
            return []
        
        filtered = []
        max_context_items = 3  # 減少到 3 條以節省 token
        
        # 只取最近的幾條，並壓縮長度
        for ctx in conversation_context[-max_context_items:]:
            # 壓縮過長的上下文
            if len(ctx) > 150:
                ctx = ctx[:150] + "..."
            filtered.append(ctx)
        
        return filtered
    
    def _get_optimized_generation_config(self, language: str, user_message: str) -> Dict[str, Any]:
        """
        根據語言和問題類型優化生成配置
        
        Args:
            language: 語言代碼
            user_message: 用戶訊息
            
        Returns:
            Dict: 優化的生成配置
        """
        # 檢測問題類型
        is_simple_question = len(user_message) < 50
        is_complex_question = len(user_message) > 200 or '?' in user_message or '？' in user_message
        
        # 基礎配置
        config = {
            'temperature': 0.7,  # 平衡創造性和準確性
            'top_p': 0.8,  # 核採樣
            'top_k': 40,  # Top-K 採樣
            'max_output_tokens': 512,  # 減少 token 使用（從 1024 降到 512）
        }
        
        # 根據問題類型調整
        if is_simple_question:
            # 簡單問題：更確定性，更短回應
            config['temperature'] = 0.5
            config['max_output_tokens'] = 256
        elif is_complex_question:
            # 複雜問題：允許更多創造性，更長回應
            config['temperature'] = 0.8
            config['max_output_tokens'] = 512
        
        return config
    
    def _validate_and_clean_response(self, response: str, language: str) -> Optional[str]:
        """
        驗證和清理 API 回應
        
        Args:
            response: API 回應
            language: 語言代碼
            
        Returns:
            清理後的回應，如果無效則返回 None
        """
        if not response or not response.strip():
            return None
        
        # 清理回應
        response = response.strip()
        
        # 移除過長的回應（超過 1000 字符）
        if len(response) > 1000:
            logger.warning(f"回應過長（{len(response)} 字符），已截斷")
            response = response[:1000] + "..."
        
        # 移除可能的重複內容
        lines = response.split('\n')
        seen = set()
        cleaned_lines = []
        for line in lines:
            line_stripped = line.strip()
            if line_stripped and line_stripped not in seen:
                seen.add(line_stripped)
                cleaned_lines.append(line)
        
        response = '\n'.join(cleaned_lines)
        
        # 驗證回應包含實際內容（不只是標點符號）
        if len(response.replace(' ', '').replace('\n', '').replace('\t', '')) < 5:
            logger.warning("回應內容過少，可能無效")
            return None
        
        return response
    
    def get_stats(self) -> Dict[str, Any]:
        """
        獲取統計資訊
        
        Returns:
            Dict: 統計資訊
        """
        cache_hit_rate = 0.0
        if self.stats['total_requests'] > 0:
            cache_hit_rate = self.stats['cache_hits'] / (
                self.stats['cache_hits'] + self.stats['cache_misses']
            ) * 100
        
        return {
            **self.stats,
            'cache_hit_rate': f"{cache_hit_rate:.1f}%",
            'cache_size': len(self.cache.cache),
            'model': self.model_name
        }
    
    def clear_cache(self) -> None:
        """清空緩存"""
        self.cache.clear()
        logger.info("Gemini 響應緩存已清空")


# 全局客戶端實例
_gemini_client: Optional[GeminiClient] = None


def get_gemini_client() -> GeminiClient:
    """
    獲取 Gemini 客戶端實例（單例模式）
    
    Returns:
        GeminiClient: Gemini 客戶端實例
    """
    global _gemini_client
    if _gemini_client is None:
        _gemini_client = GeminiClient()
    return _gemini_client

