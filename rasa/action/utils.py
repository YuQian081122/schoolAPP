"""
Rasa Actions 工具函數
提供通用的工具函數和緩存機制
"""

from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class FacilityCache:
    """
    設施查詢緩存
    使用 TTL (Time To Live) 機制
    """
    
    def __init__(self, ttl: int = 300, max_size: int = 1000):
        """
        初始化緩存
        
        Args:
            ttl: 緩存過期時間（秒），默認 5 分鐘
            max_size: 最大緩存條目數，默認 1000
        """
        self.cache: Dict[str, tuple] = {}
        self.ttl = ttl
        self.max_size = max_size
        self.access_times: Dict[str, datetime] = {}
    
    def get(self, key: str) -> Optional[Any]:
        """
        獲取緩存值
        
        Args:
            key: 緩存鍵
            
        Returns:
            緩存值，如果不存在或已過期則返回 None
        """
        if key not in self.cache:
            return None
        
        data, timestamp = self.cache[key]
        
        # 檢查是否過期
        if datetime.now() - timestamp > timedelta(seconds=self.ttl):
            # 過期，刪除
            del self.cache[key]
            if key in self.access_times:
                del self.access_times[key]
            logger.debug(f"Cache expired for key: {key}")
            return None
        
        # 更新訪問時間
        self.access_times[key] = datetime.now()
        return data
    
    def set(self, key: str, value: Any) -> None:
        """
        設置緩存值
        
        Args:
            key: 緩存鍵
            value: 緩存值
        """
        # 如果緩存已滿，刪除最舊的條目
        if len(self.cache) >= self.max_size:
            self._evict_oldest()
        
        self.cache[key] = (value, datetime.now())
        self.access_times[key] = datetime.now()
        logger.debug(f"Cached value for key: {key}")
    
    def _evict_oldest(self) -> None:
        """刪除最舊的緩存條目"""
        if not self.access_times:
            return
        
        # 找到最舊的條目
        oldest_key = min(self.access_times.items(), key=lambda x: x[1])[0]
        
        if oldest_key in self.cache:
            del self.cache[oldest_key]
        if oldest_key in self.access_times:
            del self.access_times[oldest_key]
        
        logger.debug(f"Evicted oldest cache entry: {oldest_key}")
    
    def clear(self) -> None:
        """清空緩存"""
        self.cache.clear()
        self.access_times.clear()
        logger.info("Cache cleared")
    
    def size(self) -> int:
        """返回當前緩存大小"""
        return len(self.cache)


class RateLimiter:
    """
    速率限制器
    防止 API 濫用
    """
    
    def __init__(self, max_requests: int = 100, window: int = 60):
        """
        初始化速率限制器
        
        Args:
            max_requests: 時間窗口內最大請求數
            window: 時間窗口（秒）
        """
        self.requests: Dict[str, List[datetime]] = defaultdict(list)
        self.max_requests = max_requests
        self.window = window
    
    def is_allowed(self, user_id: str) -> bool:
        """
        檢查是否允許請求
        
        Args:
            user_id: 用戶標識
            
        Returns:
            True 如果允許，False 如果不允許
        """
        now = datetime.now()
        user_requests = self.requests[user_id]
        
        # 移除過期請求
        cutoff = now - timedelta(seconds=self.window)
        user_requests[:] = [req for req in user_requests if req > cutoff]
        
        # 檢查是否超過限制
        if len(user_requests) >= self.max_requests:
            logger.warning(f"Rate limit exceeded for user: {user_id}")
            return False
        
        # 記錄新請求
        user_requests.append(now)
        return True
    
    def get_remaining(self, user_id: str) -> int:
        """
        獲取剩餘請求數
        
        Args:
            user_id: 用戶標識
            
        Returns:
            剩餘請求數
        """
        now = datetime.now()
        user_requests = self.requests[user_id]
        
        # 移除過期請求
        cutoff = now - timedelta(seconds=self.window)
        user_requests[:] = [req for req in user_requests if req > cutoff]
        
        return max(0, self.max_requests - len(user_requests))
    
    def reset(self, user_id: Optional[str] = None) -> None:
        """
        重置速率限制器
        
        Args:
            user_id: 用戶標識，如果為 None 則重置所有用戶
        """
        if user_id:
            if user_id in self.requests:
                del self.requests[user_id]
        else:
            self.requests.clear()


# 全局緩存實例
facility_cache = FacilityCache()

# 全局速率限制器實例
rate_limiter = RateLimiter()


def validate_facility_type(facility_type: Optional[str]) -> bool:
    """
    驗證設施類型是否有效
    
    Args:
        facility_type: 設施類型
        
    Returns:
        True 如果有效，False 如果無效
    """
    from .config import VALIDATION_CONFIG
    return facility_type in VALIDATION_CONFIG['facility_types']


def validate_status(status: Optional[str]) -> bool:
    """
    驗證狀態是否有效
    
    Args:
        status: 狀態
        
    Returns:
        True 如果有效，False 如果無效
    """
    from .config import VALIDATION_CONFIG
    return status in VALIDATION_CONFIG['statuses']


def validate_campus(campus: Optional[str]) -> bool:
    """
    驗證校區是否有效
    
    Args:
        campus: 校區
        
    Returns:
        True 如果有效，False 如果無效
    """
    from .config import VALIDATION_CONFIG
    return campus in VALIDATION_CONFIG['campuses']


def get_facility_name(facility_type: str, language: str = 'zh') -> str:
    """
    獲取設施名稱
    
    Args:
        facility_type: 設施類型
        language: 語言
        
    Returns:
        設施名稱
    """
    from .config import FACILITY_TYPES
    
    if facility_type in FACILITY_TYPES:
        return FACILITY_TYPES[facility_type].get(language, facility_type)
    
    return facility_type


def get_status_name(status: str, language: str = 'zh') -> str:
    """
    獲取狀態名稱
    
    Args:
        status: 狀態
        language: 語言
        
    Returns:
        狀態名稱
    """
    from .config import FACILITY_STATUSES
    
    if status in FACILITY_STATUSES:
        return FACILITY_STATUSES[status].get(language, status)
    
    return status


def normalize_facility_type(text: str) -> Optional[str]:
    """
    從文本中標準化設施類型
    
    Args:
        text: 輸入文本
        
    Returns:
        標準化的設施類型，如果無法識別則返回 None
    """
    from .config import FACILITY_TYPES
    
    text_lower = text.lower()
    
    for facility_type, config in FACILITY_TYPES.items():
        # 檢查英文別名
        if any(alias.lower() in text_lower for alias in config['aliases_en']):
            return facility_type
        # 檢查中文別名
        if any(alias in text for alias in config['aliases_zh']):
            return facility_type
    
    return None


def normalize_status(text: str) -> Optional[str]:
    """
    從文本中標準化狀態
    
    Args:
        text: 輸入文本
        
    Returns:
        標準化的狀態，如果無法識別則返回 None
    """
    from .config import FACILITY_STATUSES
    
    text_lower = text.lower()
    
    for status, config in FACILITY_STATUSES.items():
        # 檢查英文別名
        if any(alias.lower() in text_lower for alias in config['aliases_en']):
            return status
        # 檢查中文別名
        if any(alias in text for alias in config['aliases_zh']):
            return status
    
    return None


class ConversationMemory:
    """
    會話記憶管理
    記住用戶的偏好和上下文
    """
    
    def __init__(self, ttl: int = 3600):
        """
        初始化會話記憶
        
        Args:
            ttl: 記憶過期時間（秒），默認 1 小時
        """
        self.memory: Dict[str, Dict[str, Any]] = {}
        self.timestamps: Dict[str, Dict[str, datetime]] = {}
        self.ttl = ttl
    
    def remember(self, user_id: str, key: str, value: Any) -> None:
        """
        記住用戶偏好或上下文
        
        Args:
            user_id: 用戶標識
            key: 記憶鍵
            value: 記憶值
        """
        if user_id not in self.memory:
            self.memory[user_id] = {}
            self.timestamps[user_id] = {}
        
        self.memory[user_id][key] = value
        self.timestamps[user_id][key] = datetime.now()
        logger.debug(f"Remembered {key} for user {user_id}: {value}")
    
    def recall(self, user_id: str, key: str, default: Any = None) -> Any:
        """
        回憶用戶偏好或上下文
        
        Args:
            user_id: 用戶標識
            key: 記憶鍵
            default: 默認值
            
        Returns:
            記憶值，如果不存在或已過期則返回默認值
        """
        if user_id not in self.memory:
            return default
        
        if key not in self.memory[user_id]:
            return default
        
        # 檢查是否過期
        timestamp = self.timestamps[user_id].get(key)
        if timestamp and datetime.now() - timestamp > timedelta(seconds=self.ttl):
            # 過期，刪除
            del self.memory[user_id][key]
            if key in self.timestamps[user_id]:
                del self.timestamps[user_id][key]
            logger.debug(f"Memory expired for {key} of user {user_id}")
            return default
        
        value = self.memory[user_id][key]
        logger.debug(f"Recalled {key} for user {user_id}: {value}")
        return value
    
    def forget(self, user_id: str, key: Optional[str] = None) -> None:
        """
        忘記用戶記憶
        
        Args:
            user_id: 用戶標識
            key: 記憶鍵，如果為 None 則清除所有記憶
        """
        if user_id not in self.memory:
            return
        
        if key:
            if key in self.memory[user_id]:
                del self.memory[user_id][key]
            if key in self.timestamps[user_id]:
                del self.timestamps[user_id][key]
            logger.debug(f"Forgot {key} for user {user_id}")
        else:
            # 清除所有記憶
            del self.memory[user_id]
            if user_id in self.timestamps:
                del self.timestamps[user_id]
            logger.debug(f"Forgot all memories for user {user_id}")
    
    def get_user_context(self, user_id: str) -> Dict[str, Any]:
        """
        獲取用戶完整上下文
        
        Args:
            user_id: 用戶標識
            
        Returns:
            用戶上下文字典
        """
        if user_id not in self.memory:
            return {}
        
        # 過濾過期的記憶
        context = {}
        for key, value in self.memory[user_id].items():
            timestamp = self.timestamps[user_id].get(key)
            if timestamp and datetime.now() - timestamp <= timedelta(seconds=self.ttl):
                context[key] = value
        
        return context


# 全局會話記憶實例
conversation_memory = ConversationMemory()

