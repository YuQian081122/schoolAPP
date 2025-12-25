"""
Rasa Actions 配置文件
集中管理所有配置和常量
"""

# 設施類型配置
FACILITY_TYPES = {
    'toilet': {
        'zh': '廁所',
        'en': 'restroom',
        'aliases_zh': ['廁所', '洗手間', '衛生間', 'WC'],
        'aliases_en': ['restroom', 'bathroom', 'toilet', 'WC', 'washroom']
    },
    'water': {
        'zh': '飲水機',
        'en': 'water fountain',
        'aliases_zh': ['飲水機', '飲水器', '水機'],
        'aliases_en': ['water fountain', 'water dispenser', 'drinking fountain', 'water']
    },
    'trash': {
        'zh': '垃圾桶',
        'en': 'trash can',
        'aliases_zh': ['垃圾桶', '垃圾箱', '廢物桶'],
        'aliases_en': ['trash can', 'trash bin', 'garbage can', 'waste bin', 'trash']
    }
}

# 設施狀態配置
FACILITY_STATUSES = {
    '正常': {
        'zh': '正常',
        'en': 'normal',
        'aliases_zh': ['正常', '可用', '良好', 'ok'],
        'aliases_en': ['normal', 'available', 'working', 'ok', 'good']
    },
    '維修中': {
        'zh': '維修中',
        'en': 'maintenance',
        'aliases_zh': ['維修中', '維護中', '修理中'],
        'aliases_en': ['maintenance', 'under maintenance', 'repairing']
    },
    '故障': {
        'zh': '故障',
        'en': 'broken',
        'aliases_zh': ['故障', '壞了', '損壞', '無法使用'],
        'aliases_en': ['broken', 'out of order', 'not working', 'faulty']
    },
    '清潔中': {
        'zh': '清潔中',
        'en': 'cleaning',
        'aliases_zh': ['清潔中', '打掃中', '清理中'],
        'aliases_en': ['cleaning', 'under cleaning', 'being cleaned']
    },
    '滿出': {
        'zh': '滿出',
        'en': 'full',
        'aliases_zh': ['滿出', '滿了', '已滿'],
        'aliases_en': ['full', 'overflowing', 'filled']
    },
    '部分損壞': {
        'zh': '部分損壞',
        'en': 'partially damaged',
        'aliases_zh': ['部分損壞', '部分故障'],
        'aliases_en': ['partially damaged', 'partially broken']
    }
}

# 校區配置
CAMPUSES = {
    'campus1': {
        'zh': '第一校區',
        'en': 'Campus 1',
        'aliases_zh': ['第一校區', '校區1', '一校區'],
        'aliases_en': ['campus 1', 'campus1', 'first campus']
    },
    'campus2': {
        'zh': '第二校區',
        'en': 'Campus 2',
        'aliases_zh': ['第二校區', '校區2', '二校區'],
        'aliases_en': ['campus 2', 'campus2', 'second campus']
    },
    'campus3': {
        'zh': '第三校區',
        'en': 'Campus 3',
        'aliases_zh': ['第三校區', '校區3', '三校區'],
        'aliases_en': ['campus 3', 'campus3', 'third campus']
    }
}

# 建築配置
BUILDINGS = {
    '綜三館': {
        'zh': '綜三館',
        'en': 'Zongsan Building',
        'aliases_zh': ['綜三館', '綜三', 'zongsan'],
        'aliases_en': ['zongsan building', 'zongsan', 'zongsan 館']
    },
    '行政大樓': {
        'zh': '行政大樓',
        'en': 'Administration Building',
        'aliases_zh': ['行政大樓', '行政', 'administration'],
        'aliases_en': ['administration building', 'administration', 'admin building']
    },
    '圖書館': {
        'zh': '圖書館',
        'en': 'Library',
        'aliases_zh': ['圖書館', 'library'],
        'aliases_en': ['library']
    }
}

# 性能配置
PERFORMANCE_CONFIG = {
    'cache_ttl': 300,  # 緩存過期時間（秒）
    'max_cache_size': 1000,  # 最大緩存條目數
    'rate_limit_requests': 100,  # 速率限制：每分鐘請求數
    'rate_limit_window': 60,  # 速率限制時間窗口（秒）
    'max_input_length': 500,  # 最大輸入長度
    'default_radius': 500,  # 默認搜索半徑（米）
    'max_results': 10  # 默認最大結果數
}

# 語言檢測配置
LANGUAGE_CONFIG = {
    'english_threshold': 0.5,  # 英文檢測閾值
    'default_language': 'zh'  # 默認語言
}

# 驗證配置
VALIDATION_CONFIG = {
    'facility_types': list(FACILITY_TYPES.keys()),
    'statuses': list(FACILITY_STATUSES.keys()),
    'campuses': list(CAMPUSES.keys()),
    'buildings': list(BUILDINGS.keys())
}

# Gemini API 配置
GEMINI_CONFIG = {
    'default_model': 'gemini-2.0-flash-exp',
    'fallback_models': ['gemini-1.5-flash', 'gemini-1.5-pro'],  # 備用模型
    'max_input_length': 500,  # 最大輸入長度
    'max_output_length': 512,  # 最大輸出長度
    'cache_size': 100,  # 緩存大小
    'cache_ttl': 3600,  # 緩存過期時間（秒）
    'max_retries': 2,  # 最大重試次數
    'default_temperature': 0.7,  # 默認溫度
    'context_max_items': 3,  # 上下文最大條數
    'context_max_length': 150,  # 單條上下文最大長度
}

