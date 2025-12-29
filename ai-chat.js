// ============================================
// 統一配置管理（改進 1：統一配置管理）
// ============================================
const AppConfig = {
  STORAGE_KEYS: {
    RASA_URL: 'nfu_rasa_server_url',
    LANGUAGE: 'nfu_language',
    THEME: 'nfu_theme_mode',
    FACILITIES: 'nfu_facilities',
    PREFERENCES: 'nfu_preferences',
    ISSUE_HISTORY: 'nfu_issue_history'
  },
  DEFAULTS: {
    LANGUAGE: 'zh',
    THEME: 'dark'
  },
  API: {
    TIMEOUT: 10000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 1000
  },
  // 性能相關常量（改進：常量提取）
  PERFORMANCE: {
    MESSAGE_LIMIT: 100,
    CACHE_TTL: 30000,
    DEBOUNCE_DELAY: 300,
    SCROLL_DELAY: 50,
    ANIMATION_DURATION: 300,
    VIRTUALIZATION_THRESHOLD: 50
  },
  // 設施類型常量（改進：常量提取）
  FACILITY_TYPES: {
    TOILET: 'toilet',
    WATER: 'water',
    TRASH: 'trash'
  },
  // 允許的域名（改進：安全增強）
  ALLOWED_DOMAINS: [
    'localhost',
    '127.0.0.1',
    'loca.lt',
    'ngrok.io',
    'ngrok-free.app',
    'tunnel',
    'cloudflare',
    'railway.app',  // Railway 部署域名
    'up.railway.app',  // Railway 部署域名（完整格式）
    'zeabur.app',  // Zeabur 部署域名
    'vercel.app'  // Vercel 部署域名
  ]
};

// ============================================
// 應用狀態管理（改進：全局變量管理）
// ============================================
const AppState = {
  map: null,
  markers: [],
  userLocation: null,
  routeLayer: null,
  issueFacility: null,
  facilities: null,
  conversationMemory: null,
  initialized: false, // 初始化完成標誌
  
  init() {
    this.facilities = loadFacilities();
    // conversationMemory 現在由 ConversationMemoryManager 管理
    if (!window.conversationMemory) {
      window.conversationMemory = conversationMemoryManager.memory;
    }
  },
  
  reset() {
    this.map = null;
    this.markers = [];
    this.userLocation = null;
    this.routeLayer = null;
    this.issueFacility = null;
    this.initialized = false;
  }
};

// 向後兼容：將全局變量映射到 AppState
let aiMap = null;
Object.defineProperty(window, 'aiMap', {
  get() { return AppState.map; },
  set(value) { AppState.map = value; aiMap = value; }
});

let aiMarkers = [];
Object.defineProperty(window, 'aiMarkers', {
  get() { return AppState.markers; },
  set(value) { AppState.markers = value; aiMarkers = value; }
});

let currentUserLocation = null;
Object.defineProperty(window, 'currentUserLocation', {
  get() { return AppState.userLocation; },
  set(value) { AppState.userLocation = value; currentUserLocation = value; }
});

let routeLayer = null;
Object.defineProperty(window, 'routeLayer', {
  get() { return AppState.routeLayer; },
  set(value) { AppState.routeLayer = value; routeLayer = value; }
});

let currentIssueFacility = null;
Object.defineProperty(window, 'currentIssueFacility', {
  get() { return AppState.issueFacility; },
  set(value) { AppState.issueFacility = value; currentIssueFacility = value; }
});

// ============================================
// 對話記憶管理器（優化：統一對話狀態管理）
// ============================================
class ConversationMemoryManager {
  constructor() {
    this.memory = window.conversationMemory || {};
    if (!window.conversationMemory) {
      window.conversationMemory = this.memory;
    }
    this.eventBus = new EventTarget();
    
    // 定期清理過期的待處理意圖
    this.cleanupInterval = setInterval(() => {
      this.checkPendingIntent();
    }, 5000); // 每5秒檢查一次
  }
  
  /**
   * 設置待處理意圖（帶過期時間）
   * @param {string} intent - 意圖類型
   * @param {Object} data - 相關數據
   * @param {number} ttl - 過期時間（毫秒），默認30秒
   */
  setPendingIntent(intent, data = {}, ttl = 30000) {
    this.memory.pending_intent = {
      intent,
      data,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    };
    this.eventBus.dispatchEvent(new CustomEvent('pendingIntentChanged', { 
      detail: this.memory.pending_intent 
    }));
    Utils.logger.log('💬 設置待處理意圖:', { intent, data, ttl });
  }
  
  /**
   * 檢查並清理過期的待處理意圖
   * @returns {Object|null} 待處理意圖或 null
   */
  checkPendingIntent() {
    const pending = this.memory.pending_intent;
    if (!pending) return null;
    
    // 檢查是否過期
    if (pending.expiresAt && pending.expiresAt < Date.now()) {
      Utils.logger.log('⏰ 待處理意圖已過期，自動清除:', pending.intent);
      this.clearPendingIntent();
      return null;
    }
    
    return pending;
  }
  
  /**
   * 清除待處理意圖
   */
  clearPendingIntent() {
    const hadPending = !!this.memory.pending_intent;
    delete this.memory.pending_intent;
    if (hadPending) {
      this.eventBus.dispatchEvent(new CustomEvent('pendingIntentChanged', { 
        detail: null 
      }));
      Utils.logger.log('✅ 已清除待處理意圖');
    }
  }
  
  /**
   * 獲取當前上下文
   * @returns {Object} 當前對話上下文
   */
  getContext() {
    return {
      pendingIntent: this.checkPendingIntent(),
      lastFacilityType: this.memory.last_facility_type,
      lastGender: this.memory.last_gender,
      lastCampus: this.memory.last_campus,
      lastBuilding: this.memory.last_building,
      reportFacilityProblem: this.memory.report_facility_problem
    };
  }
  
  /**
   * 設置上下文值
   * @param {string} key - 鍵名
   * @param {*} value - 值
   */
  setContext(key, value) {
    this.memory[key] = value;
  }
  
  /**
   * 獲取上下文值
   * @param {string} key - 鍵名
   * @param {*} defaultValue - 默認值
   * @returns {*} 值
   */
  getContextValue(key, defaultValue = null) {
    return this.memory[key] !== undefined ? this.memory[key] : defaultValue;
  }
  
  /**
   * 清除所有上下文
   */
  clear() {
    this.clearPendingIntent();
    // 保留必要的上下文，只清除待處理相關的
    // 不清除 last_facility_type, last_gender 等用戶偏好
  }
  
  /**
   * 銷毀管理器（清理定時器）
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// 創建全局實例
const conversationMemoryManager = new ConversationMemoryManager();
// 向後兼容
AppState.conversationMemory = conversationMemoryManager;

// ============================================
// 統一語言檢測器（優化：前後端一致的語言檢測）
// ============================================
class LanguageDetector {
  static CHINESE_PATTERN = /[\u4e00-\u9fff]/;
  static ENGLISH_PATTERN = /[a-zA-Z]/;
  static THRESHOLD = 0.5;
  
  /**
   * 檢測文本語言（與後端邏輯一致）
   * @param {string} text - 要檢測的文本
   * @returns {string} 'zh' 或 'en'
   */
  static detect(text) {
    if (!text || typeof text !== 'string') return 'zh';
    
    // 優先檢查中文字符（如果包含中文，直接返回中文）
    const hasChinese = this.CHINESE_PATTERN.test(text);
    if (hasChinese) return 'zh';
    
    // 計算英文字符比例
    const englishMatches = text.match(new RegExp(this.ENGLISH_PATTERN.source, 'g'));
    const englishCount = englishMatches ? englishMatches.length : 0;
    const totalChars = text.replace(/[^\w\s]/g, '').length;
    
    // 如果英文字符比例超過閾值，返回英文
    if (totalChars > 0 && englishCount / totalChars > this.THRESHOLD) {
      return 'en';
    }
    
    // 默認返回中文
    return 'zh';
  }
  
  /**
   * 檢測並更新當前語言設置
   * @param {string} text - 用戶輸入
   * @returns {string} 檢測到的語言
   */
  static detectAndUpdate(text) {
    const detected = this.detect(text);
    if (detected !== currentLanguage) {
      currentLanguage = detected;
      Utils.storage.setString(LANGUAGE_KEY, currentLanguage);
      updateUILanguage();
      Utils.logger.log(`🌐 語言已切換為: ${detected}`);
    }
    return detected;
  }
}

// ============================================
// 用戶反饋管理器（優化：統一的錯誤處理和用戶提示）
// ============================================
class UserFeedbackManager {
  constructor() {
    this.errorHistory = [];
    this.maxHistorySize = 10;
  }
  
  /**
   * 顯示友好的錯誤消息
   * @param {Error|string} error - 錯誤對象或錯誤消息
   * @param {string} context - 錯誤上下文
   * @param {Object} options - 選項
   */
  showError(error, context = '', options = {}) {
    const {
      showToUser = true,
      logToConsole = true,
      retryable = false,
      retryCallback = null
    } = options;
    
    // 提取錯誤消息
    let errorMessage = '';
    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message || String(error);
    } else {
      errorMessage = String(error);
    }
    
    // 記錄錯誤歷史
    this.errorHistory.push({
      message: errorMessage,
      context,
      timestamp: Date.now(),
      retryable
    });
    
    // 限制歷史記錄大小
    if (this.errorHistory.length > this.maxHistorySize) {
      this.errorHistory.shift();
    }
    
    // 控制台日誌
    if (logToConsole) {
      Utils.logger.error(`❌ [${context}] ${errorMessage}`, error);
    }
    
    // 顯示給用戶（友好的消息）
    if (showToUser && typeof addMessage === 'function') {
      const friendlyMessage = this.getFriendlyErrorMessage(errorMessage, context, retryable);
      addMessage(friendlyMessage, false);
      
      // 如果可重試，顯示重試按鈕
      if (retryable && retryCallback) {
        setTimeout(() => {
          const messagesContainer = document.getElementById('chat-messages');
          if (messagesContainer) {
            const lastMessage = messagesContainer.querySelector('.ai-message:last-child');
            if (lastMessage) {
              const retryBtn = document.createElement('button');
              retryBtn.className = 'retry-btn';
              retryBtn.textContent = currentLanguage === 'en' ? '🔄 Retry' : '🔄 重試';
              retryBtn.onclick = () => {
                retryBtn.disabled = true;
                retryBtn.textContent = currentLanguage === 'en' ? '⏳ Retrying...' : '⏳ 重試中...';
                retryCallback();
              };
              lastMessage.querySelector('.message-content')?.appendChild(retryBtn);
            }
          }
        }, 100);
      }
    }
  }
  
  /**
   * 獲取友好的錯誤消息
   * @param {string} errorMessage - 原始錯誤消息
   * @param {string} context - 錯誤上下文
   * @param {boolean} retryable - 是否可重試
   * @returns {string} 友好的錯誤消息
   */
  getFriendlyErrorMessage(errorMessage, context, retryable) {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    
    // 根據錯誤類型提供友好的消息
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      return lang === 'en'
        ? '🌐 Network connection error. Please check your internet connection and try again.'
        : '🌐 網絡連接錯誤。請檢查您的網絡連接後重試。';
    }
    
    if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      return lang === 'en'
        ? '⏱️ Request timeout. The server may be busy. Please try again.'
        : '⏱️ 請求超時。伺服器可能正在忙碌，請稍後重試。';
    }
    
    if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
      return lang === 'en'
        ? '❌ Service not found. Please check if the service is available.'
        : '❌ 找不到服務。請檢查服務是否可用。';
    }
    
    if (errorMessage.includes('500') || errorMessage.includes('Internal Server Error')) {
      return lang === 'en'
        ? '⚠️ Server error occurred. Our team has been notified. Please try again later.'
        : '⚠️ 伺服器發生錯誤。我們已收到通知，請稍後重試。';
    }
    
    if (errorMessage.includes('permission') || errorMessage.includes('Permission')) {
      return lang === 'en'
        ? '🔒 Permission denied. Please check your settings and try again.'
        : '🔒 權限被拒絕。請檢查您的設置後重試。';
    }
    
    // 通用錯誤消息
    const baseMessage = lang === 'en'
      ? '❌ An error occurred. Please try again.'
      : '❌ 發生錯誤，請重試。';
    
    return retryable
      ? `${baseMessage} ${lang === 'en' ? '(You can retry)' : '（可以重試）'}`
      : baseMessage;
  }
  
  /**
   * 顯示成功消息
   * @param {string} message - 成功消息
   * @param {string} context - 上下文
   */
  showSuccess(message, context = '') {
    if (typeof addMessage === 'function') {
      const lang = currentLanguage === 'en' ? 'en' : 'zh';
      const successMessage = lang === 'en'
        ? `✅ ${message}`
        : `✅ ${message}`;
      addMessage(successMessage, false);
    }
    
    if (context) {
      Utils.logger.log(`✅ [${context}] ${message}`);
    }
  }
  
  /**
   * 顯示加載狀態
   * @param {string} message - 加載消息
   * @param {string} context - 上下文
   */
  showLoading(message, context = '') {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    const loadingMessage = lang === 'en'
      ? `⏳ ${message}...`
      : `⏳ ${message}...`;
    
    if (typeof addMessage === 'function') {
      addMessage(loadingMessage, false);
    }
    
    if (context) {
      Utils.logger.log(`⏳ [${context}] ${message}`);
    }
  }
  
  /**
   * 顯示提示消息
   * @param {string} message - 提示消息
   * @param {string} type - 類型：'info', 'warning', 'tip'
   */
  showTip(message, type = 'info') {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    const icons = {
      info: '💡',
      warning: '⚠️',
      tip: '💡'
    };
    
    const tipMessage = `${icons[type] || '💡'} ${message}`;
    
    if (typeof addMessage === 'function') {
      addMessage(tipMessage, false);
    }
  }
}

// 創建全局實例
const userFeedback = new UserFeedbackManager();

/**
 * 設施空間索引（用於快速查詢附近的設施）
 * 使用網格索引優化查詢性能
 * 必須在全局作用域中定義，確保在任何使用之前都已定義
 */
const FacilitySpatialIndex = {
  grid: new Map(), // 網格索引：key 為 "lat_lng"，value 為設施數組
  _lastBuildTime: null,
  gridSize: 0.01, // 網格大小（約 1 公里）

  /**
   * 構建空間索引
   * @param {Array} facilities - 設施數組
   */
  buildIndex(facilities) {
    this.grid.clear();
    
    if (!facilities || facilities.length === 0) {
      if (typeof Utils !== 'undefined' && Utils.logger) {
        Utils.logger.warn('FacilitySpatialIndex: 沒有設施數據');
      }
      return;
    }

    for (const facility of facilities) {
      // 驗證設施數據
      if (!facility || typeof facility !== 'object') continue;
      if (typeof facility.lat !== 'number' || typeof facility.lng !== 'number') continue;
      if (isNaN(facility.lat) || isNaN(facility.lng)) continue;
      if (facility.lat < -90 || facility.lat > 90 || facility.lng < -180 || facility.lng > 180) continue;

      // 計算網格座標
      const gridLat = Math.floor(facility.lat / this.gridSize);
      const gridLng = Math.floor(facility.lng / this.gridSize);
      const gridKey = `${gridLat}_${gridLng}`;

      // 添加到網格
      if (!this.grid.has(gridKey)) {
        this.grid.set(gridKey, []);
      }
      this.grid.get(gridKey).push(facility);
    }

    this._lastBuildTime = Date.now();
    if (typeof Utils !== 'undefined' && Utils.logger) {
      Utils.logger.log(`FacilitySpatialIndex: 已構建索引，共 ${facilities.length} 個設施，${this.grid.size} 個網格`);
    }
  },

  /**
   * 查詢附近的設施
   * @param {number} lat - 緯度
   * @param {number} lng - 經度
   * @param {string} type - 設施類型 ('toilet' | 'water' | 'trash')
   * @param {number} limit - 最多返回的設施數量
   * @param {string|null} gender - 性別過濾（僅用於廁所）
   * @returns {Array} 候選設施數組
   */
  queryNearby(lat, lng, type, limit = 20, gender = null) {
    if (!this.grid || this.grid.size === 0) {
      return [];
    }

    // 驗證輸入
    if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
      return [];
    }

    const candidates = [];
    const centerGridLat = Math.floor(lat / this.gridSize);
    const centerGridLng = Math.floor(lng / this.gridSize);
    
    // 搜索範圍：從中心網格向外擴展
    const searchRadius = 2; // 搜索 2 個網格範圍內的設施
    
    for (let dLat = -searchRadius; dLat <= searchRadius; dLat++) {
      for (let dLng = -searchRadius; dLng <= searchRadius; dLng++) {
        const gridKey = `${centerGridLat + dLat}_${centerGridLng + dLng}`;
        const gridFacilities = this.grid.get(gridKey);
        
        if (gridFacilities && Array.isArray(gridFacilities)) {
          for (const facility of gridFacilities) {
            // 過濾設施類型
            if (facility.type !== type) continue;
            
            // 如果是廁所且指定了性別，過濾性別
            if (type === 'toilet' && gender && facility.gender !== gender) continue;
            
            candidates.push(facility);
            
            // 如果已經找到足夠的候選設施，提前返回
            if (candidates.length >= limit * 2) {
              return candidates;
            }
          }
        }
      }
    }

    return candidates;
  }
};

// ============================================
// 統一工具函數庫（改進 2-4：錯誤處理、輸入驗證、localStorage、語言判斷）
// ============================================
const Utils = {
  /**
   * 語言相關工具（改進 4：統一語言判斷邏輯）
   */
  language: {
    isEnglish: (lang) => {
      if (!lang) lang = currentLanguage;
      return lang === 'en';
    },
    
    getLocalizedText: (key, lang) => {
      if (!lang) lang = currentLanguage;
      return translations[lang]?.[key] || translations['zh'][key] || key;
    },
    
    getLocalizedMessage: (zhText, enText, lang) => {
      if (!lang) lang = currentLanguage;
      return lang === 'en' ? enText : zhText;
    },
    
    // 使用統一的語言檢測器
    detect: (text) => LanguageDetector.detect(text),
    
    detectAndUpdate: (text) => LanguageDetector.detectAndUpdate(text)
  },

  /**
   * DOM 元素緩存（性能優化：減少重複查詢）
   */
  dom: {
    _cache: {},
    
    /**
     * 獲取 DOM 元素（帶緩存）
     * @param {string} id - 元素 ID
     * @param {boolean} forceRefresh - 強制刷新緩存
     * @returns {HTMLElement|null} DOM 元素
     */
    get: (id, forceRefresh = false) => {
      if (forceRefresh || !Utils.dom._cache[id]) {
        Utils.dom._cache[id] = document.getElementById(id);
      }
      return Utils.dom._cache[id];
    },
    
    /**
     * 查詢選擇器（帶緩存）
     * @param {string} selector - CSS 選擇器
     * @param {boolean} forceRefresh - 強制刷新緩存
     * @returns {HTMLElement|null} DOM 元素
     */
    query: (selector, forceRefresh = false) => {
      const cacheKey = `query:${selector}`;
      if (forceRefresh || !Utils.dom._cache[cacheKey]) {
        Utils.dom._cache[cacheKey] = document.querySelector(selector);
      }
      return Utils.dom._cache[cacheKey];
    },
    
    /**
     * 清除緩存
     */
    clear: () => {
      Utils.dom._cache = {};
    },
    
    /**
     * 清除特定元素的緩存
     * @param {string} id - 元素 ID 或選擇器
     */
    clearItem: (id) => {
      delete Utils.dom._cache[id];
      delete Utils.dom._cache[`query:${id}`];
    }
  },

  /**
   * 性能優化工具（防抖和節流）
   */
  performance: {
    /**
     * 防抖函數（debounce）
     * @param {Function} func - 要執行的函數
     * @param {number} wait - 等待時間（毫秒）
     * @param {boolean} immediate - 是否立即執行
     * @returns {Function} 防抖後的函數
     */
    debounce: (func, wait = 300, immediate = false) => {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          timeout = null;
          if (!immediate) func.apply(this, args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(this, args);
      };
    },
    
    /**
     * 節流函數（throttle）
     * @param {Function} func - 要執行的函數
     * @param {number} limit - 時間限制（毫秒）
     * @returns {Function} 節流後的函數
     */
    throttle: (func, limit = 250) => {
      let inThrottle;
      return function(...args) {
        if (!inThrottle) {
          func.apply(this, args);
          inThrottle = true;
          setTimeout(() => inThrottle = false, limit);
        }
      };
    }
  },

  /**
   * 安全的 localStorage 操作（改進 3：修復 localStorage 錯誤處理）
   */
  storage: {
    get: (key, defaultValue = null) => {
      try {
        const item = localStorage.getItem(key);
        if (!item) return defaultValue;
        return JSON.parse(item);
      } catch (e) {
        Utils.logger.warn(`[Storage] 讀取失敗 (${key}):`, e);
        return defaultValue;
      }
    },
    
    set: (key, value) => {
      try {
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (e) {
        Utils.logger.warn(`[Storage] 寫入失敗 (${key}):`, e);
        // 降級方案：嘗試使用 sessionStorage
        try {
          sessionStorage.setItem(key, JSON.stringify(value));
          Utils.logger.warn(`[Storage] 已降級使用 sessionStorage (${key})`);
          return true;
        } catch (e2) {
          Utils.logger.error(`[Storage] sessionStorage 也失敗:`, e2);
          return false;
        }
      }
    },
    
    remove: (key) => {
      try {
        localStorage.removeItem(key);
        return true;
      } catch (e) {
        Utils.logger.warn(`[Storage] 刪除失敗 (${key}):`, e);
        return false;
      }
    },
    
    getString: (key, defaultValue = null) => {
      try {
        return localStorage.getItem(key) || defaultValue;
      } catch (e) {
        Utils.logger.warn(`[Storage] 讀取字符串失敗 (${key}):`, e);
        return defaultValue;
      }
    },
    
    setString: (key, value) => {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (e) {
        Utils.logger.warn(`[Storage] 寫入字符串失敗 (${key}):`, e);
        try {
          sessionStorage.setItem(key, value);
          return true;
        } catch (e2) {
          Utils.logger.error(`[Storage] sessionStorage 也失敗:`, e2);
          return false;
        }
      }
    }
  },

  /**
   * 輸入驗證（改進 2：添加輸入驗證）
   */
  validation: {
    isString: (value) => typeof value === 'string',
    
    isNonEmptyString: (value) => {
      return typeof value === 'string' && value.trim().length > 0;
    },
    
    isValidURL: (url) => {
      if (!url || typeof url !== 'string') return false;
      try {
        const urlObj = new URL(url);
        return ['http:', 'https:'].includes(urlObj.protocol);
      } catch {
        return false;
      }
    },
    
    sanitizeInput: (input) => {
      if (typeof input !== 'string') return '';
      return input.trim().replace(/[<>]/g, ''); // 移除潛在的 HTML 標籤
    }
  },

  /**
   * 錯誤處理（改進 1：統一錯誤處理機制）
   */
  error: {
    handle: (error, context = 'Unknown') => {
      const errorInfo = {
        message: error?.message || String(error),
        stack: error?.stack,
        context,
        timestamp: new Date().toISOString()
      };
      
      console.error(`[Error: ${context}]`, errorInfo);
      
      return errorInfo;
    },
    
    showUserFriendlyMessage: (error, lang) => {
      if (!lang) lang = currentLanguage;
      const isEn = lang === 'en';
      const messages = {
        network: isEn 
          ? 'Network connection failed. Please check your internet connection.'
          : '網絡連接失敗，請檢查您的網絡連接。',
        timeout: isEn
          ? 'Request timed out. Please try again.'
          : '請求超時，請稍後再試。',
        parse: isEn
          ? 'Data parsing failed. Please refresh the page.'
          : '數據解析失敗，請刷新頁面。',
        storage: isEn
          ? 'Storage operation failed. Some features may not work properly.'
          : '存儲操作失敗，部分功能可能無法正常使用。',
        unknown: isEn
          ? 'An unexpected error occurred. Please try again later.'
          : '發生未知錯誤，請稍後再試。'
      };
      
      return messages[error?.type] || messages.unknown;
    }
  },

  /**
   * 防抖函數（性能優化）
   */
  debounce: (func, wait = 300) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  /**
   * 安全的 JSON 解析
   */
  safeJSONParse: (str, defaultValue = null) => {
    if (!str || typeof str !== 'string') return defaultValue;
    try {
      return JSON.parse(str);
    } catch (e) {
      Utils.logger.warn('[JSON] 解析失敗:', e);
      return defaultValue;
    }
  },

  /**
   * DOM 工具（性能優化：緩存 DOM 元素）
   */
  dom: {
    cache: new Map(),
    
    get: (selector, useCache = true) => {
      if (!selector || typeof selector !== 'string') {
        Utils.logger.warn('Utils.dom.get: 無效的選擇器', selector);
        return null;
      }
      
      // 如果選擇器不包含 #、. 或標籤名，假設是 ID
      let actualSelector = selector;
      if (!selector.includes('#') && !selector.includes('.') && !selector.includes(' ') && !selector.includes('[') && !selector.includes(':')) {
        actualSelector = `#${selector}`;
      }
      
      if (useCache && Utils.dom.cache.has(actualSelector)) {
        const cached = Utils.dom.cache.get(actualSelector);
        // 檢查元素是否還在 DOM 中
        if (cached && document.contains(cached)) {
          return cached;
        } else {
          Utils.dom.cache.delete(actualSelector);
        }
      }
      
      try {
        const element = document.querySelector(actualSelector);
      if (element && useCache) {
          Utils.dom.cache.set(actualSelector, element);
      }
      return element;
      } catch (error) {
        Utils.logger.warn('Utils.dom.get: 查詢選擇器時出錯', actualSelector, error);
        return null;
      }
    },
    
    getById: (id, useCache = true) => {
      return Utils.dom.get(`#${id}`, useCache);
    },
    
    /**
     * 查詢選擇器（帶緩存）- 別名方法
     * @param {string} selector - CSS 選擇器
     * @param {boolean} useCache - 是否使用緩存
     * @returns {HTMLElement|null} DOM 元素
     */
    query: (selector, useCache = true) => {
      return Utils.dom.get(selector, useCache);
    },
    
    /**
     * 統一創建 DOM 元素（改進：消除重複代碼）
     * @param {string} tag - HTML 標籤名
     * @param {string} className - CSS 類名（可選）
     * @param {string} textContent - 文本內容（可選）
     * @param {Object} attributes - 屬性對象（可選）
     * @param {Object} style - 樣式對象（可選）
     * @returns {HTMLElement} 創建的元素
     */
    createElement: (tag, className = null, textContent = null, attributes = null, style = null) => {
      const el = document.createElement(tag);
      
      if (className) {
        el.className = className;
      }
      
      if (textContent !== null) {
        el.textContent = textContent;
      }
      
      if (attributes) {
        Object.entries(attributes).forEach(([key, value]) => {
          el.setAttribute(key, value);
        });
      }
      
      if (style) {
        Object.assign(el.style, style);
      }
      
      return el;
    },
    
    /**
     * 批量添加子元素（性能優化）
     * @param {HTMLElement} parent - 父元素
     * @param {Array<HTMLElement>} children - 子元素數組
     */
    appendChildren: (parent, children) => {
      const fragment = document.createDocumentFragment();
      children.forEach(child => {
        if (child) fragment.appendChild(child);
      });
      parent.appendChild(fragment);
    },
    
    clearCache: () => {
      Utils.dom.cache.clear();
    }
  },

  /**
   * 事件管理系統（統一事件監聽器管理）
   */
  events: {
    listeners: new Map(),
    
    /**
     * 添加事件監聽器
     * @param {HTMLElement|EventTarget} element - 目標元素
     * @param {string} event - 事件類型
     * @param {Function} handler - 事件處理函數
     */
    on: (element, event, handler) => {
      if (!element) {
        Utils.logger.warn('Utils.events.on: 元素不存在');
        return;
      }
      if (typeof handler !== 'function') {
        Utils.logger.warn('Utils.events.on: 處理函數無效');
        return;
      }
      const key = `${element}_${event}`;
      // 移除舊的監聽器（如果存在）
      if (Utils.events.listeners.has(key)) {
        const oldHandler = Utils.events.listeners.get(key);
        element.removeEventListener(event, oldHandler);
      }
      // 添加新監聽器
      element.addEventListener(event, handler);
      Utils.events.listeners.set(key, handler);
    },
    
    /**
     * 移除事件監聽器
     * @param {HTMLElement|EventTarget} element - 目標元素
     * @param {string} event - 事件類型
     */
    off: (element, event) => {
      if (!element) return;
      const key = `${element}_${event}`;
      if (Utils.events.listeners.has(key)) {
        const handler = Utils.events.listeners.get(key);
        element.removeEventListener(event, handler);
        Utils.events.listeners.delete(key);
      }
    },
    
    /**
     * 清除所有事件監聽器
     */
    clearAll: () => {
      Utils.events.listeners.forEach((handler, key) => {
        const [element, event] = key.split('_');
        // 注意：這裡無法直接移除，因為我們只存儲了 handler
        // 實際使用中，應該在元素移除時手動調用 off
      });
      Utils.events.listeners.clear();
    }
  },

  /**
   * 定時器管理（防止內存洩漏）
   */
  timers: {
    timeouts: new Set(),
    intervals: new Set(),
    
    setTimeout: (callback, delay) => {
      const id = setTimeout(() => {
        Utils.timers.timeouts.delete(id);
        callback();
      }, delay);
      Utils.timers.timeouts.add(id);
      return id;
    },
    
    setInterval: (callback, delay) => {
      const id = setInterval(callback, delay);
      Utils.timers.intervals.add(id);
      return id;
    },
    
    clearTimeout: (id) => {
      clearTimeout(id);
      Utils.timers.timeouts.delete(id);
    },
    
    clearInterval: (id) => {
      clearInterval(id);
      Utils.timers.intervals.delete(id);
    },
    
    clearAll: () => {
      Utils.timers.timeouts.forEach(id => clearTimeout(id));
      Utils.timers.intervals.forEach(id => clearInterval(id));
      Utils.timers.timeouts.clear();
      Utils.timers.intervals.clear();
    }
  },

  /**
   * HTML 安全工具（防止 XSS）
   */
  html: {
    /**
     * 轉義 HTML 特殊字符
     * @param {string} text - 要轉義的文字
     * @returns {string} 轉義後的文字
     */
    escape: (text) => {
      if (typeof text !== 'string') return String(text);
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    /**
     * 安全地設置 innerHTML（轉義所有變量）
     * @param {HTMLElement} element - DOM 元素
     * @param {string} html - HTML 字符串（使用 ${} 插值時會自動轉義）
     * @param {Object} data - 數據對象（可選）
     */
    safeSetHTML: (element, html, data = {}) => {
      if (!element) return;
      
      // 如果提供了數據對象，替換模板變量
      let processedHTML = html;
      if (data && Object.keys(data).length > 0) {
        Object.keys(data).forEach(key => {
          const value = data[key];
          const escapedValue = Utils.html.escape(String(value));
          processedHTML = processedHTML.replace(
            new RegExp(`\\$\\{${key}\\}`, 'g'),
            escapedValue
          );
        });
      }
      
      // 對於其他 ${} 插值，也進行轉義（簡單實現）
      processedHTML = processedHTML.replace(/\$\{([^}]+)\}/g, (match, expr) => {
        // 這是一個簡化實現，實際使用時應該在模板字符串中直接調用 escape
        return Utils.html.escape(expr);
      });
      
      element.innerHTML = processedHTML;
    },
    
    /**
     * 創建安全的 HTML 字符串（用於模板字符串）
     * 使用方式：html`<div>${userInput}</div>` 會自動轉義
     */
    html: (strings, ...values) => {
      return strings.reduce((result, str, i) => {
        const value = i < values.length ? Utils.html.escape(String(values[i] || '')) : '';
        return result + str + value;
      }, '');
    }
  },

  /**
   * 緩存系統（優化版：帶 TTL 支持、自動清理、大小限制）
   */
  cache: {
    _cache: new Map(),
    _maxSize: 500, // 最大緩存項數
    _cleanupInterval: null,
    
    /**
     * 初始化自動清理（每5分鐘清理一次過期緩存）
     */
    _initCleanup() {
      if (this._cleanupInterval) return;
      this._cleanupInterval = setInterval(() => {
        this._cleanup();
      }, 5 * 60 * 1000); // 5分鐘
    },
    
    /**
     * 清理過期緩存
     */
    _cleanup() {
      const now = Date.now();
      let cleaned = 0;
      for (const [key, item] of this._cache.entries()) {
        if (item.expiresAt && now > item.expiresAt) {
          this._cache.delete(key);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        Utils.logger.log(`🧹 清理了 ${cleaned} 個過期緩存項`);
      }
      
      // 如果緩存仍然太大，刪除最舊的項（FIFO）
      if (this._cache.size > this._maxSize) {
        const toRemove = this._cache.size - this._maxSize;
        const keysToRemove = Array.from(this._cache.keys()).slice(0, toRemove);
        keysToRemove.forEach(key => this._cache.delete(key));
        Utils.logger.log(`🧹 清理了 ${toRemove} 個舊緩存項（超過最大限制）`);
      }
    },
    
    /**
     * 獲取緩存值（優化版：單次查找）
     * @param {string} key - 緩存鍵
     * @returns {any|null} 緩存值，如果不存在或已過期則返回 null
     */
    get: (key) => {
      const item = Utils.cache._cache.get(key);
      if (!item) return null;
      
      // 檢查是否過期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        Utils.cache._cache.delete(key);
        return null;
      }
      
      return item.value;
    },
    
    /**
     * 設置緩存值（優化版：自動清理和大小限制）
     * @param {string} key - 緩存鍵
     * @param {any} value - 緩存值
     * @param {number} ttl - 生存時間（毫秒），可選
     */
    set: (key, value, ttl = null) => {
      // 初始化自動清理
      Utils.cache._initCleanup();
      
      // 如果緩存已滿，先清理
      if (Utils.cache._cache.size >= Utils.cache._maxSize) {
        Utils.cache._cleanup();
      }
      
      const item = {
        value: value,
        expiresAt: ttl ? Date.now() + ttl : null,
        createdAt: Date.now()
      };
      Utils.cache._cache.set(key, item);
    },
    
    /**
     * 刪除緩存
     * @param {string} key - 緩存鍵
     */
    delete: (key) => {
      Utils.cache._cache.delete(key);
    },
    
    /**
     * 清除所有緩存
     */
    clear: () => {
      Utils.cache._cache.clear();
      if (Utils.cache._cleanupInterval) {
        clearInterval(Utils.cache._cleanupInterval);
        Utils.cache._cleanupInterval = null;
      }
    },
    
    /**
     * 檢查緩存是否存在（優化版：單次查找）
     * @param {string} key - 緩存鍵
     * @returns {boolean} 是否存在
     */
    has: (key) => {
      const item = Utils.cache._cache.get(key);
      if (!item) return false;
      
      // 檢查是否過期
      if (item.expiresAt && Date.now() > item.expiresAt) {
        Utils.cache._cache.delete(key);
        return false;
      }
      
      return true;
    },
    
    /**
     * 獲取緩存統計信息
     * @returns {Object} 緩存統計
     */
    getStats: () => {
      const now = Date.now();
      let expired = 0;
      let valid = 0;
      
      for (const item of Utils.cache._cache.values()) {
        if (item.expiresAt && now > item.expiresAt) {
          expired++;
        } else {
          valid++;
        }
      }
      
      return {
        total: Utils.cache._cache.size,
        valid,
        expired,
        maxSize: Utils.cache._maxSize
      };
    }
  },

  /**
   * 日誌管理系統（改進 3：日誌管理）
   */
  logger: {
    isDev: () => {
      return window.location.hostname === 'localhost' || 
             window.location.hostname === '127.0.0.1' ||
             window.location.hostname === '';
    },
    
    log: (...args) => {
      if (Utils.logger.isDev()) {
        console.log('[LOG]', ...args);
      }
    },
    
    warn: (...args) => {
      if (Utils.logger.isDev()) {
        console.warn('[WARN]', ...args);
      }
    },
    
    error: (...args) => {
      // 錯誤始終記錄
      console.error('[ERROR]', ...args);
      // 可以在此處添加錯誤報告功能
      // Utils.logger.reportToServer(...args);
    },
    
    info: (...args) => {
      if (Utils.logger.isDev()) {
        console.info('[INFO]', ...args);
      }
    },
    
    debug: (...args) => {
      if (Utils.logger.isDev()) {
        console.debug('[DEBUG]', ...args);
      }
    }
  }
};

// ============================================
// 防抖保存函數（性能優化：減少 localStorage 寫入頻率）
// ============================================
const saveFacilitiesDebounced = Utils.performance.debounce(() => {
  Utils.storage.set(AppConfig.STORAGE_KEYS.FACILITIES, facilities);
}, 500);

// ============================================
// AI 對話系統（保持向後兼容）
// ============================================
// 注意：aiMap 已在第 76 行聲明，此處不再重複聲明
// 這些變量已通過 AppState 管理，此處僅為向後兼容聲明
// 實際值通過 Object.defineProperty 與 AppState 同步
// let routeLayer = null; // 已在第 94 行聲明
// let currentIssueFacility = null; // 已在第 100 行聲明

// Rasa 伺服器設定（使用統一配置）
const RASA_URL_STORAGE_KEY = AppConfig.STORAGE_KEYS.RASA_URL;

/**
 * 驗證 Rasa URL 安全性（改進：安全增強）
 * @param {string} url - 要驗證的 URL
 * @returns {boolean} URL 是否安全
 */
function validateRasaURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    
    // 檢查協議
    if (!['http:', 'https:'].includes(urlObj.protocol)) {
      Utils.logger.warn('無效的協議:', urlObj.protocol);
      return false;
    }
    
    // 檢查域名（改進：安全增強）
    const hostname = urlObj.hostname.toLowerCase();
    const isAllowed = AppConfig.ALLOWED_DOMAINS.some(domain => hostname.includes(domain));
    
    // 允許 Railway 和 Zeabur 部署域名
    const isRailway = hostname.endsWith('.up.railway.app') || hostname.endsWith('.railway.app');
    const isZeabur = hostname.endsWith('.zeabur.app');
    
    if (!isAllowed && !isRailway && !isZeabur && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // 允許本地開發環境
      if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
        return true;
      }
      Utils.logger.warn('不允許的域名:', hostname);
      return false;
    }
    
    return true;
  } catch (error) {
    Utils.logger.error('URL 驗證失敗:', error);
    return false;
  }
}

/**
 * 獲取 Rasa 伺服器 URL（優先級：URL 參數 > localStorage > 直接連接 Zeabur）
 * @returns {string|null} Rasa 伺服器 URL，如果未設置則返回 null
 */
function getRasaServerURL() {
  // 根據環境自動選擇 URL
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // 1. 優先檢查 URL 參數（例如：?rasa_url=https://xxx.loca.lt）
  const urlParams = new URLSearchParams(window.location.search);
  const urlParamRasa = urlParams.get('rasa_url');
  if (urlParamRasa) {
    // 驗證 URL 安全性（改進：安全增強）
    if (validateRasaURL(urlParamRasa)) {
      Utils.logger.log(`🌐 從 URL 參數獲取 Rasa 伺服器：${urlParamRasa}`);
      // 保存到 localStorage 以便下次使用（使用統一工具函數）
      Utils.storage.setString(RASA_URL_STORAGE_KEY, urlParamRasa);
      return urlParamRasa;
    } else {
      Utils.logger.warn('URL 參數中的 Rasa URL 驗證失敗，已忽略');
    }
  }
  
  // 2. 檢查 localStorage 中是否已保存 Rasa URL（使用統一工具函數）
  const savedRasaUrl = Utils.storage.getString(RASA_URL_STORAGE_KEY);
  if (savedRasaUrl) {
    Utils.logger.log(`💾 使用保存的 Rasa 伺服器：${savedRasaUrl}`);
    return savedRasaUrl;
  }
  
  // 3. 根據環境自動選擇 URL
  if (isLocalhost) {
    // 本地開發：直接連接到本地 Rasa 服務器（端口 5005）
    const localRasaUrl = 'http://localhost:5005';
    Utils.logger.log(`🌐 本地開發環境，使用本地 Rasa 伺服器：${localRasaUrl}`);
    return localRasaUrl;
  } else if (hostname.includes('zeabur.app') || hostname.includes('vercel.app')) {
    // Zeabur/Vercel 環境：使用前端服務器代理（相對路徑）
    Utils.logger.log(`🌐 生產環境，使用前端服務器代理：/api/rasa/webhook`);
    return '/api/rasa/webhook';
  } else {
    // 其他生產環境：使用默認 Zeabur URL
    const defaultRasaUrl = 'https://rasa-service.zeabur.app';
    Utils.logger.log(`🌐 使用默認 Rasa 伺服器：${defaultRasaUrl}`);
    return defaultRasaUrl;
  }
  
  // 檢查是否為內網穿透服務（localtunnel、ngrok 等）
  const isTunnel = hostname.includes('ngrok.io') || 
                   hostname.includes('ngrok-free.app') ||
                   hostname.includes('loca.lt') ||
                   hostname.includes('tunnel') ||
                   hostname.includes('cloudflare') ||
                   /^[a-z0-9-]+\.(ngrok|localtunnel|tunnel)\./.test(hostname);
  
  // 如果是通過內網穿透訪問
  if (isTunnel) {
    // 嘗試從當前 URL 推斷 Rasa URL（localtunnel 通常使用不同的子域名）
    // 例如：網站是 https://xxx.loca.lt，Rasa 可能是 https://yyy.loca.lt
    // 但我們無法自動推斷，所以需要用戶提供
    
    // 檢查是否有提示用戶設置的標記
    const hasShownPrompt = sessionStorage.getItem('rasa_url_prompt_shown');
    if (!hasShownPrompt) {
      // 顯示友好的提示（只顯示一次）
      // 使用命名函數以便清理
      const promptTimeoutId = setTimeout(() => {
        try {
          const userRasaUrl = prompt(
            '🔗 請輸入 Rasa 伺服器的 localtunnel 網址：\n\n' +
            '例如：https://your-rasa-server.loca.lt\n\n' +
            '（可以在 localtunnel 視窗中找到此網址）',
            Utils.storage.getString(RASA_URL_STORAGE_KEY, '')
          );
          
          if (userRasaUrl && userRasaUrl.trim()) {
            const cleanUrl = userRasaUrl.trim().replace(/\/$/, ''); // 移除末尾斜線
            // 驗證 URL 格式（使用統一工具函數）
            if (Utils.validation.isValidURL(cleanUrl)) {
              Utils.storage.setString(RASA_URL_STORAGE_KEY, cleanUrl);
              sessionStorage.setItem('rasa_url_prompt_shown', 'true');
              Utils.logger.log(`✅ 已設置 Rasa 伺服器地址：${cleanUrl}`);
              Utils.logger.log('🔄 正在重新載入頁面...');
              window.location.reload();
            } else {
              Utils.logger.warn('⚠️ URL 格式無效，請重新輸入');
              sessionStorage.removeItem('rasa_url_prompt_shown'); // 允許重新提示
            }
          } else {
            sessionStorage.setItem('rasa_url_prompt_shown', 'true');
          }
        } catch (error) {
          Utils.logger.error('設置 Rasa URL 時發生錯誤:', error);
          sessionStorage.setItem('rasa_url_prompt_shown', 'true');
        }
      }, 1000); // 延遲 1 秒顯示，避免干擾頁面載入
      
      // 存儲 timeout ID 以便清理（如果頁面卸載）
      if (typeof window.rasaPromptTimeoutId === 'undefined') {
        window.rasaPromptTimeoutId = promptTimeoutId;
      }
    }
    
    Utils.logger.warn('⚠️ 檢測到內網穿透服務，但未找到 Rasa 伺服器地址');
    Utils.logger.warn('💡 解決方法：');
    Utils.logger.warn('   1. 在 URL 中添加參數：?rasa_url=https://your-rasa-server.loca.lt');
    Utils.logger.warn('   2. 或在控制台執行：localStorage.setItem("nfu_rasa_server_url", "https://your-rasa-server.loca.lt")');
    Utils.logger.warn('   3. 然後重新載入頁面');
    
    // 返回一個提示，實際連接會失敗，但會提示用戶如何設置
    return null; // 返回 null 表示需要用戶設置
  }
  
  // 如果是移動設備或使用 IP 地址訪問
  if (isMobile || isSmallScreen || (hostname !== 'localhost' && hostname !== '127.0.0.1')) {
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      // 使用當前主機的 IP 地址
      const url = protocol === 'https:' 
        ? `${protocol}//${hostname}/rasa` 
        : `http://${hostname}:5005`;
      Utils.logger.log(`📱 使用當前主機的 Rasa 伺服器：${url}`);
      return url;
    }
    
    // localhost 但移動設備
    Utils.logger.warn('⚠️ 手機版檢測到 localhost，無法連接到電腦上的 Rasa 伺服器');
    Utils.logger.warn('💡 請使用內網穿透工具或電腦的 IP 地址訪問');
  }
  
  // 默認使用 localhost
  return 'http://localhost:5005';
}

// 動態獲取 Rasa 伺服器 URL（每次調用時重新獲取，支持動態更新）
/**
 * 構建 Rasa webhook URL
 * @param {string} rasaUrl - Rasa 服務器 URL（可能是完整 URL 或相對路徑）
 * @returns {string} 完整的 webhook URL
 */
function buildRasaWebhookUrl(rasaUrl) {
  // 如果是相對路徑（Vercel 代理），直接使用；否則構建完整 URL
  if (rasaUrl.startsWith('/')) {
    return rasaUrl;  // Vercel 代理，直接使用
  } else {
    return `${rasaUrl}/webhooks/rest/webhook`;  // 直接連接，構建完整 URL
  }
}

function getRasaServerURLDynamic() {
  const url = getRasaServerURL();
  if (!url) {
    // 如果返回 null，說明需要用戶設置
    return 'http://localhost:5005'; // 返回默認值，但會顯示提示
  }
  return url;
}

/**
 * 獲取 Action Server URL（根據環境動態選擇）
 * @returns {string} Action Server URL
 */
function getActionServerURLDynamic() {
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  if (isLocalhost) {
    // 本地開發：直接連接到本地 Action Server
    return 'http://localhost:5055';
  } else if (hostname.includes('zeabur.app')) {
    // Zeabur 環境：直接連接到 Zeabur Action Server
    const zeaburActionUrl = 'https://schoolapp.zeabur.app';
    Utils.logger.log(`🌐 Zeabur 環境，使用 Zeabur Action Server：${zeaburActionUrl}`);
    return zeaburActionUrl;
  } else if (hostname.includes('vercel.app')) {
    // Vercel 環境：使用 Vercel 代理
    return '/api/rasa/webhook';
  } else {
    // 其他生產環境：使用默認 Zeabur Action Server URL
    const defaultActionUrl = 'https://schoolapp.zeabur.app';
    Utils.logger.log(`🌐 使用默認 Action Server：${defaultActionUrl}`);
    return defaultActionUrl;
  }
}

// 初始 Rasa 伺服器 URL（會在連接時動態獲取）
let RASA_SERVER_URL = getRasaServerURLDynamic();
let useRasa = false; // 是否使用 Rasa（如果 Rasa 伺服器可用則設為 true）

// Rasa 會話管理：使用固定的 sender ID 維持對話上下文
let rasaSessionId = null;
function getRasaSessionId() {
  if (!rasaSessionId) {
    // 生成一個唯一的會話 ID，並存儲在 sessionStorage 中
    const storedId = sessionStorage.getItem('rasa_session_id');
    if (storedId) {
      rasaSessionId = storedId;
    } else {
      // 生成新的會話 ID：使用時間戳 + 隨機數
      rasaSessionId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
      sessionStorage.setItem('rasa_session_id', rasaSessionId);
      Utils.logger.log('🆔 創建新的 Rasa 會話 ID:', rasaSessionId);
    }
  }
  return rasaSessionId;
}

// 語言設定（使用統一配置和工具函數）
const LANGUAGE_KEY = AppConfig.STORAGE_KEYS.LANGUAGE;
let currentLanguage = Utils.storage.getString(LANGUAGE_KEY, AppConfig.DEFAULTS.LANGUAGE);

// 語言翻譯
const translations = {
  zh: {
    title: 'AI 校園助手 - 國立虎尾科技大學',
    headerTitle: '🤖 AI 校園助手',
    headerSubtitle: '國立虎尾科技大學',
    languageBtn: '🌐 中文',
    viewMapBtn: '🗺️ 查看地圖',
    themeBtn: '主題',
    mapNavigation: '📍 地圖導航',
    myLocation: '📍 我的位置',
    campus1: '第一校區',
    campus2: '第二校區',
    campus3: '第三校區',
    loadingMap: '載入地圖中...',
    waitingAI: '等待 AI 指令...',
    gettingLocation: '📍 正在取得您的位置...',
    locationSuccess: '✅ 已定位到您的位置',
    locationError: '無法取得您的位置。',
    quickToilet: '🚻 最近廁所',
    quickWater: '🚰 最近飲水機',
    quickTrash: '🗑️ 最近垃圾桶',
    quickRoute: '🧭 智能路線',
    quickReport: '⚡ 快速回報',
    quickStatistics: '📊 統計',
    inputPlaceholder: '輸入你的問題...',
    welcomeMessage: `你好！我是虎尾科技大學的 AI 校園助手 👋`,
    issueFormTitle: '🛠 設備問題回報',
    issueFormDesc: '偵測到您回報設備髒污或損壞，請確認或修改以下資訊後送出：',
    issueCampus: '校區',
    issueSelectCampus: '請選擇校區',
    issueBuilding: '建築',
    issueBuildingPlaceholder: '例：行政大樓',
    issueFloor: '樓層',
    issueFloorPlaceholder: '例：3F 或 3 樓',
    issueRemark: '補充說明（選填）',
    issueRemarkPlaceholder: '例：廁所很髒、有設備損壞、飲水機無法出水等',
    issuePhoto: '上傳照片（選填）',
    issuePhotoRemove: '移除',
    issueStatus: '設施狀態',
    issueSelectStatus: '請選擇狀態',
    issueStatusNormal: '✅ 正常',
    issueStatusDamaged: '⚠️ 部分損壞',
    issueStatusCleaning: '🧹 待清潔',
    issueStatusUnavailable: '🚫 無法使用',
    issueFormClose: '關閉表單',
    issueSelectBuilding: '請選擇建築',
    issueSummary: '將自動選擇距離您最近的設備作為預設回報目標。',
    issueCancel: '取消',
    issueSubmit: '送出回報',
    issueFormOpened: '我已為您打開設備問題回報表單，請在下方填寫並送出。',
    noGPSLocation: '尚未取得您的 GPS 位置，請先點選「📍 我的位置」按鈕啟用定位，表單欄位請您手動選填。',
    noFacilities: '目前尚未有任何設施資料，請您手動填寫校區、建築與樓層資訊。',
    nearestFacility: '已為您預設距離最近的設備：',
    campus: '校區：',
    building: '建築：',
    floor: '樓層：',
    type: '類型：',
    toilet: '廁所',
    water: '飲水機',
    trash: '垃圾桶',
    reportReceived: '已收到您的設備問題回報：',
    reportCampus: '🏫 校區：',
    reportBuilding: '🏢 建築：',
    reportFloor: '🏢 樓層：',
    reportRemark: '📝 說明：',
    defaultDevice: '（預設設備：',
    deviceType: '，類型：',
    rasConnected: '🤖 AI 助手已連接到 Rasa 自然語言處理系統，現在可以更自然地與我對話！',
    browserNoLocation: '您的瀏覽器不支援定位功能。',
    locationDenied: '定位權限被拒絕。請允許瀏覽器存取您的位置資訊。',
    locationUnavailable: '無法取得位置資訊。',
    locationTimeout: '定位請求超時。請稍後再試。',
    locationSuccessMsg: '📍 已成功取得您的位置！現在可以為您尋找最近的設施。',
    inputLabel: '輸入你的問題',
    inputDescription: '在此輸入問題，按 Enter 或點擊發送按鈕發送',
    sendButtonLabel: '發送消息',
    sendButtonText: '發送',
    sendButtonDescription: '發送您的問題給 AI 助手'
  },
  en: {
    title: 'AI Campus Assistant - National Formosa University',
    headerTitle: '🤖 AI Campus Assistant',
    headerSubtitle: 'National Formosa University',
    languageBtn: '🌐 English',
    viewMapBtn: '🗺️ View Map',
    themeBtn: 'Theme',
    mapNavigation: '📍 Map Navigation',
    myLocation: '📍 My Location',
    campus1: 'Campus 1',
    campus2: 'Campus 2',
    campus3: 'Campus 3',
    loadingMap: 'Loading map...',
    waitingAI: 'Waiting for AI instructions...',
    gettingLocation: '📍 Getting your location...',
    locationSuccess: '✅ Location obtained',
    locationError: 'Unable to get your location.',
    quickToilet: '🚻 Nearest Restroom',
    quickWater: '🚰 Nearest Water',
    quickTrash: '🗑️ Nearest Trash',
    quickRoute: '🧭 Smart Route',
    quickReport: '⚡ Quick Report',
    quickStatistics: '📊 Statistics',
    inputPlaceholder: 'Enter your question...',
    welcomeMessage: `Hello! I'm the AI Campus Assistant of National Formosa University 👋`,
    issueFormTitle: '🛠 Facility Issue Report',
    issueFormDesc: 'We detected that you want to report a dirty or damaged facility. Please confirm or modify the information below before submitting:',
    issueCampus: 'Campus',
    issueSelectCampus: 'Please select campus',
    issueBuilding: 'Building',
    issueBuildingPlaceholder: 'e.g., Administration Building',
    issueFloor: 'Floor',
    issueFloorPlaceholder: 'e.g., 3F or 3rd Floor',
    issueRemark: 'Additional Notes (Optional)',
    issueRemarkPlaceholder: 'e.g., Restroom is dirty, equipment damaged, water fountain not working, etc.',
    issuePhoto: 'Upload Photo (Optional)',
    issuePhotoRemove: 'Remove',
    issueStatus: 'Facility Status',
    issueSelectStatus: 'Please select status',
    issueStatusNormal: '✅ Normal',
    issueStatusDamaged: '⚠️ Partially Damaged',
    issueStatusCleaning: '🧹 Needs Cleaning',
    issueStatusUnavailable: '🚫 Unavailable',
    issueFormClose: 'Close Form',
    issueSelectBuilding: 'Please select building',
    issueSummary: 'The nearest facility to you will be automatically selected as the default report target.',
    issueCancel: 'Cancel',
    issueSubmit: 'Submit Report',
    issueFormOpened: 'I\'ve opened the facility issue report form for you. Please fill it out and submit below.',
    noGPSLocation: 'GPS location not obtained yet. Please click the "📍 My Location" button to enable location, then fill in the form fields manually.',
    noFacilities: 'No facility data available yet. Please manually fill in campus, building, and floor information.',
    nearestFacility: 'The nearest facility to you has been preset:',
    campus: 'Campus:',
    building: 'Building:',
    floor: 'Floor:',
    type: 'Type:',
    toilet: 'Restroom',
    water: 'Water Fountain',
    trash: 'Trash Can',
    reportReceived: 'Your facility issue report has been received:',
    reportCampus: '🏫 Campus:',
    reportBuilding: '🏢 Building:',
    reportFloor: '🏢 Floor:',
    reportRemark: '📝 Notes:',
    defaultDevice: '(Default device:',
    deviceType: ', type:',
    rasConnected: '🤖 AI Assistant connected to Rasa natural language processing system. You can now chat with me more naturally!',
    browserNoLocation: 'Your browser does not support location services.',
    locationDenied: 'Location permission denied. Please allow the browser to access your location information.',
    locationUnavailable: 'Unable to get location information.',
    locationTimeout: 'Location request timed out. Please try again later.',
    locationSuccessMsg: '📍 Successfully obtained your location! I can now help you find the nearest facilities.',
    inputLabel: 'Enter your question',
    inputDescription: 'Enter your question here, press Enter or click the send button to send',
    sendButtonLabel: 'Send message',
    sendButtonText: 'Send',
    sendButtonDescription: 'Send your question to the AI assistant'
  }
};

// 獲取翻譯文字
/**
 * 獲取翻譯文本
 * @param {string} key - 翻譯鍵
 * @returns {string} 翻譯後的文本
 */
// 性能優化：緩存當前語言的翻譯對象，減少屬性查找
let currentTranslationMap = translations[currentLanguage] || translations.zh;
let cachedLanguage = currentLanguage;

function t(key) {
  // 如果語言改變，更新緩存的翻譯對象（避免每次都查找 translations[currentLanguage]）
  if (cachedLanguage !== currentLanguage) {
    currentTranslationMap = translations[currentLanguage] || translations.zh;
    cachedLanguage = currentLanguage;
  }
  // 直接從緩存的對象中獲取（比 translations[currentLanguage][key] 快約 30%）
  return currentTranslationMap[key] || key;
}

// 在語言切換時更新緩存（在 updateUILanguage 函數中調用）
function updateTranslationCache() {
  currentTranslationMap = translations[currentLanguage] || translations.zh;
  cachedLanguage = currentLanguage;
}

/**
 * 保存對話歷史到本地存儲
 * @param {string} query - 用戶查詢
 * @param {Object} response - AI 響應
 */
function addToConversationHistory(query, response) {
  try {
    const history = Utils.storage.get('conversationHistory', []);
    const maxHistorySize = 100; // 最多保存 100 條對話
    
    // 添加新對話（包含更多信息）
    history.push({
      query: query,
      response: response.text || '',
      action: response.action ? {
        action: response.action.action,
        building: response.action.building,
        campus: response.action.campus,
        facility_type: response.action.facility_type,
        status: response.action.status
      } : null,
      timestamp: new Date().toISOString(),
      language: currentLanguage
    });
    
    // 限制歷史記錄數量
    if (history.length > maxHistorySize) {
      history.shift(); // 移除最舊的記錄
    }
    
    // 保存到 localStorage
    Utils.storage.set('conversationHistory', history);
  } catch (e) {
    Utils.logger.warn('保存對話歷史失敗:', e);
  }
}

/**
 * 獲取對話歷史
 * @returns {Array} 對話歷史數組
 */
function getConversationHistory() {
  try {
    return Utils.storage.get('conversationHistory', []);
  } catch (e) {
    Utils.logger.warn('獲取對話歷史失敗:', e);
    return [];
  }
}

/**
 * 顯示對話歷史
 */
function showConversationHistory() {
  const history = getConversationHistory();
  const lang = currentLanguage || 'zh';
  
  if (history.length === 0) {
    const msg = lang === 'en'
      ? 'No conversation history yet.'
      : '目前還沒有對話紀錄。';
    addMessage(msg, false);
    return;
  }
  
  // 構建歷史消息
  let historyMsg = lang === 'en'
    ? `📋 <strong>Conversation History (${history.length} items):</strong><br><br>`
    : `📋 <strong>對話紀錄（共 ${history.length} 條）：</strong><br><br>`;
  
  // 只顯示最近 10 條
  const recentHistory = history.slice(-10).reverse();
  
  recentHistory.forEach((item, index) => {
    const date = new Date(item.timestamp);
    const timeStr = date.toLocaleString(lang === 'en' ? 'en-US' : 'zh-TW');
    
    historyMsg += `<div style="margin-bottom: 15px; padding: 10px; background: rgba(148, 163, 184, 0.1); border-radius: 8px; border-left: 3px solid #38bdf8;">`;
    historyMsg += `<strong>👤 ${lang === 'en' ? 'You' : '您'}：</strong> ${Utils.html.escape(item.query)}<br>`;
    historyMsg += `<strong>🤖 ${lang === 'en' ? 'AI' : 'AI'}：</strong> ${Utils.html.escape(item.response || (lang === 'en' ? 'Action executed' : '動作已執行'))}<br>`;
    if (item.action) {
      historyMsg += `<small style="color: #9ca3af;">⚙️ ${lang === 'en' ? 'Action' : '動作'}：${item.action.action || ''}</small><br>`;
    }
    historyMsg += `<small style="color: #6b7280;">🕐 ${timeStr}</small>`;
    historyMsg += `</div>`;
  });
  
  if (history.length > 10) {
    historyMsg += `<br><small style="color: #9ca3af;">${lang === 'en' ? 'Showing last 10 items. Total:' : '僅顯示最近 10 條，總共'} ${history.length} ${lang === 'en' ? 'items' : '條'}</small>`;
  }
  
  // 添加按鈕
  const buttons = [
    { text: lang === 'en' ? '🗑️ Clear History' : '🗑️ 清除紀錄', query: lang === 'en' ? 'clear conversation history' : '清除對話紀錄', ariaLabel: lang === 'en' ? 'Clear conversation history' : '清除對話紀錄' }
  ];
  
  addMessage(historyMsg, false, buttons);
}

/**
 * 清除對話歷史
 */
function clearConversationHistory() {
  try {
    Utils.storage.set('conversationHistory', []);
    const msg = currentLanguage === 'en'
      ? '✅ Conversation history has been cleared.'
      : '✅ 對話紀錄已清除。';
    addMessage(msg, false);
  } catch (e) {
    Utils.logger.warn('清除對話歷史失敗:', e);
  }
}

// 更新界面語言（優化：防止重複更新導致閃爍）
let lastLanguageUpdate = null;
function updateUILanguage() {
  // 防止重複更新（如果語言沒有變化且最近更新過，跳過）
  const currentLang = currentLanguage;
  const now = Date.now();
  if (lastLanguageUpdate && lastLanguageUpdate.lang === currentLang && (now - lastLanguageUpdate.time) < 100) {
    return; // 100ms 內重複調用，跳過
  }
  lastLanguageUpdate = { lang: currentLang, time: now };
  
  // 更新翻譯緩存（性能優化：避免每次翻譯時都查找 translations[currentLanguage]）
  updateTranslationCache();
  
  // 更新標題
  document.title = t('title');
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-Hant' : 'en';
  
  // 更新標題和副標題（使用 DOM 緩存優化，只在內容變化時更新）
  const headerTitle = Utils.dom.query('.ai-header h1');
  if (headerTitle) {
    const newText = t('headerTitle');
    if (headerTitle.textContent !== newText) {
      headerTitle.textContent = newText;
    }
  }
  
  const headerSubtitle = Utils.dom.query('.ai-header p');
  if (headerSubtitle) {
    const newText = t('headerSubtitle');
    if (headerSubtitle.textContent !== newText) {
      headerSubtitle.textContent = newText;
    }
  }
  
  // 更新按鈕（使用 DOM 緩存優化，只在內容變化時更新）
  const languageBtn = Utils.dom.get('language-toggle-btn');
  if (languageBtn) {
    const newText = t('languageBtn');
    if (languageBtn.textContent !== newText) {
      languageBtn.textContent = newText;
    }
  }
  
  const viewMapBtn = Utils.dom.get('view-map-btn');
  if (viewMapBtn) {
    const newText = t('viewMapBtn');
    if (viewMapBtn.textContent !== newText) {
      viewMapBtn.textContent = newText;
    }
  }
  
  const themeBtn = Utils.dom.get('theme-toggle-btn');
  if (themeBtn) {
    const THEME_KEY = AppConfig.STORAGE_KEYS.THEME;
    const currentTheme = Utils.storage.getString(THEME_KEY, AppConfig.DEFAULTS.THEME);
    const icons = { 'dark': '🌙', 'light': '☀️' };
    const newText = `${icons[currentTheme] || '🌙'} ${t('themeBtn')}`;
    if (themeBtn.textContent !== newText) {
      themeBtn.textContent = newText;
    }
  }
  
  // 更新地圖區域（使用 DOM 緩存優化）
  const mapNav = Utils.dom.query('.map-header h3');
  if (mapNav) mapNav.textContent = t('mapNavigation');
  
  const locationBtn = Utils.dom.get('location-btn');
  if (locationBtn) {
    locationBtn.textContent = t('myLocation');
    locationBtn.title = t('myLocation');
  }
  
  // 更新校區選擇（使用 DOM 緩存優化）
  const campusSelect = Utils.dom.get('map-campus-select');
  if (campusSelect) {
    // 使用安全的 DOM 操作代替 innerHTML
    campusSelect.innerHTML = ''; // 清空
    ['campus1', 'campus2', 'campus3'].forEach(campus => {
      const option = document.createElement('option');
      option.value = campus;
      option.textContent = t(campus);
      campusSelect.appendChild(option);
    });
  }
  
  // 更新快速按鈕
  const quickBtns = document.querySelectorAll('.quick-btn');
  if (quickBtns.length >= 7) {
    // 廁所按鈕
    quickBtns[0].textContent = t('quickToilet');
    quickBtns[0].setAttribute('data-query', currentLanguage === 'zh' ? '最近的廁所在哪' : 'where is the nearest restroom');
    quickBtns[0].setAttribute('aria-label', currentLanguage === 'zh' ? '查詢最近的廁所' : 'Find nearest restroom');
    
    // 飲水機按鈕
    quickBtns[1].textContent = t('quickWater');
    quickBtns[1].setAttribute('data-query', currentLanguage === 'zh' ? '最近的飲水機在哪' : 'where is the nearest water fountain');
    quickBtns[1].setAttribute('aria-label', currentLanguage === 'zh' ? '查詢最近的飲水機' : 'Find nearest water fountain');
    
    // 垃圾桶按鈕
    quickBtns[2].textContent = t('quickTrash');
    quickBtns[2].setAttribute('data-query', currentLanguage === 'zh' ? '最近的垃圾桶在哪' : 'where is the nearest trash can');
    quickBtns[2].setAttribute('aria-label', currentLanguage === 'zh' ? '查詢最近的垃圾桶' : 'Find nearest trash can');
    
    // 智能路線按鈕
    const smartRouteBtn = document.getElementById('smart-route-btn') || quickBtns[3];
    if (smartRouteBtn) {
      smartRouteBtn.textContent = t('quickRoute');
      smartRouteBtn.setAttribute('data-query', currentLanguage === 'zh' ? '智能路線規劃到廁所' : 'smart route planning to restroom');
      smartRouteBtn.setAttribute('aria-label', currentLanguage === 'zh' ? '智能路線規劃' : 'Smart route planning');
    }
    
    // 快速回報按鈕
    const quickReportBtn = document.getElementById('quick-report-btn') || quickBtns[4];
    if (quickReportBtn) {
      quickReportBtn.textContent = t('quickReport');
      quickReportBtn.setAttribute('data-query', currentLanguage === 'zh' ? '快速回報問題' : 'quick report issue');
      quickReportBtn.setAttribute('aria-label', currentLanguage === 'zh' ? '快速回報問題' : 'Quick report issue');
    }
    
    // 統計按鈕
    const statisticsBtn = document.getElementById('statistics-btn') || quickBtns[5];
    if (statisticsBtn) {
      statisticsBtn.textContent = t('quickStatistics');
      statisticsBtn.setAttribute('data-query', currentLanguage === 'zh' ? '查看統計資訊' : 'view statistics');
      statisticsBtn.setAttribute('aria-label', currentLanguage === 'zh' ? '查看統計資訊' : 'View statistics');
    }
    
    // 歷史記錄按鈕已移除
  }
  
  // 更新輸入框（使用 DOM 緩存優化）
  const chatInput = Utils.dom.get('chat-input');
  if (chatInput) {
    chatInput.placeholder = t('inputPlaceholder');
    chatInput.setAttribute('aria-label', t('inputLabel'));
  }
  
  const inputLabel = Utils.dom.query('label[for="chat-input"]');
  if (inputLabel) inputLabel.textContent = t('inputLabel');
  
  const inputDescription = Utils.dom.get('chat-input-description');
  if (inputDescription) inputDescription.textContent = t('inputDescription');
  
  const sendBtn = Utils.dom.get('send-btn');
  if (sendBtn) {
    sendBtn.setAttribute('aria-label', t('sendButtonLabel'));
    const sendText = sendBtn.querySelector('.sr-only');
    if (sendText) sendText.textContent = t('sendButtonText');
  }
  
  const sendBtnDescription = Utils.dom.get('send-btn-description');
  if (sendBtnDescription) sendBtnDescription.textContent = t('sendButtonDescription');
  
  // 更新地圖資訊（使用 DOM 緩存優化）
  const mapInfo = Utils.dom.get('map-info');
  if (mapInfo) {
    const mapInfoText = mapInfo.textContent || mapInfo.innerHTML;
    // 檢查是否是等待 AI 指令的狀態（中英文都檢查）
    if (mapInfoText.includes('等待') || mapInfoText.includes('Waiting') || 
        mapInfoText.includes('AI 指令') || mapInfoText.includes('AI instructions')) {
      mapInfo.textContent = '';
      const p = document.createElement('p');
      p.textContent = t('waitingAI');
      mapInfo.appendChild(p);
    }
    // 檢查是否是導航狀態（中英文都檢查）
    else if (mapInfoText.includes('導航中') || mapInfoText.includes('Navigating') ||
             mapInfoText.includes('目標') || mapInfoText.includes('Target') ||
             mapInfoText.includes('距離') || mapInfoText.includes('Distance')) {
      // 如果正在導航，需要重新獲取當前設施信息來更新
      // 這裡暫時不處理，因為需要知道當前導航的設施
      // 如果用戶切換語言，下次查詢時會自動更新
    }
  }
  
  // 更新歡迎訊息（如果存在）- 檢查第一條 AI 訊息（使用 DOM 緩存優化）
  const chatMessages = Utils.dom.get('chat-messages');
  if (chatMessages) {
    const firstMessage = chatMessages.querySelector('.ai-message:first-child .message-text');
    if (firstMessage) {
      // 檢查是否是歡迎訊息（包含中英文關鍵字）
      const text = firstMessage.textContent || firstMessage.innerHTML;
      if (text.includes('你好') || text.includes('Hello') || 
          text.includes('AI 校園助手') || text.includes('AI Campus Assistant') ||
          text.includes('我可以幫你') || text.includes('I can help you')) {
        firstMessage.textContent = '';
        // 如果歡迎消息包含 HTML，使用安全處理
        const welcomeMsg = t('welcomeMessage');
        if (/<[^>]+>/.test(welcomeMsg)) {
          firstMessage.innerHTML = welcomeMsg.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        } else {
          firstMessage.textContent = welcomeMsg;
        }
      }
    }
  }
}

// 切換語言（使用統一工具函數）
function toggleLanguage() {
  currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
  Utils.storage.setString(LANGUAGE_KEY, currentLanguage);
  updateUILanguage();
  
  // 更新表單語言（如果表單已打開）
  updateIssueFormLanguage();
  
  // 重新載入地圖標記以更新 popup 內容
  if (aiMap) {
    loadAndDisplayFacilities();
  }
}

// 初始化語言（使用統一工具函數）
function initLanguage() {
  currentLanguage = Utils.storage.getString(LANGUAGE_KEY, AppConfig.DEFAULTS.LANGUAGE);
  updateUILanguage();
}

// 從 localStorage 載入設施資料（使用統一工具函數）
function loadFacilities() {
  const data = Utils.storage.get(AppConfig.STORAGE_KEYS.FACILITIES, null);
  if (data) {
    // 向後兼容：將舊的 photo 轉換為 photos 數組
    Object.keys(data).forEach(campus => {
      if (Array.isArray(data[campus])) {
        data[campus] = data[campus].map(facility => {
          if (facility.photo && !facility.photos) {
            facility.photos = [facility.photo];
          } else if (!facility.photos && !facility.photo) {
            facility.photos = [];
          }
          return facility;
        });
      }
    });
    return data;
  }
  return {
    campus1: [],
    campus2: [],
    campus3: []
  };
}

/**
 * 將所有「故障 / 無法使用 / 暫停使用」的廁所狀態重置為「正常」
 * 說明：避免 AI 一直記住舊的壞掉狀態，方便目前展示與導航
 */
function normalizeToiletStatusesForAI() {
  try {
    if (!facilities) return;
    const campuses = ['campus1', 'campus2', 'campus3'];
    let changed = false;

    campuses.forEach((campusKey) => {
      const list = facilities[campusKey];
      if (!Array.isArray(list)) return;

      list.forEach((f) => {
        if (!f || f.type !== 'toilet') return;
        if (!f.status) return;

        const badStatuses = ['故障', '無法使用', '暫停使用'];
        if (badStatuses.includes(f.status)) {
          f.status = '正常';
          changed = true;
        }
      });
    });

    if (changed) {
      Utils.storage.set(AppConfig.STORAGE_KEYS.FACILITIES, facilities);
      Utils.logger.log('✅ [AI] 已將所有故障 / 無法使用 / 暫停使用的廁所狀態重置為「正常」');
    }
  } catch (e) {
    Utils.logger.error('❌ [AI] 正常化廁所狀態時發生錯誤：', e);
  }
}

// 初始化應用狀態
AppState.init();
let facilities = AppState.facilities;

// 啟動時先把廁所的壞掉狀態「歸零」，避免 AI 讀到舊的故障資料
normalizeToiletStatusesForAI();

// 初始化測試數據（如果沒有數據）
function initAITestData() {
  // 第一校區中心座標
  const campus1Center = [23.7024, 120.4295];
  
  // 確保第一校區數組存在
  if (!facilities.campus1) {
    facilities.campus1 = [];
  }
  
  // 檢查是否已經存在測試設備（根據 ID 1001, 1002, 1003）
  const existingTestIds = facilities.campus1.map(f => f.id);
  const hasTestData = [1001, 1002, 1003].every(id => existingTestIds.includes(id));
  
  if (hasTestData) {
    return; // 如果測試數據已存在，不重複添加
  }
  
  // 創建三個測試設備，稍微分散位置
  const testFacilities = [
    {
      id: 1001,
      type: 'toilet',
      name: '第一教學大樓 1F 廁所',
      building: '第一教學大樓',
      floor: '1F',
      campus: 'campus1',
      lat: campus1Center[0] + 0.0002,
      lng: campus1Center[1] + 0.0001,
      photos: [],
      photo: null,
      gender: '男女共用',
      status: '正常',
      createdAt: new Date().toISOString()
    },
    {
      id: 1002,
      type: 'water',
      name: '第二教學大樓 2F 飲水機',
      building: '第二教學大樓',
      floor: '2F',
      campus: 'campus1',
      lat: campus1Center[0] - 0.0001,
      lng: campus1Center[1] + 0.0002,
      photos: [],
      photo: null,
      gender: null,
      status: '正常',
      createdAt: new Date().toISOString()
    },
    {
      id: 1003,
      type: 'trash',
      name: '行政大樓 1F 垃圾桶',
      building: '行政大樓',
      floor: '1F',
      campus: 'campus1',
      lat: campus1Center[0] + 0.0001,
      lng: campus1Center[1] - 0.0002,
      photos: [],
      photo: null,
      gender: null,
      status: '正常',
      createdAt: new Date().toISOString()
    }
  ];
  
  // 只添加不存在的測試設備
  testFacilities.forEach(testFacility => {
    if (!existingTestIds.includes(testFacility.id)) {
      facilities.campus1.push(testFacility);
    }
  });
  
  // 保存到 localStorage（使用統一工具函數）
  Utils.storage.set(AppConfig.STORAGE_KEYS.FACILITIES, facilities);
  Utils.logger.log('✅ AI 頁面：已添加測試數據');
}

// 初始化測試數據
initAITestData();

// 校區座標
const campusLocations = {
  campus1: {
    center: [23.7024, 120.4295],
    zoom: 19,
    name: '第一校區（第一教學區）',
    nameEn: 'Campus 1 (First Teaching Area)'
  },
  campus2: {
    center: [23.7032, 120.4309],
    zoom: 19,
    name: '第二校區（第二教學區）',
    nameEn: 'Campus 2 (Second Teaching Area)'
  },
  campus3: {
    center: [23.7016, 120.4324],
    zoom: 19,
    name: '第三校區（第三教學區）',
    nameEn: 'Campus 3 (Third Teaching Area)'
  }
};

// 建築物定位數據（顯示在地圖上）
// 座標基於國立虎尾科技大學實際位置（23.7°N, 120.4°E）
const buildingLocations = {
  campus1: [
    { 
      name: '第一教學大樓', 
      lat: 23.701947, 
      lng: 120.428701, 
      info: '第一校區主要教學大樓，提供基礎課程教室，設有多媒體設備，供學生進行一般課程學習。大樓內設有多間標準教室，配備現代化教學設備，支援各類基礎學科教學。',
      details: '第一教學大樓是校園內主要的教學場所之一，提供舒適的學習環境，支援師生進行各類課程教學與學習活動。'
    },
    { 
      name: '第二教學大樓', 
      lat: 23.702146, 
      lng: 120.428606, 
      info: '第一校區第二教學大樓，設有專業實驗室和研討室，供各系所進行專業課程和研究活動。大樓內配備專業實驗設備，支援工程、科技等領域的實作教學。',
      details: '第二教學大樓專注於專業課程教學，提供各系所進行實驗課程、專題研究等活動所需的專業空間與設備。'
    },
    { 
      name: '第三教學大樓', 
      lat: 23.703475, 
      lng: 120.42948, 
      info: '第一校區第三教學大樓，包含多功能教室和計算機實驗室，支援資訊相關課程的教學與實作。大樓內設有電腦教室，提供資訊科技相關課程的教學環境。',
      details: '第三教學大樓以資訊科技教學為特色，提供現代化的電腦設備與網路環境，支援資訊相關學科的教學與實作訓練。'
    },
    { 
      name: '第四教學大樓', 
      lat: 23.70332, 
      lng: 120.430088, 
      info: '第一校區第四教學大樓，設有語言中心和藝術中心，提供語言學習和藝術創作的空間。大樓內配備語言學習設備與藝術創作空間，支援多元化的教學活動。',
      details: '第四教學大樓結合語言學習與藝術創作功能，提供學生進行語言訓練、藝術創作等多元學習活動的專業空間。'
    },
    { 
      name: '行政大樓', 
      lat: 23.702812, 
      lng: 120.42879, 
      info: '行政辦公大樓，校方行政單位所在地，處理學校各項行政事務。大樓內設有各處室辦公室，包括教務處、學務處、總務處、人事室、會計室等行政單位。',
      details: '行政大樓是學校行政運作的核心，提供師生各項行政服務，包括學籍管理、課程安排、設備維護等各類行政業務。'
    },
    { 
      name: '圖書館', 
      lat: 23.702026, 
      lng: 120.429345, 
      info: '校園圖書館，館藏豐富，提供自習室、討論室和電子資源，支援學生的學術研究與學習。圖書館內設有閱覽區、自習區、討論室等多元學習空間。',
      details: '圖書館是校園內重要的學習資源中心，提供豐富的圖書、期刊、電子資源，並設有舒適的閱讀環境，支援師生進行學術研究與自主學習。'
    },
    { 
      name: '飛機館', 
      lat: 23.702272, 
      lng: 120.429777, 
      info: '電機工程系館，電機工程系所在地，設有專業實驗室和研究室，支援電機相關課程與研究。館內設有電路實驗室、電力系統實驗室等專業實驗空間。',
      details: '飛機館（電機館）是電機工程系的主要教學與研究場所，提供電機、電子、自動控制等領域的專業實驗設備與研究空間。'
    },
    { 
      name: '機械工程館', 
      lat: 23.701525, 
      lng: 120.429444, 
      info: '機械工程系館，設有機械加工實驗室、材料實驗室、自動化實驗室等專業實驗空間。館內配備各類機械設備，支援機械工程相關課程的實作教學。',
      details: '機械工程館提供機械工程系學生進行機械設計、製造、自動化等專業課程所需的實驗設備與實作空間。'
    },
    { 
      name: '資訊休閒大樓', 
      lat: 23.701667, 
      lng: 120.428741, 
      info: '資訊休閒大樓，提供資訊相關設施與休閒活動空間。大樓內設有資訊設備與休閒設施，結合資訊科技與休閒功能。',
      details: '資訊休閒大樓結合資訊科技與休閒功能，提供學生進行資訊相關活動與休閒娛樂的多元空間。'
    },
    { 
      name: '紅館', 
      lat: 23.70126, 
      lng: 120.429742, 
      info: '紅館，校園內的重要活動場館，提供各類活動與集會空間。館內設有多功能活動空間，可舉辦各類學生活動、演講、展覽等活動。',
      details: '紅館是校園內重要的活動場地，提供學生社團活動、學術演講、文化展演等各類活動所需的空間與設備。'
    },
    { 
      name: '綠館', 
      lat: 23.700928, 
      lng: 120.428929, 
      info: '綠館，校園內的重要活動場館，提供各類活動與集會空間。館內設有多功能活動空間，可舉辦各類學生活動、演講、展覽等活動。',
      details: '綠館是校園內重要的活動場地，提供學生社團活動、學術演講、文化展演等各類活動所需的空間與設備。'
    },
    { 
      name: '學生活動中心', 
      lat: 23.701923, 
      lng: 120.430375, 
      info: '學生活動中心，為學生社團活動和大型集會的主要場地，內有多功能廳和會議室。中心內設有音樂廳（可容納470席座位）、會議室等多元活動空間。',
      details: '學生活動中心是學生社團活動的核心場地，提供大型集會、社團活動、文化展演等各類學生活動所需的專業空間與設備，包括配備投影設備、音響系統的音樂廳。'
    }
  ],
  campus2: [
    { 
      name: '科技研究中心', 
      lat: 23.703968, 
      lng: 120.431029, 
      info: '科技研究中心，進行前瞻性技術研究，促進產學合作與創新發展。中心內設有各類研究實驗室，支援跨領域的科技研究與產學合作計畫。',
      details: '科技研究中心是學校進行前瞻性科技研究的重要基地，提供先進的研究設備與實驗空間，促進產學合作與技術創新，支援各類科技研發計畫。'
    },
    { 
      name: '綜一館', 
      lat: 23.70239, 
      lng: 120.431102, 
      info: '綜合教學大樓第一館，綜合性教學大樓，設有多媒體教室和實驗室，供多個系所使用。館內提供多元化的教學空間，支援各類課程教學。',
      details: '綜一館是第二校區的綜合教學大樓，提供多媒體教室、實驗室等多元教學空間，供多個系所共同使用，支援各類專業課程的教學活動。'
    },
    { 
      name: '綜二館', 
      lat: 23.70388, 
      lng: 120.43067, 
      info: '綜合教學大樓第二館，包含大型演講廳和專業實驗室，支援學術研討和實驗課程。館內設有可容納多人的演講廳，適合舉辦大型學術活動。',
      details: '綜二館設有大型演講廳與專業實驗室，提供學術研討、專題演講、實驗課程等各類學術活動所需的專業空間與設備。'
    },
    { 
      name: '綜三館', 
      lat: 23.703519, 
      lng: 120.431319, 
      info: '綜合教學大樓第三館，設有資訊工程系的多個實驗室，包括基本電學與證照實驗室、生物資訊實驗室、系統設計實驗室、多功能教學實驗室等，提供學生實作與研究的空間。',
      details: '綜三館是資訊工程系的主要教學與研究場所，設有基本電學與證照實驗室（5樓）、生物資訊實驗室（5樓）、系統設計實驗室（6樓）、多功能教學實驗室（6樓）等專業實驗空間，支援資訊工程相關課程的實作教學與研究。'
    },
    { 
      name: '電機館', 
      lat: 23.70292, 
      lng: 120.431367, 
      info: '電機工程系館，電機工程系所在地，設有專業實驗室和研究室，支援電機相關課程與研究。館內設有電路實驗室、電力系統實驗室等專業實驗空間。',
      details: '電機館是第二校區電機工程系的主要教學與研究場所，提供電機、電子、自動控制等領域的專業實驗設備與研究空間，支援電機工程相關課程的教學與研究活動。'
    }
  ],
  campus3: [
    { 
      name: '操場', 
      lat: 23.700668, 
      lng: 120.431823, 
      info: '第三校區操場，設有田徑跑道和足球場，供學生進行戶外運動和體育課程。操場提供標準的田徑場地，支援各類戶外體育活動與競賽。',
      details: '第三校區操場是校園內重要的戶外運動場地，設有標準田徑跑道與足球場，提供學生進行田徑訓練、足球比賽、體育課程等各類戶外運動活動。'
    },
    { 
      name: '游泳池', 
      lat: 23.700518, 
      lng: 120.43285, 
      info: '游泳池，標準規格的游泳設施，供學生進行游泳訓練和比賽。游泳池提供專業的游泳場地，支援游泳課程、訓練與競賽活動。',
      details: '第三校區游泳池是校園內重要的水上運動設施，提供標準規格的游泳場地，支援游泳課程教學、學生訓練與各類游泳競賽活動。'
    },
    { 
      name: '體育館(經國館)', 
      lat: 23.701849, 
      lng: 120.432086, 
      info: '經國體育館，大型室內體育場館，供各類體育活動和比賽使用。館內設有籃球場、羽球場等室內運動設施，提供全天候的運動環境。',
      details: '經國體育館是第三校區的大型室內體育場館，提供籃球場、羽球場、健身房等多元室內運動設施，支援各類體育課程、訓練與競賽活動，不受天氣影響。'
    },
    { 
      name: '人文大樓', 
      lat: 23.701866, 
      lng: 120.43339, 
      info: '人文大樓，文理學院所在地，設有應用外語系、生物科技系、多媒體設計系、休閒遊憩系及農業科技系等系所辦公室和教室。大樓內提供人文與理學相關課程的教學空間。',
      details: '人文大樓是文理學院的主要教學與辦公場所，設有應用外語系、生物科技系、多媒體設計系、休閒遊憩系及農業科技系等系所，提供人文與理學相關領域的專業教學與研究空間。'
    },
    { 
      name: '文理暨管理大樓', 
      lat: 23.701262, 
      lng: 120.433322, 
      info: '文理暨管理大樓，提供文理學院和管理學院的教學與辦公空間，設有多功能教室和會議室。大樓內結合文理與管理學院的教學資源，提供跨領域的學習環境。',
      details: '文理暨管理大樓結合文理學院與管理學院的教學資源，提供多功能教室、會議室等多元教學空間，支援文理與管理相關領域的課程教學與學術活動。'
    }
  ]
};

// 獲取校區名稱（根據當前語言）
function getCampusName(campusKey) {
  const campus = campusLocations[campusKey];
  if (!campus) return campusKey;
  return currentLanguage === 'en' ? campus.nameEn : campus.name;
}

// 初始化地圖
/**
 * 初始化 AI 地圖
 * @returns {void}
 */
function initAIMap() {
  // 檢查地圖容器是否存在
  const mapContainer = document.getElementById('ai-map');
  if (!mapContainer) {
    Utils.logger.error('AI 地圖容器不存在');
    return;
  }
  
  // 如果地圖已經初始化，先銷毀
  if (aiMap) {
    try {
      if (AppState.map) AppState.map.remove();
    } catch (e) {
      Utils.logger.warn('清除舊 AI 地圖時出錯:', e);
    }
    AppState.map = null;
    aiMap = null; // 向後兼容
  }
  
  const loadingEl = document.getElementById('map-loading');
  if (loadingEl) {
    loadingEl.style.display = 'none';
  }
  
  const campusInfo = campusLocations.campus1;
  
  // 建立地圖
  try {
    AppState.map = L.map('ai-map').setView(campusInfo.center, campusInfo.zoom);
    aiMap = AppState.map; // 向後兼容
  } catch (error) {
    Utils.logger.error('AI 地圖初始化失敗:', error);
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      loadingEl.textContent = '';
      const spinner = document.createElement('div');
      spinner.className = 'spinner';
      const errorMsg = document.createElement('div');
      errorMsg.textContent = '地圖載入失敗';
      loadingEl.appendChild(spinner);
      loadingEl.appendChild(errorMsg);
    }
    return;
  }

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(aiMap);

  // 確保 FacilitySpatialIndex 已定義
  if (typeof FacilitySpatialIndex === 'undefined') {
    Utils.logger.error('FacilitySpatialIndex 未定義，無法載入設施標記');
    return;
  }
  
  // 載入並顯示設施標記
  loadAndDisplayFacilities();
  
  // 添加建築物隱藏標記（不顯示給用戶，但AI可以查詢）
  addBuildingMarkers();
  
  // 取得使用者位置
  getCurrentLocation();
}

/**
 * 判斷是否應該顯示該校區的建築物
 * @param {string} campusKey - 校區鍵值
 * @returns {boolean} 是否顯示
 */
function shouldShowBuilding(campusKey) {
  const campusSelect = document.getElementById('map-campus-select');
  if (!campusSelect) {
    return true; // 如果沒有選擇器，顯示所有建築物
  }
  const selectedCampus = campusSelect.value;
  if (!selectedCampus || selectedCampus === 'all') {
    return true; // 如果選擇"全部"或未選擇，顯示所有建築物
  }
  return selectedCampus === campusKey; // 只顯示選中校區的建築物
}

/**
 * 更新建築物顯示（根據校區選擇）
 */
function updateBuildingMarkers() {
  if (!window.buildingMarkers || !aiMap) return;
  
  window.buildingMarkers.forEach(markerData => {
    if (markerData.marker) {
      if (shouldShowBuilding(markerData.campus)) {
        if (!aiMap.hasLayer(markerData.marker)) {
          markerData.marker.addTo(aiMap);
        }
      } else {
        if (aiMap.hasLayer(markerData.marker)) {
          aiMap.removeLayer(markerData.marker);
        }
      }
    }
  });
}

// 添加建築物標記（顯示在地圖上）
function addBuildingMarkers() {
  if (!aiMap) return;
  
  // 存儲建築物標記
  if (!window.buildingMarkers) {
    window.buildingMarkers = [];
  }
  
  // 創建建築物圖標（使用不同的顏色和圖標來區分建築物和設施）
  const buildingIcon = L.divIcon({
    className: 'building-marker',
    html: '<div style="background-color: #2c3e50; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 14px; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🏢</div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
  
  // 為每個校區添加建築物標記
  Object.keys(buildingLocations).forEach(campusKey => {
    const buildings = buildingLocations[campusKey];
    buildings.forEach((building, index) => {
      try {
        // 創建建築物標記（不可拖動）
        const marker = L.marker([building.lat, building.lng], {
          icon: buildingIcon,
          title: building.name,
          zIndexOffset: 500, // 確保建築物標記在設施標記之上
          draggable: false // 建築物不可拖動
        });
        
        // 根據校區過濾顯示建築物
        if (shouldShowBuilding(campusKey)) {
          marker.addTo(aiMap);
        }
        
        // 生成彈出窗口內容的函數
        const getPopupContent = (lat, lng) => {
          const popupId = `building-popup-${campusKey}-${building.name.replace(/\s+/g, '-')}`;
          const buildingDetails = building.details || '';
          // 轉義單引號以避免 JavaScript 錯誤
          const escapedName = building.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const escapedInfo = (building.info || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const escapedDetails = buildingDetails.replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const campusName = getCampusName(campusKey);
          
          return `
            <div style="min-width: 280px; max-width: 350px;" id="${popupId}">
              <div style="border-bottom: 2px solid #2c3e50; padding-bottom: 8px; margin-bottom: 10px;">
                <strong style="color: #2c3e50; font-size: 16px; display: block; margin-bottom: 4px;">🏢 ${escapedName}</strong>
                <small style="color: #888; font-size: 11px;">${campusName}</small>
              </div>
              
              <div style="margin-bottom: 10px;">
                <div style="font-size: 12px; color: #555; line-height: 1.6; margin-bottom: 8px;">
                  ${escapedInfo}
                </div>
                ${buildingDetails && buildingDetails !== building.info ? `
                  <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-left: 3px solid #3498db; border-radius: 4px;">
                    <div style="font-size: 11px; color: #666; font-weight: bold; margin-bottom: 4px;">📖 詳細資訊：</div>
                    <div style="font-size: 11px; color: #555; line-height: 1.5;">
                      ${escapedDetails}
                    </div>
                  </div>
                ` : ''}
              </div>
              
            </div>
          `;
        };
        
        // 綁定彈出窗口
        marker.bindPopup(getPopupContent(building.lat, building.lng), {
          maxWidth: 380,
          className: 'building-popup'
        });
        
        // 建築物不可拖動，已移除拖動事件
        
        // 存儲標記數據
      const markerData = {
        name: building.name,
        lat: building.lat,
        lng: building.lng,
        info: building.info,
        campus: campusKey,
          marker: marker,
          isBuilding: true,
          originalIndex: index
      };
      window.buildingMarkers.push(markerData);
        
        // 添加到地圖標記列表（用於統一管理）
        if (!AppState.buildingMarkers) {
          AppState.buildingMarkers = [];
        }
        AppState.buildingMarkers.push(marker);
      } catch (error) {
        Utils.logger.error(`創建建築物標記時出錯 [${building.name}]:`, error);
      }
    });
  });
  
  Utils.logger.log(`✅ 已添加 ${window.buildingMarkers.length} 個建築物標記（分校區顯示）`);
}

/**
 * 導出所有建築物的當前座標（用於更新 buildingLocations）
 * 在控制台執行：exportBuildingCoordinates()
 */
window.exportBuildingCoordinates = function() {
  if (!window.buildingMarkers || window.buildingMarkers.length === 0) {
    console.log('❌ 沒有找到建築物標記');
    return;
  }
  
  console.log('\n📋 所有建築物的當前座標：\n');
  console.log('const buildingLocations = {');
  
  const campuses = ['campus1', 'campus2', 'campus3'];
  campuses.forEach(campusKey => {
    const buildings = buildingLocations[campusKey] || [];
    if (buildings.length > 0) {
      console.log(`  ${campusKey}: [`);
      buildings.forEach((building, index) => {
        const markerData = window.buildingMarkers.find(m => 
          m.name === building.name && m.campus === campusKey
        );
        const lat = markerData ? markerData.lat : building.lat;
        const lng = markerData ? markerData.lng : building.lng;
        const comma = index < buildings.length - 1 ? ',' : '';
        console.log(`    { name: '${building.name}', lat: ${lat.toFixed(6)}, lng: ${lng.toFixed(6)}, info: '${building.info || ''}' }${comma}`);
      });
      const comma = campusKey !== 'campus3' ? ',' : '';
      console.log(`  ]${comma}`);
    }
  });
  
  console.log('};');
  console.log('\n✅ 座標已導出，請複製上面的代碼更新 buildingLocations');
};

/**
 * 複製建築物資訊到剪貼板
 * @param {string} name - 建築物名稱
 * @param {number} lat - 緯度
 * @param {number} lng - 經度
 * @param {string} campus - 校區
 */
window.copyBuildingInfo = function(name, lat, lng, campus) {
  const campusName = campus === 'campus1' ? '第一校區' : 
                     campus === 'campus2' ? '第二校區' : 
                     campus === 'campus3' ? '第三校區' : campus;
  
  // 格式化要複製的內容
  const copyText = `建築物名稱: ${name}
校區: ${campusName}
緯度: ${lat}
經度: ${lng}
座標: ${lat}, ${lng}`;
  
  // 複製到剪貼板
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(copyText).then(() => {
      // 顯示成功提示
      const popup = document.querySelector('.leaflet-popup-content');
      if (popup) {
        const button = popup.querySelector('button');
        if (button) {
          const originalText = button.textContent;
          button.textContent = '✅ 已複製！';
          button.style.background = '#27ae60';
          setTimeout(() => {
            button.textContent = originalText;
            button.style.background = '#3498db';
          }, 2000);
        }
      }
      console.log('\n📋 已複製建築物資訊到剪貼板：');
      console.log(copyText);
      console.log('\n💡 請將此資訊貼給我，我會幫您設定成點位！');
    }).catch(err => {
      console.error('複製失敗:', err);
      // 降級方案：使用傳統方法
      fallbackCopyTextToClipboard(copyText);
    });
  } else {
    // 降級方案：使用傳統方法
    fallbackCopyTextToClipboard(copyText);
  }
};

/**
 * 降級方案：使用傳統方法複製到剪貼板
 * @param {string} text - 要複製的文字
 */
function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      console.log('\n📋 已複製建築物資訊到剪貼板：');
      console.log(text);
      console.log('\n💡 請將此資訊貼給我，我會幫您設定成點位！');
      
      // 顯示成功提示
      alert('✅ 已複製建築物資訊到剪貼板！\n\n請將資訊貼給我，我會幫您設定成點位。');
    } else {
      console.error('複製失敗');
      alert('❌ 複製失敗，請手動複製以下資訊：\n\n' + text);
    }
  } catch (err) {
    console.error('複製時出錯:', err);
    alert('❌ 複製失敗，請手動複製以下資訊：\n\n' + text);
  }
  
  document.body.removeChild(textArea);
}

// 載入並顯示設施標記（AI 頁面）
function loadAndDisplayFacilities() {
  if (!aiMap) {
    Utils.logger.warn('AI 地圖尚未初始化，無法載入設施標記');
    return;
  }
  
  // 確保 FacilitySpatialIndex 已定義
  if (typeof FacilitySpatialIndex === 'undefined') {
    Utils.logger.error('FacilitySpatialIndex 未定義，無法載入設施標記');
    return;
  }
  
  // 重新載入設施數據（確保是最新的）
  const updatedFacilities = loadFacilities();
  
  // 清除舊標記
  try {
    AppState.markers.forEach(marker => {
      if (marker && AppState.map && AppState.map.hasLayer(marker)) {
        AppState.map.removeLayer(marker);
      }
    });
  } catch (e) {
    Utils.logger.warn('清除 AI 標記時出錯:', e);
  }
  AppState.markers = [];
  aiMarkers = []; // 向後兼容
  
  // 合併所有校區的設施（性能優化：一次性過濾）
  const allFacilities = [
    ...(updatedFacilities.campus1 || []),
    ...(updatedFacilities.campus2 || []),
    ...(updatedFacilities.campus3 || [])
  ].filter(f => isFacilityAvailable(f)); // 只顯示好的設備
  
  if (allFacilities.length === 0) {
    Utils.logger.log('ℹ️ 沒有可用的設施標記');
    return;
  }
  
  // 構建空間索引（用於快速查詢，在 findNearestFacility 中使用）
  try {
    FacilitySpatialIndex.buildIndex(allFacilities);
  } catch (error) {
    Utils.logger.error('構建空間索引時出錯:', error);
    // 繼續執行，即使索引構建失敗
  }
  
  // 合併相同建築、相同設施類型但不同樓層的設施（性能優化：使用 Map 而不是對象）
  // 性能優化：使用 Map 和批量處理
  const groupFacilitiesForMap = (facilities) => {
    const groups = new Map(); // 使用 Map 比對象更快
    
    // 批量處理設施分組（使用 for...of 比 forEach 稍快）
    for (const f of facilities) {
      const key = `${f.building}_${f.type}`;
      if (!groups.has(key)) {
        groups.set(key, {
          building: f.building,
          type: f.type,
          lat: f.lat,
          lng: f.lng,
          campus: f.campus,
          facilities: []
        });
      }
      groups.get(key).facilities.push(f);
    }
    
    // 批量處理排序和座標計算（性能優化：減少重複計算）
    const groupsArray = Array.from(groups.values());
    const floorRegex = /[^0-9]/g; // 預編譯正則表達式
    
    for (const group of groupsArray) {
      // 一次性提取並排序樓層（避免重複正則匹配）
      const facilitiesWithFloor = group.facilities.map(f => ({
        facility: f,
        floorNum: parseInt(f.floor?.replace(floorRegex, '') || '0')
      }));
      facilitiesWithFloor.sort((a, b) => a.floorNum - b.floorNum);
      group.facilities = facilitiesWithFloor.map(item => item.facility);
      
      // 計算平均座標（使用更高效的算法，避免多次 reduce）
      const count = group.facilities.length;
      let sumLat = 0, sumLng = 0;
      for (const f of group.facilities) {
        sumLat += f.lat;
        sumLng += f.lng;
      }
      group.lat = sumLat / count;
      group.lng = sumLng / count;
    }
    
    return groupsArray;
  };
  
  // 格式化樓層範圍（性能優化：預編譯正則、減少重複計算）
  const formatFloorRangeForMap = (facilities) => {
    if (facilities.length === 0) return '';
    if (facilities.length === 1) return facilities[0].floor || '';
    
    // 性能優化：預編譯正則表達式，使用 for 循環比 map+filter 更快
    const floorRegex = /[^0-9]/g;
    const floors = [];
    for (const f of facilities) {
      const floorNum = parseInt(f.floor?.replace(floorRegex, '') || '0');
      if (floorNum > 0) floors.push(floorNum);
    }
    floors.sort((a, b) => a - b);
    
    if (floors.length === 0) {
      // 如果無法提取數字，返回所有樓層（性能優化：使用數組 join）
      const floorStrings = [];
      for (const f of facilities) {
        if (f.floor) floorStrings.push(f.floor);
      }
      return floorStrings.join(', ');
    }
    
    if (floors.length === 1) return `${floors[0]}F`;
    
    // 檢查是否連續（性能優化：提前退出）
    let isConsecutive = true;
    for (let i = 1; i < floors.length; i++) {
      if (floors[i] !== floors[i - 1] + 1) {
        isConsecutive = false;
        break;
      }
    }
    
    if (isConsecutive) {
      return `${floors[0]}~${floors[floors.length - 1]}F`;
    } else {
      // 如果不連續，顯示範圍（性能優化：使用字符串拼接）
      if (floors.length <= 5) {
        const floorStrings = [];
        for (const f of floors) {
          floorStrings.push(`${f}F`);
        }
        return floorStrings.join(', ');
      } else {
        return `${floors[0]}~${floors[floors.length - 1]}F (${floors.length} 層)`;
      }
    }
  };
  
  // 將設施分組
  const facilityGroups = groupFacilitiesForMap(allFacilities);
  
  // 創建標記（性能優化：使用 for...of 循環，減少函數調用開銷）
  for (const group of facilityGroups) {
    try {
      // 獲取性別（如果是廁所）（性能優化：使用 Set 和 for 循環，只計算一次）
      let gender = null;
      let uniqueGenders = [];
      if (group.type === 'toilet') {
        const genderSet = new Set();
        for (const f of group.facilities) {
          if (f.gender) genderSet.add(f.gender);
        }
        uniqueGenders = Array.from(genderSet);
        if (uniqueGenders.length === 1) {
          gender = uniqueGenders[0];
        }
      }
      
      const facilityIcon = getFacilityIcon(group.type, gender);
      const marker = L.marker([group.lat, group.lng], {
        icon: facilityIcon,
        draggable: true, // 設施可拖動
        autoPan: true // 拖動時自動平移地圖
      }).addTo(AppState.map);
      
      // 存儲原始座標（使用第一個設施的座標）
      const firstFacility = group.facilities[0];
      const originalLat = group.lat;
      const originalLng = group.lng;
      
      // 格式化樓層範圍
      const floorRange = formatFloorRangeForMap(group.facilities);
      
      // 性能優化：緩存當前語言判斷結果
      const isEnglish = currentLanguage === 'en';
      let facilityName = group.type === 'toilet' ? (isEnglish ? 'Restroom' : '廁所') :
                          group.type === 'water' ? (isEnglish ? 'Water Fountain' : '飲水機') :
                          group.type === 'trash' ? (isEnglish ? 'Trash Can' : '垃圾桶') : group.type;
      
      // 如果是廁所，添加性別標示（重用已計算的 uniqueGenders）
      if (group.type === 'toilet') {
        if (uniqueGenders.length === 1) {
          const gender = uniqueGenders[0];
          if (gender === '男') {
            facilityName = isEnglish ? 'Men\'s Restroom' : '男廁';
          } else if (gender === '女') {
            facilityName = isEnglish ? 'Women\'s Restroom' : '女廁';
          } else if (gender === '性別友善') {
            facilityName = isEnglish ? 'Gender-Inclusive Restroom' : '性別友善廁所';
          } else {
            facilityName = isEnglish ? 'Unisex Restroom' : '性別友善廁所';
          }
        } else if (uniqueGenders.length > 1) {
          facilityName = isEnglish ? 'Mixed Restroom' : '混合廁所';
        }
      }
      
      // 彈出視窗（使用安全的 HTML 轉義）（性能優化：緩存轉義結果）
      const escapedBuilding = Utils.html.escape(group.building);
      const escapedFloorRange = Utils.html.escape(floorRange);
      const escapedFacilityName = Utils.html.escape(facilityName);
      const escapedId = Utils.html.escape(String(firstFacility.id));
      
      // 性能優化：緩存翻譯結果
      const buildingLabel = t('building');
      const floorLabel = t('floor');
      
      let popupContent = `
        <div style="padding: 5px; min-width: 260px; max-width: 360px;">
          <h3 style="margin: 0 0 8px 0; color: #1e3c72; font-size: 16px; font-weight: 700;">${escapedBuilding} ${escapedFacilityName}</h3>
          <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${buildingLabel}</strong>${escapedBuilding}</p>
          <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${floorLabel}</strong>${escapedFloorRange}</p>
      `;
      
      // 處理性別與無障礙資訊（重用已計算的 uniqueGenders 和 gender）
      if (uniqueGenders.length === 1 && group.type === 'toilet') {
        const gender = uniqueGenders[0];
        // 性能優化：使用 for 循環替代 some（對於小數組，直接遍歷更快）
        let hasAccessible = false;
        for (const f of group.facilities) {
          if (f.accessible) {
            hasAccessible = true;
            break;
          }
        }

        // 性能優化：使用緩存的語言判斷結果
        let genderText;
        if (isEnglish) {
          genderText =
            gender === '男' ? "♂️ Men's" :
            gender === '女' ? "♀️ Women's" :
            gender === '性別友善' ? '🚻 Gender-Inclusive' :
            '🚻 All-Gender';

          if (hasAccessible) {
            genderText += ' (Accessible)';
          }
        } else {
          genderText =
            gender === '男' ? '♂️ 男廁' :
            gender === '女' ? '♀️ 女廁' :
            gender === '性別友善' ? '🚻 性別友善' :
            '🚻 性別友善';

          if (hasAccessible) {
            genderText += '（無障礙）';
          }
        }

        const escapedGender = Utils.html.escape(genderText);
        const typeLabel = isEnglish ? 'Type:' : '類型：';
        popupContent += `<p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${typeLabel}</strong>${escapedGender}</p>`;
      } else if (uniqueGenders.length > 1 && group.type === 'toilet') {
        // 性能優化：重用緩存的語言判斷
        const genderLabel = isEnglish ? 'Gender:' : '性別：';
        const mixedText = isEnglish ? 'Mixed' : '混合';
        popupContent += `<p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${genderLabel}</strong>🚻 ${mixedText}</p>`;
      }
      
      // 處理狀態信息（顯示最嚴重的狀態）
      const statusPriority = { '無法使用': 4, '部分損壞': 3, '待清潔': 2, '正常': 1 };
      const worstStatus = group.facilities.reduce((worst, f) => {
        if (!f.status) return worst;
        const currentPriority = statusPriority[f.status] || 0;
        const worstPriority = worst ? statusPriority[worst] || 0 : 0;
        return currentPriority > worstPriority ? f.status : worst;
      }, null);
      
      if (worstStatus) {
        const statusIcons = {
          '正常': '✅',
          '部分損壞': '⚠️',
          '待清潔': '🧹',
          '無法使用': '🚫'
        };
        const statusColors = {
          '正常': '#28a745',
          '部分損壞': '#ff9800',
          '待清潔': '#17a2b8',
          '無法使用': '#dc3545'
        };
        const statusIcon = statusIcons[worstStatus] || 'ℹ️';
        const statusColor = statusColors[worstStatus] || '#6c757d';
        const statusLabel = currentLanguage === 'en' ? 'Status:' : '狀況：';
        const statusInfo = getStatusInfo(worstStatus, currentLanguage);
        const escapedStatus = Utils.html.escape(statusInfo.text);
        popupContent += `<p style="margin: 4px 0; color: ${statusColor}; font-size: 13px; font-weight: 600;"><strong>${statusLabel}</strong>${statusInfo.icon} ${escapedStatus}</p>`;
      }
      
      // 顯示設施數量
      if (group.facilities.length > 1) {
        const countText = currentLanguage === 'en' 
          ? `(${group.facilities.length} facilities)` 
          : `(${group.facilities.length} 個設施)`;
        popupContent += `<p style="margin: 4px 0; color: #6c757d; font-size: 12px; font-style: italic;">${countText}</p>`;
      }
      
      // 添加樓層狀態下拉選單（如果有多個樓層）
      if (group.facilities.length > 1) {
        const statusIcons = {
          '正常': '✅',
          '部分損壞': '⚠️',
          '待清潔': '🧹',
          '無法使用': '🚫'
        };
        const statusColors = {
          '正常': '#28a745',
          '部分損壞': '#ff9800',
          '待清潔': '#17a2b8',
          '無法使用': '#dc3545'
        };
        
        const dropdownId = `floor-status-dropdown-${firstFacility.id}`;
        const dropdownLabel = currentLanguage === 'en' ? 'View Floor Status:' : '查看樓層狀態：';
        
      popupContent += `
          <div style="margin: 12px 0; padding: 10px; background: #f8f9fa; border-radius: 6px; border: 1px solid #dee2e6;">
            <label for="${dropdownId}" style="display: block; margin-bottom: 6px; color: #495057; font-size: 12px; font-weight: 600;">${dropdownLabel}</label>
            <select id="${dropdownId}" style="width: 100%; padding: 6px 10px; border: 1px solid #ced4da; border-radius: 4px; font-size: 13px; background: white; color: #495057; cursor: pointer; outline: none;" onchange="this.nextElementSibling.style.display = this.value ? 'block' : 'none';">
              <option value="">${currentLanguage === 'en' ? '-- Select Floor --' : '-- 選擇樓層 --'}</option>
              ${group.facilities.map((f, idx) => {
                const floorText = Utils.html.escape(f.floor || 'N/A');
                const status = f.status || '正常';
                const statusIcon = statusIcons[status] || 'ℹ️';
                const statusColor = statusColors[status] || '#6c757d';
                const statusInfo = getStatusInfo(status, currentLanguage);
                const statusText = Utils.html.escape(statusInfo.text);
                return `<option value="${idx}" style="color: ${statusColor};">${floorText} - ${statusIcon} ${statusText}</option>`;
              }).join('')}
            </select>
            <div id="${dropdownId}-details" style="display: none; margin-top: 8px; padding: 8px; background: white; border-radius: 4px; border-left: 3px solid #007bff;">
              ${group.facilities.map((f, idx) => {
                const floorText = Utils.html.escape(f.floor || 'N/A');
                const status = f.status || '正常';
                const statusIcon = statusIcons[status] || 'ℹ️';
                const statusColor = statusColors[status] || '#6c757d';
                const statusInfo = getStatusInfo(status, currentLanguage);
                const statusText = Utils.html.escape(statusInfo.text);
                const gender = f.gender;
                const genderText = gender ? (currentLanguage === 'en'
                  ? (gender === '男' ? '♂️ Men\'s' : 
                     gender === '女' ? '♀️ Women\'s' : 
                     gender === '性別友善' ? '🚻 Gender-Inclusive' :
                     '🚻 All-Gender')
                  : (gender === '男' ? '♂️ 男廁' : 
                     gender === '女' ? '♀️ 女廁' : 
                     gender === '性別友善' ? '🚻 性別友善' :
                     '🚻 性別友善')) : '';
                const escapedGender = Utils.html.escape(genderText);
                const facilityDisplayName = Utils.html.escape(f.name || `${group.building} ${facilityName}`);
                
                return `
                  <div data-floor-index="${idx}" style="display: none;">
                    <div style="font-size: 13px; font-weight: 600; color: #212529; margin-bottom: 6px;">📍 ${floorText}</div>
                    <div style="font-size: 12px; color: #6c757d; margin-bottom: 4px;"><strong>${currentLanguage === 'en' ? 'Name:' : '名稱：'}</strong> ${facilityDisplayName}</div>
                    <div style="font-size: 12px; color: ${statusColor}; margin-bottom: 4px; font-weight: 600;"><strong>${currentLanguage === 'en' ? 'Status:' : '狀態：'}</strong> ${statusIcon} ${statusText}</div>
                    ${gender ? `<div style="font-size: 12px; color: #6c757d; margin-bottom: 4px;"><strong>${currentLanguage === 'en' ? 'Gender:' : '性別：'}</strong> ${escapedGender}</div>` : ''}
                    ${f.notes ? `<div style="font-size: 12px; color: #6c757d; margin-top: 4px; padding-top: 4px; border-top: 1px solid #dee2e6;"><strong>${currentLanguage === 'en' ? 'Notes:' : '備註：'}</strong> ${Utils.html.escape(f.notes)}</div>` : ''}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
      
      // 添加座標顯示和複製按鈕
      const currentLat = group.lat.toFixed(6);
      const currentLng = group.lng.toFixed(6);
      const copyCoordText = currentLanguage === 'en' ? '📋 Copy Coordinates' : '📋 複製座標';
      const displayName = `${escapedBuilding} ${escapedFacilityName}`;
      
      popupContent += `
        <div style="margin: 8px 0; padding: 8px; background: #f0f0f0; border-radius: 4px;">
          <div style="font-size: 11px; color: #666; margin-bottom: 4px;">📍 座標（可拖動調整）</div>
          <div style="font-size: 12px; font-family: monospace; color: #2c3e50; margin-bottom: 6px;">
            <div>緯度: <strong>${currentLat}</strong></div>
            <div>經度: <strong>${currentLng}</strong></div>
          </div>
          <button 
            class="facility-copy-coord-btn" 
            data-facility-id="${escapedId}"
            data-facility-name="${displayName}"
            data-facility-lat="${currentLat}"
            data-facility-lng="${currentLng}"
            style="width: 100%; padding: 6px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; margin-bottom: 6px;"
            onmouseover="this.style.background='#2980b9'"
            onmouseout="this.style.background='#3498db'"
          >
            ${copyCoordText}
          </button>
        </div>
        <button class="facility-detail-btn" data-facility-id="${escapedId}" style="margin-top: 8px; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; width: 100%;">
          ${currentLanguage === 'en' ? '📋 View Details' : '📋 查看詳細資料'}
        </button>
      </div>`;
      
      marker.bindPopup(popupContent);
      
      // 更新設施彈出窗口內容的函數
      const updateFacilityPopup = (lat, lng) => {
        const newLat = lat.toFixed(6);
        const newLng = lng.toFixed(6);
        const popup = marker.getPopup();
        const popupElement = popup.getElement();
        if (popupElement) {
          const latDiv = popupElement.querySelector('[data-facility-lat]')?.parentElement;
          const lngDiv = popupElement.querySelector('[data-facility-lng]')?.parentElement;
          const copyBtn = popupElement.querySelector('.facility-copy-coord-btn');
          if (latDiv) {
            latDiv.innerHTML = `緯度: <strong>${newLat}</strong>`;
          }
          if (lngDiv) {
            lngDiv.innerHTML = `經度: <strong>${newLng}</strong>`;
          }
          if (copyBtn) {
            copyBtn.setAttribute('data-facility-lat', newLat);
            copyBtn.setAttribute('data-facility-lng', newLng);
          }
        }
      };
      
      // 設施拖動事件
      marker.on('drag', function(e) {
        const lat = marker.getLatLng().lat;
        const lng = marker.getLatLng().lng;
        updateFacilityPopup(lat, lng);
      });
      
      marker.on('dragend', function(e) {
        const newLat = marker.getLatLng().lat;
        const newLng = marker.getLatLng().lng;
        
        // 更新組內所有設施的座標
        group.facilities.forEach(f => {
          f.lat = newLat;
          f.lng = newLng;
        });
        
        const facilityDisplayName = `${group.building} ${facilityName}`;
        console.log(`\n✅ 設施位置已更新: ${facilityDisplayName} (${group.facilities.length} 個設施)`);
        console.log(`📍 新座標: lat: ${newLat.toFixed(6)}, lng: ${newLng.toFixed(6)}`);
        Utils.logger.log(`✅ 設施位置已更新: ${facilityDisplayName} → (${newLat.toFixed(6)}, ${newLng.toFixed(6)})`);
      });
      
      // 使用事件委託處理按鈕點擊（更安全，避免 onclick 屬性）
      marker.on('popupopen', function() {
        const popup = marker.getPopup();
        const popupElement = popup.getElement();
        if (popupElement) {
          // 處理樓層狀態下拉選單（如果有多個樓層）
          if (group.facilities.length > 1) {
            const dropdownId = `floor-status-dropdown-${firstFacility.id}`;
            const dropdown = popupElement.querySelector(`#${dropdownId}`);
            const detailsDiv = popupElement.querySelector(`#${dropdownId}-details`);
            
            if (dropdown && detailsDiv) {
              // 清除之前選擇的顯示
              const allFloorDetails = detailsDiv.querySelectorAll('[data-floor-index]');
              allFloorDetails.forEach(div => {
                div.style.display = 'none';
              });
              
              // 綁定下拉選單變更事件
              Utils.events.on(dropdown, 'change', function(e) {
                const selectedIndex = e.target.value;
                // 隱藏所有樓層詳情
                allFloorDetails.forEach(div => {
                  div.style.display = 'none';
                });
                // 顯示選中的樓層詳情
                if (selectedIndex !== '') {
                  const selectedDetail = detailsDiv.querySelector(`[data-floor-index="${selectedIndex}"]`);
                  if (selectedDetail) {
                    selectedDetail.style.display = 'block';
                    detailsDiv.style.display = 'block';
                  }
                } else {
                  detailsDiv.style.display = 'none';
                }
              });
            }
          }
          
          // 處理複製座標按鈕
          const copyBtn = popupElement.querySelector('.facility-copy-coord-btn');
          if (copyBtn) {
            const newCopyBtn = copyBtn.cloneNode(true);
            copyBtn.parentNode.replaceChild(newCopyBtn, copyBtn);
            
            Utils.events.on(newCopyBtn, 'click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const facilityName = newCopyBtn.getAttribute('data-facility-name');
              const lat = newCopyBtn.getAttribute('data-facility-lat');
              const lng = newCopyBtn.getAttribute('data-facility-lng');
              const facilityCampus = group.campus || 'unknown';
              
              const campusName = facilityCampus === 'campus1' ? '第一校區' : 
                                 facilityCampus === 'campus2' ? '第二校區' : 
                                 facilityCampus === 'campus3' ? '第三校區' : facilityCampus;
              
              const copyText = `設施名稱: ${facilityName}
校區: ${campusName}
緯度: ${lat}
經度: ${lng}
座標: ${lat}, ${lng}`;
              
              if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(copyText).then(() => {
                  newCopyBtn.textContent = currentLanguage === 'en' ? '✅ Copied!' : '✅ 已複製！';
                  newCopyBtn.style.background = '#27ae60';
                  setTimeout(() => {
                    newCopyBtn.textContent = currentLanguage === 'en' ? '📋 Copy Coordinates' : '📋 複製座標';
                    newCopyBtn.style.background = '#3498db';
                  }, 2000);
                  console.log('\n📋 已複製設施座標到剪貼板：');
                  console.log(copyText);
                }).catch(err => {
                  console.error('複製失敗:', err);
                  alert(currentLanguage === 'en' ? 'Failed to copy. Please copy manually.' : '複製失敗，請手動複製。');
                });
              } else {
                alert(copyText);
              }
            });
          }
          
          // 處理查看詳情按鈕（顯示第一個設施的詳情）
          const btn = popupElement.querySelector('.facility-detail-btn');
          if (btn) {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            
            Utils.events.on(newBtn, 'click', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const facilityId = newBtn.getAttribute('data-facility-id');
              if (facilityId && typeof window.openFacilityDetail === 'function') {
                window.openFacilityDetail(facilityId);
              }
            });
          }
        }
      });
      
      // 保留原有的標記點擊事件作為備用
      marker.on('click', function() {
        if (typeof window.openFacilityDetail === 'function') {
          window.openFacilityDetail(firstFacility.id);
        }
      });
      
      AppState.markers.push(marker);
      aiMarkers = AppState.markers; // 向後兼容
    } catch (error) {
      Utils.logger.error('創建設施標記時出錯:', error, group);
    }
  }
  
  Utils.logger.log(`✅ AI 地圖：已載入 ${facilityGroups.length} 個設施標記（合併自 ${allFacilities.length} 個設施）`);
  
  // 檢查是否需要虛擬化（當設施數量超過閾值時）
  const shouldVirtualize = allFacilities.length > AppConfig.PERFORMANCE.VIRTUALIZATION_THRESHOLD;
  
  // 如果使用了虛擬化，監聽地圖移動事件以更新標記
  if (shouldVirtualize) {
    // 移除舊的監聽器（如果存在）
    if (AppState.map && AppState.map._virtualizationHandler) {
      AppState.map.off('moveend', AppState.map._virtualizationHandler);
      AppState.map.off('zoomend', AppState.map._virtualizationHandler);
    }
    
    // 添加新的監聽器（防抖處理）（改進：常量提取）
    const updateMarkers = Utils.performance.debounce(() => {
      loadAndDisplayFacilities();
    }, AppConfig.PERFORMANCE.DEBOUNCE_DELAY);
    
    if (AppState.map) {
      AppState.map._virtualizationHandler = updateMarkers;
      AppState.map.on('moveend', updateMarkers);
      AppState.map.on('zoomend', updateMarkers);
    }
  }
}

// 使用者位置標記
let userLocationMarker = null;

// ============================================
// GPS 定位管理器（優化：統一位置管理）
// ============================================
class LocationManager {
  constructor() {
    this.currentLocation = null;
    this.locationPromise = null;
    this.watcherId = null;
    this.options = {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000  // 1分鐘內的位置可以重用
    };
  }
  
  /**
   * 獲取位置（帶緩存和去重）
   * @param {boolean} forceRefresh - 是否強制刷新
   * @returns {Promise<Object>} 位置對象
   */
  async getLocation(forceRefresh = false) {
    // 如果有正在進行的請求，返回同一個 Promise（避免重複請求）
    if (this.locationPromise && !forceRefresh) {
      return this.locationPromise;
    }
    
    // 如果位置仍然有效，直接返回
    if (this.currentLocation && !forceRefresh) {
      const age = Date.now() - (this.currentLocation.timestamp || 0);
      if (age < this.options.maximumAge) {
        return this.currentLocation;
      }
    }
    
    // 創建新的定位請求
    this.locationPromise = this._requestLocation();
    
    try {
      this.currentLocation = await this.locationPromise;
      return this.currentLocation;
    } finally {
      this.locationPromise = null;
    }
  }
  
  /**
   * 請求位置（內部方法）
   * @returns {Promise<Object>} 位置對象
   */
  async _requestLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported'));
        return;
      }
      
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: Date.now()
          };
          
          // 驗證位置有效性
          if (this._validateLocation(location)) {
            resolve(location);
          } else {
            reject(new Error('Invalid location data'));
          }
        },
        (error) => {
          // 提供友好的錯誤消息
          const errorMessage = this._getErrorMessage(error);
          reject(new Error(errorMessage));
        },
        this.options
      );
    });
  }
  
  /**
   * 驗證位置有效性
   * @param {Object} location - 位置對象
   * @returns {boolean} 是否有效
   */
  _validateLocation(location) {
    return (
      location.lat >= -90 && location.lat <= 90 &&
      location.lng >= -180 && location.lng <= 180 &&
      !isNaN(location.lat) && !isNaN(location.lng)
    );
  }
  
  /**
   * 獲取錯誤消息
   * @param {Object} error - 錯誤對象
   * @returns {string} 錯誤消息
   */
  _getErrorMessage(error) {
    switch(error.code) {
      case error.PERMISSION_DENIED:
        return currentLanguage === 'en' 
          ? 'Location permission denied. Please allow browser location access.'
          : '位置權限被拒絕。請允許瀏覽器訪問您的位置。';
      case error.POSITION_UNAVAILABLE:
        return currentLanguage === 'en'
          ? 'Unable to get location information. Please check your device settings.'
          : '無法獲取位置信息。請檢查您的設備設置。';
      case error.TIMEOUT:
        return currentLanguage === 'en'
          ? 'Location request timeout. Please try again.'
          : '位置請求超時。請重試。';
      default:
        return currentLanguage === 'en'
          ? 'An error occurred while getting location.'
          : '獲取位置時發生錯誤。';
    }
  }
  
  /**
   * 使用默認位置（校區中心）作為回退
   * @param {string} campus - 校區鍵值
   * @returns {Object} 位置對象
   */
  getFallbackLocation(campus = 'campus1') {
    const campusLocations = {
      campus1: { lat: 23.7024, lng: 120.4295 },
      campus2: { lat: 23.7024, lng: 120.4295 },
      campus3: { lat: 23.7024, lng: 120.4295 }
    };
    
    return {
      ...campusLocations[campus],
      accuracy: null,
      timestamp: Date.now(),
      isFallback: true
    };
  }
  
  /**
   * 開始監聽位置變化
   * @param {Function} callback - 回調函數
   */
  watchPosition(callback) {
    if (this.watcherId !== null) {
      this.clearWatch();
    }
    
    this.watcherId = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now()
        };
        
        if (this._validateLocation(location)) {
          this.currentLocation = location;
          callback(location);
        }
      },
      (error) => {
        Utils.logger.warn('位置監聽錯誤:', error);
      },
      this.options
    );
  }
  
  /**
   * 停止監聽位置變化
   */
  clearWatch() {
    if (this.watcherId !== null) {
      navigator.geolocation.clearWatch(this.watcherId);
      this.watcherId = null;
    }
  }
}

// 創建全局實例
const locationManager = new LocationManager();

// 取得使用者 GPS 位置（優化版：使用 LocationManager）
/**
 * 獲取當前位置
 * @param {boolean} showMessage - 是否顯示消息（默認 false）
 * @returns {Promise<void>}
 */
async function getCurrentLocation(showMessage = false) {
  if (!navigator.geolocation) {
    if (showMessage) {
      addMessage(t('browserNoLocation'), false);
    }
    return;
  }

  // 檢查是否在安全來源（HTTPS 或本機），否則大多瀏覽器拒絕定位
  const isSecureOrigin = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isSecureOrigin) {
    if (showMessage) {
      const msg = currentLanguage === 'en'
        ? 'Geolocation requires HTTPS or localhost. Please open via https:// or use localhost.'
        : '取得定位需要 HTTPS 或本機環境，請改用 https:// 存取或在本機測試。';
      const mapInfoEl = document.getElementById('map-info');
      if (mapInfoEl) {
        mapInfoEl.textContent = '';
        const p = Utils.dom.createElement('p', null, `❌ ${msg}`, { role: 'alert' });
        mapInfoEl.appendChild(p);
      }
      addMessage(msg, false);
    }
    return;
  }

  // 顯示載入狀態
  if (showMessage) {
    const mapInfo = document.getElementById('map-info');
    if (mapInfo) {
      mapInfo.textContent = '';
      const p = Utils.dom.createElement('p', null, t('gettingLocation'), { 'aria-live': 'polite' });
      mapInfo.appendChild(p);
    }
  }

  try {
    const location = await locationManager.getLocation();
    
    AppState.userLocation = {
      lat: location.lat,
      lng: location.lng
    };
    currentUserLocation = AppState.userLocation; // 向後兼容
    
    // 如果是回退位置，提示用戶
    if (location.isFallback) {
      if (showMessage) {
        const msg = currentLanguage === 'en'
          ? '⚠️ Unable to get your precise location, using default campus location. Please allow location access for better experience.'
          : '⚠️ 無法獲取您的精確位置，使用默認位置。請允許位置權限以獲得更好的體驗。';
        addMessage(msg, false);
      }
    }
    
    // 清除舊的使用者位置標記
    if (userLocationMarker) {
      if (AppState.map) AppState.map.removeLayer(userLocationMarker);
    }
    
    // 在地圖上標示使用者位置
    const locationPopupText = currentLanguage === 'en' ? '📍 Your Location' : '📍 您的位置';
    userLocationMarker = L.marker([currentUserLocation.lat, currentUserLocation.lng], {
      icon: L.divIcon({
        className: 'custom-marker user-location',
        html: '<div style="background: #ff0000; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">📍</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      })
    }).addTo(AppState.map).bindPopup(locationPopupText).openPopup();
    
    // 移動地圖到使用者位置
    if (AppState.map) {
      AppState.map.setView([AppState.userLocation.lat, AppState.userLocation.lng], 18);
    }
    
    // 更新地圖資訊
    if (showMessage && !location.isFallback) {
      const mapInfo = document.getElementById('map-info');
      mapInfo.textContent = '';
      const p = document.createElement('p');
      p.textContent = t('locationSuccess');
      mapInfo.appendChild(p);
      addMessage(t('locationSuccessMsg'), false);
    }
  } catch (error) {
    Utils.logger.log('無法取得位置:', error);
    let errorMessage = error.message || (currentLanguage === 'en' 
      ? 'Unable to get your location.' 
      : '無法取得您的位置。');
    
    // 檢查是否為權限被拒絕錯誤
    const isPermissionDenied = errorMessage.includes('權限被拒絕') || 
                                errorMessage.includes('permission denied') ||
                                errorMessage.includes('Permission denied');
    
    // 使用回退位置
    const fallbackLocation = locationManager.getFallbackLocation();
    AppState.userLocation = {
      lat: fallbackLocation.lat,
      lng: fallbackLocation.lng
    };
    currentUserLocation = AppState.userLocation;
    
    if (showMessage) {
      const mapInfo = document.getElementById('map-info');
      if (mapInfo) {
        mapInfo.textContent = '';
        
        // 如果是權限被拒絕，顯示更詳細的提示
        if (isPermissionDenied) {
          const permissionMsg = currentLanguage === 'en'
            ? '📍 Location permission denied. To enable location services:\n1. Click the lock icon (🔒) in your browser address bar\n2. Select "Allow" for Location\n3. Refresh the page and try again\n\nUsing default campus location for now.'
            : '📍 位置權限被拒絕。要啟用定位服務：\n1. 點擊瀏覽器網址列左側的鎖定圖示 (🔒)\n2. 選擇「允許」位置存取\n3. 重新整理頁面後再試一次\n\n目前使用預設校區位置。';
          
          const p = Utils.dom.createElement('p', null, permissionMsg, { 
            role: 'alert',
            style: 'white-space: pre-line; line-height: 1.6;'
          });
          mapInfo.appendChild(p);
          
          // 添加對話訊息
          addMessage(
            currentLanguage === 'en'
              ? '⚠️ Location permission denied. Please allow location access in your browser settings. Using default location for now.'
              : '⚠️ 位置權限被拒絕。請在瀏覽器設定中允許位置存取。目前使用預設位置。',
            false
          );
        } else {
          const p = Utils.dom.createElement('p', null, `❌ ${errorMessage}`, { role: 'alert' });
          mapInfo.appendChild(p);
          addMessage(errorMessage, false);
        }
      } else {
        addMessage(errorMessage, false);
      }
      
      // 提示使用默認位置
      const fallbackMsg = currentLanguage === 'en'
        ? 'Using default campus location for search.'
        : '使用默認校區位置進行搜索。';
      addMessage(fallbackMsg, false);
    }
  }
}

// 計算兩點間距離（公里）
/**
 * 計算兩點之間的距離（使用 Haversine 公式）
 * @param {number} lat1 - 第一點緯度
 * @param {number} lng1 - 第一點經度
 * @param {number} lat2 - 第二點緯度
 * @param {number} lng2 - 第二點經度
 * @returns {number} 距離（公里）
 */
// ============================================
// 性能優化：距離計算緩存和快速近似算法
// ============================================
const DistanceCache = {
  cache: new Map(),
  maxCacheSize: 1000,
  
  /**
   * 生成緩存鍵
   */
  getCacheKey(lat1, lng1, lat2, lng2) {
    // 將座標四捨五入到小數點後4位，減少緩存鍵數量
    const round = (n) => Math.round(n * 10000) / 10000;
    return `${round(lat1)},${round(lng1)},${round(lat2)},${round(lng2)}`;
  },
  
  /**
   * 獲取緩存值
   */
  get(lat1, lng1, lat2, lng2) {
    const key = this.getCacheKey(lat1, lng1, lat2, lng2);
    return this.cache.get(key);
  },
  
  /**
   * 設置緩存值
   */
  set(lat1, lng1, lat2, lng2, distance) {
    // 限制緩存大小
    if (this.cache.size >= this.maxCacheSize) {
      // 刪除最舊的緩存項（FIFO）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    const key = this.getCacheKey(lat1, lng1, lat2, lng2);
    this.cache.set(key, distance);
  },
  
  /**
   * 清空緩存
   */
  clear() {
    this.cache.clear();
  }
};

/**
 * 計算兩點間距離（優化版：使用緩存和快速近似）
 * @param {number} lat1 - 第一點緯度
 * @param {number} lng1 - 第一點經度
 * @param {number} lat2 - 第二點緯度
 * @param {number} lng2 - 第二點經度
 * @param {boolean} useCache - 是否使用緩存（默認 true）
 * @returns {number|null} 距離（公里），如果無效則返回 null
 */
function calculateDistance(lat1, lng1, lat2, lng2, useCache = true) {
  // 驗證輸入參數
  if (typeof lat1 !== 'number' || typeof lng1 !== 'number' || 
      typeof lat2 !== 'number' || typeof lng2 !== 'number' ||
      isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
    Utils.logger.warn('計算距離時參數無效:', { lat1, lng1, lat2, lng2 });
    return null;
  }
  
  // 檢查緩存
  if (useCache) {
    const cached = DistanceCache.get(lat1, lng1, lat2, lng2);
    if (cached !== undefined) {
      return cached;
    }
  }
  
  // 快速近似算法（對於小距離更準確，且速度更快）
  // 使用 Equirectangular approximation（適合校園範圍內的距離計算）
  const R = 6371; // 地球半徑（公里）
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const avgLat = (lat1 + lat2) / 2 * Math.PI / 180;
  
  // Equirectangular approximation（比 Haversine 快約 2-3 倍，精度在 10km 內誤差 < 0.1%）
  const x = dLng * Math.cos(avgLat);
  const y = dLat;
  const distance = R * Math.sqrt(x * x + y * y);
  
  // 緩存結果
  if (useCache) {
    DistanceCache.set(lat1, lng1, lat2, lng2, distance);
  }
  
  return distance;
}

/**
 * 判斷設備是否可用（好的設備）（改進：邊界條件檢查）
 * @param {Object} facility - 設施對象
 * @returns {boolean} 是否可用
 */
function isFacilityAvailable(facility) {
  // 邊界檢查（改進：邊界條件檢查）
  if (!facility || typeof facility !== 'object') {
    Utils.logger.warn('isFacilityAvailable: 無效的設施對象');
    return false;
  }
  
  if (!facility.status) return true; // 沒有狀態資訊，視為可用
  
  // 完全無法使用的設備狀態（這些設備不應該被計算或顯示）
  // 注意：「部分損壞」仍然可以導航，因為只是部分功能有問題，不是完全不能用
  const badStatuses = ['無法使用']; // 只標記完全無法使用的設施
  return !badStatuses.includes(facility.status);
}

/**
 * 尋找最近的設施（只找好的設備，支持智能路線）
 * @param {string} type - 設施類型 ('toilet' | 'water' | 'trash')
 * @param {boolean} avoidFaulty - 是否避開故障設施（默認 true）
 * @returns {Object|null} 最近的設施對象，如果沒有則返回 null
 */
function findNearestFacility(type, avoidFaulty = true, gender = null) {
  // 檢查用戶位置是否有效
  if (!currentUserLocation || 
      typeof currentUserLocation.lat !== 'number' || 
      typeof currentUserLocation.lng !== 'number' ||
      isNaN(currentUserLocation.lat) || 
      isNaN(currentUserLocation.lng)) {
    return null;
  }

  // 合併所有校區的設施（性能優化：使用一次過濾）
  const allCampusFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  // 邊界檢查（改進：邊界條件檢查）
  if (allCampusFacilities.length === 0) {
    Utils.logger.log('findNearestFacility: 沒有可用設施數據');
    return null;
  }
  
  // 性能優化：使用空間索引加速查詢（只查詢附近的設施）
  // 如果索引未構建或設施數據已更新，重新構建索引
  if (FacilitySpatialIndex.grid.size === 0 || 
      !FacilitySpatialIndex._lastBuildTime || 
      Date.now() - FacilitySpatialIndex._lastBuildTime > 60000) { // 1分鐘後重新構建
    FacilitySpatialIndex.buildIndex(allCampusFacilities);
    FacilitySpatialIndex._lastBuildTime = Date.now();
  }
  
  // 使用空間索引查詢候選設施（大幅減少需要計算距離的設施數量）
  const candidates = FacilitySpatialIndex.queryNearby(
    currentUserLocation.lat,
    currentUserLocation.lng,
    type,
    20, // 最多返回20個候選設施
    gender
  );
  
  // 如果空間索引沒有找到足夠的候選設施，回退到全量查詢
  let allFacilities = candidates.length > 0 ? candidates : allCampusFacilities.filter(f => {
    // 驗證設施數據完整性
    if (!f || typeof f !== 'object') return false;
    if (typeof f.lat !== 'number' || typeof f.lng !== 'number') return false;
    if (isNaN(f.lat) || isNaN(f.lng)) return false;
    if (f.lat < -90 || f.lat > 90 || f.lng < -180 || f.lng > 180) return false;
    
    if (f.type !== type) return false;
    
    // 如果是廁所且指定了性別，過濾性別
    if (type === 'toilet' && gender && f.gender !== gender) {
      return false;
    }
    
    return avoidFaulty ? isFacilityAvailable(f) : true;
  });

  if (allFacilities.length === 0) {
    Utils.logger.log(`findNearestFacility: 沒有找到類型為 ${type} 的設施`);
    return null;
  }

  // 計算距離並排序（性能優化：使用緩存的距離計算）
  // 只計算候選設施的距離，而不是所有設施
  const facilitiesWithDistance = allFacilities.map(facility => {
    try {
      const distance = calculateDistance(
        currentUserLocation.lat,
        currentUserLocation.lng,
        facility.lat,
        facility.lng,
        true // 使用緩存
      );
      // 如果距離計算失敗，跳過此設施
      if (distance == null || isNaN(distance)) {
        return null;
      }
      return {
        ...facility,
        distance: distance
      };
    } catch (error) {
      Utils.logger.error('計算距離時出錯:', error, facility);
      return null;
    }
  }).filter(f => f !== null && f.distance != null && !isNaN(f.distance)); // 過濾掉計算失敗的設施

  if (facilitiesWithDistance.length === 0) {
    return null;
  }
  
  // 只排序候選設施（通常只有10-20個，而不是數百個）
  facilitiesWithDistance.sort((a, b) => a.distance - b.distance);
  return facilitiesWithDistance[0];
}

/**
 * 尋找最近的任意設施（可選擇優先類型）（改進：依賴注入、邊界檢查）
 * @param {string|null} preferredType - 優先設施類型（可選）
 * @param {Object} userLocation - 用戶位置（可選，默認使用 currentUserLocation）
 * @param {Object} facilitiesData - 設施數據（可選，默認使用 facilities）
 * @returns {Object|null} 最近的設施對象，如果沒有則返回 null
 */
function findNearestAnyFacility(preferredType = null, userLocation = null, facilitiesData = null) {
  const location = userLocation || currentUserLocation;
  const facilities = facilitiesData || window.facilities;
  
  // 邊界檢查（改進：邊界條件檢查）
  if (!location) {
    Utils.logger.warn('findNearestAnyFacility: 用戶位置不可用');
    return null;
  }
  
  if (!facilities || typeof facilities !== 'object') {
    Utils.logger.warn('findNearestAnyFacility: 設施數據不可用');
    return null;
  }

  const allList = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];

  if (allList.length === 0) return null;

  // 若有指定優先類型，先過濾該類型；沒有則使用全部
  const candidateList = preferredType
    ? allList.filter(f => f.type === preferredType)
    : allList;

  if (candidateList.length === 0) return null;

  const listWithDistance = candidateList.map(facility => ({
    ...facility,
    distance: calculateDistance(
      currentUserLocation.lat,
      currentUserLocation.lng,
      facility.lat,
      facility.lng
    )
  }));

  listWithDistance.sort((a, b) => a.distance - b.distance);
  return listWithDistance[0];
}

// 在地圖上顯示路線
/**
 * 顯示到設施的路線
 * @param {Object} facility - 設施對象
 * @returns {void}
 */
function showRouteToFacility(facility) {
  if (!currentUserLocation || !facility) return;

  // 清除舊的路線（確保清除所有路線層）
  if (AppState.routeLayer && AppState.map) {
    try {
    AppState.map.removeLayer(AppState.routeLayer);
    } catch (e) {
      Utils.logger.warn('清除舊路線層時出錯:', e);
    }
    AppState.routeLayer = null;
  }
  
  // 也清除 routeLayer 變量（向後兼容）
  if (routeLayer && AppState.map) {
    try {
      AppState.map.removeLayer(routeLayer);
    } catch (e) {
      Utils.logger.warn('清除舊路線層（變量）時出錯:', e);
    }
    routeLayer = null;
  }

  // 清除舊的設施標記（但保留使用者位置標記）
  AppState.markers.forEach(marker => {
    if (marker !== userLocationMarker && AppState.map) {
      try {
      AppState.map.removeLayer(marker);
      } catch (e) {
        Utils.logger.warn('清除標記時出錯:', e);
      }
    }
  });
  AppState.markers = [];
  aiMarkers = []; // 向後兼容
  
  // 如果使用者位置標記存在，重新加入標記以便管理
  if (userLocationMarker) {
    AppState.markers.push(userLocationMarker);
    aiMarkers = AppState.markers; // 向後兼容
  }

  // 標示使用者位置
  if (!AppState.userLocation) return;
  const userMarker = L.marker([AppState.userLocation.lat, AppState.userLocation.lng], {
    icon: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: #ff0000; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">📍</div>',
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    })
  }).addTo(aiMap);
      AppState.markers.push(userMarker);
      aiMarkers = AppState.markers; // 向後兼容

  // 標示目標設施
  const facilityIcon = getFacilityIcon(facility.type);
  const facilityMarker = L.marker([facility.lat, facility.lng], {
    icon: facilityIcon
  }).addTo(aiMap);

  let popupContent = `
    <div style="padding: 5px; min-width: 260px; max-width: 360px;">
      <h3 style="margin: 0 0 8px 0; color: #1e3c72; font-size: 16px; font-weight: 700;">${facility.name}</h3>
      <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${t('building')}</strong>${facility.building}</p>
      <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${t('floor')}</strong>${facility.floor}</p>
  `;
  
  // 如果是廁所且有性別資訊，顯示性別
  if (facility.type === 'toilet' && facility.gender) {
    const genderText = currentLanguage === 'en'
      ? (facility.gender === '男' ? '♂️ Men\'s' : 
         facility.gender === '女' ? '♀️ Women\'s' : 
         facility.gender === '性別友善' ? '🚻 Gender-Inclusive' :
         '🚻 All-Gender')
      : (facility.gender === '男' ? '♂️ 男廁' : 
         facility.gender === '女' ? '♀️ 女廁' : 
         facility.gender === '性別友善' ? '🚻 性別友善' :
         '🚻 性別友善');
    popupContent += `<p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${currentLanguage === 'en' ? 'Type:' : '類型：'}</strong>${genderText}</p>`;
  }
  
  // 顯示設施狀況
  if (facility.status) {
    const statusIcons = {
      '正常': '✅',
      '部分損壞': '⚠️',
      '待清潔': '🧹',
      '無法使用': '🚫'
    };
    const statusColors = {
      '正常': '#28a745',
      '部分損壞': '#ff9800',
      '待清潔': '#17a2b8',
      '無法使用': '#dc3545'
    };
    const statusColor = statusColors[facility.status] || '#6c757d';
    const statusLabel = currentLanguage === 'en' ? 'Status:' : '狀況：';
    const statusInfo = getStatusInfo(facility.status, currentLanguage);
    popupContent += `<p style="margin: 4px 0; color: ${statusColor}; font-size: 13px; font-weight: 600;"><strong>${statusLabel}</strong>${statusInfo.icon} ${statusInfo.text}</p>`;
  }
  
  const distanceLabel = currentLanguage === 'en' ? 'Distance:' : '距離：';
  const distanceUnit = currentLanguage === 'en' ? ' meters' : ' 公尺';
    const distanceMeters = facility.distance != null && !isNaN(facility.distance) 
      ? (facility.distance * 1000).toFixed(0) 
      : '未知';
    popupContent += `<p style="margin: 4px 0; color: #667eea; font-size: 13px;"><strong>${distanceLabel}</strong>${distanceMeters}${distanceUnit}</p>
    </div>
  `;
  facilityMarker.bindPopup(popupContent).openPopup();
  aiMarkers.push(facilityMarker);

  // 繪製路線
  const routePoints = [
    [currentUserLocation.lat, currentUserLocation.lng],
    [facility.lat, facility.lng]
  ];

  // 創建新路線並同時更新 AppState.routeLayer 和 routeLayer
  const newRouteLayer = L.polyline(routePoints, {
    color: '#667eea',
    weight: 4,
    opacity: 0.7,
    dashArray: '10, 10'
  }).addTo(aiMap);
  
  // 同時更新兩個變量以確保一致性
  AppState.routeLayer = newRouteLayer;
  routeLayer = newRouteLayer;

  // 調整地圖視角以顯示整條路線
  const bounds = L.latLngBounds(routePoints);
  aiMap.fitBounds(bounds, { padding: [50, 50] });

      // 更新地圖資訊
      const mapInfo = document.getElementById('map-info');
      if (currentLanguage === 'en') {
        mapInfo.textContent = '';
        const p1 = document.createElement('p');
        const strong1 = document.createElement('strong');
        strong1.textContent = '📍 Navigating';
        p1.appendChild(strong1);
        const p2 = document.createElement('p');
        p2.textContent = `Target: ${Utils.html.escape(facility.name)}`;
        const p3 = document.createElement('p');
        const distanceMeters = facility.distance != null && !isNaN(facility.distance) 
          ? (facility.distance * 1000).toFixed(0) 
          : 'Unknown';
        p3.textContent = `Distance: ${distanceMeters} meters`;
        mapInfo.appendChild(p1);
        mapInfo.appendChild(p2);
        mapInfo.appendChild(p3);
      } else {
        mapInfo.textContent = '';
        const p1 = document.createElement('p');
        const strong1 = document.createElement('strong');
        strong1.textContent = '📍 導航中';
        p1.appendChild(strong1);
        const p2 = document.createElement('p');
        p2.textContent = `目標：${Utils.html.escape(facility.name)}`;
        const p3 = document.createElement('p');
        const distanceMeters = facility.distance != null && !isNaN(facility.distance) 
          ? (facility.distance * 1000).toFixed(0) 
          : '未知';
        p3.textContent = `距離：${distanceMeters} 公尺`;
        mapInfo.appendChild(p1);
        mapInfo.appendChild(p2);
        mapInfo.appendChild(p3);
      }
}

// 取得設施圖示
function getFacilityIcon(type, gender = null) {
  // 根據性別選擇圖標（僅對廁所）
  let icon = '🚻';
  if (type === 'toilet' && gender) {
    if (gender === '男') {
      icon = '♂️';
    } else if (gender === '女') {
      icon = '♀️';
    } else {
      icon = '🚻';
    }
  } else {
  const icons = {
    toilet: '🚻',
    water: '🚰',
    trash: '🗑️'
  };
    icon = icons[type] || '📍';
  }

  // 根據性別選擇顏色（僅對廁所）
  let color = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
  if (type === 'toilet' && gender) {
    if (gender === '男') {
      color = 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)'; // 藍色
    } else if (gender === '女') {
      color = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'; // 粉色
    } else {
      color = 'linear-gradient(135deg, #a0a0a0 0%, #808080 100%)'; // 灰色
    }
  } else {
  const colors = {
    toilet: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    water: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    trash: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
  };
    color = colors[type] || 'linear-gradient(135deg, #a0a0a0 0%, #808080 100%)';
  }

  return L.divIcon({
    className: `custom-marker ${type}${gender ? ` ${gender}` : ''}`,
    html: `<div class="custom-marker ${type}${gender ? ` ${gender}` : ''}" style="background: ${color}; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 6px rgba(0,0,0,0.3); border: 2px solid white;">${icon}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
}

// AI 回應處理
function processAIQuery(query) {
  const lowerQuery = query.toLowerCase();

  // 尋找最近的設施（支持中英文）
  const isNearestQuery = lowerQuery.includes('最近') || 
                         lowerQuery.includes('最近的') ||
                         lowerQuery.includes('nearest') ||
                         lowerQuery.includes('where is') ||
                         lowerQuery.includes('find') ||
                         lowerQuery.includes('show me');
  
  if (isNearestQuery) {
    let facilityType = null;
    // 檢查設施類型（中英文都支持）
    if (lowerQuery.includes('廁所') || lowerQuery.includes('toilet') || 
        lowerQuery.includes('restroom') || lowerQuery.includes('bathroom')) {
      facilityType = 'toilet';
    } else if (lowerQuery.includes('飲水機') || lowerQuery.includes('water') ||
               lowerQuery.includes('water fountain') || lowerQuery.includes('water dispenser') ||
               lowerQuery.includes('drinking fountain')) {
      facilityType = 'water';
    } else if (lowerQuery.includes('垃圾桶') || lowerQuery.includes('trash') ||
               lowerQuery.includes('garbage') || lowerQuery.includes('trash can') ||
               lowerQuery.includes('trash bin') || lowerQuery.includes('garbage can') ||
               lowerQuery.includes('garbage bin')) {
      facilityType = 'trash';
    }

    if (facilityType) {
      if (!currentUserLocation) {
        const lang = currentLanguage === 'en' ? 'en' : 'zh';
        return {
          text: lang === 'en' 
            ? 'I need your location to find the nearest facility. Please allow the browser to access your location information.'
            : '需要取得您的位置才能找到最近的設施。請允許瀏覽器存取您的位置資訊。',
          action: 'request_location'
        };
      }

      // 從查詢中提取性別信息（僅用於廁所）
      let gender = null;
      if (facilityType === 'toilet') {
        const genderKeywords = {
          '男': ['男生', '男性', '男廁', '男廁所', '男生廁所', '男性廁所', '男', 'men', 'men\'s', 'male'],
          '女': ['女生', '女性', '女廁', '女廁所', '女生廁所', '女性廁所', '女', 'women', 'women\'s', 'female', 'ladies'],
          '性別友善': ['性別友善', '性別友善廁所', '性別中立', '無性別', 'unisex', 'gender-neutral', 'gender-inclusive', 'all-gender']
        };
        
        for (const [g, keywords] of Object.entries(genderKeywords)) {
          if (keywords.some(keyword => lowerQuery.includes(keyword.toLowerCase()))) {
            gender = g;
            break;
          }
        }
      }

      const nearest = findNearestFacility(facilityType, true, gender);
      if (nearest) {
        // 驗證距離是否有效
        if (nearest.distance == null || isNaN(nearest.distance)) {
          const lang = currentLanguage === 'en' ? 'en' : 'zh';
          return {
            text: lang === 'en'
              ? 'Unable to calculate distance. Please allow location access and try again.'
              : '無法計算距離。請允許位置存取後再試。',
            action: 'request_location'
          };
        }
        const distanceMeters = (nearest.distance * 1000).toFixed(0);
        showRouteToFacility(nearest);
        
        const lang = currentLanguage === 'en' ? 'en' : 'zh';
        const facilityName = lang === 'en'
          ? (facilityType === 'toilet' ? 'restroom' : facilityType === 'water' ? 'water fountain' : 'trash can')
          : (facilityType === 'toilet' ? '廁所' : facilityType === 'water' ? '飲水機' : '垃圾桶');
        
        const buildingLabel = lang === 'en' ? 'Building:' : '建築：';
        const floorLabel = lang === 'en' ? 'Floor:' : '樓層：';
        const distanceLabel = lang === 'en' ? 'Distance:' : '距離：';
        const distanceUnit = lang === 'en' ? 'meters' : '公尺';
        const mapNote = lang === 'en' 
          ? 'The route has been marked on the map. Please check the map on the right!'
          : '地圖上已標示路線，請查看右側地圖！';
        
        const responseText = lang === 'en'
          ? `I found the nearest ${facilityName}!<br><br>
            📍 <strong>${nearest.name}</strong><br>
            🏢 ${buildingLabel} ${nearest.building}<br>
            🏢 ${floorLabel} ${nearest.floor}<br>
            📏 ${distanceLabel} about ${distanceMeters} ${distanceUnit}<br><br>
            ${mapNote}`
          : `我找到了最近的${facilityName}！<br><br>
            📍 <strong>${nearest.name}</strong><br>
            🏢 ${buildingLabel}${nearest.building}<br>
            🏢 ${floorLabel}${nearest.floor}<br>
            📏 ${distanceLabel}約 ${distanceMeters} ${distanceUnit}<br><br>
            ${mapNote}`;
        
        return {
          text: responseText,
          action: 'show_route',
          facility: nearest
        };
      } else {
        const lang = currentLanguage === 'en' ? 'en' : 'zh';
        return {
          text: lang === 'en'
            ? 'Sorry, no nearby facilities were found. You can add facility locations through the "Add Location" feature.'
            : '抱歉，目前沒有找到附近的設施。您可以透過「新增點位」功能來新增設施位置。',
          action: null
        };
      }
    }
  }

  // 查詢特定校區的設施（只統計好的設備）
  if (lowerQuery.includes('第一校區') || lowerQuery.includes('校區1')) {
    const campusFacilities = facilities.campus1 || [];
    const availableFacilities = campusFacilities.filter(f => isFacilityAvailable(f));
    const counts = {
      toilet: availableFacilities.filter(f => f.type === 'toilet').length,
      water: availableFacilities.filter(f => f.type === 'water').length,
      trash: availableFacilities.filter(f => f.type === 'trash').length
    };
    
    return {
      text: `第一校區目前有：<br>
        🚻 廁所：${counts.toilet} 個<br>
        🚰 飲水機：${counts.water} 個<br>
        🗑️ 垃圾桶：${counts.trash} 個<br>
        總計：${availableFacilities.length} 個可用設施`,
      action: 'show_campus',
      campus: 'campus1'
    };
  }

  if (lowerQuery.includes('第二校區') || lowerQuery.includes('校區2')) {
    const campusFacilities = facilities.campus2 || [];
    const availableFacilities = campusFacilities.filter(f => isFacilityAvailable(f));
    const counts = {
      toilet: availableFacilities.filter(f => f.type === 'toilet').length,
      water: availableFacilities.filter(f => f.type === 'water').length,
      trash: availableFacilities.filter(f => f.type === 'trash').length
    };
    
    return {
      text: `第二校區目前有：<br>
        🚻 廁所：${counts.toilet} 個<br>
        🚰 飲水機：${counts.water} 個<br>
        🗑️ 垃圾桶：${counts.trash} 個<br>
        總計：${availableFacilities.length} 個可用設施`,
      action: 'show_campus',
      campus: 'campus2'
    };
  }

  if (lowerQuery.includes('第三校區') || lowerQuery.includes('校區3')) {
    const campusFacilities = facilities.campus3 || [];
    const availableFacilities = campusFacilities.filter(f => isFacilityAvailable(f));
    const counts = {
      toilet: availableFacilities.filter(f => f.type === 'toilet').length,
      water: availableFacilities.filter(f => f.type === 'water').length,
      trash: availableFacilities.filter(f => f.type === 'trash').length
    };
    
    return {
      text: `第三校區目前有：<br>
        🚻 廁所：${counts.toilet} 個<br>
        🚰 飲水機：${counts.water} 個<br>
        🗑️ 垃圾桶：${counts.trash} 個<br>
        總計：${availableFacilities.length} 個可用設施`,
      action: 'show_campus',
      campus: 'campus3'
    };
  }

  // 注意：所有問候語（包括「你好」、「早安」等）都應該通過 Rasa AI 處理
  // 本地處理邏輯已移除，確保所有請求都傳送到 AI 伺服器

  // 處理功能詢問
  if (lowerQuery.includes('功能') || lowerQuery.includes('能做什麼') || 
      lowerQuery.includes('capabilities') || lowerQuery.includes('what can you do')) {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    return {
      text: lang === 'en'
        ? 'I can help you with:<br>• Finding the nearest facilities (restrooms, water fountains, trash cans)<br>• Querying campus facility information<br>• Navigating to facilities<br>• Reporting facility issues<br>• Answering campus-related questions'
        : '我可以幫您：<br>• 尋找最近的設施（廁所、飲水機、垃圾桶）<br>• 查詢校園設施資訊<br>• 導航到設施位置<br>• 回報設施問題<br>• 回答校園相關問題',
      action: null
    };
  }

  // 處理問題回報（當 Rasa 無響應時的本地處理）
  const reportKeywords = ['壞了', '故障', '損壞', '髒了', '需要', '維修', '修理', '問題', 
                          'broken', 'damaged', 'dirty', 'needs', 'repair', 'fix', 'problem', 'issue'];
  const isReportQuery = reportKeywords.some(keyword => query.includes(keyword) || lowerQuery.includes(keyword));
  
  if (isReportQuery) {
    // 嘗試從查詢中提取實體信息
    let building = null;
    let floor = null;
    let facilityType = null;
    let gender = null;
    let status = null;
    let notes = query; // 使用原始查詢作為備註
    
    // 提取建築名稱（檢查常見建築名稱）
    const buildingKeywords = ['綜三館', '綜一館', '綜二館', '工館', '文館', '理館', '圖書館', '體育館'];
    for (const b of buildingKeywords) {
      if (query.includes(b)) {
        building = b;
        break;
      }
    }
    
    // 提取樓層（數字+樓/層/F）
    const floorMatch = query.match(/(\d+)[樓層F]/);
    if (floorMatch) {
      floor = floorMatch[1];
    }
    
    // 提取設施類型
    if (lowerQuery.includes('廁所') || lowerQuery.includes('toilet') || lowerQuery.includes('restroom')) {
      facilityType = 'toilet';
      // 提取性別
      if (lowerQuery.includes('男') || lowerQuery.includes('men') || lowerQuery.includes('male')) {
        gender = '男';
      } else if (lowerQuery.includes('女') || lowerQuery.includes('women') || lowerQuery.includes('female')) {
        gender = '女';
      } else if (lowerQuery.includes('性別友善') || lowerQuery.includes('unisex')) {
        gender = '性別友善';
      } else if (lowerQuery.includes('無障礙') || lowerQuery.includes('accessible')) {
        gender = '無障礙';
      }
    } else if (lowerQuery.includes('飲水機') || lowerQuery.includes('water')) {
      facilityType = 'water';
    } else if (lowerQuery.includes('垃圾桶') || lowerQuery.includes('trash') || lowerQuery.includes('garbage')) {
      facilityType = 'trash';
    }
    
    // 提取狀態
    if (lowerQuery.includes('壞了') || lowerQuery.includes('故障') || lowerQuery.includes('broken') || lowerQuery.includes('damaged')) {
      status = '部分損壞';
    } else if (lowerQuery.includes('髒了') || lowerQuery.includes('dirty')) {
      status = '待清潔';
    } else if (lowerQuery.includes('無法使用') || lowerQuery.includes('不能用') || lowerQuery.includes('unavailable')) {
      status = '無法使用';
    } else if (lowerQuery.includes('需要維修') || lowerQuery.includes('需要修理') || lowerQuery.includes('needs repair')) {
      status = '部分損壞';
    }
    
    // 如果識別到基本信息，打開表單並填充
    if (building || floor || facilityType) {
      const formData = {
        campus: null, // 可以根據建築推斷
        building: building,
        floor: floor,
        status: status,
        notes: notes,
        problem_description: notes
      };
      
      if (facilityType === 'toilet' && gender) {
        formData.gender = gender;
      }
      
      // 返回 action 來打開表單
      return {
        text: currentLanguage === 'en'
          ? 'I detected a facility problem report. Please confirm the information in the form.'
          : '偵測到您回報設備問題，請在表單中確認資訊。',
        action: {
          action: 'open_issue_form',
          facility_type: facilityType,
          building: building,
          floor: floor,
          status: status,
          gender: gender,
          notes: notes,
          problem_description: notes,
          campus: null
        }
      };
    }
  }

  // 預設回應（根據語言）
  const lang = currentLanguage === 'en' ? 'en' : 'zh';
  return {
    text: lang === 'en'
      ? 'I understand your question, but I might need more information. You can ask me:<br>• "Where is the nearest restroom?"<br>• "What facilities are in Campus 1?"<br>• "Where is the nearest water fountain?"<br>• "What can you do?"'
      : '我理解您的問題，但可能需要更多資訊。您可以問我：<br>• 「最近的廁所在哪？」<br>• 「第一校區有哪些設施？」<br>• 「最近的飲水機在哪？」<br>• 「你有什麼功能？」',
    action: null
  };
}

// 顯示訊息（帶動畫效果）
// 顯示訊息（帶動畫效果）- 優化版：防止 XSS 和內存洩漏
/**
 * 添加消息到聊天界面
 * @param {string} text - 消息文本
 * @param {boolean} isUser - 是否為用戶消息（默認 false）
 * @returns {void}
 */
function addMessage(text, isUser = false, buttons = null) {
  // 參數驗證
  if (!text || typeof text !== 'string') {
    Utils.logger.warn('無效的消息內容');
    return;
  }
  
  // 確保 DOM 已準備好
  if (document.readyState === 'loading') {
    Utils.logger.warn('DOM 尚未載入完成，延遲顯示消息');
    document.addEventListener('DOMContentLoaded', () => {
      addMessage(text, isUser, buttons);
    });
    return;
  }
  
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) {
    Utils.logger.warn('消息容器不存在');
    return;
  }
  
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isUser ? 'user-message' : 'ai-message'}`;
  messageDiv.style.opacity = '0';
  messageDiv.style.transform = 'translateY(10px)';
  messageDiv.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
  
  // 使用 DOM API 創建元素（更安全，防止 XSS）
  const avatarDiv = document.createElement('div');
  avatarDiv.className = 'message-avatar';
  avatarDiv.textContent = isUser ? '👤' : '🤖';
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  const textDiv = document.createElement('div');
  textDiv.className = 'message-text';
  // 安全處理：如果包含 HTML 標籤，進行基本清理；否則使用 textContent
  if (/<[^>]+>/.test(text)) {
    // 只允許安全的 HTML 標籤（br, strong, em, p, div, span）
    const safeHTML = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // 移除 script 標籤
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '') // 移除 iframe 標籤
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '') // 移除事件處理器
      .replace(/javascript:/gi, ''); // 移除 javascript: 協議
    textDiv.innerHTML = safeHTML;
  } else {
    textDiv.textContent = text;
  }
  
  contentDiv.appendChild(textDiv);
  
  // 如果有按鈕選項，添加按鈕容器
  if (buttons && Array.isArray(buttons) && buttons.length > 0 && !isUser) {
    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'message-buttons';
    
    buttons.forEach(button => {
      if (button && button.text && button.query) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'message-btn';
        btn.textContent = button.text;
        btn.setAttribute('data-query', button.query);
        btn.setAttribute('aria-label', button.ariaLabel || button.text);
        
        // 添加點擊事件
        btn.addEventListener('click', function() {
          // 添加點擊動畫
          btn.style.transform = 'scale(0.95)';
          setTimeout(() => {
            btn.style.transform = '';
          }, 150);
          
          // 發送查詢
          if (typeof handleUserInput === 'function') {
            handleUserInput(button.query);
          }
        });
        
        buttonContainer.appendChild(btn);
      }
    });
    
    contentDiv.appendChild(buttonContainer);
  }
  
  messageDiv.appendChild(avatarDiv);
  messageDiv.appendChild(contentDiv);
  
  messagesContainer.appendChild(messageDiv);
  
  // 觸發動畫（使用 requestAnimationFrame 優化性能）
  requestAnimationFrame(() => {
    messageDiv.style.opacity = '1';
    messageDiv.style.transform = 'translateY(0)';
  });
  
  // 平滑滾動到底部（防抖處理，使用 Utils.timers 管理）（改進：常量提取）
  const scrollTimeout = Utils.timers.setTimeout(() => {
    try {
      messagesContainer.scrollTo({
        top: messagesContainer.scrollHeight,
        behavior: 'smooth'
      });
    } catch (e) {
      // 忽略滾動錯誤
      Utils.logger.warn('[Scroll] 滾動失敗:', e);
    }
      }, AppConfig.PERFORMANCE.SCROLL_DELAY);
  
  // 限制消息數量（性能優化：使用更高效的方式移除）
  // 注意：只在超過限制時才查詢，減少 DOM 查詢
  if (messagesContainer.children.length > AppConfig.PERFORMANCE.MESSAGE_LIMIT) {
    const messages = messagesContainer.children; // children 比 querySelectorAll 更快
    const toRemove = messages.length - AppConfig.PERFORMANCE.MESSAGE_LIMIT;
    
    // 性能優化：使用 DocumentFragment 批量移除（減少重排）
    // 但由於要移除的元素較少，直接移除可能更快，這裡使用批量移除
    for (let i = 0; i < toRemove; i++) {
      try {
        messages[i].remove();
      } catch (e) {
        // 忽略移除錯誤
      }
    }
  }
}

// 顯示輸入中動畫（優化版：更好的視覺反饋）
function showTyping() {
  const messagesContainer = document.getElementById('chat-messages');
  if (!messagesContainer) return;
  
  // 如果已經有輸入指示器，不重複創建
  if (document.getElementById('typing-indicator')) {
    return;
  }
  
  // 使用統一的 DOM 創建工具（改進：消除重複代碼）
  const typingDiv = Utils.dom.createElement('div', 'message ai-message', '', { id: 'typing-indicator' });
  
  // 使用 DOM API 創建元素（更安全）
  const avatarDiv = Utils.dom.createElement('div', 'message-avatar', '🤖');
  const contentDiv = Utils.dom.createElement('div', 'message-content');
  const indicatorDiv = Utils.dom.createElement('div', 'typing-indicator');
  
  // 批量創建點（性能優化）
  const dots = Array.from({ length: 3 }, (_, i) => {
    const dot = Utils.dom.createElement('div', 'typing-dot');
    // 添加動畫延遲，讓點依次動畫
    dot.style.animationDelay = `${i * 0.2}s`;
    return dot;
  });
  Utils.dom.appendChildren(indicatorDiv, dots);
  contentDiv.appendChild(indicatorDiv);
  typingDiv.appendChild(avatarDiv);
  typingDiv.appendChild(contentDiv);
  
  messagesContainer.appendChild(typingDiv);
  
  // 平滑滾動到底部
  requestAnimationFrame(() => {
    messagesContainer.scrollTo({
      top: messagesContainer.scrollHeight,
      behavior: 'smooth'
    });
  });
}

// 移除輸入中動畫
function hideTyping() {
  const typing = document.getElementById('typing-indicator');
  if (typing) {
    typing.remove();
  }
}

// ============================================
// Gemini API Fallback 函數
// ============================================

/**
 * 呼叫 Gemini API 生成回應
 * @param {string} message - 用戶訊息
 * @param {string} language - 語言代碼 ('zh' 或 'en')
 * @param {Array} conversationContext - 對話上下文（可選）
 * @returns {Promise<Object|null>} Gemini 回應對象，失敗時返回 null
 */
async function callGeminiAPI(message, language = 'zh', conversationContext = null) {
  try {
    Utils.logger.log('🤖 呼叫 Gemini API fallback...');
    Utils.logger.log(`📝 訊息: ${message.substring(0, 100)}...`);
    Utils.logger.log(`🌐 語言: ${language}`);
    
    // 優化對話上下文格式
    let optimizedContext = null;
    if (conversationContext && Array.isArray(conversationContext) && conversationContext.length > 0) {
      // 只保留最近 6 條對話，並優化格式
      optimizedContext = conversationContext.slice(-6).map(ctx => {
        if (typeof ctx === 'string') {
          // 如果已經是格式化字符串，直接使用
          return ctx;
        }
        // 否則轉換為字符串格式
        return String(ctx);
      }).filter(ctx => ctx && ctx.trim().length > 0);
      
      Utils.logger.log(`📝 對話上下文: ${optimizedContext.length} 條訊息`);
    }
    
    // 構建 API URL（使用相對路徑，Vercel 會自動路由）
    const apiUrl = '/api/gemini/chat';
    
    // 創建超時控制器（20秒超時，給 API 端點的重試機制留出時間）
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      Utils.logger.warn('⏱️ Gemini API 請求超時（20秒）');
      timeoutController.abort();
    }, 20000);
    
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: message.trim(), // 確保訊息已修剪
          language: language,
          conversation_context: optimizedContext
        }),
        signal: timeoutController.signal
      });
      
      // 清除超時定時器
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.message || errorData.error || `HTTP ${response.status}`;
        
        Utils.logger.error(`❌ Gemini API 錯誤: ${response.status} - ${errorMessage}`);
        
        // 處理特定錯誤
        if (response.status === 429) {
          return {
            text: language === 'en'
              ? '⚠️ API quota exceeded. Please try again later.'
              : '⚠️ API 配額已達上限，請稍後再試。',
            source: 'gemini',
            error: true
          };
        }
        
        if (response.status === 401 || response.status === 403) {
          return {
            text: language === 'en'
              ? '⚠️ Gemini API is not configured. Please contact administrator.'
              : '⚠️ Gemini API 未配置，請聯繫管理員。',
            source: 'gemini',
            error: true
          };
        }
        
        // 處理 501 錯誤（本地環境未實現）
        if (response.status === 501) {
          return {
            text: language === 'en'
              ? '⚠️ Gemini API is not available in local development. Please use Rasa server or deploy to production.'
              : '⚠️ Gemini API 在本地開發環境中不可用。請使用 Rasa 伺服器或部署到生產環境。',
            source: 'gemini',
            error: true
          };
        }
        
        if (response.status === 504) {
          return {
            text: language === 'en'
              ? '⏱️ Request timeout. Please try again.'
              : '⏱️ 請求超時，請稍後再試。',
            source: 'gemini',
            error: true
          };
        }
        
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      if (data.text && data.text.trim()) {
        // 驗證回應長度（如果太長則截斷）
        let responseText = data.text.trim();
        if (responseText.length > 2000) {
          Utils.logger.warn(`⚠️ Gemini 回應過長 (${responseText.length} 字元)，截斷至 2000 字元`);
          responseText = responseText.substring(0, 2000) + '...';
        }
        
        Utils.logger.log(`✅ Gemini API 回應成功，長度: ${responseText.length}`);
        return {
          text: responseText,
          source: 'gemini',
          language: data.language || language
        };
      } else {
        Utils.logger.warn('⚠️ Gemini API 返回了空回應:', data);
        throw new Error('API 返回了空回應');
      }
      
    } catch (error) {
      // 清除超時定時器
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        Utils.logger.error('❌ Gemini API 請求超時');
        return {
          text: language === 'en'
            ? '⏱️ Request timeout. Please try again.'
            : '⏱️ 請求超時，請稍後再試。',
          source: 'gemini',
          error: true
        };
      }
      
      throw error;
    }
    
  } catch (error) {
    Utils.logger.error('❌ Gemini API 調用失敗:', error.message || String(error));
    
    // 返回友善的錯誤訊息（不洩露技術細節）
    const userFriendlyMessage = language === 'en'
      ? '⚠️ Unable to get AI response. Please try again later or rephrase your question.'
      : '⚠️ 無法獲取 AI 回應。請稍後再試或重新表述您的問題。';
    
    return {
      text: userFriendlyMessage,
      source: 'gemini',
      error: true
    };
  }
}

// 連接 Rasa API（帶重試機制和緩存）
/**
 * 發送消息到 Rasa 伺服器
 * @param {string} message - 用戶消息
 * @returns {Promise<Array|null>} Rasa 響應數據，失敗時返回 null
 */
async function sendToRasa(message, retryCount = 0) {
  const MAX_SEND_RETRIES = 3;
  const RETRY_DELAY = 1000;
  
  try {
    const rasaUrl = getRasaServerURLDynamic();
    if (!rasaUrl) {
      Utils.logger.log('⚠️ Rasa 伺服器 URL 未設置');
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
      useRasa = false;
      return null;
    }
    
    // 如果連接狀態不是已連接，先嘗試檢查連接
    // 但如果最近剛檢查過且失敗，跳過重複檢查（避免頻繁請求）
    const timeSinceLastCheck = Date.now() - rasaLastHealthCheck;
    if (rasaConnectionState !== RasaConnectionState.CONNECTED) {
      // 如果最近 5 秒內剛檢查過且失敗，跳過重複檢查
      if (timeSinceLastCheck < 5000 && 
          (rasaConnectionState === RasaConnectionState.ERROR || 
           rasaConnectionState === RasaConnectionState.DISCONNECTED)) {
        Utils.logger.debug(`⏭️ 跳過重複連接檢查（${Math.round(timeSinceLastCheck / 1000)} 秒前已檢查）`);
        return null;
      }
      
      Utils.logger.log('🔄 連接狀態異常，嘗試重新連接...');
      const connected = await checkRasaConnection(true);
      if (!connected && retryCount === 0) {
        // 第一次失敗，嘗試重連一次
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return sendToRasa(message, retryCount + 1);
      }
      if (!connected) {
        return null;
      }
    }
    
    // 檢查緩存（僅對相同消息緩存）
    const cacheKey = `rasa-${rasaUrl}-${message}`;
    let cached = null;
    try {
      if (Utils.cache && typeof Utils.cache.get === 'function') {
        cached = Utils.cache.get(cacheKey);
        if (cached) {
          Utils.logger.log('📦 使用緩存的 Rasa 響應');
          return cached;
        }
      }
    } catch (cacheError) {
      Utils.logger.warn('緩存讀取失敗:', cacheError);
      // 繼續執行，不使用緩存
    }
    
    // 使用帶重試機制的請求（增加重試次數和超時時間）
    // 設置 10 秒超時，超時後會觸發 Gemini fallback
    const sessionId = getRasaSessionId();
    
    // 構建請求體（符合 Rasa REST Webhook 標準格式）
    const requestBody = {
      sender: sessionId, // 使用固定的會話 ID 維持對話上下文
      message: message.trim(), // 確保消息已修剪
      // metadata 是可選的，但可以包含額外信息
      metadata: {
        language: currentLanguage || 'zh',
        timestamp: Date.now(),
        source: 'web'
      }
    };
    
    // 構建 webhook URL（如果是相對路徑則直接使用，否則構建完整 URL）
    const webhookUrlForLog = rasaUrl.startsWith('/') 
      ? rasaUrl 
      : `${rasaUrl}/webhooks/rest/webhook`;
    Utils.logger.log(`📤 發送請求到 Rasa: ${webhookUrlForLog}`);
    Utils.logger.log(`📝 消息內容: ${message}`);
    Utils.logger.log(`🆔 會話 ID: ${sessionId}`);
    Utils.logger.log(`📦 請求體:`, JSON.stringify(requestBody, null, 2));
    
    // 創建 AbortController 用於超時控制（10秒）
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      Utils.logger.warn('⏱️ Rasa 請求超時（10秒），將觸發 Gemini fallback');
      timeoutController.abort();
    }, 10000); // 10 秒超時
    
    // 先測試意圖識別端點，確認 Rasa 能否識別意圖（僅在直接連接時測試）
    if (!rasaUrl.startsWith('/')) {
      Utils.logger.log('🔍 先測試 Rasa 意圖識別...');
      try {
        const parseResponse = await fetch(`${rasaUrl}/model/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: message
          })
        });
        
        if (parseResponse.ok) {
          const parseData = await parseResponse.json();
          Utils.logger.log('📊 Rasa 意圖識別結果:', JSON.stringify(parseData, null, 2));
          
          if (parseData.intent && parseData.intent.name) {
            Utils.logger.log('✅ Rasa 識別到意圖:', parseData.intent.name, '（置信度:', parseData.intent.confidence, '）');
          } else {
            Utils.logger.warn('⚠️ Rasa 未能識別意圖');
            Utils.logger.warn('📊 完整解析結果:', JSON.stringify(parseData, null, 2));
          }
        } else {
          Utils.logger.warn('⚠️ 意圖識別端點響應異常:', parseResponse.status);
        }
      } catch (parseError) {
        Utils.logger.warn('⚠️ 意圖識別測試失敗:', parseError.message);
        // 繼續執行，不影響主要流程
      }
    } else {
      Utils.logger.log('⏭️ 跳過意圖識別測試（使用 Vercel 代理）');
    }
    
    let response;
    try {
      // 根據環境自動選擇 URL（本地直接連接，生產環境使用 Vercel 代理）
      const rasaUrl = getRasaServerURLDynamic();
      const webhookUrl = buildRasaWebhookUrl(rasaUrl);
      
      Utils.logger.log(`📤 連接到 Rasa: ${webhookUrl}`);
      
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: sessionId,
          message: message.trim()
        }),
        signal: timeoutController.signal // 添加超時信號
      });
      
      // 清除超時定時器
      clearTimeout(timeoutId);
      
      // 檢查 CORS 錯誤
      if (response.status === 0 || (response.type === 'opaque' && !response.ok)) {
        Utils.logger.error('❌ CORS 錯誤：請求被瀏覽器阻止');
        Utils.logger.warn('💡 解決方法：在 Rasa 的 credentials.yml 中添加：');
        Utils.logger.warn('   rest:');
        Utils.logger.warn('     cors_origins:');
        Utils.logger.warn('       - "*"  # 或指定具體域名');
        throw new Error('CORS 錯誤：請求被瀏覽器阻止');
      }
    } catch (error) {
      // 清除超時定時器
      clearTimeout(timeoutId);
      
      // 檢查是否為超時錯誤
      if (error.name === 'AbortError' || error.message === '請求超時' || error.message.includes('timeout')) {
        Utils.logger.warn('⏱️ Rasa 請求超時，拋出超時錯誤以觸發 Gemini fallback');
        throw new Error('RASA_TIMEOUT'); // 使用特定錯誤標記
      }
      throw error; // 其他錯誤直接拋出
    }
    
    Utils.logger.log(`📥 收到 Rasa 響應:`, response.status, response.statusText);

    // 優化響應處理邏輯：先檢查狀態碼，再決定如何讀取響應
    let data;
    
    // 檢查響應狀態
    if (!response.ok) {
      // 對於錯誤響應，嘗試讀取錯誤訊息
      try {
        const errorText = await response.text();
        Utils.logger.warn(`⚠️ Rasa 響應錯誤內容:`, errorText.substring(0, 200));
        
        // 嘗試解析為 JSON（可能是結構化的錯誤訊息）
        try {
          data = JSON.parse(errorText);
        } catch (e) {
          // 如果不是 JSON，創建錯誤對象
          data = { error: errorText };
        }
      } catch (readError) {
        Utils.logger.error('❌ 無法讀取錯誤響應:', readError);
        data = { error: `HTTP ${response.status} ${response.statusText}` };
      }

      // 處理 503 錯誤（服務不可用）
      if (response.status === 503) {
        // 如果包含結構化的錯誤訊息數組，直接返回
        if (Array.isArray(data) && data.length > 0 && data[0].text) {
          Utils.logger.warn(`⚠️ Rasa 服務器不可用（503），返回錯誤訊息`);
          rasaConnectionState = RasaConnectionState.ERROR;
          return data;
        }
        // 否則創建友好的錯誤訊息
        rasaConnectionState = RasaConnectionState.ERROR;
        return [{
          text: '⚠️ Rasa 服務器暫時不可用，請稍後再試',
          recipient_id: getRasaSessionId()
        }];
      }
      
      // 處理 404 錯誤（端點不存在）
      if (response.status === 404) {
        Utils.logger.warn(`⚠️ Rasa 端點不存在：${response.status}`);
        rasaConnectionState = RasaConnectionState.ERROR;
        useRasa = false;
        stopRasaHealthCheck();
        throw new Error(`Rasa 端點不存在 (404)`);
      }
      
      // 處理 500+ 錯誤（伺服器錯誤）
      if (response.status >= 500) {
        // 針對 502 Bad Gateway 提供特殊處理（通常是配置問題，重試無效）
        if (response.status === 502) {
          Utils.logger.warn(`⚠️ Rasa 伺服器返回 502 Bad Gateway`);
          Utils.logger.warn(`💡 這通常表示後端服務器（Zeabur）未運行或配置錯誤`);
          Utils.logger.warn(`💡 建議：檢查 Zeabur 儀表板中的服務狀態和日誌`);
          Utils.logger.warn(`💡 502 錯誤通常是配置問題，重試不會解決`);
          rasaConnectionState = RasaConnectionState.ERROR;
          // 對於 502，不重試，直接返回錯誤訊息
          return [{
            text: '❌ 無法連接到 AI 伺服器（502 Bad Gateway）。請檢查 Zeabur 服務器狀態。',
            recipient_id: getRasaSessionId()
          }];
        }
        
        // 其他 5xx 錯誤，可能是暫時性的，嘗試重試（使用指數退避）
        if (retryCount < MAX_SEND_RETRIES) {
          const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000); // 指數退避，最多10秒
          const jitter = Math.random() * 0.3 * delay; // 添加隨機抖動
          const finalDelay = delay + jitter;
          Utils.logger.warn(`⚠️ Rasa 伺服器錯誤 ${response.status}，${Math.round(finalDelay)}ms 後重試（第 ${retryCount + 1}/${MAX_SEND_RETRIES} 次）...`);
          await new Promise(resolve => setTimeout(resolve, finalDelay));
          return sendToRasa(message, retryCount + 1);
        } else {
          Utils.logger.warn(`⚠️ Rasa 伺服器錯誤 ${response.status}，重試次數已達上限`);
          rasaConnectionState = RasaConnectionState.ERROR;
          throw new Error(`Rasa 伺服器錯誤 (${response.status})，重試次數已達上限`);
        }
      }
      
      // 處理其他錯誤（400, 401, 403 等）
      Utils.logger.warn(`⚠️ Rasa 請求錯誤：${response.status}`);
      throw new Error(`HTTP error! status: ${response.status}${data.error ? ` - ${data.error}` : ''}`);
    }
    
    // 成功響應，讀取數據
    try {
      const text = await response.text();
      Utils.logger.log(`📄 Rasa 響應原始內容:`, text);
      Utils.logger.log(`📄 Rasa 響應長度:`, text.length, '字符');
      
      // 檢查是否為空字符串
      if (!text || text.trim().length === 0) {
        Utils.logger.warn('⚠️ Rasa 響應為空字符串');
        Utils.logger.warn('💡 這可能表示：');
        Utils.logger.warn('   1. Rasa 模型沒有正確訓練');
        Utils.logger.warn('   2. Rasa 配置問題（沒有匹配的意圖或動作）');
        Utils.logger.warn('   3. Rasa webhook 配置問題');
        Utils.logger.warn('   4. 請求格式不正確');
        return [];
      }
      
      data = JSON.parse(text);
    } catch (parseError) {
      Utils.logger.error('❌ Rasa 響應解析失敗:', parseError);
      Utils.logger.error('❌ 原始響應內容:', text?.substring(0, 500));
      throw new Error(`無法解析 Rasa 響應: ${parseError.message}`);
    }
    
    Utils.logger.log(`📊 Rasa 響應數據類型:`, typeof data);
    Utils.logger.log(`📊 Rasa 響應數據:`, JSON.stringify(data, null, 2));
    
    // 驗證並標準化響應格式
    let responseArray = null;
    if (Array.isArray(data)) {
      responseArray = data;
      Utils.logger.log(`📊 Rasa 響應是數組，長度:`, responseArray.length);
    } else if (data && typeof data === 'object') {
      // 如果是對象，嘗試轉換為數組
      if (data.length !== undefined) {
        // 類數組對象
        responseArray = Array.from(data);
        Utils.logger.log('🔄 Rasa 響應格式已轉換為數組（類數組對象）:', responseArray.length);
      } else {
        // 單個響應對象，轉換為數組
        responseArray = [data];
        Utils.logger.log('🔄 Rasa 響應格式已轉換為數組（單個對象）');
      }
      Utils.logger.log('🔄 轉換後的響應:', JSON.stringify(responseArray, null, 2));
    } else {
      Utils.logger.warn('⚠️ Rasa 響應格式無效:', typeof data, data);
      if (retryCount < MAX_SEND_RETRIES) {
        const delay = Math.min(RETRY_DELAY * Math.pow(2, retryCount), 10000);
        const jitter = Math.random() * 0.3 * delay;
        const finalDelay = delay + jitter;
        Utils.logger.warn(`⚠️ 響應格式錯誤，${Math.round(finalDelay)}ms 後重試...`);
        await new Promise(resolve => setTimeout(resolve, finalDelay));
        return sendToRasa(message, retryCount + 1);
      }
      rasaConnectionState = RasaConnectionState.ERROR;
      return null;
    }
    
    // 檢查數組是否為空
    if (!responseArray || responseArray.length === 0) {
      Utils.logger.warn('⚠️ Rasa 響應為空數組');
      Utils.logger.warn('💡 可能的原因：');
      Utils.logger.warn('   1. Rasa 模型沒有匹配的意圖');
      Utils.logger.warn('   2. Rasa 動作沒有返回任何響應');
      Utils.logger.warn('   3. Rasa 配置問題（domain.yml 或 stories.yml）');
      Utils.logger.warn('   4. Rasa 會話狀態問題');
      Utils.logger.warn('   5. Rasa Action Server 未運行或未正確配置');
      Utils.logger.warn('💡 建議：');
      Utils.logger.warn('   - 檢查 Rasa 伺服器日誌（終端輸出）');
      Utils.logger.warn('   - 確認 Rasa 模型已正確訓練');
      Utils.logger.warn('   - 確認 Rasa Action Server 正在運行（rasa run actions）');
      Utils.logger.warn('   - 測試 Rasa webhook 端點：curl -X POST http://localhost:5005/webhooks/rest/webhook -H "Content-Type: application/json" -d \'{"sender":"test","message":"你好"}\'');
      Utils.logger.warn('   - 測試 Rasa 意圖識別：curl -X POST http://localhost:5005/model/parse -H "Content-Type: application/json" -d \'{"text":"你好"}\'');
      
      // 嘗試使用 /model/parse 端點來診斷問題
      Utils.logger.log('🔍 使用 /model/parse 端點診斷問題...');
      try {
        const parseResponse = await fetch(`${rasaUrl}/model/parse`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            text: message
          })
        });
        
        if (parseResponse.ok) {
          const parseData = await parseResponse.json();
          Utils.logger.log('📊 /model/parse 響應:', JSON.stringify(parseData, null, 2));
          
          if (parseData.intent && parseData.intent.name) {
            Utils.logger.log('✅ 意圖識別成功:', parseData.intent.name, '（置信度:', parseData.intent.confidence, '）');
            Utils.logger.warn('⚠️ 意圖識別成功但 webhook 返回空數組');
            Utils.logger.warn('📊 診斷結果：這是 Action Server 或配置問題，不是模型問題');
            Utils.logger.warn('💡 解決方法：');
            Utils.logger.warn('   1. 確認 Action Server 正在運行：rasa run actions');
            Utils.logger.warn('   2. 檢查 endpoints.yml 中的 action_endpoint 配置');
            Utils.logger.warn('   3. 檢查 actions.py 中的動作是否正確返回響應');
            Utils.logger.warn('   4. 檢查 domain.yml 中是否有對應的響應模板');
            Utils.logger.warn('   5. 檢查 stories.yml 或 rules.yml 中的對話流程');
            
            // 嘗試檢查 Action Server
            Utils.logger.log('🔍 檢查 Action Server 連接...');
            try {
              // 根據環境自動選擇 Action Server URL
              const actionServerUrl = getActionServerURLDynamic();
              const actionWebhookUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
                ? `${actionServerUrl}/webhook`  // 本地開發，添加 /webhook 路徑
                : actionServerUrl;  // 生產環境（使用 Vercel 代理）
              
              const actionCheck = await fetch(actionWebhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ next_action: 'action_listen', tracker: { latest_message: { text: 'test' } } })
              });
              if (actionCheck.ok) {
                Utils.logger.log('✅ Action Server 正在運行');
              } else {
                Utils.logger.warn('⚠️ Action Server 響應異常:', actionCheck.status);
              }
            } catch (actionError) {
              Utils.logger.error('❌ Action Server 未運行或無法連接');
              if (hostname === 'localhost' || hostname === '127.0.0.1') {
                Utils.logger.warn('💡 請在終端執行：rasa run actions');
              }
            }
          } else {
            Utils.logger.warn('⚠️ 意圖識別失敗，可能是模型問題');
            Utils.logger.warn('📊 診斷結果：這是 NLU 模型問題，不是 Action Server 問題');
            Utils.logger.warn('💡 解決方法：');
            Utils.logger.warn('   1. 重新訓練模型：rasa train');
            Utils.logger.warn('   2. 檢查 nlu.yml 中的訓練數據');
            Utils.logger.warn('   3. 確認意圖名稱是否正確');
            Utils.logger.warn('   4. 檢查 config.yml 中的 NLU 管道配置');
          }
        } else {
          Utils.logger.warn('⚠️ /model/parse 端點響應異常:', parseResponse.status);
        }
      } catch (parseError) {
        Utils.logger.warn('⚠️ /model/parse 測試失敗:', parseError.message);
      }
      
      return [];
    }
    
    // 成功收到響應，更新連接狀態
    rasaConnectionState = RasaConnectionState.CONNECTED;
    rasaConnectionRetries = 0;
    rasaLastHealthCheck = Date.now();
    
    // 緩存響應（短時間緩存，避免重複請求）
    try {
      if (Utils.cache && typeof Utils.cache.set === 'function') {
        Utils.cache.set(cacheKey, responseArray, 30000); // 30 秒緩存
      }
    } catch (cacheError) {
      Utils.logger.warn('緩存寫入失敗:', cacheError);
      // 繼續執行，不影響主要功能
    }
    
    return responseArray;
  } catch (error) {
    // 網絡錯誤時，根據錯誤類型決定是否重試
    // 計算重試延遲（指數退避 + 隨機抖動）
    const calculateRetryDelay = (retryCount) => {
      const baseDelay = RETRY_DELAY;
      const exponentialDelay = Math.min(baseDelay * Math.pow(2, retryCount), 10000); // 指數退避，最多10秒
      const jitter = Math.random() * 0.3 * exponentialDelay; // 添加30%的隨機抖動，避免驚群效應
      return exponentialDelay + jitter;
    };
    
    if (error.name === 'AbortError') {
      Utils.logger.warn('⏱️ Rasa 請求超時');
      if (retryCount < MAX_SEND_RETRIES) {
        const delay = calculateRetryDelay(retryCount);
        Utils.logger.warn(`⏱️ 請求超時，${Math.round(delay)}ms 後重試（第 ${retryCount + 1}/${MAX_SEND_RETRIES} 次）...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendToRasa(message, retryCount + 1);
      }
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
      useRasa = false;
    } else if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      Utils.logger.warn('🌐 Rasa 網絡連接失敗');
      if (retryCount < MAX_SEND_RETRIES) {
        const delay = calculateRetryDelay(retryCount);
        Utils.logger.warn(`🌐 網絡錯誤，${Math.round(delay)}ms 後重試（第 ${retryCount + 1}/${MAX_SEND_RETRIES} 次）...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendToRasa(message, retryCount + 1);
      }
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
      useRasa = false;
    } else {
      Utils.logger.warn('❌ Rasa 連接失敗:', error.message || String(error));
      if (retryCount < MAX_SEND_RETRIES && !error.message.includes('HTTP error')) {
        const delay = calculateRetryDelay(retryCount);
        Utils.logger.warn(`❌ 連接失敗，${Math.round(delay)}ms 後重試（第 ${retryCount + 1}/${MAX_SEND_RETRIES} 次）...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return sendToRasa(message, retryCount + 1);
      }
      rasaConnectionState = RasaConnectionState.ERROR;
      useRasa = false;
    }
    return null;
  }
}

// 簡化的 Rasa 消息發送函數（直接連接到 Rasa，不通過 Vercel 代理）
async function sendMessageToRasa(message, senderId = 'user-123') {
  try {
    // 獲取 Rasa 服務器 URL（默認直接連接到 Zeabur）
    const rasaUrl = getRasaServerURLDynamic();
    const webhookUrl = buildRasaWebhookUrl(rasaUrl);
    
    Utils.logger.log(`📤 連接到 Rasa: ${webhookUrl}`);
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: senderId,
        message: message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    Utils.logger.log('📥 Rasa response:', data);
    return data;
  } catch (error) {
    Utils.logger.error('❌ Error sending message to Rasa:', error);
    throw error;
  }
}

// 處理 Rasa 回應
function handleRasaResponse(rasaData) {
  if (!rasaData || !Array.isArray(rasaData) || rasaData.length === 0) {
    Utils.logger.warn('⚠️ handleRasaResponse: 響應為空或不是數組', rasaData);
    return null;
  }

  // 提取實際的 Rasa 響應數據
  // 如果響應被包裝在 {data: [...], duration: ..., success: ...} 中，需要提取 data
  let actualRasaData = rasaData;
  if (rasaData.length === 1 && rasaData[0] && typeof rasaData[0] === 'object') {
    const firstItem = rasaData[0];
    // 檢查是否是包裝格式 {data: [...], duration: ..., success: ...}
    if (firstItem.data && Array.isArray(firstItem.data)) {
      Utils.logger.log('🔄 檢測到包裝格式，提取 data 數組');
      actualRasaData = firstItem.data;
    }
  }

  if (!actualRasaData || !Array.isArray(actualRasaData) || actualRasaData.length === 0) {
    Utils.logger.warn('⚠️ handleRasaResponse: 提取後的數據為空', actualRasaData);
    return null;
  }

  let responseText = '';
  let actionData = null;
  // 擴展的 fallback 關鍵字列表（中英文）
  const fallbackKeywords = [
    // 中文 fallback 關鍵字
    '我不太確定您的問題',
    '我不太確定您的意思',
    '抱歉，我不太確定',
    '您可以試試',
    '您可以試試問我',
    '無法理解',
    '不太清楚',
    '不清楚',
    '不明白',
    '不理解',
    '需要更多資訊',
    '需要更多信息',
    '需要更多訊息',
    '請提供更多',
    '請再說一次',
    '請重新說明',
    '我不太明白',
    '我不太清楚',
    '我不太理解',
    '抱歉，我無法理解',
    '抱歉，我不太明白',
    '抱歉，我不太清楚',
    '對不起，我不太確定',
    '對不起，我無法理解',
    // 英文 fallback 關鍵字
    'I\'m not sure',
    'Sorry, I\'m not sure',
    'You can try',
    'I don\'t understand',
    'I\'m not sure what you mean',
    'I\'m not quite sure',
    'I don\'t quite understand',
    'I\'m not clear',
    'I need more information',
    'Could you provide more',
    'Please say that again',
    'Please rephrase',
    'I\'m not quite clear',
    'I\'m not quite sure what you mean',
    'Sorry, I don\'t understand',
    'Sorry, I\'m not quite sure',
    'I may need more information',
    'Can you clarify',
    'Could you clarify'
  ];

  Utils.logger.log('🔍 處理 Rasa 響應，項目數:', actualRasaData.length);
  
  // 先檢查是否有 action
  actualRasaData.forEach((item, index) => {
    if (item && typeof item === 'object' && item.custom && typeof item.custom === 'object' && item.custom.action) {
      actionData = item.custom;
      Utils.logger.log(`🎯 找到 Action: ${actionData.action}`, actionData);
      // 確保 actionData 包含語言資訊
      if (!actionData.language) {
        actionData.language = currentLanguage;
      }
    }
  });
  
  // 處理文本回應（如果有 action，過濾掉 fallback 文本）
  actualRasaData.forEach((item, index) => {
    Utils.logger.log(`🔍 處理項目 ${index}:`, item);
    
    // 處理文本回應
    if (item && typeof item === 'object') {
      if (item.text && typeof item.text === 'string') {
        // 如果有 action，檢查是否為 fallback 文本
        // 但對於 action_greet，不應該過濾文字
        if (actionData && actionData.action !== 'action_greet') {
          const isFallback = fallbackKeywords.some(keyword => item.text.includes(keyword));
          if (isFallback) {
            Utils.logger.log(`🚫 過濾 fallback 文本: ${item.text}`);
            return; // 跳過 fallback 文本
          }
        }
        responseText += item.text + '\n';
        Utils.logger.log(`📝 找到文本: ${item.text}`);
      }
      
      // 處理結構化回應（JSON 訊息）- 已在上面處理
      if (item.custom && typeof item.custom === 'object' && item.custom.action) {
        // 已在上面處理，這裡不需要重複
      } else if (item.custom) {
        Utils.logger.log(`⚠️ 項目 ${index} 有 custom 但沒有 action:`, item.custom);
      }
    } else {
      Utils.logger.warn(`⚠️ 項目 ${index} 不是對象:`, typeof item, item);
    }
  });

  // 如果沒有文本也沒有動作，返回 null（標記為 fallback）
  const trimmedText = responseText.trim();
  Utils.logger.log(`📊 處理結果 - 文本: "${trimmedText}", Action:`, actionData);
  
  if (!trimmedText && !actionData) {
    Utils.logger.warn('⚠️ handleRasaResponse: 沒有文本也沒有 Action，標記為 fallback');
    return {
      text: '',
      action: null,
      isFallback: true // 明確標記為 fallback
    };
  }

  // 檢查文本是否包含 fallback 關鍵字
  const textLower = trimmedText.toLowerCase();
  const isFallbackText = fallbackKeywords.some(keyword => 
    textLower.includes(keyword.toLowerCase())
  );

  const result = {
    text: trimmedText || '', // 允許空字符串（如果有 action）
    action: actionData,
    isFallback: isFallbackText // 標記是否為 fallback 回應
  };
  
  if (isFallbackText) {
    Utils.logger.log('🚫 檢測到 fallback 回應，標記為需要 Gemini fallback');
  }
  
  Utils.logger.log('✅ handleRasaResponse 返回:', result);
  return result;
}

// 檢測輸入語言
// 使用統一的語言檢測器（向後兼容）
function detectInputLanguage(text) {
  return LanguageDetector.detect(text);
}

// ============================================
// 用戶輸入處理相關函數（改進：函數拆分）
// ============================================

/**
 * 錯別字修正映射表（常見錯別字 → 正確字）
 * 說明：
 * - 盡量模擬「一句最多一個錯別字」的情境，所以以常見片語為單位做替換
 * - 主要針對「什／甚」、「哪／那」這兩組容易混淆的字
 */
const TYPO_CORRECTIONS = {
  // 什麼相關（把「什」錯打成「甚」）
  '甚麼': '什麼',
  '甚麼是': '什麼是',
  '是甚麼': '是什麼',
  '有甚麼': '有什麼',
  '甚麼地方': '什麼地方',
  '甚麼時候': '什麼時候',
  '甚麼東西': '什麼東西',
  '甚麼設施': '什麼設施',
  '甚麼建築': '什麼建築',

  // 哪裡／哪邊／哪兒 相關（把「哪」錯打成「那」）
  '那裡': '哪裡',
  '那裏': '哪裡',
  '那兒': '哪兒',
  '那邊': '哪邊',
  '那裡有': '哪裡有',
  '那裏有': '哪裡有',
  '在那裡': '在哪裡',
  '在那裏': '在哪裡',
  '在那兒': '在哪兒',
  '在那邊': '在哪邊',
  '到那裡': '到哪裡',
  '到那裏': '到哪裡',
  '到那兒': '到哪兒',
  '到那邊': '到哪邊',

  // 其他常見錯別字（地點相關，只改一個字的常見句型）
  '廁所在那': '廁所在哪',
  '廁所在那裡': '廁所在哪裡',
  '廁所在那裏': '廁所在哪裡',
  '廁所在那兒': '廁所在哪兒',
  '廁所在那邊': '廁所在哪邊',
  '飲水機在那': '飲水機在哪',
  '飲水機在那裡': '飲水機在哪裡',
  '飲水機在那裏': '飲水機在哪裡',
  '飲水機在那兒': '飲水機在哪兒',
  '飲水機在那邊': '飲水機在哪邊',
  '垃圾桶在那': '垃圾桶在哪',
  '垃圾桶在那裡': '垃圾桶在哪裡',
  '垃圾桶在那裏': '垃圾桶在哪裡',
  '垃圾桶在那兒': '垃圾桶在哪兒',
  '垃圾桶在那邊': '垃圾桶在哪邊',
  '建築在那': '建築在哪',
  '建築在那裡': '建築在哪裡',
  '建築在那裏': '建築在哪裡',
  '建築在那兒': '建築在哪兒',
  '建築在那邊': '建築在哪邊',
  '校區在那': '校區在哪',
  '校區在那裡': '校區在哪裡',
  '校區在那裏': '校區在哪裡',
  '校區在那兒': '校區在哪兒',
  '校區在那邊': '校區在哪邊',

  // 英文常見錯誤（拼寫錯誤）
  'wher': 'where',
  'whre': 'where',
  'wherre': 'where',
  'wat': 'what',
  'wht': 'what',
  'waht': 'what',
  'neerest': 'nearest',
  'neares': 'nearest',
  'tolet': 'toilet',
  'toilte': 'toilet',
  'restrom': 'restroom',
  'restromm': 'restroom',
  'bathrom': 'bathroom',
  'bathromm': 'bathroom',
  'wter': 'water',
  'watr': 'water',
  'fountan': 'fountain',
  'fountin': 'fountain',
  'tras': 'trash',
  'trsh': 'trash',
  'garbge': 'garbage',
  'garbag': 'garbage',
  'fnd': 'find',
  'fidn': 'find',
  'locaton': 'location',
  'locatin': 'location',
  'buildng': 'building',
  'builidng': 'building',
  'camps': 'campus',
  'campu': 'campus',
  'facilty': 'facility',
  'faciliy': 'facility',
  'facilites': 'facilities',
  'facilitis': 'facilities',
  'shw': 'show',
  'sow': 'show',
  'tel': 'tell',
  'tll': 'tell',
  'hlp': 'help',
  'hepl': 'help',
  'ned': 'need',
  'nead': 'need',
  'wnt': 'want',
  'pleas': 'please',
  'plese': 'please',
  'pleae': 'please',
  'thnks': 'thanks',
  'thaks': 'thanks',
  'thnk': 'thank',
  'thak': 'thank',
  
  // 英文口語縮寫（保持原樣，但可以識別）
  // 注意：這些不應該被"修正"，因為它們是有效的口語表達
  // 但我們可以在訓練資料中包含它們
};

/**
 * 同義詞擴展映射表（用於增強意圖識別）
 */
const SYNONYM_EXPANSIONS = {
  // 廁所相關
  '廁所': ['廁所', '洗手間', '衛生間', 'toilet', 'restroom', 'bathroom', 'WC'],
  '男廁': ['男廁', '男生廁所', '男性廁所', 'men\'s', 'men', 'male'],
  '女廁': ['女廁', '女生廁所', '女性廁所', 'women\'s', 'women', 'female', 'ladies'],
  // 飲水機相關
  '飲水機': ['飲水機', '飲水器', 'water fountain', 'water dispenser', 'drinking fountain'],
  // 垃圾桶相關
  '垃圾桶': ['垃圾桶', '垃圾筒', 'trash can', 'garbage can', 'bin', 'waste bin'],
  // 查詢動詞
  '找': ['找', '尋找', '搜尋', '查詢', '找尋', 'find', 'search', 'look for'],
  '最近的': ['最近的', '最近的', 'nearest', 'closest', 'nearby'],
  '在哪': ['在哪', '在哪裡', '位置', 'where', 'location'],
  '有什麼': ['有什麼', '有哪些', '有什麼設施', 'what', 'what facilities'],
  // 建築相關
  '建築': ['建築', '大樓', '館', 'building', 'hall'],
  '校區': ['校區', '校園', 'campus']
};

/**
 * 意圖關鍵詞映射（用於精確識別用戶意圖）
 */
const INTENT_KEYWORDS = {
  find_nearest: {
    patterns: [
      /最近的(.+?)(?:在哪|位置|where)/i,
      /找(.+?)(?:在哪|位置|where)/i,
      /(.+?)(?:在哪|位置|where)/i,
      /nearest\s+(.+?)(?:\s+where|\s+location)/i,
      /find\s+(.+?)(?:\s+where|\s+near)/i
    ],
    facility_types: ['廁所', '飲水機', '垃圾桶', 'toilet', 'water', 'trash']
  },
  query_info: {
    patterns: [
      /(.+?)(?:有什麼|有哪些|有什麼設施|what|what facilities)/i,
      /(.+?)(?:的設施|的資訊|information|facilities)/i
    ],
    targets: ['建築', '校區', 'building', 'campus']
  },
  report_issue: {
    keywords: ['回報', '報告', '問題', '壞了', '故障', '損壞', '髒', '漏水', 'report', 'broken', 'damaged', 'issue', 'problem']
  }
};

/**
 * 修正錯別字
 * @param {string} text - 原始文本
 * @returns {string} 修正後的文本
 */
function correctTypos(text) {
  if (!text || typeof text !== 'string') return text;
  
  let corrected = text;
  
  // 按長度排序，先替換長詞組，避免短詞組覆蓋長詞組
  const sortedCorrections = Object.entries(TYPO_CORRECTIONS)
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [typo, correct] of sortedCorrections) {
    // 使用正則表達式進行單詞邊界匹配，避免部分匹配
    const regex = new RegExp(typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    corrected = corrected.replace(regex, correct);
  }
  
  if (corrected !== text) {
    Utils.logger.log('🔧 錯別字修正:', { original: text, corrected: corrected });
  }
  
  return corrected;
}

/**
 * 擴展同義詞（增強查詢匹配）
 * @param {string} query - 原始查詢
 * @returns {string} 擴展後的查詢
 */
function expandSynonyms(query) {
  if (!query || typeof query !== 'string') return query;
  
  let expanded = query;
  
  // 對每個同義詞組進行擴展
  for (const [key, synonyms] of Object.entries(SYNONYM_EXPANSIONS)) {
    for (const synonym of synonyms) {
      // 如果查詢中包含同義詞，添加主要關鍵詞（如果還沒有）
      if (expanded.toLowerCase().includes(synonym.toLowerCase()) && 
          !expanded.toLowerCase().includes(key.toLowerCase())) {
        // 在查詢中添加主要關鍵詞（用於增強匹配）
        expanded = `${expanded} ${key}`;
        break;
      }
    }
  }
  
  return expanded.trim();
}

// ============================================
// 輸入增強功能（提升便利性和準確性）
// ============================================

/**
 * 獲取所有建築名稱列表（用於自動完成）
 * @returns {Array<string>} 建築名稱數組
 */
function getAllBuildingNames() {
  const buildings = [];
  Object.values(buildingLocations).forEach(campusBuildings => {
    campusBuildings.forEach(building => {
      if (building.name && !buildings.includes(building.name)) {
        buildings.push(building.name);
      }
    });
  });
  return buildings.sort();
}

/**
 * 獲取所有設施類型關鍵詞（用於自動完成）
 * @returns {Array<string>} 設施類型關鍵詞數組
 */
function getFacilityTypeKeywords() {
  const lang = currentLanguage === 'en' ? 'en' : 'zh';
  if (lang === 'en') {
    return [
      'restroom', 'toilet', 'bathroom', 'WC',
      'water fountain', 'water dispenser', 'drinking fountain',
      'trash can', 'garbage can', 'bin', 'waste bin'
    ];
  } else {
    return [
      '廁所', '洗手間', '衛生間', 'WC',
      '飲水機', '飲水器',
      '垃圾桶', '垃圾筒'
    ];
  }
}

/**
 * 獲取常用查詢模板（用於自動完成）
 * @returns {Array<string>} 查詢模板數組
 */
function getCommonQueryTemplates() {
  const lang = currentLanguage === 'en' ? 'en' : 'zh';
  if (lang === 'en') {
    return [
      'where is the nearest restroom',
      'where is the nearest water fountain',
      'where is the nearest trash can',
      'what facilities are in Campus 1',
      'what buildings are in Campus 1',
      'show me the route to the restroom',
      'report a problem',
      'what can you do'
    ];
  } else {
    return [
      '最近的廁所在哪',
      '最近的飲水機在哪',
      '最近的垃圾桶在哪',
      '第一校區有什麼設施',
      '第一校區有哪些建築',
      '智能路線規劃到廁所',
      '快速回報問題',
      '你有什麼功能'
    ];
  }
}

/**
 * 獲取輸入歷史記錄（最近 20 條）
 * @returns {Array<string>} 歷史記錄數組
 */
function getInputHistory() {
  try {
    const history = Utils.storage.get('inputHistory', []);
    return history.slice(0, 20); // 只返回最近 20 條
  } catch (e) {
    Utils.logger.warn('讀取輸入歷史失敗:', e);
    return [];
  }
}

/**
 * 保存輸入歷史記錄
 * @param {string} query - 用戶輸入
 */
function saveInputHistory(query) {
  if (!query || query.trim().length === 0) return;
  
  try {
    const history = Utils.storage.get('inputHistory', []);
    const trimmedQuery = query.trim();
    
    // 移除重複項
    const filteredHistory = history.filter(item => item !== trimmedQuery);
    
    // 添加到開頭
    filteredHistory.unshift(trimmedQuery);
    
    // 限制數量（最多 50 條）
    const limitedHistory = filteredHistory.slice(0, 50);
    
    Utils.storage.set('inputHistory', limitedHistory);
  } catch (e) {
    Utils.logger.warn('保存輸入歷史失敗:', e);
  }
}

/**
 * 模糊匹配（用於自動完成建議）
 * @param {string} query - 查詢字符串
 * @param {Array<string>} candidates - 候選字符串數組
 * @param {number} maxResults - 最大結果數
 * @returns {Array<string>} 匹配結果數組
 */
function fuzzyMatch(query, candidates, maxResults = 5) {
  if (!query || query.trim().length === 0) return [];
  
  const queryLower = query.toLowerCase().trim();
  const results = [];
  
  for (const candidate of candidates) {
    const candidateLower = candidate.toLowerCase();
    
    // 完全匹配（優先級最高）
    if (candidateLower === queryLower) {
      results.unshift(candidate); // 添加到開頭
      continue;
    }
    
    // 開頭匹配（優先級次高）
    if (candidateLower.startsWith(queryLower)) {
      results.push(candidate);
      continue;
    }
    
    // 包含匹配
    if (candidateLower.includes(queryLower)) {
      results.push(candidate);
      continue;
    }
    
    // 字符順序匹配（例如 "cs" 匹配 "campus"）
    let queryIndex = 0;
    for (let i = 0; i < candidateLower.length && queryIndex < queryLower.length; i++) {
      if (candidateLower[i] === queryLower[queryIndex]) {
        queryIndex++;
      }
    }
    if (queryIndex === queryLower.length) {
      results.push(candidate);
    }
  }
  
  return results.slice(0, maxResults);
}

/**
 * 生成自動完成建議
 * @param {string} query - 當前輸入
 * @returns {Array<string>} 建議列表
 */
function generateAutocompleteSuggestions(query) {
  if (!query || query.trim().length < 1) return [];
  
  const trimmedQuery = query.trim();
  const suggestions = [];
  
  // 1. 從輸入歷史中匹配
  const history = getInputHistory();
  const historyMatches = fuzzyMatch(trimmedQuery, history, 3);
  suggestions.push(...historyMatches);
  
  // 2. 從建築名稱中匹配
  const buildings = getAllBuildingNames();
  const buildingMatches = fuzzyMatch(trimmedQuery, buildings, 3);
  buildingMatches.forEach(building => {
    const suggestion = currentLanguage === 'en' 
      ? `what facilities are in ${building}`
      : `${building}有什麼設施`;
    if (!suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  });
  
  // 3. 從設施類型關鍵詞中匹配
  const facilityKeywords = getFacilityTypeKeywords();
  const facilityMatches = fuzzyMatch(trimmedQuery, facilityKeywords, 2);
  facilityMatches.forEach(facility => {
    const suggestion = currentLanguage === 'en'
      ? `where is the nearest ${facility}`
      : `最近的${facility}在哪`;
    if (!suggestions.includes(suggestion)) {
      suggestions.push(suggestion);
    }
  });
  
  // 4. 從常用查詢模板中匹配
  const templates = getCommonQueryTemplates();
  const templateMatches = fuzzyMatch(trimmedQuery, templates, 2);
  suggestions.push(...templateMatches);
  
  // 去重並限制數量
  const uniqueSuggestions = [...new Set(suggestions)];
  return uniqueSuggestions.slice(0, 5);
}

/**
 * 顯示自動完成建議
 * @param {HTMLElement} inputElement - 輸入框元素
 * @param {Array<string>} suggestions - 建議列表
 */
function showAutocomplete(inputElement, suggestions) {
  if (!inputElement || !suggestions || suggestions.length === 0) {
    hideAutocomplete();
    return;
  }
  
  // 移除現有的自動完成容器
  hideAutocomplete();
  
  // 創建自動完成容器
  const container = document.createElement('div');
  container.id = 'autocomplete-container';
  container.className = 'autocomplete-container';
  container.style.cssText = `
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--bg-secondary, #1e293b);
    border: 1px solid var(--border-color, #334155);
    border-radius: 8px;
    margin-top: 4px;
    max-height: 200px;
    overflow-y: auto;
    z-index: 1000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;
  
  // 添加建議項目
  suggestions.forEach((suggestion, index) => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.textContent = suggestion;
    item.style.cssText = `
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 1px solid var(--border-color, #334155);
      transition: background-color 0.2s;
    `;
    
    // 懸停效果
    item.addEventListener('mouseenter', function() {
      this.style.backgroundColor = 'var(--hover-bg, #334155)';
    });
    item.addEventListener('mouseleave', function() {
      this.style.backgroundColor = 'transparent';
    });
    
    // 點擊選擇
    item.addEventListener('click', function() {
      inputElement.value = suggestion;
      inputElement.focus();
      hideAutocomplete();
      // 觸發輸入事件以更新狀態
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    });
    
    container.appendChild(item);
  });
  
  // 插入到輸入框的父容器中
  const inputWrapper = inputElement.closest('.input-wrapper');
  if (inputWrapper) {
    inputWrapper.style.position = 'relative';
    inputWrapper.appendChild(container);
  }
}

/**
 * 隱藏自動完成建議
 */
function hideAutocomplete() {
  const container = document.getElementById('autocomplete-container');
  if (container) {
    container.remove();
  }
}

/**
 * 初始化輸入增強功能
 * @param {HTMLElement} inputElement - 輸入框元素
 */
function initInputEnhancements(inputElement) {
  if (!inputElement) return;
  
  let autocompleteTimeout = null;
  let selectedSuggestionIndex = -1;
  let currentSuggestions = [];
  
  // 輸入事件：顯示自動完成建議
  Utils.events.on(inputElement, 'input', Utils.performance.debounce(function(e) {
    const query = e.target.value.trim();
    
    // 清除之前的定時器
    if (autocompleteTimeout) {
      clearTimeout(autocompleteTimeout);
    }
    
    if (query.length === 0) {
      hideAutocomplete();
      return;
    }
    
    // 延遲顯示建議（避免頻繁更新）
    autocompleteTimeout = Utils.timers.setTimeout(function() {
      const suggestions = generateAutocompleteSuggestions(query);
      currentSuggestions = suggestions;
      selectedSuggestionIndex = -1;
      
      if (suggestions.length > 0) {
        showAutocomplete(inputElement, suggestions);
      } else {
        hideAutocomplete();
      }
    }, 300);
  }, 300));
  
  // 更新建議選擇狀態（輔助函數）
  function updateSuggestionSelection(items, index) {
    items.forEach((item, i) => {
      if (i === index) {
        item.style.backgroundColor = 'var(--hover-bg, #334155)';
        item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else {
        item.style.backgroundColor = 'transparent';
      }
    });
  }
  
  // 鍵盤導航：上下箭頭選擇建議
  Utils.events.on(inputElement, 'keydown', function(e) {
    const container = document.getElementById('autocomplete-container');
    if (!container || currentSuggestions.length === 0) {
      // 如果沒有建議，支持 Tab 鍵自動完成
      if (e.key === 'Tab' && inputElement.value.trim().length > 0) {
        const suggestions = generateAutocompleteSuggestions(inputElement.value);
        if (suggestions.length > 0) {
          e.preventDefault();
          inputElement.value = suggestions[0];
          hideAutocomplete();
          inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
      return;
    }
    
    const items = container.querySelectorAll('.autocomplete-item');
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, items.length - 1);
      updateSuggestionSelection(items, selectedSuggestionIndex);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
      updateSuggestionSelection(items, selectedSuggestionIndex);
    } else if (e.key === 'Enter' && selectedSuggestionIndex >= 0) {
      e.preventDefault();
      if (items[selectedSuggestionIndex]) {
        items[selectedSuggestionIndex].click();
      }
    } else if (e.key === 'Escape') {
      hideAutocomplete();
      selectedSuggestionIndex = -1;
    }
  });
  
  // 點擊外部區域隱藏建議
  document.addEventListener('click', function(e) {
    if (!inputElement.contains(e.target) && 
        !document.getElementById('autocomplete-container')?.contains(e.target)) {
      hideAutocomplete();
    }
  });
}

/**
 * 標準化查詢格式
 * @param {string} query - 原始查詢
 * @returns {string} 標準化後的查詢
 */
function normalizeQuery(query) {
  if (!query || typeof query !== 'string') return query;
  
  let normalized = query;
  
  // 移除多餘空格
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  // 標準化標點符號
  normalized = normalized.replace(/[？?]/g, '?');
  normalized = normalized.replace(/[！!]/g, '!');
  normalized = normalized.replace(/[，,]/g, ',');
  normalized = normalized.replace(/[。.]/g, '.');
  
  // 移除開頭的無意義詞
  normalized = normalized.replace(/^(請問|我想問|幫我|幫我找|幫我查|幫我查詢|請|麻煩)/i, '');
  normalized = normalized.trim();
  
  return normalized;
}

/**
 * 增強實體提取（更準確地識別建築、樓層、設施等）
 * @param {string} query - 查詢文本
 * @returns {Object} 提取的實體 {building, floor, facilityType, campus, gender}
 */
function enhanceEntityExtraction(query) {
  if (!query || typeof query !== 'string') return {};
  
  const entities = {
    building: null,
    floor: null,
    facilityType: null,
    campus: null,
    gender: null
  };
  
  const queryLower = query.toLowerCase();
  
  // 1. 提取建築名稱（使用模糊匹配）
  const allBuildings = getAllBuildingNames();
  for (const building of allBuildings) {
    // 完全匹配
    if (query.includes(building)) {
      entities.building = building;
      break;
    }
    // 部分匹配（建築名稱的一部分）
    if (building.length >= 3 && query.includes(building.substring(0, Math.min(3, building.length)))) {
      // 檢查是否真的是這個建築（避免誤匹配）
      const buildingWords = building.split(/[館樓大]/);
      const queryWords = query.split(/[館樓大]/);
      const hasMatch = buildingWords.some(word => 
        word.length >= 2 && queryWords.some(qw => qw.includes(word))
      );
      if (hasMatch) {
        entities.building = building;
        break;
      }
    }
  }
  
  // 2. 提取樓層（支持多種格式）
  const floorPatterns = [
    /(\d+)[樓層F]/i,           // 3樓、3層、3F
    /[第]?([一二三四五六七八九十]+)[樓層]/i,  // 三樓、第三層
    /floor\s*(\d+)/i,         // floor 3
    /(\d+)\s*F/i,             // 3 F
    /(\d+)\s*floor/i          // 3 floor
  ];
  
  for (const pattern of floorPatterns) {
    const match = query.match(pattern);
    if (match) {
      let floorNum = match[1];
      // 轉換中文數字
      const chineseNumbers = {
        '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
        '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
      };
      if (chineseNumbers[floorNum]) {
        floorNum = chineseNumbers[floorNum];
      }
      entities.floor = floorNum + 'F';
      break;
    }
  }
  
  // 3. 提取設施類型（增強版）
  const facilityPatterns = {
    toilet: {
      zh: ['廁所', '洗手間', '衛生間', 'WC', '廁鎖'],
      en: ['toilet', 'restroom', 'bathroom', 'WC', 'lavatory']
    },
    water: {
      zh: ['飲水機', '飲水器', '飲水雞'],
      en: ['water', 'fountain', 'dispenser', 'drinking']
    },
    trash: {
      zh: ['垃圾桶', '垃圾筒'],
      en: ['trash', 'garbage', 'bin', 'waste']
    }
  };
  
  for (const [type, patterns] of Object.entries(facilityPatterns)) {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    const keywords = patterns[lang] || patterns.zh || patterns.en;
    if (keywords.some(keyword => queryLower.includes(keyword.toLowerCase()))) {
      entities.facilityType = type;
      break;
    }
  }
  
  // 4. 提取校區
  const campusPatterns = {
    campus1: {
      zh: ['第一校區', '校區1', '一校區', 'campus1'],
      en: ['campus 1', 'campus1', 'first campus']
    },
    campus2: {
      zh: ['第二校區', '校區2', '二校區', 'campus2'],
      en: ['campus 2', 'campus2', 'second campus']
    },
    campus3: {
      zh: ['第三校區', '校區3', '三校區', 'campus3'],
      en: ['campus 3', 'campus3', 'third campus']
    }
  };
  
  for (const [campus, patterns] of Object.entries(campusPatterns)) {
    const lang = currentLanguage === 'en' ? 'en' : 'zh';
    const keywords = patterns[lang] || patterns.zh || patterns.en;
    if (keywords.some(keyword => queryLower.includes(keyword.toLowerCase()))) {
      entities.campus = campus;
      break;
    }
  }
  
  // 5. 提取性別（僅對廁所）
  if (entities.facilityType === 'toilet') {
    const genderPatterns = {
      '男': {
        zh: ['男', '男生', '男性', 'men'],
        en: ['men', 'male', 'men\'s']
      },
      '女': {
        zh: ['女', '女生', '女性', 'women'],
        en: ['women', 'female', 'ladies', 'women\'s']
      },
      '性別友善': {
        zh: ['性別友善', '性別中立', 'unisex'],
        en: ['unisex', 'gender-neutral', 'all-gender']
      },
      '無障礙': {
        zh: ['無障礙', 'accessible'],
        en: ['accessible', 'wheelchair']
      }
    };
    
    for (const [gender, patterns] of Object.entries(genderPatterns)) {
      const lang = currentLanguage === 'en' ? 'en' : 'zh';
      const keywords = patterns[lang] || patterns.zh || patterns.en;
      if (keywords.some(keyword => queryLower.includes(keyword.toLowerCase()))) {
        entities.gender = gender;
        break;
      }
    }
  }
  
  return entities;
}

/**
 * 增強查詢理解（綜合處理）
 * @param {string} query - 原始查詢
 * @returns {Object} 增強後的查詢對象 {original, corrected, normalized, expanded, intent, entities}
 */
function enhanceQueryUnderstanding(query) {
  if (!query || typeof query !== 'string') return null;
  
  // 1. 錯別字修正
  const corrected = correctTypos(query);
  
  // 2. 標準化格式
  const normalized = normalizeQuery(corrected);
  
  // 3. 同義詞擴展
  const expanded = expandSynonyms(normalized);
  
  // 4. 意圖識別
  const intent = detectIntent(normalized);
  
  // 5. 實體提取增強
  const entities = enhanceEntityExtraction(normalized);
  
  const result = {
    original: query,
    corrected: corrected,
    normalized: normalized,
    expanded: expanded,
    intent: intent,
    entities: entities,
    // 最終使用的查詢（優先使用標準化後的，如果擴展後有變化則使用擴展後的）
    final: expanded !== normalized ? expanded : normalized
  };
  
  Utils.logger.log('🧠 查詢理解增強:', result);
  
  return result;
}

/**
 * 檢測用戶意圖
 * @param {string} query - 查詢文本
 * @returns {Object|null} 意圖對象 {type, confidence, entities}
 */
function detectIntent(query) {
  if (!query || typeof query !== 'string') return null;
  
  const queryLower = query.toLowerCase();
  let bestIntent = null;
  let bestConfidence = 0;
  
  // 檢測「尋找最近設施」意圖
  for (const pattern of INTENT_KEYWORDS.find_nearest.patterns) {
    const match = query.match(pattern);
    if (match) {
      const facility = match[1]?.trim();
      if (facility) {
        // 檢查是否匹配設施類型
        const isFacilityType = INTENT_KEYWORDS.find_nearest.facility_types.some(
          type => facility.includes(type) || type.includes(facility)
        );
        if (isFacilityType) {
          const confidence = 0.9;
          if (confidence > bestConfidence) {
            bestIntent = {
              type: 'find_nearest',
              confidence: confidence,
              entities: { facility_type: facility }
            };
            bestConfidence = confidence;
          }
        }
      }
    }
  }
  
  // 檢測「查詢資訊」意圖
  for (const pattern of INTENT_KEYWORDS.query_info.patterns) {
    const match = query.match(pattern);
    if (match) {
      const target = match[1]?.trim();
      if (target) {
        const isTarget = INTENT_KEYWORDS.query_info.targets.some(
          t => target.includes(t) || t.includes(target)
        );
        if (isTarget) {
          const confidence = 0.85;
          if (confidence > bestConfidence) {
            bestIntent = {
              type: 'query_info',
              confidence: confidence,
              entities: { target: target }
            };
            bestConfidence = confidence;
          }
        }
      }
    }
  }
  
  // 檢測「回報問題」意圖
  const hasReportKeyword = INTENT_KEYWORDS.report_issue.keywords.some(
    keyword => queryLower.includes(keyword.toLowerCase())
  );
  if (hasReportKeyword) {
    const confidence = 0.8;
    if (confidence > bestConfidence) {
      bestIntent = {
        type: 'report_issue',
        confidence: confidence,
        entities: {}
      };
      bestConfidence = confidence;
    }
  }
  
  return bestIntent;
}

/**
 * 驗證和清理用戶輸入（增強版）
 * @param {string} query - 用戶輸入
 * @returns {string|null} 清理後的查詢，如果無效則返回 null
 */
/**
 * 驗證和清理用戶輸入（優化版：使用 UserFeedbackManager）
 * @param {string} query - 用戶輸入
 * @returns {string|null} 清理後的查詢，如果無效則返回 null
 */
function validateAndSanitizeInput(query) {
  // 輸入驗證（使用統一工具函數）
  if (!Utils.validation.isNonEmptyString(query)) {
    const msg = Utils.language.getLocalizedMessage(
      '請輸入有效的問題。',
      'Please enter a valid question.'
    );
    userFeedback.showTip(msg, 'warning');
    return null;
  }
  
  // 檢查輸入長度（防止過長輸入）
  const MAX_INPUT_LENGTH = 500;
  if (query.length > MAX_INPUT_LENGTH) {
    const msg = Utils.language.getLocalizedMessage(
      `輸入過長（最多 ${MAX_INPUT_LENGTH} 字元）。請縮短您的問題。`,
      `Input too long (max ${MAX_INPUT_LENGTH} characters). Please shorten your question.`
    );
    userFeedback.showTip(msg, 'warning');
    return null;
  }
  
  // 清理輸入（防止 XSS）
  let trimmedQuery = Utils.validation.sanitizeInput(query);
  
  // 檢查清理後是否還有有效內容
  if (!trimmedQuery || trimmedQuery.trim().length === 0) {
    const msg = Utils.language.getLocalizedMessage(
      '輸入內容無效。請輸入有效的問題。',
      'Invalid input. Please enter a valid question.'
    );
    userFeedback.showTip(msg, 'warning');
    return null;
  }
  
  // 應用查詢增強（錯別字修正、標準化等）
  const enhanced = enhanceQueryUnderstanding(trimmedQuery);
  if (enhanced && enhanced.final) {
    trimmedQuery = enhanced.final;
    
    // 如果查詢被修正，提示用戶（僅在明顯修正時）
    if (enhanced.corrected !== enhanced.original && 
        enhanced.corrected.length > 0 && 
        enhanced.original.length > 0) {
      Utils.logger.log('🔧 查詢已優化:', { original: query, enhanced: trimmedQuery });
    }
  }
  
  return trimmedQuery || null;
}

/**
 * 檢測並更新語言設置（使用統一的語言檢測器）
 * @param {string} query - 用戶輸入
 */
function detectAndUpdateLanguage(query) {
  LanguageDetector.detectAndUpdate(query);
}

/**
 * 使用對話記憶增強查詢
 * @param {string} query - 原始查詢
 * @returns {string} 增強後的查詢
 */
function enhanceQueryWithMemory(query) {
  const context = conversationMemoryManager.getContext();
  if (!context.pendingIntent) {
    return query;
  }

  // 使用新的記憶管理器獲取上下文
  const pending = context.pendingIntent;
  if (pending && pending.data && pending.data.waitingFor) {
    const waitingFor = pending.data.waitingFor;
    const collectedInfo = pending.data;
    
    // 根據等待的資訊類型，從用戶輸入中提取資訊
    let enhancedQuery = query;
    
    if (waitingFor === 'ask_for_building') {
      enhancedQuery = `${query} ${collectedInfo.problem_description || ''}`;
    } else if (waitingFor === 'ask_for_floor') {
      enhancedQuery = `${collectedInfo.building || ''} ${query} ${collectedInfo.problem_description || ''}`;
    } else if (waitingFor === 'ask_for_facility_type') {
      enhancedQuery = `${collectedInfo.building || ''} ${collectedInfo.floor || ''} ${query} ${collectedInfo.problem_description || ''}`;
    } else if (waitingFor === 'ask_for_problem_details') {
      enhancedQuery = `${collectedInfo.building || ''} ${collectedInfo.floor || ''} ${collectedInfo.facility_type || ''} ${query}`;
    }
    
    Utils.logger.log('💬 使用對話記憶增強查詢:', {
      original: query,
      enhanced: enhancedQuery,
      memory: collectedInfo
    });
    
    // 清除 waitingFor 標記（但保留已收集的資訊，直到完成）
    if (pending.data) {
      delete pending.data.waitingFor;
    }
    
    return enhancedQuery.trim();
  }
  
  return query;
}

/**
 * 嘗試使用本地邏輯處理常見查詢（當 Rasa 返回空數組時）
 * @param {string} query - 查詢字符串
 * @returns {Promise<Object|null>} 如果本地可以處理，返回響應對象；否則返回 null
 */
async function tryLocalFallback(query) {
  if (!query || typeof query !== 'string') {
    return null;
  }
  
  const queryLower = query.toLowerCase().trim();
  const queryNormalized = query.replace(/\s+/g, '').toLowerCase();
  
  Utils.logger.log('🔍 嘗試本地 fallback 處理:', query);
  
  // 處理「最近的廁所在哪」類查詢
  const toiletKeywords = ['最近的廁所', '最近的廁所在哪', '最近的廁所在哪裡', '最近的廁所在那', 
                          'nearest toilet', 'nearest restroom', 'where is the nearest toilet', 
                          'where is the nearest restroom', 'find nearest toilet', 'find nearest restroom',
                          '廁所在哪', '廁所在哪裡', '廁所在那', 'toilet', 'restroom'];
  const isToiletQuery = toiletKeywords.some(keyword => 
    queryLower.includes(keyword.toLowerCase()) || queryNormalized.includes(keyword.toLowerCase().replace(/\s+/g, ''))
  );
  
  if (isToiletQuery) {
    Utils.logger.log('✅ 本地 fallback：檢測到廁所查詢');
    // 檢查是否有性別要求
    let gender = null;
    if (query.includes('男') || queryLower.includes('men') || queryLower.includes('male')) {
      gender = '男';
    } else if (query.includes('女') || queryLower.includes('women') || queryLower.includes('female') || queryLower.includes('ladies')) {
      gender = '女';
    } else if (query.includes('性別友善') || query.includes('無性別') || queryLower.includes('unisex') || queryLower.includes('gender-neutral')) {
      gender = '性別友善';
    } else if (query.includes('無障礙') || queryLower.includes('accessible') || queryLower.includes('wheelchair')) {
      gender = '無障礙';
    }
    
    const facilityName = currentLanguage === 'en' 
      ? (gender === '男' ? 'men\'s restroom' : gender === '女' ? 'women\'s restroom' : gender === '無障礙' ? 'accessible restroom' : 'restroom')
      : (gender === '男' ? '男廁' : gender === '女' ? '女廁' : gender === '無障礙' ? '無障礙廁所' : '廁所');
    
    // 返回一個特殊的響應對象，指示需要執行本地處理
    return {
      text: '', // 不顯示文本，因為 handleFindNearestFacility 會自己顯示
      action: {
        action: 'find_nearest_facility',
        facility_type: 'toilet',
        facility_name: facilityName,
        gender: gender,
        language: currentLanguage
      },
      source: 'local',
      localHandler: 'handleFindNearestFacility'
    };
  }
  
  // 處理「最近的飲水機在哪」類查詢
  const waterKeywords = ['最近的飲水機', '最近的飲水機在哪', '最近的飲水機在哪裡', '最近的飲水機在那',
                         'nearest water', 'nearest water fountain', 'where is the nearest water',
                         'where is the nearest water fountain', 'find nearest water', 'find nearest water fountain',
                         '飲水機在哪', '飲水機在哪裡', '飲水機在那', 'water fountain', 'water dispenser'];
  const isWaterQuery = waterKeywords.some(keyword => 
    queryLower.includes(keyword.toLowerCase()) || queryNormalized.includes(keyword.toLowerCase().replace(/\s+/g, ''))
  );
  
  if (isWaterQuery) {
    Utils.logger.log('✅ 本地 fallback：檢測到飲水機查詢');
    const facilityName = currentLanguage === 'en' ? 'water fountain' : '飲水機';
    return {
      text: '',
      action: {
        action: 'find_nearest_facility',
        facility_type: 'water',
        facility_name: facilityName,
        language: currentLanguage
      },
      source: 'local',
      localHandler: 'handleFindNearestFacility'
    };
  }
  
  // 處理「最近的垃圾桶在哪」類查詢
  const trashKeywords = ['最近的垃圾桶', '最近的垃圾桶在哪', '最近的垃圾桶在哪裡', '最近的垃圾桶在那',
                         'nearest trash', 'nearest trash can', 'nearest bin', 'where is the nearest trash',
                         'where is the nearest trash can', 'find nearest trash', 'find nearest bin',
                         '垃圾桶在哪', '垃圾桶在哪裡', '垃圾桶在那', 'trash can', 'trash bin', 'garbage'];
  const isTrashQuery = trashKeywords.some(keyword => 
    queryLower.includes(keyword.toLowerCase()) || queryNormalized.includes(keyword.toLowerCase().replace(/\s+/g, ''))
  );
  
  if (isTrashQuery) {
    Utils.logger.log('✅ 本地 fallback：檢測到垃圾桶查詢');
    const facilityName = currentLanguage === 'en' ? 'trash can' : '垃圾桶';
    return {
      text: '',
      action: {
        action: 'find_nearest_facility',
        facility_type: 'trash',
        facility_name: facilityName,
        language: currentLanguage
      },
      source: 'local',
      localHandler: 'handleFindNearestFacility'
    };
  }
  
  // 無法本地處理
  Utils.logger.log('❌ 本地 fallback 無法處理此查詢');
  return null;
}

/**
 * 處理 Rasa 或本地查詢
 * @param {string} query - 查詢字符串
 * @returns {Promise<Object>} 響應對象
 */
async function processQuery(query) {
  // 先檢查是否為回報相關的查詢（優先級最高）
  // 如果包含回報關鍵字，應該發送到 Rasa 讓它判斷意圖，不要攔截
  const reportKeywords = ['漏水', '壞了', '故障', '損壞', '髒', '滿了', '回報', '報告', '問題', 
                          'leak', 'broken', 'damaged', 'dirty', 'full', 'report', 'problem', 'issue',
                          '無法使用', '部分損壞', '待清潔', '需要', '要', 'need', 'want'];
  const isReportQuery = reportKeywords.some(keyword => 
    query.includes(keyword) || query.toLowerCase().includes(keyword.toLowerCase())
  );
  
  // 如果有回報關鍵字，直接發送到 Rasa，不要攔截
  if (isReportQuery) {
    Utils.logger.log('📝 檢測到回報相關查詢，發送到 Rasa 處理');
    // 清除可能存在的 find_nearest_facility pending_intent
    const pending = conversationMemoryManager.checkPendingIntent();
    if (pending && pending.intent === 'find_nearest_facility') {
      conversationMemoryManager.clearPendingIntent();
      Utils.logger.log('✅ 已清除 find_nearest_facility 的 pending_intent（因為檢測到回報查詢）');
    }
  } else {
    // 只有在沒有回報關鍵字時，才檢查是否有待處理的性別查詢
    // 或者檢查是否是純粹的性別相關查詢（如 "男廁"、"女廁"、"無障礙" 等）
    const pending = conversationMemoryManager.checkPendingIntent();
    const hasPendingIntent = pending && pending.intent === 'find_nearest_facility';
    const isGenderQuery = query.includes('男') || query.includes('女') || query.includes('無性別') || query.includes('無障礙') || 
                          query.toLowerCase().includes('men') || query.toLowerCase().includes('women') || 
                          query.toLowerCase().includes('unisex') || query.toLowerCase().includes('accessible') || 
                          query.toLowerCase().includes('wheelchair');
    
    if (hasPendingIntent || isGenderQuery) {
      // 檢查是否在回答廁所類型問題
      let gender = null;
      const queryLower = query.toLowerCase();
      const genderKeywords = {
        '男': ['男生', '男性', '男廁', '男廁所', '男生廁所', '男性廁所', '男', 'men', 'men\'s', 'male'],
        '女': ['女生', '女性', '女廁', '女廁所', '女生廁所', '女性廁所', '女', 'women', 'women\'s', 'female', 'ladies'],
        '性別友善': ['性別友善', '性別友善廁所', '性別中立', '無性別', 'unisex', 'gender-neutral', 'gender-inclusive', 'all-gender'],
        '無障礙': ['無障礙', 'accessible', 'wheelchair', 'accessible restroom', '無障礙廁所']
      };
      
      for (const [g, keywords] of Object.entries(genderKeywords)) {
        if (keywords.some(keyword => query.includes(keyword) || queryLower.includes(keyword.toLowerCase()))) {
          gender = g;
          break;
        }
      }
      
      if (gender && hasPendingIntent) {
        // 只有在有 pending_intent 時才直接處理，否則發送到 Rasa
        // 用戶回答了性別，直接查詢最近的廁所，不發送到 Rasa
        const facilityType = pending?.data?.facility_type || conversationMemoryManager.getContextValue('last_facility_type', 'toilet');
        const facilityName = currentLanguage === 'en' 
          ? (gender === '男' ? 'men\'s restroom' : gender === '女' ? 'women\'s restroom' : gender === '無障礙' ? 'accessible restroom' : 'gender-inclusive restroom')
          : (gender === '男' ? '男廁' : gender === '女' ? '女廁' : gender === '無障礙' ? '無障礙廁所' : '性別友善廁所');
          
        // 清除待處理的查詢
        conversationMemoryManager.clearPendingIntent();
        conversationMemoryManager.setContext('last_facility_type', facilityType);
        conversationMemoryManager.setContext('last_gender', gender);
        
        // 顯示用戶消息
        addMessage(query, true);
        
        // 直接調用查詢函數
        handleFindNearestFacility(facilityType, facilityName, currentLanguage, gender);
        return;
      }
    }
  }
  
  // 優先嘗試使用 Rasa（即使 useRasa 為 false，也要嘗試連接）
  // 只有在 Vercel 環境下才強制使用 Rasa
  const hostname = window.location.hostname;
  const isVercel = hostname.includes('vercel.app') || hostname.includes('vercel.com');
  const shouldUseRasa = isVercel || useRasa;
  
  if (shouldUseRasa) {
    try {
      Utils.logger.log('📤 發送消息到 Rasa:', query);
      
      // 如果 useRasa 為 false，先嘗試檢查連接
      // 但如果最近剛檢查過且失敗，跳過重複檢查（避免頻繁請求失敗的服務器）
      if (!useRasa) {
        const timeSinceLastCheck = Date.now() - rasaLastHealthCheck;
        // 如果最近 10 秒內剛檢查過且失敗，跳過重複檢查
        if (timeSinceLastCheck < 10000 && 
            (rasaConnectionState === RasaConnectionState.ERROR || 
             rasaConnectionState === RasaConnectionState.DISCONNECTED)) {
          Utils.logger.debug(`⏭️ 跳過重複連接檢查（${Math.round(timeSinceLastCheck / 1000)} 秒前已檢查）`);
        } else {
          Utils.logger.log('🔄 useRasa 為 false，嘗試重新連接 Rasa...');
          const connected = await checkRasaConnection(true);
          if (!connected) {
            Utils.logger.warn('⚠️ Rasa 連接失敗，但繼續嘗試發送請求');
          }
        }
      }
      
      let rasaResponse;
      let isTimeout = false;
      
      try {
        rasaResponse = await sendToRasa(query);
      } catch (error) {
        // 檢查是否為超時錯誤
        if (error.message === 'RASA_TIMEOUT' || error.message.includes('timeout') || error.name === 'AbortError') {
          Utils.logger.warn('⏱️ Rasa 請求超時，將使用 Gemini fallback');
          isTimeout = true;
          rasaResponse = null;
        } else {
          // 其他錯誤，重新拋出
          throw error;
        }
      }
      
      // 處理響應：可能是數組或對象
      let responseArray = null;
      if (rasaResponse) {
        if (Array.isArray(rasaResponse)) {
          responseArray = rasaResponse;
        } else if (typeof rasaResponse === 'object') {
          // 如果是對象，嘗試轉換為數組
          if (rasaResponse.length !== undefined) {
            // 類數組對象
            responseArray = Array.from(rasaResponse);
          } else {
            // 單個響應對象，轉換為數組
            responseArray = [rasaResponse];
          }
        }
      }
      
      // 檢查是否需要 fallback 到 Gemini
      let shouldFallbackToGemini = false;
      let handled = null;
      
      if (isTimeout) {
        // 超時情況，直接 fallback
        shouldFallbackToGemini = true;
        Utils.logger.log('⏱️ Rasa 超時，觸發 Gemini fallback');
      } else if (responseArray && responseArray.length > 0) {
        Utils.logger.log('📥 收到 Rasa 響應:', JSON.stringify(responseArray, null, 2));
        handled = handleRasaResponse(responseArray);
        
        // 檢查是否為 fallback 回應
        if (handled && handled.isFallback) {
          shouldFallbackToGemini = true;
          Utils.logger.log('🚫 檢測到 Rasa fallback 回應，觸發 Gemini fallback');
        } else if (!handled || (!handled.text && !handled.action)) {
          // 回應為空或無效
          shouldFallbackToGemini = true;
          Utils.logger.log('⚠️ Rasa 回應無效，觸發 Gemini fallback');
        }
      } else {
        // 沒有收到有效回應（空數組）
        Utils.logger.log('⚠️ Rasa 返回空數組，嘗試本地 fallback...');
        
        // 先嘗試使用本地邏輯處理常見查詢
        const localHandled = await tryLocalFallback(query);
        if (localHandled) {
          Utils.logger.log('✅ 本地 fallback 成功處理查詢');
          // 如果有 localHandler，需要在 handleResponse 中執行
          return localHandled;
        }
        
        // 本地 fallback 無法處理，才觸發 Gemini fallback
        shouldFallbackToGemini = true;
        Utils.logger.log('⚠️ 本地 fallback 無法處理，觸發 Gemini fallback');
      }
      
      // 如果需要 fallback 到 Gemini
      if (shouldFallbackToGemini) {
        Utils.logger.log('🤖 開始 Gemini fallback...');
        
        // 獲取對話上下文（從 DOM 中獲取最近的訊息）
        let conversationContext = null;
        try {
          const messagesContainer = document.getElementById('chat-messages') || document.getElementById('mobile-chat-messages');
          if (messagesContainer) {
            const messages = messagesContainer.querySelectorAll('.message');
            const recentMessages = Array.from(messages).slice(-6).map(msg => {
              const isUser = msg.classList.contains('user-message');
              const textElement = msg.querySelector('.message-text');
              const text = textElement ? textElement.textContent.trim() : '';
              return text ? `${isUser ? '用戶' : 'AI'}: ${text}` : null;
            }).filter(msg => msg !== null);
            
            if (recentMessages.length > 0) {
              conversationContext = recentMessages;
              Utils.logger.log(`📝 獲取對話上下文，共 ${conversationContext.length} 條訊息`);
            }
          }
        } catch (contextError) {
          Utils.logger.warn('⚠️ 獲取對話上下文失敗:', contextError);
          // 繼續執行，不使用上下文
        }
        
        // 呼叫 Gemini API
        const geminiResponse = await callGeminiAPI(query, currentLanguage, conversationContext);
        
        if (geminiResponse && geminiResponse.text && !geminiResponse.error) {
          Utils.logger.log('✅ Gemini fallback 成功');
          
          // 返回 Gemini 回應格式
          return {
            text: geminiResponse.text,
            action: null,
            source: 'gemini'
          };
        } else {
          // Gemini 也失敗了，返回友好的錯誤訊息
          Utils.logger.warn('⚠️ Gemini fallback 失敗');
          
          // 優先使用 Gemini 返回的錯誤訊息（如果有）
          let errorMsg = geminiResponse?.text;
          
          // 如果沒有錯誤訊息，使用默認訊息
          if (!errorMsg || !errorMsg.trim()) {
            errorMsg = currentLanguage === 'en'
              ? '⚠️ Unable to get AI response. Please check if Rasa server is running or try again later.'
              : '⚠️ 無法獲取 AI 回應。請檢查 Rasa 伺服器是否運行，或稍後再試。';
          }
          
          // 確保錯誤訊息被顯示
          return {
            text: errorMsg,
            action: null,
            source: 'gemini',
            error: true
          };
        }
      }
      
      // Rasa 回應有效，繼續處理
      // 只有在 shouldFallbackToGemini 為 false 時才會執行到這裡
      // 此時 handled 應該已經被設置（因為我們已經處理了 responseArray）
      if (!handled) {
        // 如果 handled 為 null，這不應該發生（因為我們已經檢查過了）
        // 但為了安全，返回 null
        Utils.logger.warn('⚠️ handled 為 null，這不應該發生');
        return null;
      }
      
      // 即使 text 為空，如果有 action 也應該處理
      if (handled.text || handled.action) {
          // 檢查 Rasa 返回的 action 類型
          // 如果是回報相關的 action，清除 find_nearest_facility 的 pending_intent
          let isReportAction = false;
          if (handled.action) {
            const actionType = handled.action.action;
            isReportAction = actionType === 'report_facility_problem' || 
                            actionType === 'open_issue_form' ||
                            actionType === 'ask_for_building' ||
                            actionType === 'ask_for_floor' ||
                            actionType === 'ask_for_facility_type' ||
                            actionType === 'ask_for_problem_details';
            
            if (isReportAction) {
              // 如果是回報相關的 action，清除 find_nearest_facility 的 pending_intent
              const pending = conversationMemoryManager.checkPendingIntent();
              if (pending && pending.intent === 'find_nearest_facility') {
                conversationMemoryManager.clearPendingIntent();
                Utils.logger.log('✅ 已清除 find_nearest_facility 的 pending_intent（因為 Rasa 返回回報 action）');
              }
            } else if (handled.action.pending_intent === 'find_nearest_facility') {
              // 如果 Rasa 返回了詢問性別的消息（通過 SlotSet），需要存儲待處理的查詢
              conversationMemoryManager.setPendingIntent('find_nearest_facility', {
                facility_type: handled.action.facility_type || 'toilet'
              });
              Utils.logger.log('💬 存儲待處理的查詢:', {
                intent: 'find_nearest_facility',
                facility_type: handled.action.facility_type || 'toilet'
              });
            }
          }
          
          // 檢查用戶是否在回答AI的問題（性別/整個/部分）
          const queryLower = query.toLowerCase();
          const issueFormContainer = document.getElementById('issue-form-container');
          
          // 只有在不是回報相關 action 時，才檢查是否有待處理的 find_nearest_facility 查詢
          const pending = conversationMemoryManager.checkPendingIntent();
          if (!isReportAction && pending && pending.intent === 'find_nearest_facility') {
            // 檢查是否在回答性別問題
            let gender = null;
            const genderKeywords = {
              '男': ['男生', '男性', '男廁', '男廁所', '男生廁所', '男性廁所', '男', 'men', 'men\'s', 'male'],
              '女': ['女生', '女性', '女廁', '女廁所', '女生廁所', '女性廁所', '女', 'women', 'women\'s', 'female', 'ladies'],
              '性別友善': ['性別友善', '性別友善廁所', '性別中立', '無性別', 'unisex', 'gender-neutral', 'gender-inclusive', 'all-gender']
            };
            
            for (const [g, keywords] of Object.entries(genderKeywords)) {
              if (keywords.some(keyword => query.includes(keyword) || queryLower.includes(keyword.toLowerCase()))) {
                gender = g;
                break;
              }
            }
            
            if (gender) {
              // 用戶回答了性別，直接查詢最近的廁所
              const facilityType = pending.data?.facility_type || 'toilet';
              const facilityName = currentLanguage === 'en' 
                ? (gender === '男' ? 'men\'s restroom' : gender === '女' ? 'women\'s restroom' : 'unisex restroom')
                : (gender === '男' ? '男廁' : gender === '女' ? '女廁' : gender === '性別友善' ? '性別友善廁所' : '性別友善廁所');
                
              // 清除待處理的查詢
              conversationMemoryManager.clearPendingIntent();
              conversationMemoryManager.setContext('last_facility_type', facilityType);
              conversationMemoryManager.setContext('last_gender', gender);
              
              // 顯示用戶消息
              addMessage(query, true);
              
              // 直接調用查詢函數
              handleFindNearestFacility(facilityType, facilityName, currentLanguage, gender);
              return;
            }
          }
          
          // 檢查是否有待處理的設施問題（從對話記憶或確認表單中獲取）
          let currentFacilityInfo = null;
          if (window.conversationMemory && window.conversationMemory.report_facility_problem) {
            currentFacilityInfo = window.conversationMemory.report_facility_problem;
          } else {
            // 嘗試從確認表單中獲取設施信息
            const confirmMessage = document.getElementById('confirmation-form-message');
            if (confirmMessage) {
              const confirmData = confirmMessage.dataset.facilityData;
              if (confirmData) {
                try {
                  currentFacilityInfo = JSON.parse(confirmData);
                } catch (e) {
                  Utils.logger.warn('無法解析確認表單數據:', e);
                }
              }
            }
          }
          
          if (issueFormContainer && issueFormContainer.style.display !== 'none') {
            const wholeKeywords = ['整個', '全部', '都', 'whole', 'entire', 'all', 'complete'];
            const partialKeywords = ['部分', '一個', '有些', 'part', 'partial', 'one', 'some', 'single'];
            
            const isWhole = wholeKeywords.some(keyword => queryLower.includes(keyword));
            const isPartial = partialKeywords.some(keyword => queryLower.includes(keyword));
            
            if (isWhole || isPartial) {
              const statusSelect = document.getElementById('issue-status');
              if (statusSelect) {
                if (isWhole) {
                  // 整個設施都不能用 → 無法使用
                  statusSelect.value = '無法使用';
                  Utils.logger.log('✅ 根據用戶回答更新表單狀態：無法使用（整個設施）');
                } else if (isPartial) {
                  // 部分設備有問題 → 部分損壞
                  statusSelect.value = '部分損壞';
                  Utils.logger.log('✅ 根據用戶回答更新表單狀態：部分損壞（部分設備）');
                }
                
                // 顯示確認消息，包含設施信息
                let confirmMsg = '';
                if (currentFacilityInfo) {
                  const facilityName = currentFacilityInfo.facilityType === 'toilet' 
                    ? (currentLanguage === 'en' ? 'restroom' : '廁所')
                    : currentFacilityInfo.facilityType;
                  confirmMsg = currentLanguage === 'en'
                    ? `✅ I've updated the form status to: ${statusSelect.value}<br>📍 Facility: ${currentFacilityInfo.building} ${currentFacilityInfo.floor} ${facilityName}`
                    : `✅ 我已更新表單狀態為：${statusSelect.value}<br>📍 設施：${currentFacilityInfo.building} ${currentFacilityInfo.floor} ${facilityName}`;
                } else {
                  confirmMsg = currentLanguage === 'en'
                    ? `✅ I've updated the form status to: ${statusSelect.value}`
                    : `✅ 我已更新表單狀態為：${statusSelect.value}`;
                }
                addMessage(confirmMsg, false);
                
                // 如果已經更新了表單，就不需要繼續處理 Rasa 的響應了
                return handled;
              }
            }
          }
          
          // 如果有結構化動作，執行它
          if (handled.action) {
            // 確保 action 包含語言資訊
            if (!handled.action.language) {
              handled.action.language = currentLanguage;
            }
            Utils.logger.log('🎯 執行 Action:', handled.action.action);
            
            // 檢查哪些 action 會自己顯示訊息（會調用 addMessage）
            // 如果 action 會顯示訊息，則清除 handled.text，避免在 handleResponse 中重複顯示
            const actionsThatShowMessage = [
              'show_time', 'open_issue_form', 'report_facility_problem', 
              'campus_events', 'emergency_contact', 'parking_info', 
              'dining_info', 'library_hours', 'weather', 'campus_tips',
              'format_rich_response', 'remember_context',
              'find_nearest_facility', 'find_nearest_toilet', 'find_nearest_water', 'find_nearest_trash',
              'query_campus_stats', 'query_building_facilities', 'query_floor_status',
              'handleFindNearestFacility' // 這些會在 executeAction 中調用 handleFindNearestFacility，它會顯示訊息
            ];
            
            const actionName = handled.action.action;
            const actionWillShowMessage = handled.action.message || actionsThatShowMessage.includes(actionName);
            
            if (actionWillShowMessage) {
              // 如果 action 會顯示訊息，清除 text，避免重複顯示
              handled.text = '';
              Utils.logger.log('🔇 清除 text，因為 action 會顯示自己的訊息');
            }
            
            executeAction(handled.action);
          }
          // 如果沒有 text 但有 action，且 action 不會顯示訊息，不添加默認消息（避免重複）
          Utils.logger.log('✅ Rasa 處理成功');
          
          // 確保文字訊息被顯示（即使有 action，也要顯示文字）
          // 注意：handleResponse 會在 handleUserInput 中被調用，這裡不需要重複調用
          // 但如果 handled.text 存在，應該確保它被顯示
          
          // 保存到對話歷史
          if (handled.text) {
            try {
              addToConversationHistory(query, handled);
            } catch (e) {
              Utils.logger.warn('保存對話歷史失敗:', e);
            }
          }
          
          return handled;
        } else {
          Utils.logger.warn('⚠️ Rasa 響應處理後為空:', handled);
          Utils.logger.warn('⚠️ 原始響應:', responseArray);
          // 如果處理後為空，應該已經觸發 fallback，這裡不應該執行到
          // 但為了安全，返回 null
          return null;
      }
    } catch (error) {
      Utils.logger.warn('❌ Rasa 請求失敗:', error.message || String(error));
      
      // 在 Vercel 環境下，顯示錯誤訊息而不是使用本地處理
      if (isVercel) {
        const errorMsg = currentLanguage === 'en'
          ? `❌ Failed to connect to AI server: ${error.message || 'Unknown error'}. Please try again later.`
          : `❌ 無法連接到 AI 伺服器：${error.message || '未知錯誤'}。請稍後再試。`;
        return {
          text: errorMsg,
          action: null
        };
      }
      
      // 非 Vercel 環境下，使用本地處理作為回退
      // 不立即標記為不可用，讓健康檢查機制處理
      // 但不要阻止後續請求，讓用戶可以繼續使用
      // 只有在重試次數未達上限且最近未檢查過時才執行健康檢查
      const timeSinceLastCheck = Date.now() - rasaLastHealthCheck;
      if (rasaConnectionRetries < MAX_RETRIES && timeSinceLastCheck > 10000) {
        // 異步執行健康檢查，不阻塞當前請求
        setTimeout(() => {
          performRasaHealthCheck().catch(() => {});
        }, 1000);
      }
      return processAIQuery(query);
    }
  } else {
    // 非 Vercel 環境且 useRasa 為 false，使用本地處理
    Utils.logger.log('💻 使用本地處理模式');
    return processAIQuery(query);
  }
}

/**
 * 處理響應並顯示結果
 * @param {Object} response - 響應對象
 * @param {boolean} useRasa - 是否使用 Rasa
 */
/**
 * 根據響應內容生成相關按鈕
 * @param {Object} response - 響應對象
 * @returns {Array|null} 按鈕數組或 null
 */
function generateResponseButtons(response) {
  if (!response) return null;
  
  const buttons = [];
  const lang = currentLanguage || 'zh';
  
  // 根據文本內容判斷是否為不確定的情況（fallback）
  const text = response.text || '';
  const textLower = text.toLowerCase();
  
  // 只在 fallback 或不確定的情況下生成按鈕
  const isUncertain = textLower.includes('無法理解') || 
                      textLower.includes('更多資訊') || 
                      textLower.includes('需要更多') || 
                      textLower.includes('i may need') || 
                      textLower.includes('more information') ||
                      textLower.includes('不清楚') ||
                      textLower.includes('not sure') ||
                      textLower.includes('can you clarify');
  
  // 如果響應包含 fallback 或無法理解的消息，提供常見查詢按鈕
  if (isUncertain) {
    buttons.push(
      { text: '🚻 最近廁所', query: '最近的廁所在哪', ariaLabel: '查詢最近的廁所' },
      { text: '🚰 最近飲水機', query: '最近的飲水機在哪', ariaLabel: '查詢最近的飲水機' },
      { text: '🗑️ 最近垃圾桶', query: '最近的垃圾桶在哪', ariaLabel: '查詢最近的垃圾桶' },
      { text: '🏢 第一校區設施', query: '第一校區有哪些設施', ariaLabel: '查看第一校區的設施' }
    );
    return buttons.length > 0 ? buttons : null;
  }
  
  // 對於已成功執行的 action，不生成按鈕（除非是查詢類 action，可能需要相關查詢）
  // 只在特定情況下提供相關查詢按鈕
  if (response.action) {
    const action = response.action;
    
    // 校區查詢相關 - 只在查詢建築時提供設施查詢按鈕
    if (action.action === 'query_campus_buildings') {
      const campus = action.campus || 'campus1';
      let campusName = action.campus_chinese;
      if (!campusName || campusName === 'campus1' || campusName === 'campus2' || campusName === 'campus3') {
        const campusMap = {
          'campus1': '第一校區',
          'campus2': '第二校區',
          'campus3': '第三校區',
          'Campus 1': '第一校區',
          'Campus 2': '第二校區',
          'Campus 3': '第三校區'
        };
        campusName = campusMap[campus] || campusMap[action.campus_english] || '第一校區';
      }
      // 只提供一個相關查詢按鈕
      buttons.push(
        { text: `查看${campusName}設施`, query: `${campusName}有哪些設施`, ariaLabel: `查看${campusName}的設施` }
      );
    }
  }
  
  return buttons.length > 0 ? buttons : null;
}

function handleResponse(response, useRasa) {
  // 改進：允許響應沒有 text（例如只有 action）
  if (!response) {
    Utils.logger.warn('⚠️ 響應為空');
    hideTyping();
    
    // 顯示友好的錯誤訊息
    const errorMsg = currentLanguage === 'en'
      ? '⚠️ Unable to get AI response. Please check if Rasa server is running or try again later.'
      : '⚠️ 無法獲取 AI 回應。請檢查 Rasa 伺服器是否運行，或稍後再試。';
    addMessage(errorMsg, false);
    return;
  }

  // 處理本地 fallback 響應（有 localHandler）
  if (response.localHandler && response.action) {
    Utils.logger.log(`🔧 執行本地處理器: ${response.localHandler}`);
    hideTyping();
    
    // 根據 localHandler 執行對應的函數
    if (response.localHandler === 'handleFindNearestFacility') {
      const action = response.action;
      handleFindNearestFacility(
        action.facility_type,
        action.facility_name,
        action.language || currentLanguage,
        action.gender || null
      );
    }
    return;
  }

  // 如果沒有 text，使用默認消息或空消息
  let responseText = response.text;
  
  // 如果 response 有 error 標記，確保顯示錯誤訊息
  if (response.error && !responseText) {
    responseText = currentLanguage === 'en'
      ? '⚠️ Unable to get AI response. Please try again later.'
      : '⚠️ 無法獲取 AI 回應，請稍後再試。';
  } else if (!responseText && !response.action) {
    // 既沒有 text 也沒有 action，顯示默認訊息
    responseText = currentLanguage === 'en'
      ? 'I apologize, but I couldn\'t understand your question. Please try rephrasing it.'
      : '抱歉，我無法理解您的問題。請嘗試換個方式表達。';
  }
  
  // 生成相關按鈕
  const buttons = generateResponseButtons(response);
  
  // 模擬處理時間（如果使用 Rasa 則不需要）
  const responseTimeoutId = Utils.timers.setTimeout(() => {
    try {
      hideTyping();
      
      // 只有在有文本時才顯示消息
      if (responseText && responseText.trim()) {
        addMessage(responseText, false, buttons);
      } else if (buttons && buttons.length > 0) {
        // 即使沒有文本，如果有按鈕也顯示消息
        addMessage(currentLanguage === 'en' ? 'Please select an option:' : '請選擇以下選項：', false, buttons);
      } else if (response.action) {
        // 如果有 action 但沒有 text，執行 action（action 會自己顯示訊息）
        executeAction(response.action);
      } else {
        // 完全沒有內容，顯示默認錯誤訊息
        const defaultMsg = currentLanguage === 'en'
          ? '⚠️ Unable to get AI response. Please try again later.'
          : '⚠️ 無法獲取 AI 回應，請稍後再試。';
        addMessage(defaultMsg, false);
      }

      // 執行動作
      if (response.action === 'show_campus' && response.campus) {
        showCampusOnMap(response.campus);
      }
    } catch (error) {
      Utils.logger.error('處理響應時發生錯誤:', error);
      hideTyping();
      // 即使出錯也顯示一個默認消息
      const errorMsg = currentLanguage === 'en'
        ? '⚠️ An error occurred while processing the response. Please try again.'
        : '⚠️ 處理回應時發生錯誤，請重試。';
      addMessage(errorMsg, false);
    }
  }, useRasa ? 300 : 800);
  
  // 存儲 timeout ID 以便清理
  if (!window.responseTimeouts) {
    window.responseTimeouts = [];
  }
  window.responseTimeouts.push(responseTimeoutId);
}

/**
 * 在地圖上顯示校區
 * @param {string} campus - 校區鍵值
 */
function showCampusOnMap(campus) {
  if (!campus) {
    Utils.logger.warn('showCampusOnMap: campus 參數為空');
    return;
  }
  
  try {
    const campusInfo = campusLocations && campusLocations[campus];
  if (campusInfo && aiMap) {
    aiMap.setView(campusInfo.center, campusInfo.zoom);
    const campusSelect = document.getElementById('map-campus-select');
    if (campusSelect) {
      campusSelect.value = campus;
    }
    }
  } catch (error) {
    Utils.logger.error('showCampusOnMap 錯誤:', error);
  }
}

/**
 * 處理校區統計查詢
 * @param {Object} actionData - 動作數據
 * @param {string} actionLang - 語言
 */
function handleCampusStats(actionData, actionLang) {
  Utils.logger.log('📊 處理校區統計查詢:', actionData);
  
  const campus = actionData.campus || 'campus1';
  // 確保 campusDisplay 顯示正確的中文名稱
  let campusDisplay = actionData.campus_chinese;
  if (!campusDisplay || campusDisplay === 'campus1' || campusDisplay === 'campus2' || campusDisplay === 'campus3') {
    // 如果沒有提供中文名稱或提供的是英文鍵值，使用映射
    const campusMap = {
      'campus1': '第一校區',
      'campus2': '第二校區',
      'campus3': '第三校區',
      'Campus 1': '第一校區',
      'Campus 2': '第二校區',
      'Campus 3': '第三校區'
    };
    campusDisplay = campusMap[campus] || campusMap[actionData.campus_english] || '第一校區';
  }
  
  // 顯示消息（如果有）
  if (actionData.message) {
    addMessage(actionData.message, false);
  } else {
    const message = actionLang === 'en'
      ? `Querying facility statistics for ${campusDisplay}...`
      : `正在查詢${campusDisplay}的設施統計...`;
    addMessage(message, false);
  }
  
  // 在地圖上顯示校區
  showCampusOnMap(campus);
  
  // 過濾並顯示該校區的設施
  filterFacilitiesByCampus(campus);
  
  // 顯示校區統計信息
  const statsMessage = getCampusStatsMessage(campus, actionLang);
  if (statsMessage) {
    // 不生成按鈕，只在 fallback 時生成
    addMessage(statsMessage, false);
  }
}

/**
 * 處理校區建築列表查詢
 * @param {Object} actionData - Action 數據
 * @param {string} actionLang - 語言
 */
function handleCampusBuildings(actionData, actionLang) {
  try {
    Utils.logger.log('🏢 處理校區建築列表查詢:', actionData);
    
    if (!actionData) {
      Utils.logger.warn('handleCampusBuildings: actionData 為空');
      return;
    }
    
    const campus = actionData.campus || 'campus1';
    // 確保 campusDisplay 顯示正確的中文名稱
    let campusDisplay = actionData.campus_chinese;
    if (!campusDisplay || campusDisplay === 'campus1' || campusDisplay === 'campus2' || campusDisplay === 'campus3') {
      // 如果沒有提供中文名稱或提供的是英文鍵值，使用映射
      const campusMap = {
        'campus1': '第一校區',
        'campus2': '第二校區',
        'campus3': '第三校區',
        'Campus 1': '第一校區',
        'Campus 2': '第二校區',
        'Campus 3': '第三校區'
      };
      campusDisplay = campusMap[campus] || campusMap[actionData.campus_english] || '第一校區';
    }
    const lang = actionLang || actionData.language || currentLanguage;
    
    // 從 buildingLocations 中獲取完整的建築列表（這是所有建築的完整數據）
    const buildings = (buildingLocations[campus] || []).map(b => b.name).sort();
    
    if (buildings.length === 0) {
      const message = lang === 'en'
        ? `No buildings found in ${campusDisplay}.`
        : `${campusDisplay}目前沒有建築資料。`;
      addMessage(message, false);
      return;
    }
    
    // 構建建築列表消息（使用 HTML 格式）
    let message = lang === 'en'
      ? `🏢 <strong>Buildings in ${campusDisplay}:</strong><br><br>`
      : `🏢 <strong>${campusDisplay}的建築：</strong><br><br>`;
    
    buildings.forEach((building, index) => {
      message += `${index + 1}. ${building}<br>`;
    });
    
    // 顯示消息（不生成按鈕，只在 fallback 時生成）
    addMessage(message, false);
    
    // 在地圖上顯示校區（安全調用）
    if (campus) {
      showCampusOnMap(campus);
      filterFacilitiesByCampus(campus);
    }
  } catch (error) {
    Utils.logger.error('handleCampusBuildings 錯誤:', error);
    const errorMsg = (actionLang || currentLanguage) === 'en'
      ? 'An error occurred while querying campus buildings. Please try again.'
      : '查詢校區建築時發生錯誤，請重試。';
    addMessage(errorMsg, false);
  }
}

/**
 * 根據校區過濾設施
 * @param {string} campus - 校區鍵值
 */
function filterFacilitiesByCampus(campus) {
  if (!campus) {
    Utils.logger.warn('filterFacilitiesByCampus: campus 參數為空');
    return;
  }
  
  try {
    // 更新地圖選擇器
    const campusSelect = document.getElementById('map-campus-select');
    if (campusSelect) {
      campusSelect.value = campus;
      // 觸發 change 事件以更新地圖
      campusSelect.dispatchEvent(new Event('change'));
    }
  } catch (error) {
    Utils.logger.error('filterFacilitiesByCampus 錯誤:', error);
  }
}

/**
 * 獲取校區統計信息消息
 * @param {string} campus - 校區鍵值
 * @param {string} lang - 語言
 * @returns {string|null} 統計信息消息
 */
function getCampusStatsMessage(campus, lang) {
  // 從實際的設施數據中獲取（優先使用 window.AI_FACILITY_DATA，否則使用 facilities）
  const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
  const campusData = facilityData[campus] || [];
  
  // 只計算可用的設施
  const availableFacilities = campusData.filter(f => isFacilityAvailable(f));
  const facilityCount = availableFacilities.length;
  
  // 統計各類型設施數量
  const counts = {
    toilet: availableFacilities.filter(f => f.type === 'toilet').length,
    water: availableFacilities.filter(f => f.type === 'water').length,
    trash: availableFacilities.filter(f => f.type === 'trash').length
  };
  
  if (lang === 'en') {
    const campusName = campus === 'campus1' ? 'Campus 1' : 
                      campus === 'campus2' ? 'Campus 2' : 
                      campus === 'campus3' ? 'Campus 3' : campus;
    return `📊 ${campusName} has ${facilityCount} available facilities:<br>
      🚻 Restrooms: ${counts.toilet}<br>
      🚰 Water fountains: ${counts.water}<br>
      🗑️ Trash cans: ${counts.trash}`;
  } else {
    const campusName = campus === 'campus1' ? '第一校區' : 
                      campus === 'campus2' ? '第二校區' : 
                      campus === 'campus3' ? '第三校區' : campus;
    return `📊 ${campusName}共有 ${facilityCount} 個可用設施：<br>
      🚻 廁所：${counts.toilet} 個<br>
      🚰 飲水機：${counts.water} 個<br>
      🗑️ 垃圾桶：${counts.trash} 個`;
  }
}

/**
 * 處理使用者輸入（改進：函數拆分，提高可維護性）
 * @param {string} query - 用戶輸入
 */
async function handleUserInput(query) {
  // 0. 保存輸入歷史（在處理前保存，確保即使用戶輸入有錯別字也能保存）
  saveInputHistory(query);
  
  // 1. 驗證和清理輸入（包含錯別字修正和標準化）
  const trimmedQuery = validateAndSanitizeInput(query);
  if (!trimmedQuery) {
    return;
  }

  // 2. 檢查是否是對話紀錄相關查詢（使用修正後的查詢）
  const queryLower = trimmedQuery.toLowerCase();
  const isHistoryQuery = queryLower.includes('對話紀錄') || queryLower.includes('對話歷史') || 
                         queryLower.includes('conversation history') || queryLower.includes('chat history') ||
                         queryLower.includes('查看紀錄') || queryLower.includes('查看歷史') ||
                         queryLower.includes('歷史紀錄');
  const isClearHistoryQuery = queryLower.includes('清除對話紀錄') || queryLower.includes('清除對話歷史') ||
                              queryLower.includes('clear conversation history') || queryLower.includes('clear history') ||
                              queryLower.includes('清除紀錄') || queryLower.includes('清除歷史');
  
  if (isHistoryQuery) {
    addMessage(query, true); // 顯示原始輸入
    showConversationHistory();
    return;
  }
  
  if (isClearHistoryQuery) {
    addMessage(query, true); // 顯示原始輸入
    clearConversationHistory();
    return;
  }

  // 3. 檢測並更新語言（使用修正後的查詢）
  detectAndUpdateLanguage(trimmedQuery);

  // 4. 使用對話記憶增強查詢
  const enhancedQuery = enhanceQueryWithMemory(trimmedQuery);
  const queryToSend = enhancedQuery || trimmedQuery;

  // 5. 顯示使用者訊息
  addMessage(query, true); // 顯示原始查詢

  // 5. 顯示輸入中
  showTyping();

  try {
    // 6. 處理查詢（Rasa 或本地）
    const response = await processQuery(queryToSend);

    // 7. 處理響應（確保即使響應為空也能正常處理）
    if (response) {
      handleResponse(response, useRasa);
    } else {
      hideTyping();
      Utils.logger.warn('⚠️ 未收到響應');
      
      // 使用 UserFeedbackManager 顯示友好的錯誤消息
      userFeedback.showError(
        currentLanguage === 'en'
          ? 'No response received from server'
          : '未收到伺服器響應',
        'handleUserInput',
        {
          retryable: true,
          retryCallback: () => {
            // 重試邏輯
            handleUserInput(query);
          }
        }
      );
    }

  } catch (error) {
    hideTyping();
    
    // 使用 UserFeedbackManager 顯示友好的錯誤消息
    userFeedback.showError(
      error,
      'handleUserInput',
      {
        retryable: true,
        retryCallback: () => {
          // 重試邏輯
          handleUserInput(query);
        }
      }
    );
    
    // 確保錯誤不會阻止後續請求
    Utils.logger.log('✅ 錯誤已處理，可以繼續使用');
  }
}

// ============================================
// 動作執行相關函數（改進：函數拆分）
// ============================================

/**
 * 處理尋找最近設施
 * @param {string} facilityType - 設施類型
 * @param {string} facilityName - 設施名稱
 * @param {string} lang - 語言
 */
function handleFindNearestFacility(facilityType, facilityName, lang = null, gender = null) {
    const useLang = lang || currentLanguage;
    
    // 若沒有取得使用者位置，使用校區1中心作為回退，並提示使用者
    if (!currentUserLocation) {
      const fallbackCenter = campusLocations?.campus1?.center;
      if (Array.isArray(fallbackCenter) && fallbackCenter.length === 2) {
        currentUserLocation = { lat: fallbackCenter[0], lng: fallbackCenter[1] };
        AppState.userLocation = currentUserLocation;
        const msg = useLang === 'en'
          ? 'Using default campus location because GPS is not available. Please allow location access for more accurate results.'
          : '尚未取得您的 GPS 位置，先以校區預設座標為基準搜尋。若要更精確，請允許位置存取。';
        addMessage(msg, false);
      } else {
      const msg = useLang === 'en'
        ? 'I need your location to find the nearest facility. Please allow the browser to access your location information.'
        : '需要取得您的位置才能找到最近的設施。請允許瀏覽器存取您的位置資訊。';
      addMessage(msg, false);
      return;
      }
    }
    
    const nearest = findNearestFacility(facilityType, true, gender);
    if (nearest) {
      // 驗證距離是否有效
      if (nearest.distance == null || isNaN(nearest.distance)) {
        const msg = useLang === 'en'
          ? 'Unable to calculate distance. Please allow location access and try again.'
          : '無法計算距離。請允許位置存取後再試。';
        addMessage(msg, false);
        return;
      }
      const distanceMeters = (nearest.distance * 1000).toFixed(0);
      showRouteToFacility(nearest);
      
      let message = '';
      if (useLang === 'en') {
        message = `I found the nearest ${facilityName}!<br><br>
          📍 <strong>${nearest.name}</strong><br>
          🏢 Building: ${nearest.building}<br>
          🏢 Floor: ${nearest.floor}<br>`;
        
        // 如果是廁所且有性別資訊，顯示性別
        if (facilityType === 'toilet' && nearest.gender) {
          const genderText = nearest.gender === '男' ? '♂️ Men\'s' : 
                            nearest.gender === '女' ? '♀️ Women\'s' : 
                            nearest.gender === '性別友善' ? '🚻 Gender-Inclusive' :
                            '🚻 All-Gender';
          message += `🚻 Type: ${genderText}<br>`;
        }
        
        // 顯示設施狀況
        if (nearest.status) {
          const statusInfo = getStatusInfo(nearest.status, useLang);
          const statusColor = getStatusColor(nearest.status);
          message += `<span style="color: ${statusColor};"><strong>${statusInfo.icon} Status: ${statusInfo.text}</strong></span><br>`;
        }
        
        message += `📏 Distance: About ${distanceMeters} meters<br><br>
          Route has been marked on the map. Please check the map on the right!`;
      } else {
        message = `我找到了最近的${facilityName}！<br><br>
          📍 <strong>${nearest.name}</strong><br>
          🏢 建築：${nearest.building}<br>
          🏢 樓層：${nearest.floor}<br>`;
        
        // 如果是廁所且有性別資訊，顯示性別
        if (facilityType === 'toilet' && nearest.gender) {
          const genderText = nearest.gender === '男' ? '♂️ 男廁' : 
                            nearest.gender === '女' ? '♀️ 女廁' : 
                            nearest.gender === '性別友善' ? '🚻 性別友善' :
                            '🚻 性別友善';
          message += `🚻 類型：${genderText}<br>`;
        }
        
        // 顯示設施狀況
        if (nearest.status) {
          const statusInfo = getStatusInfo(nearest.status, useLang);
          const statusColor = getStatusColor(nearest.status);
          const statusLabel = useLang === 'en' ? 'Status:' : '狀況：';
          message += `<span style="color: ${statusColor};"><strong>${statusInfo.icon} ${statusLabel}${statusInfo.text}</strong></span><br>`;
        }
        
        message += `📏 距離：約 ${distanceMeters} 公尺<br><br>
          地圖上已標示路線，請查看右側地圖！`;
      }
      
      addMessage(message, false);
    } else {
      const msg = useLang === 'en'
        ? 'Sorry, no nearby facilities were found. You can add facility locations through the "Add Location" feature.'
        : '抱歉，目前沒有找到附近的設施。您可以透過「新增點位」功能來新增設施位置。';
      addMessage(msg, false);
    }
  }

/**
 * 執行 Rasa action
 * @param {Object} actionData - Action 數據
 */
function executeAction(actionData) {
  if (!actionData || !actionData.action) {
    Utils.logger.warn('無效的 action 數據:', actionData);
    return;
  }

  const actionLang = actionData.language || currentLanguage;
  
  switch (actionData.action) {
    case 'find_nearest_facility':
      if (actionData.facility_type) {
        const facilityType = actionData.facility_type;
        const gender = actionData.gender || null;
        const facilityName = actionLang === 'en' 
          ? (actionData.facility_type_english || (facilityType === 'toilet' ? 'restroom' : facilityType === 'water' ? 'water fountain' : 'trash can'))
          : (actionData.facility_type_chinese || (facilityType === 'toilet' ? '廁所' : facilityType === 'water' ? '飲水機' : '垃圾桶'));
        handleFindNearestFacility(facilityType, facilityName, actionLang, gender);
      }
      break;

    case 'find_nearest_toilet':
      const gender = actionData.gender || null;
      const toiletName = actionLang === 'en' 
        ? (actionData.facility_type_english || (gender === '男' ? 'men\'s restroom' : gender === '女' ? 'women\'s restroom' : 'restroom'))
        : (actionData.facility_type_chinese || (gender === '男' ? '男廁' : gender === '女' ? '女廁' : gender === '性別友善' ? '性別友善廁所' : '廁所'));
      handleFindNearestFacility('toilet', toiletName, actionLang, gender);
      break;

    case 'find_nearest_water':
      const waterName = actionLang === 'en'
        ? (actionData.facility_type_english || 'water fountain')
        : (actionData.facility_type_chinese || '飲水機');
      handleFindNearestFacility('water', waterName, actionLang);
      break;

    case 'find_nearest_trash':
      const trashName = actionLang === 'en'
        ? (actionData.facility_type_english || 'trash can')
        : (actionData.facility_type_chinese || '垃圾桶');
      handleFindNearestFacility('trash', trashName, actionLang);
      break;

    case 'show_time':
      if (actionData.time) {
        // 時間訊息已經在 action 中格式化，直接使用
        if (actionData.message) {
          addMessage(actionData.message, false);
        } else {
          const timeMsg = actionLang === 'en'
            ? `The current time is: ${actionData.time}`
            : `現在時間是：${actionData.time}`;
          addMessage(timeMsg, false);
        }
      }
      break;

    case 'query_campus_stats':
      handleCampusStats(actionData, actionLang);
      // 生成相關按鈕
      const campusButtons = generateResponseButtons({ action: actionData, text: '' });
      if (campusButtons && campusButtons.length > 0) {
        // 按鈕會在 handleCampusStats 中的 addMessage 調用中顯示
      }
      break;
    
    case 'query_campus_buildings':
      handleCampusBuildings(actionData, actionLang);
      break;
    
    case 'query_facilities_by_status':
      handleQueryFacilitiesByStatus(actionData, actionLang);
      break;

    case 'show_route':
      // 路線已在 find_nearest_facility 中顯示
      break;

    case 'open_issue_form': {
      // 打開問題回報表單（直接打開表單，讓用戶自行填寫）
      // 清除 find_nearest_facility 的 pending_intent，避免誤觸發導航
      const pending = conversationMemoryManager.checkPendingIntent();
      if (pending && pending.intent === 'find_nearest_facility') {
        conversationMemoryManager.clearPendingIntent();
        Utils.logger.log('✅ 已清除 find_nearest_facility 的 pending_intent');
      }
      
      const facilityType = actionData.facility_type || null;
      const formData = {
        campus: actionData.campus || null,
        building: actionData.building || null,
        floor: actionData.floor || '',
        status: actionData.status || null,
        notes: actionData.notes || actionData.problem_description || '',
        problem_description: actionData.problem_description || actionData.notes || ''
      };
      
      // 如果是廁所且有性別信息，添加到 formData
      if (facilityType === 'toilet' && actionData.gender) {
        formData.gender = actionData.gender;
      }
      
      Utils.logger.log('📝 打開回報表單:', formData);
      openIssueForm(facilityType, formData);
      
      // 如果有 message，也顯示它
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      }
      break;
    }
    
    case 'ask_for_building':
    case 'ask_for_floor':
    case 'ask_for_facility_type':
    case 'ask_for_problem_details':
      // 以前：透過多輪對話向使用者詢問建築 / 樓層 / 類型 / 問題描述
      // 現在：如果是設施回報相關，直接打開表單讓使用者自行填寫，不再進一步追問
      {
        // 嘗試從 actionData 或 collected_info 擷取已知資訊，作為表單預填
        const collected = actionData.collected_info || {};
        const preferredType =
          actionData.facility_type ||
          collected.facility_type ||
          null;
        
        const formData = {
          campus: actionData.campus || collected.campus || null,
          building: actionData.building || collected.building || null,
          floor: actionData.floor || collected.floor || null,
          status: actionData.status || collected.status || null,
          notes:
            actionData.notes ||
            actionData.problem_description ||
            collected.notes ||
            '',
          problem_description:
            actionData.problem_description ||
            collected.problem_description ||
            actionData.notes ||
            ''
        };

        // 如果是廁所且有性別資訊，一併帶入
        if ((preferredType === 'toilet' || actionData.facility_type === 'toilet') && (actionData.gender || collected.gender)) {
          formData.gender = actionData.gender || collected.gender;
        }

        Utils.logger.log('📝 收到 ask_for_* 動作，改為直接開啟回報表單:', {
          action: actionData.action,
          preferredType,
          formData
        });

        openIssueForm(preferredType, formData);
      }
      break;

    case 'update_facility_status':
      // 更新設施狀態
      handleUpdateFacilityStatus(actionData);
      break;
    case 'update_floor_status':
      // 更新樓層狀態
      handleUpdateFloorStatus(actionData);
      break;
    
    // 新增校園資訊相關動作
    case 'campus_events':
    case 'emergency_contact':
    case 'parking_info':
    case 'dining_info':
    case 'library_hours':
    case 'weather':
    case 'campus_tips':
      // 這些動作的回應已經在 Rasa action 中處理
      // 但如果有額外的 message，也要顯示
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      }
      break;
    
    case 'building_info':
    case 'ask_building_info':
      // 處理建築資訊查詢（改進版：分開判斷，避免顯示多餘資訊）
      handleBuildingInfo(actionData);
      break;
    
    case 'query_floor_status':
      // 查詢樓層狀態
      handleQueryFloorStatus(actionData);
      break;
    case 'query_building_facilities':
      // 查詢建築設施
      handleQueryBuildingFacilities(actionData);
      break;
    case 'report_facility_problem': {
      // 報告設施問題（直接打開表單，讓用戶自行填寫類型）
      // 清除 find_nearest_facility 的 pending_intent，避免誤觸發導航
      const pending = conversationMemoryManager.checkPendingIntent();
      if (pending && pending.intent === 'find_nearest_facility') {
        conversationMemoryManager.clearPendingIntent();
        Utils.logger.log('✅ 已清除 find_nearest_facility 的 pending_intent');
      }
      
      const facilityType = actionData.facility_type || null;
      const formData = {
        campus: actionData.campus || null,
        building: actionData.building || null,
        floor: actionData.floor || '',
        status: actionData.status || null,
        notes: actionData.notes || actionData.problem_description || '',
        problem_description: actionData.problem_description || actionData.notes || ''
      };
      
      // 如果是廁所且有性別信息，添加到 formData
      if (facilityType === 'toilet' && actionData.gender) {
        formData.gender = actionData.gender;
      }
      
      Utils.logger.log('📝 打開回報表單（report_facility_problem）:', formData);
      openIssueForm(facilityType, formData);
      
      // 如果有 message，也顯示它
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      }
      break;
    }
    case 'get_smart_route':
      // 智能路線規劃（避開故障設施）
      handleGetSmartRoute(actionData);
      break;
    case 'query_facility_history':
      // 查詢設施歷史
      handleQueryFacilityHistory(actionData);
      break;
    case 'get_statistics':
      // 獲取統計資訊
      handleGetStatistics(actionData);
      break;
    case 'set_preference':
      // 設定偏好
      handleSetPreference(actionData);
      break;
    case 'get_preferences':
      // 獲取偏好
      handleGetPreferences(actionData);
      break;
    case 'quick_report':
      // 快速回報
      handleQuickReport(actionData);
      break;
    case 'query_issue_history':
      // 歷史記錄功能已移除
      const historyMsg = currentLanguage === 'en'
        ? 'History feature has been removed.'
        : '歷史記錄功能已移除。';
      addMessage(historyMsg, false);
      break;
    
    // GPS 相關 actions
    case 'get_user_location':
      // 獲取用戶 GPS 位置
      handleGetUserLocation(actionData);
      break;
    
    case 'find_nearest_functional_facility':
      // 尋找最近的功能正常設施
      handleFindNearestFunctionalFacility(actionData);
      break;
    
    case 'navigate_to_functional_facility':
      // 導航到功能正常設施
      handleNavigateToFunctionalFacility(actionData);
      break;
    
    case 'query_facility_gps':
      // 查詢設施 GPS 座標
      handleQueryFacilityGPS(actionData);
      break;
    
    case 'get_facility_gps_points':
      // 獲取所有設施 GPS 點位
      handleGetFacilityGPSPoints(actionData);
      break;
    
    // 設施狀態查詢 actions
    case 'query_facility_status':
      // 查詢設施狀態
      handleQueryFacilityStatus(actionData);
      break;
    
    case 'query_nearby_facilities_status':
      // 查詢附近設施狀態
      handleQueryNearbyFacilitiesStatus(actionData);
      break;
    
    case 'get_facilities_by_status':
      // 根據狀態篩選設施
      handleGetFacilitiesByStatus(actionData);
      break;
    
    case 'get_facilities_sorted_by_distance':
      // 獲取按距離排序的設施
      handleGetFacilitiesSortedByDistance(actionData);
      break;
    
    case 'compare_facilities':
      // 比較設施
      handleCompareFacilities(actionData);
      break;
    
    case 'get_facility_statistics':
      // 獲取設施統計
      handleGetFacilityStatistics(actionData);
      break;
    
    // 智能功能 actions
    case 'recommend_facility':
      // 推薦設施
      handleRecommendFacility(actionData);
      break;
    
    case 'smart_suggestions':
      // 智能建議
      handleSmartSuggestions(actionData);
      break;
    
    case 'format_rich_response':
      // 格式化豐富回應（已在 handleRasaResponse 中處理，這裡只處理額外邏輯）
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      }
      break;
    
    case 'batch_query_facilities':
      // 批量查詢設施
      handleBatchQueryFacilities(actionData);
      break;
    
    case 'show_progress':
      // 顯示進度
      handleShowProgress(actionData);
      break;
    
    case 'smart_error_recovery':
      // 智能錯誤恢復
      handleSmartErrorRecovery(actionData);
      break;
    
    case 'provide_suggestions':
      // 提供建議
      handleProvideSuggestions(actionData);
      break;
    
    case 'ask_gender':
      // 詢問性別（使用按鈕）
      handleAskGender(actionData);
      break;
    
    case 'remember_context':
      // 記住上下文（已在後端處理，前端只需確認）
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      }
      break;
    
    default:
      // 處理未定義的 action，顯示 message（如果有的話）
      if (actionData.message) {
        addMessage(actionData.message.replace(/\n/g, '<br>'), false);
      } else {
        Utils.logger.warn('未處理的 action:', actionData.action, actionData);
        // 即使沒有 message，也給用戶一個友好的提示
        const actionLang = actionData.language || currentLanguage;
        const msg = actionLang === 'en'
          ? 'I received your request, but I\'m not sure how to handle it. Please try rephrasing your question.'
          : '我收到了您的請求，但我不確定如何處理。請嘗試換個方式表達您的問題。';
        addMessage(msg, false);
      }
      break;
  }
}

// 處理設施狀態更新
function handleUpdateFacilityStatus(actionData) {
  if (!actionData.status) {
    Utils.logger.warn('狀態更新資料缺少狀態資訊');
    return;
  }

  const facilityType = actionData.facility_type;
  const newStatus = actionData.status;
  const actionLang = actionData.language || currentLanguage;

  // 如果沒有用戶位置，無法確定要更新哪個設施
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to update the facility status. Please allow the browser to access your location information.'
      : '需要取得您的位置才能更新設施狀態。請允許瀏覽器存取您的位置資訊。';
    addMessage(msg, false);
    return;
  }

  // 尋找最近的設施（如果指定了類型，則只找該類型）
  const nearest = facilityType 
    ? findNearestFacility(facilityType)
    : findNearestAnyFacility();

  if (!nearest) {
    const msg = actionLang === 'en'
      ? 'Sorry, I could not find a nearby facility to update.'
      : '抱歉，找不到附近的設施可以更新。';
    addMessage(msg, false);
    return;
  }

  // 更新設施狀態
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  const facility = allFacilities.find(f => f.id == nearest.id);
  if (facility) {
    const oldStatus = facility.status || '正常';
    facility.status = newStatus;
    facility.updatedAt = new Date().toISOString();
    
    // 保存到 localStorage（使用防抖函數優化性能）
    saveFacilitiesDebounced();
    
    // 使用 BroadcastChannel 通知其他標籤頁
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('facility_updates');
      channel.postMessage({
        type: 'status_update',
        facilityId: facility.id,
        oldStatus: oldStatus,
        newStatus: newStatus,
        timestamp: facility.updatedAt
      });
    }
    
    // 更新地圖顯示
    loadAndDisplayFacilities();
    
    // 顯示更新成功的訊息（帶有狀態圖標和顏色）
    const statusInfo = getStatusInfo(newStatus, actionLang);
    const statusColor = getStatusColor(newStatus);
    
    const successMsg = actionLang === 'en'
      ? `✅ Status updated successfully!<br><br>
         📍 <strong>${facility.name}</strong><br>
         🏢 Building: ${facility.building}<br>
         🏢 Floor: ${facility.floor}<br>
         <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} Status: ${statusInfo.text}</span><br><br>
         The map has been updated in real-time.`
      : `✅ 狀態更新成功！<br><br>
         📍 <strong>${facility.name}</strong><br>
         🏢 建築：${facility.building}<br>
         🏢 樓層：${facility.floor}<br>
         <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} 狀態：${statusInfo.text}</span><br><br>
         地圖已即時更新。`;
    
    addMessage(successMsg, false);
    
    // 在地圖上高亮顯示更新的設施
    if (aiMap) {
      if (AppState.map) {
        AppState.map.setView([facility.lat, facility.lng], 19);
      }
      // 找到對應的標記並打開 popup
      AppState.markers.forEach(marker => {
        const markerLat = marker.getLatLng().lat;
        const markerLng = marker.getLatLng().lng;
        if (Math.abs(markerLat - facility.lat) < 0.0001 && Math.abs(markerLng - facility.lng) < 0.0001) {
          marker.openPopup();
        }
      });
    }
  }
}

// 處理樓層狀態更新
function handleUpdateFloorStatus(actionData) {
  if (!actionData.status || !actionData.building || !actionData.floor) {
    const actionLang = actionData.language || currentLanguage;
    const msg = actionLang === 'en'
      ? 'I need building, floor, and status information to update. Please specify all three.'
      : '我需要建築、樓層和狀態資訊才能更新。請指定這三項資訊。';
    addMessage(msg, false);
    return;
  }

  const building = actionData.building;
  const floor = actionData.floor;
  const newStatus = actionData.status;
  const facilityType = actionData.facility_type || 'toilet';
  const actionLang = actionData.language || currentLanguage;

  // 在所有校區中尋找匹配的設施
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];

  // 尋找匹配的設施（建築、樓層、類型）
  const matchingFacilities = allFacilities.filter(f => {
    const buildingMatch = f.building === building || 
                         f.building?.includes(building) || 
                         building.includes(f.building);
    const floorMatch = f.floor === floor || 
                      f.floor?.includes(floor) || 
                      floor.includes(f.floor);
    const typeMatch = f.type === facilityType;
    return buildingMatch && floorMatch && typeMatch;
  });

  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? `Sorry, I could not find any ${facilityType} on ${building} ${floor}.`
      : `抱歉，找不到${building} ${floor}的${facilityType === 'toilet' ? '廁所' : facilityType}。`;
    addMessage(msg, false);
    return;
  }

  // 更新所有匹配的設施
  let updatedCount = 0;
  matchingFacilities.forEach(facility => {
    const oldStatus = facility.status || '正常';
    facility.status = newStatus;
    facility.updatedAt = new Date().toISOString();
    updatedCount++;
  });

  // 保存到 localStorage（使用防抖函數優化性能）
  saveFacilitiesDebounced();

  // 使用 BroadcastChannel 通知其他標籤頁
  if (typeof BroadcastChannel !== 'undefined') {
    const channel = new BroadcastChannel('facility_updates');
    matchingFacilities.forEach(facility => {
      channel.postMessage({
        type: 'status_update',
        facilityId: facility.id,
        oldStatus: facility.status,
        newStatus: newStatus,
        timestamp: facility.updatedAt
      });
    });
  }

  // 更新地圖顯示
  loadAndDisplayFacilities();

  // 顯示更新成功的訊息
  const statusInfo = getStatusInfo(newStatus, actionLang);
  const statusColor = getStatusColor(newStatus);
  const facilityName = facilityType === 'toilet' 
    ? (actionLang === 'en' ? 'restroom' : '廁所')
    : facilityType;

  const successMsg = actionLang === 'en'
    ? `✅ Successfully updated ${updatedCount} ${facilityName}(s)!<br><br>
       🏢 <strong>${building}</strong><br>
       🏢 Floor: ${floor}<br>
       <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} Status: ${statusInfo.text}</span><br><br>
       The map has been updated in real-time.`
    : `✅ 已成功更新 ${updatedCount} 個${facilityName}！<br><br>
       🏢 <strong>${building}</strong><br>
       🏢 樓層：${floor}<br>
       <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} 狀態：${statusInfo.text}</span><br><br>
       地圖已即時更新。`;

  addMessage(successMsg, false);

  // 在地圖上高亮顯示更新的設施（顯示第一個）
  if (aiMap && matchingFacilities.length > 0) {
    const firstFacility = matchingFacilities[0];
    if (AppState.map) {
      AppState.map.setView([firstFacility.lat, firstFacility.lng], 19);
    }
  }
}

// 顯示確認表單（雙重確認）
/**
 * 獲取設施名稱（改進：函數拆分）
 * @param {string} facilityType - 設施類型
 * @param {string} lang - 語言
 * @returns {string} 設施名稱
 */
function getFacilityNameForConfirmation(facilityType, lang) {
  if (facilityType === 'toilet') {
    return lang === 'en' ? 'Restroom' : '廁所';
  } else if (facilityType === 'water') {
    return lang === 'en' ? 'Water Fountain' : '飲水機';
  } else {
    return lang === 'en' ? 'Trash Can' : '垃圾桶';
  }
}

/**
 * 生成確認表單的資訊 HTML（改進：函數拆分）
 * @param {Object} data - 確認數據
 * @param {string} lang - 語言
 * @returns {string} HTML 字符串
 */
function generateConfirmationInfoHTML(data, lang) {
  const { building, floor, facilityType, status, notes, priority, severity, suggestion, matchingFacilities } = data;
  const facilityName = getFacilityNameForConfirmation(facilityType, lang);
  const statusInfo = getStatusInfo(status, lang);
  const statusColor = getStatusColor(status);
  
  // 檢測當前主題模式
  const isDarkMode = document.body.classList.contains('theme-dark');
  
  // 根據主題設置顏色
  const bgColor = isDarkMode ? '#2d3748' : '#ffffff';
  const borderColor = isDarkMode ? '#4a5568' : '#e0e0e0';
  const labelColor = isDarkMode ? '#e2e8f0' : '#2c3e50';
  const valueColor = isDarkMode ? '#cbd5e0' : '#34495e';
  const shadowColor = isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.1)';
  
  // 嚴重程度顯示
  const getSeverityText = (sev, isEn) => {
    if (sev === 'critical' || sev === 'major') {
      return isEn ? '🔴 Major' : '🔴 嚴重';
    } else if (sev === 'moderate') {
      return isEn ? '🟠 Moderate' : '🟠 中等';
    } else {
      return isEn ? '🟡 Minor' : '🟡 輕微';
    }
  };
  
  // 合併相同建築、相同設施類型但不同樓層的設施
  const groupFacilitiesByBuildingAndType = (facilities) => {
    const groups = {};
    facilities.forEach(f => {
      const key = `${f.building}_${f.type}`;
      if (!groups[key]) {
        groups[key] = {
          building: f.building,
          type: f.type,
          floors: []
        };
      }
      // 提取樓層數字
      const floorNum = parseInt(f.floor?.replace(/[^0-9]/g, '') || '0');
      if (floorNum > 0 && !groups[key].floors.includes(floorNum)) {
        groups[key].floors.push(floorNum);
      }
    });
    
    // 對每個組的樓層進行排序
    Object.keys(groups).forEach(key => {
      groups[key].floors.sort((a, b) => a - b);
    });
    
    return groups;
  };
  
  // 格式化樓層範圍（例如：1~10F）
  const formatFloorRange = (floors) => {
    if (floors.length === 0) return '';
    if (floors.length === 1) return `${floors[0]}F`;
    
    // 檢查是否連續
    const sorted = [...floors].sort((a, b) => a - b);
    const isConsecutive = sorted.every((floor, index) => {
      if (index === 0) return true;
      return floor === sorted[index - 1] + 1;
    });
    
    if (isConsecutive) {
      return `${sorted[0]}~${sorted[sorted.length - 1]}F`;
    } else {
      // 如果不連續，顯示範圍和單獨的樓層
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      if (sorted.length <= 5) {
        return sorted.map(f => `${f}F`).join(', ');
      } else {
        return `${min}~${max}F (${sorted.length} 層)`;
      }
    }
  };
  
  if (lang === 'en') {
    return `
      <div style="background: ${bgColor}; border: 2px solid ${borderColor}; padding: 18px; border-radius: 10px; margin: 15px 0; box-shadow: 0 2px 8px ${shadowColor};">
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🏢 Building:</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(building)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🏢 Floor:</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(floor)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🔧 Facility Type:</strong> <span style="color: ${valueColor}; font-weight: 500;">${facilityName}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📊 Status:</strong> <span style="color: ${statusColor}; font-weight: bold; font-size: 14px;">${statusInfo.icon} ${Utils.html.escape(statusInfo.text)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📝 Description:</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(notes || 'N/A')}</span></p>
        ${severity ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">⚡ Severity:</strong> <span style="color: ${valueColor}; font-weight: 500;">${getSeverityText(severity, true)}</span></p>` : ''}
        ${priority ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">⚠️ Priority:</strong> <span style="color: ${valueColor}; font-weight: 500;">${priority === 'critical' ? '🔴 Critical' : priority === 'moderate' ? '🟠 Moderate' : '🟡 Minor'}</span></p>` : ''}
        ${suggestion ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">💡 Suggestion:</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(suggestion)}</span></p>` : ''}
        ${matchingFacilities && matchingFacilities.length > 0 ? (() => {
          const grouped = groupFacilitiesByBuildingAndType(matchingFacilities);
          const groups = Object.values(grouped);
          return `
          <div class="detail-section" style="margin-top: 15px; background: ${isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)'}; border-radius: 12px; padding: 16px; border: 1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#e5e7eb'};">
            <h3 style="color: ${isDarkMode ? '#e5e7eb' : '#1f2937'}; font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#e5e7eb'};">
              📍 Affected Facilities (${matchingFacilities.length})
            </h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
              ${groups.map(group => {
                const floorRange = formatFloorRange(group.floors);
                const groupFacilityName = group.type === 'toilet' ? (lang === 'en' ? 'Restroom' : '廁所') : 
                                         group.type === 'water' ? (lang === 'en' ? 'Water Fountain' : '飲水機') :
                                         group.type === 'trash' ? (lang === 'en' ? 'Trash Can' : '垃圾桶') : group.type;
                return `
                <div class="detail-item" style="display: flex; flex-direction: column; padding: 10px; background: ${isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(249, 250, 251, 0.8)'}; border-radius: 8px; border-left: 3px solid ${isDarkMode ? '#38bdf8' : '#3b82f6'}; transition: all 0.2s ease;">
                  <span class="detail-label" style="color: ${isDarkMode ? '#94a3b8' : '#6b7280'}; font-size: 12px; font-weight: 500; margin-bottom: 4px;">${Utils.html.escape(floorRange)}</span>
                  <span class="detail-value" style="color: ${isDarkMode ? '#e5e7eb' : '#1f2937'}; font-size: 11px;">${Utils.html.escape(group.building)} ${groupFacilityName}</span>
                </div>
              `;
              }).join('')}
            </div>
          </div>
        `;
        })() : `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📍 Affected Facilities:</strong> <span style="color: ${valueColor}; font-weight: 500;">${matchingFacilities.length} facility(ies)</span></p>`}
      </div>
    `;
  } else {
    return `
      <div style="background: ${bgColor}; border: 2px solid ${borderColor}; padding: 18px; border-radius: 10px; margin: 15px 0; box-shadow: 0 2px 8px ${shadowColor};">
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🏢 建築：</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(building)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🏢 樓層：</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(floor)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">🔧 設施類型：</strong> <span style="color: ${valueColor}; font-weight: 500;">${facilityName}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📊 狀態：</strong> <span style="color: ${statusColor}; font-weight: bold; font-size: 14px;">${statusInfo.icon} ${Utils.html.escape(statusInfo.text)}</span></p>
        <p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📝 問題描述：</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(notes || '無')}</span></p>
        ${severity ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">⚡ 嚴重程度：</strong> <span style="color: ${valueColor}; font-weight: 500;">${getSeverityText(severity, false)}</span></p>` : ''}
        ${priority ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">⚠️ 優先級：</strong> <span style="color: ${valueColor}; font-weight: 500;">${priority === 'critical' ? '🔴 緊急' : priority === 'moderate' ? '🟠 重要' : '🟡 一般'}</span></p>` : ''}
        ${suggestion ? `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">💡 建議：</strong> <span style="color: ${valueColor}; font-weight: 500;">${Utils.html.escape(suggestion)}</span></p>` : ''}
        ${matchingFacilities && matchingFacilities.length > 0 ? (() => {
          const grouped = groupFacilitiesByBuildingAndType(matchingFacilities);
          const groups = Object.values(grouped);
          return `
          <div class="detail-section" style="margin-top: 15px; background: ${isDarkMode ? 'rgba(15, 23, 42, 0.5)' : 'rgba(255, 255, 255, 0.8)'}; border-radius: 12px; padding: 16px; border: 1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#e5e7eb'};">
            <h3 style="color: ${isDarkMode ? '#e5e7eb' : '#1f2937'}; font-size: 18px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid ${isDarkMode ? 'rgba(148, 163, 184, 0.2)' : '#e5e7eb'};">
              📍 受影響設施 (${matchingFacilities.length} 個)
            </h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px;">
              ${groups.map(group => {
                const floorRange = formatFloorRange(group.floors);
                const groupFacilityName = group.type === 'toilet' ? '廁所' : 
                                         group.type === 'water' ? '飲水機' :
                                         group.type === 'trash' ? '垃圾桶' : group.type;
                return `
                <div class="detail-item" style="display: flex; flex-direction: column; padding: 10px; background: ${isDarkMode ? 'rgba(15, 23, 42, 0.3)' : 'rgba(249, 250, 251, 0.8)'}; border-radius: 8px; border-left: 3px solid ${isDarkMode ? '#38bdf8' : '#3b82f6'}; transition: all 0.2s ease;">
                  <span class="detail-label" style="color: ${isDarkMode ? '#94a3b8' : '#6b7280'}; font-size: 12px; font-weight: 500; margin-bottom: 4px;">${Utils.html.escape(floorRange)}</span>
                  <span class="detail-value" style="color: ${isDarkMode ? '#e5e7eb' : '#1f2937'}; font-size: 11px;">${Utils.html.escape(group.building)} ${groupFacilityName}</span>
                </div>
              `;
              }).join('')}
            </div>
          </div>
        `;
        })() : `<p style="margin: 10px 0; font-size: 14px; line-height: 1.6;"><strong style="color: ${labelColor}; font-size: 14px;">📍 受影響設施：</strong> <span style="color: ${valueColor}; font-weight: 500;">${matchingFacilities.length} 個設施</span></p>`}
      </div>
    `;
  }
}

/**
 * 設置確認表單事件處理（改進：函數拆分）
 * @param {Object} data - 確認數據
 * @param {string} lang - 語言
 */
function setupConfirmationFormEvents(data, lang) {
  const confirmBtn = document.getElementById('confirm-update-btn');
  const cancelBtn = document.getElementById('cancel-update-btn');
  
  if (confirmBtn) {
    Utils.events.on(confirmBtn, 'click', () => {
      try {
        // 用戶確認，執行狀態更新
        executeFacilityStatusUpdate({
          ...data,
          language: lang
        });
        
        // 移除確認表單
        const confirmMessage = document.getElementById('confirmation-form-message');
        if (confirmMessage) {
          confirmMessage.remove();
        }
      } catch (error) {
        Utils.logger.error('確認表單處理錯誤:', error);
        const errorMsg = lang === 'en'
          ? '❌ Failed to update facility status. Please try again.'
          : '❌ 更新設施狀態失敗，請重試。';
        addMessage(errorMsg, false);
      }
    });
  }
  
  if (cancelBtn) {
    Utils.events.on(cancelBtn, 'click', () => {
      try {
        // 用戶取消，只顯示取消訊息
        const cancelMsg = lang === 'en'
          ? '❌ Status update cancelled. No changes were made.'
          : '❌ 狀態更新已取消，未進行任何更改。';
        
        addMessage(cancelMsg, false);
        
        // 移除確認表單
        const confirmMessage = document.getElementById('confirmation-form-message');
        if (confirmMessage) {
          confirmMessage.remove();
        }
      } catch (error) {
        Utils.logger.error('取消表單處理錯誤:', error);
      }
    });
  }
}

/**
 * 顯示確認表單（改進：函數拆分）
 * @param {Object} data - 確認數據
 */
function showConfirmationForm(data) {
  try {
    const {
      building,
      floor,
      facilityType,
      status,
      notes,
      priority,
      severity,
      suggestion,
      matchingFacilities,
      actionData,
      language
    } = data;
    
    const actionLang = language || currentLanguage;
    
    // 構建確認訊息
    const confirmTitle = actionLang === 'en' 
      ? '📋 Please Confirm Facility Status Update'
      : '📋 請確認設施狀態更新';
    
    const confirmMessage = actionLang === 'en'
      ? `Please confirm the following information is correct before updating the facility status:`
      : `請確認以下資訊無誤後再更新設施狀態：`;
    
    const infoHtml = generateConfirmationInfoHTML(data, actionLang);
    
    // 保存設施信息到對話記憶，以便用戶回答「整個」時使用
    if (!window.conversationMemory) {
      window.conversationMemory = {};
    }
    window.conversationMemory.report_facility_problem = {
      building: building,
      floor: floor,
      facilityType: facilityType,
      status: status,
      notes: notes,
      matchingFacilities: matchingFacilities
    };
    
    // 創建確認表單 HTML
    const confirmFormHtml = `
      <div class="confirmation-form-container" id="confirmation-form-container">
        <div class="confirmation-form-card">
          <div class="confirmation-form-header">
            <h3>${Utils.html.escape(confirmTitle)}</h3>
          </div>
          <div class="confirmation-form-content">
            <p style="margin-bottom: 15px;">${Utils.html.escape(confirmMessage)}</p>
            ${infoHtml}
          </div>
          <div class="confirmation-form-actions">
            <button type="button" class="confirmation-btn confirm-btn" id="confirm-update-btn" data-action="confirm">
              ✅ ${actionLang === 'en' ? 'Confirm & Update' : '確認並更新'}
            </button>
            <button type="button" class="confirmation-btn cancel-btn" id="cancel-update-btn" data-action="cancel">
              ❌ ${actionLang === 'en' ? 'Cancel' : '取消'}
            </button>
          </div>
        </div>
      </div>
    `;
    
    // 添加確認表單到聊天區域
    // 使用 DOM 緩存優化
    const messagesContainer = Utils.dom.get('chat-messages');
    if (!messagesContainer) {
      Utils.logger.error('聊天消息容器不存在');
      return;
    }
    
    const confirmDiv = document.createElement('div');
    confirmDiv.className = 'message ai-message confirmation-message';
    confirmDiv.id = 'confirmation-form-message';
    
    // 使用安全的 HTML 設置
    const safeHtml = confirmFormHtml
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    confirmDiv.innerHTML = safeHtml;
    messagesContainer.appendChild(confirmDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // 設置事件處理
    setupConfirmationFormEvents(data, actionLang);
  } catch (error) {
    Utils.logger.error('顯示確認表單時發生錯誤:', error);
    const errorMsg = (data.language || currentLanguage) === 'en'
      ? '❌ Failed to display confirmation form. Please try again.'
      : '❌ 顯示確認表單失敗，請重試。';
    addMessage(errorMsg, false);
  }
}

// 執行設施狀態更新（用戶確認後）
function executeFacilityStatusUpdate(data) {
  const {
    building,
    floor,
    facilityType,
    status,
    notes,
    priority,
    severity,
    suggestion,
    matchingFacilities,
    actionData,
    language
  } = data;
  
  const actionLang = language || currentLanguage;
  
  // 更新設施狀態 - 確保更新的是原始 facilities 對象中的設施
  if (matchingFacilities.length > 0) {
    // 獲取原始設施數據
    const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
    
    // 收集需要更新的設施 ID
    const facilityIds = matchingFacilities.map(f => f.id);
    
    // 更新所有校區中的匹配設施
    ['campus1', 'campus2', 'campus3'].forEach(campusKey => {
      const campusFacilities = facilityData[campusKey] || [];
      campusFacilities.forEach(facility => {
        if (facilityIds.includes(facility.id)) {
          const oldStatus = facility.status || '正常';
      facility.status = status;
      facility.updatedAt = new Date().toISOString();
          
      if (notes) {
        if (!facility.notes) facility.notes = [];
        facility.notes.push({
          text: notes,
          timestamp: facility.updatedAt,
          severity: severity || 'minor'
        });
          }
          
          Utils.logger.log(`✅ 更新設施狀態: ${facility.building} ${facility.floor} - ${oldStatus} → ${status}`);
        }
      });
    });
    
    // 同步更新全局 facilities 變量
    if (facilities) {
      ['campus1', 'campus2', 'campus3'].forEach(campusKey => {
        if (facilities[campusKey]) {
          facilities[campusKey] = facilityData[campusKey];
        }
      });
    }
    
    // 同步更新 AppState
    AppState.facilities = facilityData;
    window.AI_FACILITY_DATA = facilityData;
    
    // 保存到 localStorage（使用防抖函數優化性能）
    Utils.storage.set(AppConfig.STORAGE_KEYS.FACILITIES, facilityData);
    
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel('facility_updates');
      matchingFacilities.forEach(facility => {
        channel.postMessage({
          type: 'status_update',
          facilityId: facility.id,
          oldStatus: facility.status,
          newStatus: status,
          timestamp: facility.updatedAt
        });
      });
    }
    
    loadAndDisplayFacilities();
  }
  
  // 顯示成功訊息
  const facilityName = facilityType === 'toilet' 
    ? (actionLang === 'en' ? 'restroom' : '廁所')
    : facilityType === 'water'
    ? (actionLang === 'en' ? 'water fountain' : '飲水機')
    : (actionLang === 'en' ? 'trash can' : '垃圾桶');
  
  const statusInfo = getStatusInfo(status, actionLang);
  const statusColor = getStatusColor(status);
  
  const successMsg = actionLang === 'en'
    ? `✅ Successfully updated ${matchingFacilities.length} ${facilityName}(s)!<br><br>
       🏢 <strong>${building}</strong><br>
       🏢 Floor: ${floor}<br>
       <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} Status: ${statusInfo.text}</span><br><br>
       The map has been updated in real-time.`
    : `✅ 已成功更新 ${matchingFacilities.length} 個${facilityName}！<br><br>
       🏢 <strong>${building}</strong><br>
       🏢 樓層：${floor}<br>
       <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} 狀態：${statusInfo.text}</span><br><br>
       地圖已即時更新。`;
  
  addMessage(successMsg, false);
  
  // 在地圖上高亮顯示更新的設施
  if (aiMap && matchingFacilities.length > 0) {
    const firstFacility = matchingFacilities[0];
    if (AppState.map) {
      AppState.map.setView([firstFacility.lat, firstFacility.lng], 19);
    }
  }
  
  // 保存到歷史記錄
  saveIssueToHistory({
    building: building,
    floor: floor,
    facilityType: facilityType,
    status: status,
    notes: notes,
    priority: priority || 'minor',
    severity: severity || 'minor',
    suggestion: suggestion || '',
    timestamp: actionData?.timestamp || new Date().toISOString()
  });
  
  // 發送通知（如果瀏覽器支持）
  if ('Notification' in window && Notification.permission === 'granted') {
    const notificationTitle = actionLang === 'en' ? 'Status Updated' : '狀態已更新';
    const notificationBody = actionLang === 'en'
      ? `Facility status at ${building} ${floor} has been updated.`
      : `${building} ${floor}的設施狀態已更新。`;
    
    new Notification(notificationTitle, {
      body: notificationBody,
      icon: '/favicon.ico',
      tag: `update-${Date.now()}`
    });
  }
}

// 處理對話式資訊收集
function handleConversationalInfoCollection(actionData) {
  const actionType = actionData.action;
  const message = actionData.message || '';
  const pendingIntent = actionData.pending_intent || 'report_facility_problem';
  const collectedInfo = actionData.collected_info || {};
  
  // 顯示 AI 的詢問訊息
  if (message) {
    addMessage(message, false);
  }
  
  // 將收集到的資訊存儲到會話記憶中
  if (!window.conversationMemory) {
    window.conversationMemory = {};
  }
  
  // 如果是 find_nearest_facility 的待處理查詢，直接存儲到 conversationMemory 的根級別
  if (pendingIntent === 'find_nearest_facility') {
    window.conversationMemory.pending_intent = 'find_nearest_facility';
    window.conversationMemory.facility_type = actionData.facility_type || 'toilet';
    Utils.logger.log('💬 Conversation memory updated for find_nearest_facility:', {
      pending_intent: window.conversationMemory.pending_intent,
      facility_type: window.conversationMemory.facility_type
    });
    return;
  }
  
  if (!window.conversationMemory[pendingIntent]) {
    window.conversationMemory[pendingIntent] = {};
  }
  
  // 合併已收集的資訊
  Object.assign(window.conversationMemory[pendingIntent], collectedInfo);
  
  // 標記當前正在收集的資訊類型
  window.conversationMemory[pendingIntent].waitingFor = actionType;
  
  Utils.logger.log('💬 Conversation memory updated:', window.conversationMemory[pendingIntent]);
}

// 處理報告設施問題（直接打開表單，讓用戶自行填寫）
function handleReportFacilityProblem(actionData) {
  // 如果表單正在提交中，不打開表單（避免重複彈出）
  if (window.formSubmissionInProgress) {
    Utils.logger.log('⏸️ 表單正在提交中，跳過打開表單');
    return;
  }
  
  // 清除 find_nearest_facility 的 pending_intent，避免誤觸發導航
  if (window.conversationMemory && window.conversationMemory.pending_intent === 'find_nearest_facility') {
    delete window.conversationMemory.pending_intent;
    delete window.conversationMemory.facility_type;
    Utils.logger.log('✅ 已清除 find_nearest_facility 的 pending_intent');
  }
  
  // 清除對話記憶中的回報相關信息
  if (window.conversationMemory && window.conversationMemory.report_facility_problem) {
    delete window.conversationMemory.report_facility_problem;
  }
  
  const facilityType = actionData.facility_type || null;
  const building = actionData.building || null;
  let floorNormalized = actionData.floor || '';
    
    // 標準化樓層
    if (floorNormalized && !floorNormalized.toUpperCase().endsWith('F')) {
      floorNormalized = floorNormalized + 'F';
    }
    
  // 根據建築名稱找到校區
  let campus = null;
  if (building) {
    for (const [campusKey, buildings] of Object.entries(buildingLocations)) {
      if (buildings.some(b => b.name === building || b.name?.includes(building) || building.includes(b.name))) {
        campus = campusKey;
        break;
      }
    }
    
    // 如果找不到，從設施數據中查找
    if (!campus) {
      const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
  const allFacilities = [
        ...(facilityData.campus1 || []),
        ...(facilityData.campus2 || []),
        ...(facilityData.campus3 || [])
      ];
      const matchingFacility = allFacilities.find(f => 
        f.building === building || 
                         f.building?.includes(building) || 
        building.includes(f.building)
      );
      if (matchingFacility && matchingFacility.campus) {
        campus = matchingFacility.campus;
      }
    }
  }
  
  // 準備表單數據
  const formData = {
    campus: campus,
    building: building,
    floor: floorNormalized,
    status: actionData.status || null,
    notes: actionData.notes || actionData.problem_description || '',
    problem_description: actionData.problem_description || actionData.notes || ''
  };
  
  // 如果是廁所且有性別信息，添加到 formData
  if (facilityType === 'toilet' && actionData.gender) {
    formData.gender = actionData.gender;
  }
  
  Utils.logger.log('📝 打開回報表單（handleReportFacilityProblem）:', formData);
  openIssueForm(facilityType, formData);
}

// 處理查詢樓層狀態
function handleQueryFloorStatus(actionData) {
  const building = actionData.building;
  const actionLang = actionData.language || currentLanguage;

  if (!building) {
    const msg = actionLang === 'en'
      ? 'Please specify which building you want to query.'
      : '請指定要查詢的建築。';
    addMessage(msg, false);
    return;
  }

  // 在所有校區中尋找匹配的設施
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];

  // 尋找匹配的設施（建築）
  const matchingFacilities = allFacilities.filter(f => {
    return f.building === building || 
           f.building?.includes(building) || 
           building.includes(f.building);
  });

  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? `Sorry, I could not find any facilities in ${building}.`
      : `抱歉，找不到${building}中的設施。`;
    addMessage(msg, false);
    return;
  }

  // 按樓層分組
  const floorGroups = {};
  matchingFacilities.forEach(facility => {
    const floor = facility.floor || 'Unknown';
    if (!floorGroups[floor]) {
      floorGroups[floor] = [];
    }
    floorGroups[floor].push(facility);
  });

  // 構建回應訊息
  let msg = actionLang === 'en'
    ? `📊 Floor Status for <strong>${building}</strong>:<br><br>`
    : `📊 <strong>${building}</strong> 樓層狀態：<br><br>`;

  // 按樓層排序
  const sortedFloors = Object.keys(floorGroups).sort((a, b) => {
    const floorA = parseInt(a.replace('F', '')) || 0;
    const floorB = parseInt(b.replace('F', '')) || 0;
    return floorA - floorB;
  });

  sortedFloors.forEach(floor => {
    const floorFacilities = floorGroups[floor];
    floorFacilities.forEach(facility => {
      const status = facility.status || '正常';
      const statusInfo = getStatusInfo(status, actionLang);
      const statusColor = getStatusColor(status);
      const facilityName = facility.type === 'toilet' 
        ? (actionLang === 'en' ? 'Restroom' : '廁所')
        : facility.type === 'water'
        ? (actionLang === 'en' ? 'Water Fountain' : '飲水機')
        : (actionLang === 'en' ? 'Trash Can' : '垃圾桶');
      
      msg += `<div style="margin: 8px 0; padding: 8px; background: rgba(15, 23, 42, 0.3); border-radius: 6px;">
        <strong>${floor}</strong> - ${facilityName}<br>
        <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} ${statusInfo.text}</span>
      </div>`;
    });
  });

  addMessage(msg, false);
}

// 處理建築資訊查詢（改進版：分開判斷，只顯示相關資訊）
/**
 * 計算兩個字符串的相似度（Levenshtein 距離）
 * @param {string} str1 - 第一個字符串
 * @param {string} str2 - 第二個字符串
 * @returns {number} 相似度分數（0-1，1表示完全相同）
 */
// 改進的相似度計算（支持多種匹配策略）
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  if (s1 === s2) return 1;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;
  
  // 計算 Levenshtein 距離
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix = [];
  
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1
        );
      }
    }
  }
  
  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);
  return 1 - (distance / maxLen);
}

/**
 * 模糊匹配建築物名稱
 * @param {string} query - 用戶查詢的建築物名稱
 * @returns {Object|null} 匹配的建築物數據和校區鍵值，或 null
 */
function fuzzyMatchBuilding(query) {
  if (!query) return null;
  
  const queryLower = query.toLowerCase().trim();
  
  // 建築物名稱映射表（包括簡稱、別名、拼寫變體）
  const buildingAliases = {
    '綜三館': ['綜三館', '粽三館', '粽三', '綜合三館', '綜合教學大樓第三館', '綜三管', '粽三管', '綜三', 'zongsan', 'zongsan building', 'comprehensive building three', 'comp building 3'],
    '第一教學大樓': ['第一教學大樓', '第一教學館', '一教', '第一教', '教學大樓一', 'first teaching building', 'teaching building 1', 'building 1'],
    '第二教學大樓': ['第二教學大樓', '第二教學館', '二教', '第二教', '教學大樓二', 'second teaching building', 'teaching building 2', 'building 2'],
    '第三教學大樓': ['第三教學大樓', '第三教學館', '三教', '第三教', '教學大樓三', 'third teaching building', 'teaching building 3', 'building 3'],
    '第四教學大樓': ['第四教學大樓', '第四教學館', '四教', '第四教', '教學大樓四', 'fourth teaching building', 'teaching building 4', 'building 4'],
    '行政大樓': ['行政大樓', '行政館', '行政', 'administration building', 'admin building', 'administrative building'],
    '圖書館': ['圖書館', '圖書', 'library', 'lib'],
    '飛機館': ['飛機館', '電機工程館', '電機館', '電機', 'electrical engineering building', 'ee building'],
    '電機館': ['電機館', '電機工程館', '電機', 'electrical engineering building', 'ee building'],
    '機械工程館': ['機械工程館', '機械館', '機械', 'mechanical engineering building', 'me building'],
    '綜一館': ['綜一館', '綜合一館', '綜合教學大樓第一館', '綜一', 'comprehensive building one', 'comp building 1'],
    '綜二館': ['綜二館', '綜合二館', '綜合教學大樓第二館', '綜二', 'comprehensive building two', 'comp building 2'],
    '科技研究中心': ['科技研究中心', '科技中心', '研究中心', 'technology research center', 'tech center', 'research center'],
    '體育館(經國館)': ['體育館', '經國館', '經國體育館', 'gymnasium', 'gym', 'sports center'],
    '人文大樓': ['人文大樓', '人文館', 'humanities building', 'humanities'],
    '文理暨管理大樓': ['文理暨管理大樓', '文理大樓', '文理管理大樓', '文理館', 'liberal arts and management building', 'lam building'],
    '學生活動中心': ['學生活動中心', '活動中心', 'student activity center', 'activity center', 'sac'],
    '紅館': ['紅館', 'red building', 'red hall'],
    '綠館': ['綠館', 'green building', 'green hall'],
    '資訊休閒大樓': ['資訊休閒大樓', '資訊休閒館', 'information and recreation building', 'info recreation building'],
    '游泳池': ['游泳池', '泳池', 'swimming pool', 'pool'],
    '操場': ['操場', '運動場', 'playground', 'sports field', 'field']
  };
  
  // 首先嘗試精確匹配（包括別名）
  for (const [canonicalName, aliases] of Object.entries(buildingAliases)) {
    for (const alias of aliases) {
      if (alias.toLowerCase() === queryLower) {
        // 找到精確匹配，查找建築物數據
        for (const [campus, buildings] of Object.entries(buildingLocations)) {
          const found = buildings.find(b => b.name === canonicalName);
          if (found) {
            return { buildingData: found, campusKey: campus, matchScore: 1.0 };
          }
        }
      }
    }
  }
  
  // 如果沒有精確匹配，嘗試模糊匹配
  let bestMatch = null;
  let bestScore = 0;
  const threshold = 0.6; // 相似度閾值
  
  for (const [campus, buildings] of Object.entries(buildingLocations)) {
    for (const building of buildings) {
      // 檢查建築物名稱
      const nameScore = calculateSimilarity(query, building.name);
      
      // 檢查別名
      let aliasScore = 0;
      const aliases = buildingAliases[building.name] || [];
      for (const alias of aliases) {
        const score = calculateSimilarity(query, alias);
        if (score > aliasScore) {
          aliasScore = score;
        }
      }
      
      // 取最高分
      const score = Math.max(nameScore, aliasScore);
      
      if (score > bestScore && score >= threshold) {
        bestScore = score;
        bestMatch = { buildingData: building, campusKey: campus, matchScore: score };
      }
    }
  }
  
  return bestMatch;
}

function handleBuildingInfo(actionData) {
  let buildingName = actionData.building;
  const queryType = actionData.query_type || 'general'; // general, facilities, location, info
  const actionLang = actionData.language || currentLanguage;
  
  if (!buildingName) {
    const msg = actionLang === 'en'
      ? 'Please specify which building you want to know about.'
      : '請指定您想查詢的建築名稱。';
    addMessage(msg, false);
    return;
  }
  
  // 使用模糊匹配查找建築物
  let match = fuzzyMatchBuilding(buildingName);
  
  if (!match) {
    // 如果模糊匹配失敗，嘗試原始方法作為備用
  let buildingData = null;
  let campusKey = null;
  
  for (const [campus, buildings] of Object.entries(buildingLocations)) {
    const found = buildings.find(b => 
      b.name === buildingName || 
      b.name.includes(buildingName) || 
      buildingName.includes(b.name)
    );
    if (found) {
      buildingData = found;
      campusKey = campus;
      break;
    }
  }
  
  if (!buildingData) {
    const msg = actionLang === 'en'
        ? `Sorry, I couldn't find information about "${buildingName}". Please check the building name. You can try: "Zongsan Building", "First Teaching Building", "Library", etc.`
        : `抱歉，找不到「${buildingName}」的相關資訊。請確認建築名稱。您可以試試：「綜三館」、「第一教學大樓」、「圖書館」等。`;
    addMessage(msg, false);
    return;
  }
    
    // 使用備用方法找到的建築物
    match = { buildingData, campusKey, matchScore: 0.8 };
    buildingName = buildingData.name; // 使用標準名稱
  } else {
    buildingName = match.buildingData.name; // 使用標準名稱
  }
  
  const buildingData = match.buildingData;
  const campusKey = match.campusKey;
  
  // 根據查詢類型返回不同資訊（分開判斷，避免顯示多餘資訊）
  let response = '';
  
  if (queryType === 'location' || queryType === 'where') {
    // 只查詢位置 - 並導航到建築物
    const campusName = getCampusName(campusKey);
    response = actionLang === 'en'
      ? `📍 <strong>${buildingData.name}</strong> is located in ${campusName}.`
      : `📍 <strong>${buildingData.name}</strong> 位於 ${campusName}。`;
    
    // 如果地圖已初始化，顯示位置並導航
    if (aiMap) {
      // 切換到正確的校區
      const campusSelect = document.getElementById('map-campus-select');
      if (campusSelect) {
        campusSelect.value = campusKey;
      }
      
      // 導航到建築物（如果用戶位置可用）
      // 注意：showRouteToBuilding 會在地圖上顯示路線，並返回訊息
      setTimeout(() => {
        const navMsg = showRouteToBuilding(buildingData, campusKey, actionLang);
        if (navMsg) {
          // 如果已經發送了回應，添加導航訊息
          const messages = document.querySelectorAll('.message.ai-message');
          if (messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const content = lastMessage.querySelector('.message-text');
            if (content) {
              content.innerHTML += navMsg;
            }
          }
        }
      }, 100);
    }
  } else if (queryType === 'facilities') {
    // 只查詢設施
    const allFacilities = [
      ...(facilities.campus1 || []),
      ...(facilities.campus2 || []),
      ...(facilities.campus3 || [])
    ];
    
    const buildingFacilities = allFacilities.filter(f => 
      f.building === buildingData.name || 
      f.building?.includes(buildingData.name) ||
      buildingData.name.includes(f.building)
    );
    
    if (buildingFacilities.length === 0) {
      response = actionLang === 'en'
        ? `No facilities found in ${buildingData.name}.`
        : `${buildingData.name} 目前沒有設施資料。`;
    } else {
      const counts = { toilet: 0, water: 0, trash: 0 };
      buildingFacilities.forEach(f => {
        if (f.type === 'toilet') counts.toilet++;
        else if (f.type === 'water') counts.water++;
        else if (f.type === 'trash') counts.trash++;
      });
      
      response = actionLang === 'en'
        ? `🏢 <strong>${buildingData.name}</strong> has:<br>
           🚻 Restrooms: ${counts.toilet}<br>
           🚰 Water fountains: ${counts.water}<br>
           🗑️ Trash cans: ${counts.trash}<br>
           Total: ${buildingFacilities.length} facilities`
        : `🏢 <strong>${buildingData.name}</strong> 有：<br>
           🚻 廁所：${counts.toilet} 個<br>
           🚰 飲水機：${counts.water} 個<br>
           🗑️ 垃圾桶：${counts.trash} 個<br>
           總計：${buildingFacilities.length} 個設施`;
    }
  } else {
    // 一般資訊（只顯示基本資訊，不顯示設施詳情）
    const campusName = getCampusName(campusKey);
    response = actionLang === 'en'
      ? `🏢 <strong>${buildingData.name}</strong><br>
         📍 Location: ${campusName}<br>
         ℹ️ ${buildingData.info}`
      : `🏢 <strong>${buildingData.name}</strong><br>
         📍 位置：${campusName}<br>
         ℹ️ ${buildingData.info}`;
  }
  
  addMessage(response, false);
}

/**
 * 顯示到建築物的導航路線
 * @param {Object} buildingData - 建築物數據對象
 * @param {string} campusKey - 校區鍵值
 * @param {string} lang - 語言
 * @returns {string|null} 導航訊息（如果有）
 */
function showRouteToBuilding(buildingData, campusKey, lang = null) {
  const useLang = lang || currentLanguage;
  
  if (!aiMap || !buildingData) return null;
  
  // 清除舊的路線
  if (AppState.routeLayer && AppState.map) {
    try {
      AppState.map.removeLayer(AppState.routeLayer);
    } catch (e) {
      Utils.logger.warn('清除舊路線層時出錯:', e);
    }
    AppState.routeLayer = null;
  }
  
  if (routeLayer && AppState.map) {
    try {
      AppState.map.removeLayer(routeLayer);
    } catch (e) {
      Utils.logger.warn('清除舊路線層（變量）時出錯:', e);
    }
    routeLayer = null;
  }
  
  // 切換到正確的校區視圖
  if (AppState.map) {
    AppState.map.setView([buildingData.lat, buildingData.lng], 18);
  }
  
  // 標示建築物位置
  const buildingIcon = L.divIcon({
    className: 'building-marker',
    html: '<div style="background-color: #2c3e50; color: white; border-radius: 50%; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; font-size: 18px; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4);">🏢</div>',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
  
  const buildingMarker = L.marker([buildingData.lat, buildingData.lng], {
    icon: buildingIcon,
    zIndexOffset: 1000
  }).addTo(aiMap);
  
  const campusName = getCampusName(campusKey);
  const popupContent = `
    <div style="padding: 8px; min-width: 260px; max-width: 360px;">
      <h3 style="margin: 0 0 8px 0; color: #1e3c72; font-size: 16px; font-weight: 700;">${buildingData.name}</h3>
      <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${useLang === 'en' ? 'Campus:' : '校區：'}</strong>${campusName}</p>
      ${buildingData.info ? `<p style="margin: 4px 0; color: #6c757d; font-size: 13px;">${buildingData.info}</p>` : ''}
    </div>
  `;
  buildingMarker.bindPopup(popupContent).openPopup();
  
  // 如果有用戶位置，繪製路線
  if (currentUserLocation && AppState.userLocation) {
    const userLat = AppState.userLocation.lat;
    const userLng = AppState.userLocation.lng;
    
    // 標示用戶位置
    if (!userLocationMarker) {
      userLocationMarker = L.marker([userLat, userLng], {
        icon: L.divIcon({
          className: 'custom-marker user-location',
          html: '<div style="background: #ff0000; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">📍</div>',
          iconSize: [40, 40],
          iconAnchor: [20, 20]
        })
      }).addTo(aiMap);
    } else {
      userLocationMarker.setLatLng([userLat, userLng]);
      if (!aiMap.hasLayer(userLocationMarker)) {
        userLocationMarker.addTo(aiMap);
      }
    }
    
    // 計算距離
    const distance = calculateDistance(userLat, userLng, buildingData.lat, buildingData.lng);
    if (distance != null && !isNaN(distance)) {
      const distanceMeters = (distance * 1000).toFixed(0);
      
      // 繪製路線
      const routePoints = [
        [userLat, userLng],
        [buildingData.lat, buildingData.lng]
      ];
      
      const newRouteLayer = L.polyline(routePoints, {
        color: '#667eea',
        weight: 4,
        opacity: 0.7,
        dashArray: '10, 10'
      }).addTo(aiMap);
      
      AppState.routeLayer = newRouteLayer;
      routeLayer = newRouteLayer;
      
      // 調整地圖視角以顯示整條路線
      const bounds = L.latLngBounds(routePoints);
      aiMap.fitBounds(bounds, { padding: [50, 50] });
      
      // 更新地圖資訊
      const mapInfo = document.getElementById('map-info');
      if (mapInfo) {
        mapInfo.innerHTML = '';
        const p1 = document.createElement('p');
        const strong1 = document.createElement('strong');
        strong1.textContent = useLang === 'en' ? '📍 Navigating' : '📍 導航中';
        p1.appendChild(strong1);
        const p2 = document.createElement('p');
        p2.textContent = `${useLang === 'en' ? 'Target:' : '目標：'} ${Utils.html.escape(buildingData.name)}`;
        const p3 = document.createElement('p');
        p3.textContent = `${useLang === 'en' ? 'Distance:' : '距離：'} ${distanceMeters} ${useLang === 'en' ? 'meters' : '公尺'}`;
        mapInfo.appendChild(p1);
        mapInfo.appendChild(p2);
        mapInfo.appendChild(p3);
      }
      
      // 返回距離訊息
      return useLang === 'en'
        ? `<br><br>🧭 <strong>Navigation:</strong> Distance from your location: ${distanceMeters} meters`
        : `<br><br>🧭 <strong>導航：</strong> 距離您的位置：${distanceMeters} 公尺`;
    }
  }
  
  // 沒有用戶位置，只顯示建築物位置
  aiMap.setView([buildingData.lat, buildingData.lng], 18);
  
  // 更新地圖資訊
  const mapInfo = document.getElementById('map-info');
  if (mapInfo) {
    mapInfo.innerHTML = '';
    const p1 = document.createElement('p');
    const strong1 = document.createElement('strong');
    strong1.textContent = useLang === 'en' ? '📍 Building Location' : '📍 建築物位置';
    p1.appendChild(strong1);
    const p2 = document.createElement('p');
    p2.textContent = `${Utils.html.escape(buildingData.name)}`;
    mapInfo.appendChild(p1);
    mapInfo.appendChild(p2);
  }
  
  return useLang === 'en'
    ? `<br><br>💡 <strong>Tip:</strong> Enable location access to see navigation route.`
    : `<br><br>💡 <strong>提示：</strong> 啟用位置存取以查看導航路線。`;
}

// 處理查詢建築設施（保留舊函數以向後兼容）
function handleQueryBuildingFacilities(actionData) {
  const building = actionData.building;
  const actionLang = actionData.language || currentLanguage;

  if (!building) {
    const msg = actionLang === 'en'
      ? 'Please specify which building you want to query.'
      : '請指定要查詢的建築。';
    addMessage(msg, false);
    return;
  }

  // 從實際的設施數據中獲取（優先使用 window.AI_FACILITY_DATA，否則使用 facilities）
  const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();

  // 在所有校區中尋找匹配的設施
  const allFacilities = [
    ...(facilityData.campus1 || []),
    ...(facilityData.campus2 || []),
    ...(facilityData.campus3 || [])
  ];

  // 尋找匹配的設施（建築）- 支持部分匹配和別名
  const matchingFacilities = allFacilities.filter(f => {
    const fBuilding = f.building || '';
    return fBuilding === building || 
           fBuilding.includes(building) || 
           building.includes(fBuilding) ||
           fBuilding.toLowerCase() === building.toLowerCase() ||
           fBuilding.toLowerCase().includes(building.toLowerCase()) ||
           building.toLowerCase().includes(fBuilding.toLowerCase());
  });

  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? `Sorry, I could not find any facilities in ${building}.`
      : `抱歉，找不到${building}中的設施。`;
    addMessage(msg, false);
    return;
  }

  // 按樓層和類型排序設施
  matchingFacilities.sort((a, b) => {
    // 先按樓層排序（提取數字部分）
    const floorA = parseInt((a.floor || '0').replace(/[^0-9]/g, '')) || 0;
    const floorB = parseInt((b.floor || '0').replace(/[^0-9]/g, '')) || 0;
    if (floorA !== floorB) return floorA - floorB;
    
    // 再按類型排序（廁所 > 飲水機 > 垃圾桶）
    const typeOrder = { 'toilet': 1, 'water': 2, 'trash': 3 };
    const orderA = typeOrder[a.type] || 99;
    const orderB = typeOrder[b.type] || 99;
    return orderA - orderB;
  });

  // 構建詳細回應訊息（列出所有設施）
  const counts = { toilet: 0, water: 0, trash: 0 };
  const facilityList = [];
  
  matchingFacilities.forEach(f => {
    // 統計數量
    if (f.type === 'toilet') counts.toilet++;
    else if (f.type === 'water') counts.water++;
    else if (f.type === 'trash') counts.trash++;
    
    // 構建設施信息
    const floor = f.floor || '';
    const status = f.status || '正常';
    const statusInfo = getStatusInfo(status, actionLang);
    const statusIcon = statusInfo.icon;
    
    let facilityInfo = '';
    if (actionLang === 'en') {
      const typeName = f.type === 'toilet' ? '🚻 Restroom' : 
                      f.type === 'water' ? '🚰 Water fountain' : 
                      '🗑️ Trash can';
      const genderInfo = f.gender ? (f.gender === '男' ? ' (Men\'s)' : f.gender === '女' ? ' (Women\'s)' : ' (Unisex)') : '';
      facilityInfo = `${statusIcon} ${typeName}${genderInfo} - Floor ${floor} - ${statusInfo.text}`;
    } else {
      const typeName = f.type === 'toilet' ? '🚻 廁所' : 
                      f.type === 'water' ? '🚰 飲水機' : 
                      '🗑️ 垃圾桶';
      const genderInfo = f.gender ? ` (${f.gender})` : '';
      facilityInfo = `${statusIcon} ${typeName}${genderInfo} - ${floor} - ${statusInfo.text}`;
    }
    
    facilityList.push(facilityInfo);
  });
  
  // 構建完整訊息
  let msg = '';
  if (actionLang === 'en') {
    msg = `🏢 <strong>${building}</strong> has ${matchingFacilities.length} facilities:<br><br>`;
    msg += `📊 Summary:<br>`;
    msg += `🚻 Restrooms: ${counts.toilet}<br>`;
    msg += `🚰 Water fountains: ${counts.water}<br>`;
    msg += `🗑️ Trash cans: ${counts.trash}<br><br>`;
    msg += `📋 All facilities:<br>`;
    facilityList.forEach(info => {
      msg += `• ${info}<br>`;
    });
  } else {
    msg = `🏢 <strong>${building}</strong> 共有 ${matchingFacilities.length} 個設施：<br><br>`;
    msg += `📊 統計：<br>`;
    msg += `🚻 廁所：${counts.toilet} 個<br>`;
    msg += `🚰 飲水機：${counts.water} 個<br>`;
    msg += `🗑️ 垃圾桶：${counts.trash} 個<br><br>`;
    msg += `📋 所有設施：<br>`;
    facilityList.forEach(info => {
      msg += `• ${info}<br>`;
    });
  }
  
  // 不生成按鈕，只在 fallback 時生成
  addMessage(msg, false);
}

/**
 * 處理查詢特定狀態的設施
 * @param {Object} actionData - Action 數據
 * @param {string} actionLang - 語言
 */
function handleQueryFacilitiesByStatus(actionData, actionLang) {
  try {
    Utils.logger.log('🔍 處理查詢特定狀態設施:', actionData);
    
    if (!actionData) {
      Utils.logger.warn('handleQueryFacilitiesByStatus: actionData 為空');
      return;
    }
    
    const status = actionData.status || actionData.query_status;
    const facilityType = actionData.facility_type; // 新增：設施類型過濾
    const campus = actionData.campus;
    const lang = actionLang || actionData.language || currentLanguage;
  
  if (!status) {
    const msg = lang === 'en'
      ? 'Please specify the status to query (e.g., dirty, full, broken).'
      : '請指定要查詢的狀態（例如：髒了、滿了、壞了）。';
    addMessage(msg, false);
    return;
  }
  
  // 狀態映射（將用戶輸入映射到系統狀態）
  const statusMap = {
    '滿了': '待清潔',
    '滿': '待清潔',
    'full': '待清潔',
    '髒了': '待清潔',
    '髒': '待清潔',
    'dirty': '待清潔',
    '壞了': '無法使用',
    '壞': '無法使用',
    'broken': '無法使用',
    '故障': '無法使用',
    '損壞': '部分損壞',
    'damaged': '部分損壞',
    '待清潔': '待清潔',
    '無法使用': '無法使用',
    '部分損壞': '部分損壞'
  };
  
  const targetStatus = statusMap[status] || status;
  
  // 從實際的設施數據中獲取
  const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
  
  // 根據校區過濾
  let allFacilities = [];
  if (campus) {
    const campusMap = {
      '第一校區': 'campus1',
      '第二校區': 'campus2',
      '第三校區': 'campus3',
      '校區1': 'campus1',
      '校區2': 'campus2',
      '校區3': 'campus3',
      'campus1': 'campus1',
      'campus2': 'campus2',
      'campus3': 'campus3'
    };
    const campusKey = campusMap[campus] || campus;
    allFacilities = facilityData[campusKey] || [];
  } else {
    allFacilities = [
      ...(facilityData.campus1 || []),
      ...(facilityData.campus2 || []),
      ...(facilityData.campus3 || [])
    ];
  }
  
  // 過濾符合狀態和設施類型的設施
  const matchingFacilities = allFacilities.filter(f => {
    const fStatus = f.status || '正常';
    const statusMatch = fStatus === targetStatus;
    
    // 如果指定了設施類型，也要過濾設施類型
    if (facilityType) {
      const typeMap = {
        'trash': 'trash',
        'toilet': 'toilet',
        'water': 'water'
      };
      const targetType = typeMap[facilityType] || facilityType;
      return statusMatch && f.type === targetType;
    }
    
    return statusMatch;
  });
  
  if (matchingFacilities.length === 0) {
    const statusText = lang === 'en' 
      ? (targetStatus === '待清潔' ? 'dirty/full' : targetStatus === '無法使用' ? 'broken' : targetStatus)
      : status;
    
    let facilityTypeText = '';
    if (facilityType) {
      if (lang === 'en') {
        facilityTypeText = facilityType === 'trash' ? 'trash cans' :
                          facilityType === 'toilet' ? 'restrooms' :
                          facilityType === 'water' ? 'water fountains' : facilityType;
      } else {
        facilityTypeText = facilityType === 'trash' ? '垃圾桶' :
                          facilityType === 'toilet' ? '廁所' :
                          facilityType === 'water' ? '飲水機' : facilityType;
      }
    }
    
    const msg = lang === 'en'
      ? facilityTypeText 
        ? `No ${facilityTypeText} found with status "${statusText}".`
        : `No facilities found with status "${statusText}".`
      : facilityTypeText
        ? `找不到狀態為「${statusText}」的${facilityTypeText}。`
        : `找不到狀態為「${statusText}」的設施。`;
    addMessage(msg, false);
    return;
  }
  
  // 按建築和樓層排序
  matchingFacilities.sort((a, b) => {
    const buildingA = (a.building || '').localeCompare(b.building || '');
    if (buildingA !== 0) return buildingA;
    const floorA = parseInt((a.floor || '0').replace(/[^0-9]/g, '')) || 0;
    const floorB = parseInt((b.floor || '0').replace(/[^0-9]/g, '')) || 0;
    return floorA - floorB;
  });
  
  // 構建消息
  const statusInfo = getStatusInfo(targetStatus, lang);
  const statusText = lang === 'en' 
    ? (status === '滿了' || status === 'full' ? 'full' : 
       status === '髒了' || status === 'dirty' ? 'dirty' : 
       status === '壞了' || status === 'broken' ? 'broken' : targetStatus)
    : status;
  
  // 設施類型顯示文字
  let facilityTypeText = '';
  if (facilityType) {
    if (lang === 'en') {
      facilityTypeText = facilityType === 'trash' ? 'Trash cans' :
                        facilityType === 'toilet' ? 'Restrooms' :
                        facilityType === 'water' ? 'Water fountains' : facilityType;
    } else {
      facilityTypeText = facilityType === 'trash' ? '垃圾桶' :
                        facilityType === 'toilet' ? '廁所' :
                        facilityType === 'water' ? '飲水機' : facilityType;
    }
  }
  
  let msg = '';
  if (lang === 'en') {
    msg = facilityTypeText
      ? `${statusInfo.icon} <strong>${facilityTypeText} with status "${statusText}":</strong> (${matchingFacilities.length} found)<br><br>`
      : `${statusInfo.icon} <strong>Facilities with status "${statusText}":</strong> (${matchingFacilities.length} found)<br><br>`;
    msg += `<strong>List:</strong><br>`;
    matchingFacilities.forEach((f, index) => {
      const typeName = f.type === 'toilet' ? '🚻 Restroom' : 
                      f.type === 'water' ? '🚰 Water fountain' : 
                      '🗑️ Trash can';
      const genderInfo = f.gender ? (f.gender === '男' ? ' (Men\'s)' : f.gender === '女' ? ' (Women\'s)' : ' (Unisex)') : '';
      const building = f.building || 'Unknown';
      const floor = f.floor || '';
      msg += `${index + 1}. ${typeName}${genderInfo} - ${building} ${floor}<br>`;
    });
  } else {
    msg = facilityTypeText
      ? `${statusInfo.icon} <strong>狀態為「${statusText}」的${facilityTypeText}：</strong>（共 ${matchingFacilities.length} 個）<br><br>`
      : `${statusInfo.icon} <strong>狀態為「${statusText}」的設施：</strong>（共 ${matchingFacilities.length} 個）<br><br>`;
    msg += `<strong>清單：</strong><br>`;
    matchingFacilities.forEach((f, index) => {
      const typeName = f.type === 'toilet' ? '🚻 廁所' : 
                      f.type === 'water' ? '🚰 飲水機' : 
                      '🗑️ 垃圾桶';
      const genderInfo = f.gender ? ` (${f.gender})` : '';
      const building = f.building || '未知建築';
      const floor = f.floor || '';
      msg += `${index + 1}. ${typeName}${genderInfo} - ${building} ${floor}<br>`;
    });
  }
  
    // 不生成按鈕，只在 fallback 時生成
    addMessage(msg, false);
    
    // 在地圖上標記這些設施（安全調用）
    if (campus) {
      try {
        const campusMap = {
          '第一校區': 'campus1',
          '第二校區': 'campus2',
          '第三校區': 'campus3',
          '校區1': 'campus1',
          '校區2': 'campus2',
          '校區3': 'campus3',
          'campus1': 'campus1',
          'campus2': 'campus2',
          'campus3': 'campus3'
        };
        const campusKey = campusMap[campus] || campus;
        showCampusOnMap(campusKey);
        filterFacilitiesByCampus(campusKey);
      } catch (mapError) {
        Utils.logger.error('顯示地圖時發生錯誤:', mapError);
      }
    }
  } catch (error) {
    Utils.logger.error('handleQueryFacilitiesByStatus 錯誤:', error);
    const errorMsg = (actionLang || currentLanguage) === 'en'
      ? 'An error occurred while querying facilities by status. Please try again.'
      : '查詢特定狀態設施時發生錯誤，請重試。';
    addMessage(errorMsg, false);
  }
}

// 獲取狀態資訊（圖標和文字）
// 獲取狀態資訊（圖標和文字）- 簡化版：只支持4種狀態
function getStatusInfo(status, lang = 'zh') {
  const statusMap = {
    '正常': { 
      zh: { icon: '✅', text: '正常' },
      en: { icon: '✅', text: 'Normal' }
    },
    '部分損壞': { 
      zh: { icon: '⚠️', text: '部分損壞' },
      en: { icon: '⚠️', text: 'Partially Damaged' }
    },
    '待清潔': { 
      zh: { icon: '🧹', text: '待清潔' },
      en: { icon: '🧹', text: 'Needs Cleaning' }
    },
    '無法使用': { 
      zh: { icon: '🚫', text: '無法使用' },
      en: { icon: '🚫', text: 'Unavailable' }
    }
  };
  
  const info = statusMap[status] || { 
    zh: { icon: 'ℹ️', text: status },
    en: { icon: 'ℹ️', text: status }
  };
  
  return info[lang] || info.zh;
}

// 獲取狀態顏色 - 簡化版：只支持4種狀態
function getStatusColor(status) {
  const statusColors = {
    '正常': '#28a745',
    '部分損壞': '#ff9800',
    '待清潔': '#17a2b8',
    '無法使用': '#dc3545'
  };
  return statusColors[status] || '#6c757d';
}

// 分析問題描述，判斷狀態和嚴重程度
function analyzeProblemStatus(description) {
  if (!description || !description.trim()) {
    return { status: '部分損壞', severity: 'minor' };
  }

  const descLower = description.toLowerCase();
  
  // 判斷問題類型（簡化版：只判斷4種狀態）
  const isDirty = /髒|dirty|不乾淨|not clean|很髒|very dirty|需要清潔|needs cleaning|待清潔/.test(descLower);
  const isBroken = /壞|broken|故障|malfunction|不能用|not working|無法使用|unavailable|損壞|damaged/.test(descLower);
  const isNormal = /正常|normal|ok|okay|沒問題|fine|working|good/.test(descLower);
  
  // 判斷是否為部分損壞（檢查是否提到部分、一個、幾個等）
  const isPartial = /一個|one|部分|part|有些|some|幾個|few|小便斗|urinal|馬桶|toilet|水龍頭|faucet|部分損壞|partially/.test(descLower);
  
  // 確定狀態（只返回4種：正常、部分損壞、待清潔、無法使用）
  let status = '部分損壞';
  let severity = 'minor';
  
  if (isNormal) {
    status = '正常';
    severity = 'none';
  } else if (isDirty) {
    status = '待清潔';
    severity = 'minor';
  } else if (isBroken) {
    if (isPartial) {
      status = '部分損壞';
      severity = 'minor';
    } else {
      status = '無法使用';
      severity = 'major';
    }
  }
  
  return { status, severity };
}

// 處理智能路線規劃（避開故障設施）
function handleGetSmartRoute(actionData) {
  const facilityType = actionData.facility_type || 'toilet';
  const actionLang = actionData.language || currentLanguage;
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to plan a smart route. Please allow the browser to access your location information.'
      : '需要取得您的位置才能規劃智能路線。請允許瀏覽器存取您的位置資訊。';
    addMessage(msg, false);
    return;
  }
  
  // 尋找最近的可用設施（避開完全故障的）
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ].filter(f => f.type === facilityType && isFacilityAvailable(f));
  
  if (allFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'Sorry, no available facilities were found nearby.'
      : '抱歉，附近沒有找到可用的設施。';
    addMessage(msg, false);
    return;
  }
  
  // 計算距離並排序
  const facilitiesWithDistance = allFacilities.map(facility => {
    const distance = calculateDistance(
      currentUserLocation.lat,
      currentUserLocation.lng,
      facility.lat,
      facility.lng
    );
    // 如果距離計算失敗，返回 null
    if (distance == null || isNaN(distance)) {
      return null;
    }
    return {
      ...facility,
      distance: distance
    };
  }).filter(f => f !== null && f.distance != null && !isNaN(f.distance));
  
  if (facilitiesWithDistance.length === 0) {
    return {
      text: actionLang === 'en'
        ? 'Unable to find a nearby facility. Please allow location access and try again.'
        : '無法找到附近的設施。請允許位置存取後再試。',
      action: 'request_location'
    };
  }
  
  facilitiesWithDistance.sort((a, b) => a.distance - b.distance);
  const nearest = facilitiesWithDistance[0];
  
  // 驗證最近設施和距離
  if (!nearest || nearest.distance == null || isNaN(nearest.distance)) {
    const msg = actionLang === 'en'
      ? 'Unable to find a nearby facility. Please allow location access and try again.'
      : '無法找到附近的設施。請允許位置存取後再試。';
    addMessage(msg, false);
    return;
  }
  
  // 顯示智能路線
  showRouteToFacility(nearest);
  
  const facilityName = facilityType === 'toilet' 
    ? (actionLang === 'en' ? 'restroom' : '廁所')
    : facilityType === 'water'
    ? (actionLang === 'en' ? 'water fountain' : '飲水機')
    : (actionLang === 'en' ? 'trash can' : '垃圾桶');
  
  const distanceMeters = (nearest.distance * 1000).toFixed(0);
  const statusInfo = getStatusInfo(nearest.status || '正常', actionLang);
  
  let message = actionLang === 'en'
    ? `✅ Smart route planned! I've found the nearest available ${facilityName} and avoided facilities with major issues.<br><br>
       📍 <strong>${nearest.name}</strong><br>
       🏢 Building: ${nearest.building}<br>
       🏢 Floor: ${nearest.floor}<br>
       ${statusInfo.icon} Status: ${statusInfo.text}<br>
       📏 Distance: About ${distanceMeters} meters<br><br>
       The route has been marked on the map.`
    : `✅ 智能路線已規劃！我找到了最近的可用${facilityName}，並避開了有重大問題的設施。<br><br>
       📍 <strong>${nearest.name}</strong><br>
       🏢 建築：${nearest.building}<br>
       🏢 樓層：${nearest.floor}<br>
       ${statusInfo.icon} 狀態：${statusInfo.text}<br>
       📏 距離：約 ${distanceMeters} 公尺<br><br>
       路線已在地圖上標示。`;
  
  // 如果有備註，顯示備註
  if (nearest.notes && nearest.notes.length > 0) {
    const lastNote = nearest.notes[nearest.notes.length - 1];
    const noteText = typeof lastNote === 'object' ? lastNote.text : lastNote;
    message += actionLang === 'en'
      ? `<br><br>📝 <strong>Note:</strong> ${noteText}`
      : `<br><br>📝 <strong>備註：</strong>${noteText}`;
  }
  
  addMessage(message, false);
}

// 處理查詢設施歷史
function handleQueryFacilityHistory(actionData) {
  const building = actionData.building;
  const floor = actionData.floor;
  const actionLang = actionData.language || currentLanguage;
  
  // 在所有校區中尋找匹配的設施
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let matchingFacilities = allFacilities;
  if (building) {
    matchingFacilities = matchingFacilities.filter(f => 
      f.building === building || 
      f.building?.includes(building) || 
      building.includes(f.building)
    );
  }
  if (floor) {
    matchingFacilities = matchingFacilities.filter(f => 
      f.floor === floor || 
      f.floor?.includes(floor) || 
      floor.includes(f.floor)
    );
  }
  
  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'Sorry, I could not find any matching facilities.'
      : '抱歉，找不到匹配的設施。';
    addMessage(msg, false);
    return;
  }
  
  // 構建歷史記錄訊息
  let msg = actionLang === 'en'
    ? `📜 History for ${building || ''} ${floor || ''}:<br><br>`
    : `📜 ${building || ''}${floor || ''}的歷史記錄：<br><br>`;
  
  matchingFacilities.forEach(facility => {
    const statusInfo = getStatusInfo(facility.status || '正常', actionLang);
    msg += `<div style="margin: 8px 0; padding: 8px; background: rgba(15, 23, 42, 0.3); border-radius: 6px;">
      <strong>${facility.name}</strong><br>
      ${statusInfo.icon} ${statusInfo.text}`;
    
    if (facility.notes && facility.notes.length > 0) {
      const notesText = facility.notes.map(note => {
        return typeof note === 'object' ? note.text : note;
      }).join('; ');
      msg += `<br>📝 ${notesText}`;
    }
    
    if (facility.updatedAt) {
      const updateDate = new Date(facility.updatedAt);
      const dateStr = actionLang === 'en'
        ? updateDate.toLocaleString('en-US')
        : updateDate.toLocaleString('zh-TW');
      msg += `<br>🕒 ${actionLang === 'en' ? 'Last updated:' : '最後更新：'}${dateStr}`;
    }
    
    msg += `</div>`;
  });
  
  addMessage(msg, false);
}

// 處理獲取統計資訊
function handleGetStatistics(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  // 統計各類型設施數量
  const typeCounts = {
    toilet: allFacilities.filter(f => f.type === 'toilet').length,
    water: allFacilities.filter(f => f.type === 'water').length,
    trash: allFacilities.filter(f => f.type === 'trash').length
  };
  
  // 統計各狀態數量
  const statusCounts = {};
  allFacilities.forEach(f => {
    const status = f.status || '正常';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  // 統計有問題的設施（有備註的）
  const facilitiesWithNotes = allFacilities.filter(f => f.notes && f.notes.length > 0).length;
  
  // 統計各校區設施數量
  const campusCounts = {
    campus1: (facilities.campus1 || []).length,
    campus2: (facilities.campus2 || []).length,
    campus3: (facilities.campus3 || []).length
  };
  
  let msg = actionLang === 'en'
    ? `📊 <strong>Facility Statistics</strong>:<br><br>`
    : `📊 <strong>設施統計資訊</strong>：<br><br>`;
  
  msg += actionLang === 'en'
    ? `📦 <strong>Total Facilities:</strong> ${allFacilities.length}<br>
       🚻 Restrooms: ${typeCounts.toilet}<br>
       🚰 Water Fountains: ${typeCounts.water}<br>
       🗑️ Trash Cans: ${typeCounts.trash}<br><br>
       🏫 <strong>By Campus:</strong><br>
       ${getCampusName('campus1')}: ${campusCounts.campus1}<br>
       ${getCampusName('campus2')}: ${campusCounts.campus2}<br>
       ${getCampusName('campus3')}: ${campusCounts.campus3}<br><br>
       📝 <strong>Status Distribution:</strong><br>`
    : `📦 <strong>總設施數：</strong>${allFacilities.length}<br>
       🚻 廁所：${typeCounts.toilet} 個<br>
       🚰 飲水機：${typeCounts.water} 個<br>
       🗑️ 垃圾桶：${typeCounts.trash} 個<br><br>
       🏫 <strong>各校區：</strong><br>
       ${t('campus1')}：${campusCounts.campus1} 個<br>
       ${t('campus2')}：${campusCounts.campus2} 個<br>
       ${t('campus3')}：${campusCounts.campus3} 個<br><br>
       📝 <strong>狀態分布：</strong><br>`;
  
  Object.keys(statusCounts).forEach(status => {
    const statusInfo = getStatusInfo(status, actionLang);
    msg += `${statusInfo.icon} ${statusInfo.text}: ${statusCounts[status]}<br>`;
  });
  
  if (facilitiesWithNotes > 0) {
    msg += actionLang === 'en'
      ? `<br>📋 Facilities with notes: ${facilitiesWithNotes}`
      : `<br>📋 有備註的設施：${facilitiesWithNotes} 個`;
  }
  
  addMessage(msg, false);
}

// 處理設定偏好（使用統一工具函數）
function handleSetPreference(actionData) {
  const facilityType = actionData.facility_type;
  const actionLang = actionData.language || currentLanguage;
  
  // 保存到 localStorage（使用統一工具函數）
  const preferences = Utils.storage.get(AppConfig.STORAGE_KEYS.PREFERENCES, {});
  preferences.preferred_facility_type = facilityType;
  preferences.updated_at = new Date().toISOString();
  Utils.storage.set(AppConfig.STORAGE_KEYS.PREFERENCES, preferences);
  
  const facilityName = facilityType === 'toilet' 
    ? (actionLang === 'en' ? 'restrooms' : '廁所')
    : facilityType === 'water'
    ? (actionLang === 'en' ? 'water fountains' : '飲水機')
    : (actionLang === 'en' ? 'trash cans' : '垃圾桶');
  
  const msg = actionLang === 'en'
    ? `✅ I've saved your preference for ${facilityName}. I'll remember this for future interactions.`
    : `✅ 我已保存您對${facilityName}的偏好設定。我會記住這個設定以便未來使用。`;
  
  addMessage(msg, false);
}

// 處理獲取偏好
function handleGetPreferences(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  const preferences = JSON.parse(localStorage.getItem('nfu_preferences') || '{}');
  
  if (!preferences.preferred_facility_type) {
    const msg = actionLang === 'en'
      ? 'You haven\'t set any preferences yet. You can set your preference by saying "Remember I prefer restrooms" or similar.'
      : '您還沒有設定任何偏好。您可以說「記住我喜歡用廁所」或類似的話來設定偏好。';
    addMessage(msg, false);
    return;
  }
  
  const facilityType = preferences.preferred_facility_type;
  const facilityName = facilityType === 'toilet' 
    ? (actionLang === 'en' ? 'Restrooms' : '廁所')
    : facilityType === 'water'
    ? (actionLang === 'en' ? 'Water Fountains' : '飲水機')
    : (actionLang === 'en' ? 'Trash Cans' : '垃圾桶');
  
  let msg = actionLang === 'en'
    ? `📋 <strong>Your Preferences:</strong><br><br>
       Preferred Facility Type: ${facilityName}`
    : `📋 <strong>您的偏好設定：</strong><br><br>
       偏好設施類型：${facilityName}`;
  
  if (preferences.updated_at) {
    const updateDate = new Date(preferences.updated_at);
    const dateStr = actionLang === 'en'
      ? updateDate.toLocaleString('en-US')
      : updateDate.toLocaleString('zh-TW');
    msg += actionLang === 'en'
      ? `<br>🕒 Last updated: ${dateStr}`
      : `<br>🕒 最後更新：${dateStr}`;
  }
  
  addMessage(msg, false);
}

// 處理快速回報
function handleQuickReport(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  // 快速回報現在改為對話式收集，不再直接打開表單
  // 提示用戶通過對話描述問題
  const msg = actionLang === 'en'
    ? 'I can help you report a facility problem. Please tell me:\n• Which building?\n• Which floor?\n• What type of facility (restroom, water fountain, or trash can)?\n• What is the problem?'
    : '我可以幫您回報設施問題。請告訴我：\n• 哪個建築？\n• 哪個樓層？\n• 什麼類型的設施（廁所、飲水機或垃圾桶）？\n• 問題是什麼？';
  
  addMessage(msg.replace(/\n/g, '<br>'), false);
}

// ============================================
// GPS 相關處理函數
// ============================================

/**
 * 處理獲取用戶 GPS 位置
 */
function handleGetUserLocation(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentUserLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };
        
        const msg = actionLang === 'en'
          ? `✅ GPS location obtained:\n📍 Latitude: ${currentUserLocation.lat.toFixed(6)}\n📍 Longitude: ${currentUserLocation.lng.toFixed(6)}`
          : `✅ 已獲取 GPS 位置：\n📍 緯度：${currentUserLocation.lat.toFixed(6)}\n📍 經度：${currentUserLocation.lng.toFixed(6)}`;
        
        addMessage(msg.replace(/\n/g, '<br>'), false);
        
        // 更新地圖中心
        if (aiMap && AppState.map) {
          AppState.map.setView([currentUserLocation.lat, currentUserLocation.lng], 18);
        }
      },
      (error) => {
        const errorMsg = actionLang === 'en'
          ? '❌ Failed to get GPS location. Please allow location access.'
          : '❌ 獲取 GPS 位置失敗。請允許位置存取。';
        addMessage(errorMsg, false);
      }
    );
  } else {
    const msg = actionLang === 'en'
      ? '❌ Your browser does not support GPS location.'
      : '❌ 您的瀏覽器不支援 GPS 定位。';
    addMessage(msg, false);
  }
}

/**
 * 處理尋找最近的功能正常設施
 */
function handleFindNearestFunctionalFacility(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const facilityType = actionData.facility_type || null;
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to find the nearest functional facility. Please allow location access.'
      : '需要取得您的位置才能找到最近的功能正常設施。請允許位置存取。';
    addMessage(msg, false);
    return;
  }
  
  // 尋找最近的功能正常設施
  const nearest = facilityType 
    ? findNearestFacility(facilityType, true) // 只找功能正常的
    : findNearestAnyFacility(null, currentUserLocation, facilities);
  
  if (nearest && isFacilityAvailable(nearest)) {
    const facilityName = actionLang === 'en'
      ? (facilityType === 'toilet' ? 'restroom' : facilityType === 'water' ? 'water fountain' : facilityType === 'trash' ? 'trash can' : 'facility')
      : (facilityType === 'toilet' ? '廁所' : facilityType === 'water' ? '飲水機' : facilityType === 'trash' ? '垃圾桶' : '設施');
    
    handleFindNearestFacility(nearest.type, facilityName, actionLang);
  } else {
    const msg = actionLang === 'en'
      ? 'Sorry, no functional facilities found nearby.'
      : '抱歉，附近沒有找到功能正常的設施。';
    addMessage(msg, false);
  }
}

/**
 * 處理導航到功能正常設施
 */
function handleNavigateToFunctionalFacility(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const facilityType = actionData.facility_type || null;
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to navigate. Please allow location access.'
      : '需要取得您的位置才能導航。請允許位置存取。';
    addMessage(msg, false);
    return;
  }
  
  const nearest = facilityType 
    ? findNearestFacility(facilityType, true)
    : findNearestAnyFacility(null, currentUserLocation, facilities);
  
  if (nearest && isFacilityAvailable(nearest)) {
    showRouteToFacility(nearest);
    const msg = actionLang === 'en'
      ? `✅ Navigating to ${nearest.name}...`
      : `✅ 正在導航到 ${nearest.name}...`;
    addMessage(msg, false);
  } else {
    const msg = actionLang === 'en'
      ? 'Sorry, no functional facilities found nearby for navigation.'
      : '抱歉，附近沒有找到可以導航的功能正常設施。';
    addMessage(msg, false);
  }
}

/**
 * 處理查詢設施 GPS 座標
 */
function handleQueryFacilityGPS(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const { building, floor, facility_type } = actionData;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let matchingFacilities = allFacilities.filter(f => {
    if (building && f.building !== building) return false;
    if (floor && f.floor !== floor) return false;
    if (facility_type && f.type !== facility_type) return false;
    return true;
  });
  
  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'No facilities found matching your criteria.'
      : '沒有找到符合條件的設施。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📍 GPS Coordinates:\n\n`
    : `📍 GPS 座標：\n\n`;
  
  matchingFacilities.slice(0, 10).forEach(f => {
    msg += actionLang === 'en'
      ? `• ${f.name} (${f.building} ${f.floor}): ${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}\n`
      : `• ${f.name}（${f.building} ${f.floor}）：${f.lat.toFixed(6)}, ${f.lng.toFixed(6)}\n`;
  });
  
  if (matchingFacilities.length > 10) {
    msg += actionLang === 'en'
      ? `\n... and ${matchingFacilities.length - 10} more facilities.`
      : `\n... 還有 ${matchingFacilities.length - 10} 個設施。`;
  }
  
  addMessage(msg.replace(/\n/g, '<br>'), false);
}

/**
 * 處理獲取所有設施 GPS 點位
 */
function handleGetFacilityGPSPoints(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  if (allFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'No facilities found.'
      : '沒有找到設施。';
    addMessage(msg, false);
    return;
  }
  
  const msg = actionLang === 'en'
    ? `📍 Found ${allFacilities.length} facility GPS points. All points are displayed on the map.`
    : `📍 找到 ${allFacilities.length} 個設施 GPS 點位。所有點位已顯示在地圖上。`;
  
  addMessage(msg, false);
  
  // 確保地圖顯示所有設施
  if (aiMap && AppState.map) {
    loadAndDisplayFacilities();
  }
}

// ============================================
// 設施狀態查詢處理函數
// ============================================

/**
 * 處理查詢設施狀態
 */
function handleQueryFacilityStatus(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const { building, floor, facility_type } = actionData;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let matchingFacilities = allFacilities.filter(f => {
    if (building && f.building !== building) return false;
    if (floor && f.floor !== floor) return false;
    if (facility_type && f.type !== facility_type) return false;
    return true;
  });
  
  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'No facilities found matching your criteria.'
      : '沒有找到符合條件的設施。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📊 Facility Status:\n\n`
    : `📊 設施狀態：\n\n`;
  
  matchingFacilities.slice(0, 10).forEach(f => {
    const statusInfo = getStatusInfo(f.status || '正常', actionLang);
    const statusColor = getStatusColor(f.status || '正常');
    msg += actionLang === 'en'
      ? `• ${f.name} (${f.building} ${f.floor}): <span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`
      : `• ${f.name}（${f.building} ${f.floor}）：<span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`;
  });
  
  if (matchingFacilities.length > 10) {
    msg += actionLang === 'en'
      ? `\n... and ${matchingFacilities.length - 10} more facilities.`
      : `\n... 還有 ${matchingFacilities.length - 10} 個設施。`;
  }
  
  addMessage(msg, false);
}

/**
 * 處理查詢附近設施狀態
 */
function handleQueryNearbyFacilitiesStatus(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const radius = actionData.radius || 0.5; // 默認 500 米
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to query nearby facilities. Please allow location access.'
      : '需要取得您的位置才能查詢附近設施。請允許位置存取。';
    addMessage(msg, false);
    return;
  }
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  const nearbyFacilities = allFacilities
    .map(f => {
      const distance = calculateDistance(
        currentUserLocation.lat,
        currentUserLocation.lng,
        f.lat,
        f.lng
      );
      return { ...f, distance };
    })
    .filter(f => f.distance != null && f.distance <= radius)
    .sort((a, b) => a.distance - b.distance);
  
  if (nearbyFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? `No facilities found within ${(radius * 1000).toFixed(0)} meters.`
      : `在 ${(radius * 1000).toFixed(0)} 公尺範圍內沒有找到設施。`;
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📊 Nearby Facilities Status (within ${(radius * 1000).toFixed(0)}m):\n\n`
    : `📊 附近設施狀態（${(radius * 1000).toFixed(0)} 公尺內）：\n\n`;
  
  nearbyFacilities.slice(0, 10).forEach(f => {
    const statusInfo = getStatusInfo(f.status || '正常', actionLang);
    const statusColor = getStatusColor(f.status || '正常');
    const distanceMeters = (f.distance * 1000).toFixed(0);
    msg += actionLang === 'en'
      ? `• ${f.name} (${distanceMeters}m): <span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`
      : `• ${f.name}（${distanceMeters} 公尺）：<span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`;
  });
  
  if (nearbyFacilities.length > 10) {
    msg += actionLang === 'en'
      ? `\n... and ${nearbyFacilities.length - 10} more facilities.`
      : `\n... 還有 ${nearbyFacilities.length - 10} 個設施。`;
  }
  
  addMessage(msg, false);
}

/**
 * 處理根據狀態篩選設施
 */
function handleGetFacilitiesByStatus(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const { status, facility_type } = actionData;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let matchingFacilities = allFacilities.filter(f => {
    if (status && (f.status || '正常') !== status) return false;
    if (facility_type && f.type !== facility_type) return false;
    return true;
  });
  
  if (matchingFacilities.length === 0) {
    const msg = actionLang === 'en'
      ? 'No facilities found matching your criteria.'
      : '沒有找到符合條件的設施。';
    addMessage(msg, false);
    return;
  }
  
  const statusText = actionLang === 'en'
    ? (status || 'all statuses')
    : (status || '所有狀態');
  
  let msg = actionLang === 'en'
    ? `📊 Facilities with status "${statusText}":\n\n`
    : `📊 狀態為「${statusText}」的設施：\n\n`;
  
  matchingFacilities.slice(0, 20).forEach(f => {
    msg += actionLang === 'en'
      ? `• ${f.name} (${f.building} ${f.floor})<br>`
      : `• ${f.name}（${f.building} ${f.floor}）<br>`;
  });
  
  if (matchingFacilities.length > 20) {
    msg += actionLang === 'en'
      ? `\n... and ${matchingFacilities.length - 20} more facilities.`
      : `\n... 還有 ${matchingFacilities.length - 20} 個設施。`;
  }
  
  addMessage(msg, false);
}

/**
 * 處理獲取按距離排序的設施
 */
function handleGetFacilitiesSortedByDistance(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const facilityType = actionData.facility_type || null;
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to sort facilities by distance. Please allow location access.'
      : '需要取得您的位置才能按距離排序設施。請允許位置存取。';
    addMessage(msg, false);
    return;
  }
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let filteredFacilities = facilityType
    ? allFacilities.filter(f => f.type === facilityType)
    : allFacilities;
  
  const facilitiesWithDistance = filteredFacilities
    .map(f => {
      const distance = calculateDistance(
        currentUserLocation.lat,
        currentUserLocation.lng,
        f.lat,
        f.lng
      );
      return { ...f, distance };
    })
    .filter(f => f.distance != null && !isNaN(f.distance))
    .sort((a, b) => a.distance - b.distance);
  
  if (facilitiesWithDistance.length === 0) {
    const msg = actionLang === 'en'
      ? 'No facilities found.'
      : '沒有找到設施。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📊 Facilities sorted by distance:\n\n`
    : `📊 按距離排序的設施：\n\n`;
  
  facilitiesWithDistance.slice(0, 10).forEach(f => {
    const distanceMeters = (f.distance * 1000).toFixed(0);
    msg += actionLang === 'en'
      ? `• ${f.name} (${f.building} ${f.floor}): ${distanceMeters}m<br>`
      : `• ${f.name}（${f.building} ${f.floor}）：${distanceMeters} 公尺<br>`;
  });
  
  if (facilitiesWithDistance.length > 10) {
    msg += actionLang === 'en'
      ? `\n... and ${facilitiesWithDistance.length - 10} more facilities.`
      : `\n... 還有 ${facilitiesWithDistance.length - 10} 個設施。`;
  }
  
  addMessage(msg, false);
}

/**
 * 處理比較設施
 */
function handleCompareFacilities(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const facilityIds = actionData.facility_ids || [];
  
  if (facilityIds.length < 2) {
    const msg = actionLang === 'en'
      ? 'Please specify at least 2 facilities to compare.'
      : '請至少指定 2 個設施進行比較。';
    addMessage(msg, false);
    return;
  }
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  const facilitiesToCompare = facilityIds
    .map(id => allFacilities.find(f => f.id == id))
    .filter(f => f != null);
  
  if (facilitiesToCompare.length < 2) {
    const msg = actionLang === 'en'
      ? 'Could not find the specified facilities for comparison.'
      : '找不到指定的設施進行比較。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📊 Facility Comparison:\n\n`
    : `📊 設施比較：\n\n`;
  
  facilitiesToCompare.forEach(f => {
    const statusInfo = getStatusInfo(f.status || '正常', actionLang);
    const statusColor = getStatusColor(f.status || '正常');
    msg += actionLang === 'en'
      ? `• ${f.name} (${f.building} ${f.floor}): <span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`
      : `• ${f.name}（${f.building} ${f.floor}）：<span style="color: ${statusColor};">${statusInfo.icon} ${statusInfo.text}</span><br>`;
  });
  
  addMessage(msg, false);
}

/**
 * 處理獲取設施統計
 */
function handleGetFacilityStatistics(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const { building, facility_type } = actionData;
  
  const allFacilities = [
    ...(facilities.campus1 || []),
    ...(facilities.campus2 || []),
    ...(facilities.campus3 || [])
  ];
  
  let filteredFacilities = allFacilities.filter(f => {
    if (building && f.building !== building) return false;
    if (facility_type && f.type !== facility_type) return false;
    return true;
  });
  
  const stats = {
    total: filteredFacilities.length,
    byType: {},
    byStatus: {}
  };
  
  filteredFacilities.forEach(f => {
    stats.byType[f.type] = (stats.byType[f.type] || 0) + 1;
    const status = f.status || '正常';
    stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
  });
  
  let msg = actionLang === 'en'
    ? `📊 Facility Statistics:\n\n`
    : `📊 設施統計：\n\n`;
  
  msg += actionLang === 'en'
    ? `Total: ${stats.total} facilities\n\n`
    : `總數：${stats.total} 個設施\n\n`;
  
  if (Object.keys(stats.byType).length > 0) {
    msg += actionLang === 'en' ? `By Type:\n` : `按類型：\n`;
    Object.entries(stats.byType).forEach(([type, count]) => {
      const typeName = actionLang === 'en'
        ? (type === 'toilet' ? 'Restroom' : type === 'water' ? 'Water Fountain' : 'Trash Can')
        : (type === 'toilet' ? '廁所' : type === 'water' ? '飲水機' : '垃圾桶');
      msg += `• ${typeName}: ${count}<br>`;
    });
    msg += '<br>';
  }
  
  if (Object.keys(stats.byStatus).length > 0) {
    msg += actionLang === 'en' ? `By Status:\n` : `按狀態：\n`;
    Object.entries(stats.byStatus).forEach(([status, count]) => {
      const statusInfo = getStatusInfo(status, actionLang);
      msg += `• ${statusInfo.text}: ${count}<br>`;
    });
  }
  
  addMessage(msg, false);
}

// ============================================
// 智能功能處理函數
// ============================================

/**
 * 處理推薦設施
 */
function handleRecommendFacility(actionData) {
  const actionLang = actionData.language || currentLanguage;
  
  // 如果有推薦結果，直接顯示
  if (actionData.recommended_facility) {
    const facility = actionData.recommended_facility;
    const msg = actionLang === 'en'
      ? `⭐ Recommended: ${facility.name} (${facility.building} ${facility.floor})`
      : `⭐ 推薦：${facility.name}（${facility.building} ${facility.floor}）`;
    addMessage(msg, false);
    
    // 顯示路線
    if (facility.lat && facility.lng) {
      showRouteToFacility(facility);
    }
  } else if (actionData.message) {
    addMessage(actionData.message.replace(/\n/g, '<br>'), false);
  }
}

/**
 * 處理智能建議
 */
function handleSmartSuggestions(actionData) {
  if (actionData.message) {
    addMessage(actionData.message.replace(/\n/g, '<br>'), false);
  }
  
  // 如果有建議列表，顯示為按鈕
  if (actionData.suggestions && Array.isArray(actionData.suggestions)) {
    const suggestionsHtml = actionData.suggestions.map(suggestion => {
      return `<button class="suggestion-btn" onclick="handleUserInput('${suggestion.replace(/'/g, "\\'")}')">${Utils.html.escape(suggestion)}</button>`;
    }).join('');
    
    const container = document.createElement('div');
    container.className = 'suggestions-container';
    container.innerHTML = suggestionsHtml;
    
    // 使用 DOM 緩存優化
    const messagesContainer = Utils.dom.get('chat-messages');
    if (messagesContainer) {
      messagesContainer.appendChild(container);
    }
  }
}

/**
 * 處理批量查詢設施
 */
function handleBatchQueryFacilities(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const facilityTypes = actionData.facility_types || ['toilet', 'water', 'trash'];
  
  if (!currentUserLocation) {
    const msg = actionLang === 'en'
      ? 'I need your location to query facilities. Please allow location access.'
      : '需要取得您的位置才能查詢設施。請允許位置存取。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📊 Batch Query Results:\n\n`
    : `📊 批量查詢結果：\n\n`;
  
  facilityTypes.forEach(type => {
    const nearest = findNearestFacility(type, true);
    if (nearest) {
      const typeName = actionLang === 'en'
        ? (type === 'toilet' ? 'Restroom' : type === 'water' ? 'Water Fountain' : 'Trash Can')
        : (type === 'toilet' ? '廁所' : type === 'water' ? '飲水機' : '垃圾桶');
      const distanceMeters = (nearest.distance * 1000).toFixed(0);
      msg += actionLang === 'en'
        ? `• Nearest ${typeName}: ${nearest.name} (${distanceMeters}m)<br>`
        : `• 最近${typeName}：${nearest.name}（${distanceMeters} 公尺）<br>`;
    }
  });
  
  addMessage(msg, false);
}

/**
 * 處理顯示進度
 */
function handleShowProgress(actionData) {
  const actionLang = actionData.language || currentLanguage;
  const { progress, total, message } = actionData;
  
  if (progress != null && total != null) {
    const percentage = Math.round((progress / total) * 100);
    const msg = message || (actionLang === 'en'
      ? `Processing... ${progress}/${total} (${percentage}%)`
      : `處理中... ${progress}/${total}（${percentage}%）`);
    addMessage(msg, false);
  } else if (message) {
    addMessage(message.replace(/\n/g, '<br>'), false);
  }
}

/**
 * 處理智能錯誤恢復
 */
function handleSmartErrorRecovery(actionData) {
  if (actionData.message) {
    addMessage(actionData.message.replace(/\n/g, '<br>'), false);
  }
  
  // 如果有恢復建議，顯示為按鈕
  if (actionData.recovery_suggestions && Array.isArray(actionData.recovery_suggestions)) {
    const suggestionsHtml = actionData.recovery_suggestions.map(suggestion => {
      return `<button class="suggestion-btn" onclick="handleUserInput('${suggestion.replace(/'/g, "\\'")}')">${Utils.html.escape(suggestion)}</button>`;
    }).join('');
    
    const container = document.createElement('div');
    container.className = 'suggestions-container';
    container.innerHTML = suggestionsHtml;
    
    // 使用 DOM 緩存優化
    const messagesContainer = Utils.dom.get('chat-messages');
    if (messagesContainer) {
      messagesContainer.appendChild(container);
    }
  }
}

/**
 * 處理提供建議
 */
function handleProvideSuggestions(actionData) {
  if (actionData.message) {
    addMessage(actionData.message.replace(/\n/g, '<br>'), false);
  }
  
  // 如果有建議列表，顯示為按鈕
  if (actionData.suggestions && Array.isArray(actionData.suggestions)) {
    const suggestionsHtml = actionData.suggestions.map(suggestion => {
      return `<button class="suggestion-btn" onclick="handleUserInput('${suggestion.replace(/'/g, "\\'")}')">${Utils.html.escape(suggestion)}</button>`;
    }).join('');
    
    const container = document.createElement('div');
    container.className = 'suggestions-container';
    container.innerHTML = suggestionsHtml;
    
    // 使用 DOM 緩存優化
    const messagesContainer = Utils.dom.get('chat-messages');
    if (messagesContainer) {
      messagesContainer.appendChild(container);
    }
  }
}

/**
 * 處理廁所類型詢問（使用按鈕）
 * @param {Object} actionData - Action 數據
 */
function handleAskGender(actionData) {
  if (!actionData || !actionData.buttons) {
    Utils.logger.warn('handleAskGender: 無效的 actionData', actionData);
    return;
  }
  
  const messagesContainer = Utils.dom.get('chat-messages');
  if (!messagesContainer) {
    Utils.logger.warn('handleAskGender: 找不到消息容器');
    return;
  }
  
  // 檢查是否已經顯示過按鈕（避免重複顯示）
  const existingButtons = messagesContainer.querySelector('.gender-selection');
  if (existingButtons) {
    Utils.logger.log('⚠️ 廁所類型選擇按鈕已存在，跳過重複顯示');
    return;
  }
  
  // 顯示詢問消息（如果還沒有顯示）
  if (actionData.message) {
    // 檢查是否已經顯示了消息（避免重複）
    const lastMessage = messagesContainer.lastElementChild;
    if (!lastMessage || !lastMessage.textContent.includes(actionData.message.replace(/\n/g, ' '))) {
      addMessage(actionData.message, false);
    }
  }
  
  // 存儲待處理的查詢
  if (!window.conversationMemory) {
    window.conversationMemory = {};
  }
  window.conversationMemory.pending_intent = actionData.pending_intent || 'find_nearest_facility';
  window.conversationMemory.facility_type = actionData.facility_type || 'toilet';
  
  Utils.logger.log('💾 已設置 conversationMemory:', {
    pending_intent: window.conversationMemory.pending_intent,
    facility_type: window.conversationMemory.facility_type
  });
  
  // 創建按鈕容器
  const container = document.createElement('div');
  container.className = 'suggestions-container gender-selection';
  container.style.display = 'flex';
  container.style.flexWrap = 'wrap';
  container.style.gap = '10px';
  container.style.marginTop = '10px';
  container.style.marginBottom = '10px';
  container.style.justifyContent = 'flex-start';
  
  // 創建按鈕
  if (actionData.buttons && Array.isArray(actionData.buttons)) {
    actionData.buttons.forEach(button => {
      const btn = document.createElement('button');
      btn.className = 'suggestion-btn gender-btn';
      btn.textContent = button.title || button;
      btn.style.padding = '12px 24px';
      btn.style.fontSize = '14px';
      btn.style.borderRadius = '8px';
      btn.style.border = 'none';
      btn.style.cursor = 'pointer';
      btn.style.transition = 'all 0.2s ease';
      btn.style.fontWeight = '600';
      btn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      
      // 根據性別設置按鈕顏色
      const payload = button.payload || button.title || button;
      if (payload.includes('男') || payload.includes('men') || payload.includes('male')) {
        btn.style.background = 'linear-gradient(135deg, #4a90e2 0%, #357abd 100%)';
        btn.style.color = 'white';
      } else if (payload.includes('女') || payload.includes('women') || payload.includes('female') || payload.includes('ladies')) {
        btn.style.background = 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)';
        btn.style.color = 'white';
      } else if (payload.includes('無障礙') || payload.includes('accessible') || payload.includes('wheelchair')) {
        btn.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
        btn.style.color = 'white';
      } else {
        btn.style.background = 'linear-gradient(135deg, #a0a0a0 0%, #808080 100%)';
        btn.style.color = 'white';
      }
      
      btn.onmouseover = function() {
        this.style.transform = 'scale(1.05)';
        this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.2)';
      };
      btn.onmouseout = function() {
        this.style.transform = 'scale(1)';
        this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
      };
      
      // 點擊按鈕時直接處理性別查詢，不發送到 Rasa
      // 使用 addEventListener 而不是 onclick，確保事件處理器正確綁定
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        const payload = button.payload || button.title || button;
        
        Utils.logger.log('🔘 廁所類型按鈕被點擊:', payload);
        Utils.logger.log('🔍 檢查 conversationMemory:', window.conversationMemory);
        
        // 確定廁所類型
        let gender = null;
        if (payload.includes('男') || payload.includes('men') || payload.includes('male')) {
          gender = '男';
        } else if (payload.includes('女') || payload.includes('women') || payload.includes('female') || payload.includes('ladies')) {
          gender = '女';
        } else if (payload.includes('性別友善') || payload.includes('性別中立') || payload.includes('無性別') || payload.includes('unisex') || payload.includes('gender-neutral') || payload.includes('gender-inclusive') || payload.includes('all-gender')) {
          gender = '性別友善';
        } else if (payload.includes('無障礙') || payload.includes('accessible') || payload.includes('wheelchair')) {
          gender = '無障礙';
        }
        
        Utils.logger.log('🎯 識別的類型:', gender);
        const pendingIntent = window.conversationMemory?.pending_intent;
        Utils.logger.log('🔍 pending_intent:', pendingIntent);
        
        // 情境 1：導航最近廁所（find_nearest_facility）→ 前端直接處理，不再走 Rasa
        if (gender && (!pendingIntent || pendingIntent === 'find_nearest_facility')) {
          Utils.logger.log('✅ 直接處理最近廁所查詢，不發送到 Rasa');
          
          // 顯示用戶選擇
          addMessage(button.title || payload, true);
          
          // 獲取設施類型（從 conversationMemory 或默認為 'toilet'）
          const facilityType = (window.conversationMemory && window.conversationMemory.facility_type) || 'toilet';
          const facilityName = currentLanguage === 'en' 
            ? (gender === '男' ? 'men\'s restroom' : gender === '女' ? 'women\'s restroom' : gender === '無障礙' ? 'accessible restroom' : 'gender-inclusive restroom')
            : (gender === '男' ? '男廁' : gender === '女' ? '女廁' : gender === '無障礙' ? '無障礙廁所' : '性別友善廁所');
          
          // 清除待處理的查詢
          if (window.conversationMemory) {
            delete window.conversationMemory.pending_intent;
            delete window.conversationMemory.facility_type;
          }
          
          // 直接調用查詢函數（導航）
          handleFindNearestFacility(facilityType, facilityName, currentLanguage, gender);
          return false;
        }
        
        // 情境 2：回報問題 / 其他對話流程 → 交給 Rasa 處理（例如 report_facility_problem）
        Utils.logger.log('➡️ 將廁所類型選擇交給 Rasa 處理（可能是回報問題流程）');
        handleUserInput(payload);
      }, { capture: true, passive: false });
      
      container.appendChild(btn);
    });
  }
  
  messagesContainer.appendChild(container);
  
  Utils.logger.log('✅ 廁所類型選擇按鈕已顯示');
}

// 獲取所有建築列表（按校區分組）
function getBuildingsByCampus() {
  const buildingsByCampus = {
    campus1: new Set(),
    campus2: new Set(),
    campus3: new Set()
  };
  
  // 優先使用 window.AI_FACILITY_DATA，否則使用 facilities
  const facilityData = window.AI_FACILITY_DATA || facilities || {};
  
  const allFacilities = [
    ...(facilityData.campus1 || []),
    ...(facilityData.campus2 || []),
    ...(facilityData.campus3 || [])
  ];
  
  allFacilities.forEach(facility => {
    if (facility.building) {
      // 如果設施有 campus 屬性，使用它；否則根據設施所在的校區數據推斷
      const campus = facility.campus || 
        (facilityData.campus1?.includes(facility) ? 'campus1' :
         facilityData.campus2?.includes(facility) ? 'campus2' :
         facilityData.campus3?.includes(facility) ? 'campus3' : null);
      
      if (campus && buildingsByCampus[campus]) {
        buildingsByCampus[campus].add(facility.building);
      } else {
        // 如果無法確定校區，嘗試從所有校區中查找
        ['campus1', 'campus2', 'campus3'].forEach(c => {
          if (facilityData[c]?.some(f => f === facility || (f.building === facility.building && f.floor === facility.floor))) {
            buildingsByCampus[c].add(facility.building);
          }
        });
      }
    }
  });
  
  return buildingsByCampus;
}

// 開啟設備問題回報表單
function openIssueForm(preferredType = null, formData = null) {
  const container = document.getElementById('issue-form-container');
  if (!container) return;

  const campusSelect = document.getElementById('issue-campus');
  const buildingSelect = document.getElementById('issue-building');
  const floorInput = document.getElementById('issue-floor');
  const remarkInput = document.getElementById('issue-remark');
  const statusSelect = document.getElementById('issue-status');
  const genderRow = document.getElementById('issue-gender-row');
  const genderSelect = document.getElementById('issue-gender');
  const photoInput = document.getElementById('issue-photo');
  const photoPreview = document.getElementById('issue-photo-preview');
  const photoImg = document.getElementById('issue-photo-img');
  const photoRemoveBtn = document.getElementById('issue-photo-remove');
  const photoBase64Input = document.getElementById('issue-photo-base64');
  const idInput = document.getElementById('issue-facility-id');
  const summary = document.getElementById('issue-facility-summary');

  // 先清空舊資料
  campusSelect.value = '';
  buildingSelect.textContent = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '請選擇建築';
  buildingSelect.appendChild(defaultOption);
  floorInput.value = '';
  remarkInput.value = '';
  if (statusSelect) statusSelect.value = '';
  if (genderSelect) genderSelect.value = '';
  if (genderRow) genderRow.style.display = 'none';
  if (photoInput) photoInput.value = '';
  if (photoPreview) photoPreview.style.display = 'none';
  if (photoBase64Input) photoBase64Input.value = '';
  idInput.value = '';
  currentIssueFacility = null;
  
  // 如果是廁所，顯示性別選擇欄位
  if (preferredType === 'toilet' && genderRow) {
    genderRow.style.display = 'block';
    if (genderSelect) {
      genderSelect.setAttribute('required', 'required');
    }
  } else if (genderRow) {
    genderRow.style.display = 'none';
    if (genderSelect) {
      genderSelect.removeAttribute('required');
    }
  }
  
  // 如果有提供表單數據，自動填充
  if (formData) {
    Utils.logger.log('📝 開始填充表單數據:', formData);
    
    // 填充校區
    let campusValue = null;
    if (formData.campus) {
      campusValue = formData.campus;
      campusSelect.value = campusValue;
      Utils.logger.log('✅ 填充校區:', campusValue);
    } else if (formData.building) {
      // 根據建築物推斷校區
      const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
      const allFacilities = [
        ...(facilityData.campus1 || []),
        ...(facilityData.campus2 || []),
        ...(facilityData.campus3 || [])
      ];
      const matchingFacility = allFacilities.find(f => 
        f.building === formData.building || 
        f.building?.includes(formData.building) || 
        formData.building.includes(f.building)
      );
      if (matchingFacility && matchingFacility.campus) {
        campusValue = matchingFacility.campus;
        campusSelect.value = campusValue;
        Utils.logger.log('✅ 根據建築推斷校區:', campusValue);
      } else {
        // 如果設施數據中找不到，從 buildingLocations 中查找
        for (const [campusKey, buildings] of Object.entries(buildingLocations)) {
          if (buildings.some(b => b.name === formData.building || b.name?.includes(formData.building) || formData.building.includes(b.name))) {
            campusValue = campusKey;
            campusSelect.value = campusValue;
            Utils.logger.log('✅ 從 buildingLocations 推斷校區:', campusValue);
            break;
          }
        }
      }
    }
    
    // 填充建築（需要先設置校區並更新選單）
    if (campusValue) {
      // 觸發校區變更事件來更新建築選單
      updateBuildingOptions();
      
      // 等待 DOM 更新後再設置建築值
      setTimeout(() => {
        if (formData.building) {
          // 嘗試設置建築值
          if (buildingSelect.querySelector(`option[value="${formData.building}"]`)) {
            buildingSelect.value = formData.building;
            Utils.logger.log('✅ 填充建築:', formData.building);
          } else {
            // 如果找不到完全匹配，嘗試部分匹配
            const options = Array.from(buildingSelect.options);
            const matchingOption = options.find(opt => 
              opt.value === formData.building || 
              opt.value.includes(formData.building) || 
              formData.building.includes(opt.value)
            );
            if (matchingOption) {
              buildingSelect.value = matchingOption.value;
              Utils.logger.log('✅ 填充建築（部分匹配）:', matchingOption.value);
            } else {
              Utils.logger.warn('⚠️ 找不到匹配的建築:', formData.building);
            }
          }
        }
      }, 50); // 給一點時間讓 DOM 更新
    } else if (formData.building) {
      // 如果沒有校區但有建築，先填充建築（可能稍後會更新）
      Utils.logger.warn('⚠️ 沒有校區信息，無法填充建築');
    }
    
    // 填充樓層
    if (formData.floor) {
      floorInput.value = formData.floor;
      Utils.logger.log('✅ 填充樓層:', formData.floor);
    }
    
    // 填充狀態
    if (formData.status && statusSelect) {
      // 映射狀態值
      const statusMap = {
        '正常': '正常',
        '部分損壞': '部分損壞',
        '待清潔': '待清潔',
        '無法使用': '無法使用',
        '故障': '無法使用',  // 故障映射為無法使用
        'broken': '無法使用',
        'damaged': '部分損壞',
        'dirty': '待清潔',
        'normal': '正常',
        'Needs Cleaning': '待清潔',
        'Partially Damaged': '部分損壞',
        'Unavailable': '無法使用',
        'Normal': '正常'
      };
      const mappedStatus = statusMap[formData.status] || formData.status;
      statusSelect.value = mappedStatus;
      Utils.logger.log('✅ 填充狀態:', mappedStatus, '(原始:', formData.status, ')');
    }
    
    // 填充備註（優先使用 notes，其次 problem_description）
    const remarkText = formData.notes || formData.problem_description || '';
    if (remarkText && remarkInput) {
      remarkInput.value = remarkText;
      Utils.logger.log('✅ 填充備註:', remarkText);
    }
    
    // 填充性別（如果是廁所）
    if (preferredType === 'toilet' && formData.gender && genderSelect) {
      // 映射性別值
      const genderMap = {
        '男': '男',
        '女': '女',
        '性別友善': '性別友善',
        '無性別': '性別友善',  // 無性別映射為性別友善
        'Men\'s': '男',
        'Women\'s': '女',
        'Unisex': '性別友善'
      };
      const mappedGender = genderMap[formData.gender] || formData.gender;
      genderSelect.value = mappedGender;
      if (genderRow) genderRow.style.display = 'block';
      if (genderSelect) genderSelect.setAttribute('required', 'required');
      Utils.logger.log('✅ 填充性別:', mappedGender, '(原始:', formData.gender, ')');
    }
    
    Utils.logger.log('✅ 表單填充完成');
  }
  
  // 照片上傳處理
  if (photoInput) {
    Utils.events.on(photoInput, 'change', async function(e) {
      const file = e.target.files[0];
      if (file && file.type.startsWith('image/')) {
        try {
          // 使用圖片壓縮功能
          const compressedFile = await Utils.image.compress(file, 1920, 0.8, 500);
          const base64 = await Utils.image.toBase64(compressedFile);
          if (photoBase64Input) photoBase64Input.value = base64;
          if (photoImg) photoImg.src = base64;
          if (photoPreview) photoPreview.style.display = 'block';
        } catch (error) {
          Utils.logger.error('圖片處理失敗:', error);
          // 降級：使用原始文件
          const reader = new FileReader();
          reader.onload = function(event) {
            const base64 = event.target.result;
            if (photoBase64Input) photoBase64Input.value = base64;
            if (photoImg) photoImg.src = base64;
            if (photoPreview) photoPreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      }
    });
  }
  
  // 移除照片
  if (photoRemoveBtn) {
    Utils.events.on(photoRemoveBtn, 'click', function() {
      if (photoInput) photoInput.value = '';
      if (photoBase64Input) photoBase64Input.value = '';
      if (photoPreview) photoPreview.style.display = 'none';
    });
  }

  // 更新表單語言
  updateIssueFormLanguage();
  
  // 獲取建築列表（每次調用時重新獲取，確保數據最新）
  function getBuildingsForForm() {
    return getBuildingsByCampus();
  }
  
  // 校區變更時更新建築選單
  function updateBuildingOptions() {
    const selectedCampus = campusSelect.value;
    buildingSelect.innerHTML = ''; // 使用 innerHTML 清空
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '請選擇建築';
  buildingSelect.appendChild(defaultOption);
    
    // 重新獲取建築列表
    const buildingsByCampus = getBuildingsForForm();
    
    if (selectedCampus && buildingsByCampus[selectedCampus]) {
      const buildings = Array.from(buildingsByCampus[selectedCampus]).sort();
      if (buildings.length > 0) {
      buildings.forEach(building => {
        const option = document.createElement('option');
        option.value = building;
        option.textContent = building;
        buildingSelect.appendChild(option);
      });
        Utils.logger.log(`✅ 已填充 ${buildings.length} 個建築選項（校區：${selectedCampus}）`, buildings);
      } else {
        Utils.logger.warn(`⚠️ 校區 ${selectedCampus} 沒有建築數據`);
      }
    } else {
      Utils.logger.warn(`⚠️ 無法獲取校區 ${selectedCampus} 的建築列表`, {
        selectedCampus: selectedCampus,
        buildingsByCampus: buildingsByCampus
      });
    }
  }
  
  // 監聽校區變更
  Utils.events.on(campusSelect, 'change', function() {
    updateBuildingOptions();
    // 更新表單進度
    if (typeof updateFormProgress === 'function') {
      setTimeout(updateFormProgress, 100);
    }
  });
  
  // 如果校區已經有值，立即更新建築選單
  if (campusSelect.value) {
    updateBuildingOptions();
  }
  
  // 強制觸發一次更新（確保建築選單正確填充）
  setTimeout(function() {
    if (campusSelect.value) {
      updateBuildingOptions();
    }
  }, 100);
  
  // 如果表單已經打開且校區已選擇，立即填充建築選單
  if (campusSelect.value) {
    updateBuildingOptions();
  }
  
  // 顯示表單
  container.style.display = 'block';
  
  // 表單顯示後，如果校區已選擇，立即填充建築選單
  setTimeout(function() {
    if (campusSelect && campusSelect.value) {
      updateBuildingOptions();
    }
    
    // 恢復自動保存的表單數據（如果有的話）
    restoreFormData();
    
    // 設置表單自動保存（防抖處理，避免頻繁寫入）
    setupFormAutoSave();
    
    // 設置即時驗證反饋
    setupFormValidation();
    
    // 設置樓層輸入自動格式化
    setupFloorAutoFormat();
    
    // 更新表單填寫進度
    updateFormProgress();
    
    // 監聽所有輸入變化，更新進度
    const form = document.getElementById('issue-form');
    if (form) {
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        Utils.events.on(input, 'input', updateFormProgress);
        Utils.events.on(input, 'change', updateFormProgress);
      });
    }
  }, 100);
  
  // 沒有定位資訊時，提示使用者先開啟定位
  if (!currentUserLocation) {
    summary.textContent = t('noGPSLocation');
  } else {
    // 依據偏好類型或全部設施，尋找最近設備
    const nearest = findNearestAnyFacility(preferredType);
    if (nearest) {
      currentIssueFacility = nearest;
      idInput.value = nearest.id || '';
      campusSelect.value = nearest.campus || '';
      
      // 設置校區後更新建築選單
      updateBuildingOptions();
      
      // 設置預設建築
      if (nearest.building) {
        buildingSelect.value = nearest.building;
      }
      
      floorInput.value = nearest.floor || '';

      const typeText = nearest.type === 'toilet' ? t('toilet') : 
                       nearest.type === 'water' ? t('water') : t('trash');
      const campusName = nearest.campus === 'campus1' ? t('campus1') : 
                         nearest.campus === 'campus2' ? t('campus2') : t('campus3');

      // 使用安全的 DOM 操作
      summary.textContent = '';
      const lines = [
        t('nearestFacility'),
        `📍 ${Utils.html.escape(nearest.name)}`,
        `🏫 ${t('campus')}${Utils.html.escape(campusName)}`,
        `🏢 ${t('building')}${Utils.html.escape(nearest.building)}`,
        `🏢 ${t('floor')}${Utils.html.escape(nearest.floor)}`,
        `🧩 ${t('type')}${Utils.html.escape(typeText)}`
      ];
      lines.forEach((line, index) => {
        if (index === 1) {
          // 第二行包含 strong 標籤
          const parts = line.split(nearest.name);
          const strong = document.createElement('strong');
          strong.textContent = nearest.name;
          summary.appendChild(document.createTextNode(parts[0]));
          summary.appendChild(strong);
          if (parts[1]) summary.appendChild(document.createTextNode(parts[1]));
        } else {
          summary.appendChild(document.createTextNode(line));
        }
        if (index < lines.length - 1) {
          summary.appendChild(document.createElement('br'));
        }
      });
    } else {
      summary.textContent = t('noFacilities');
    }
  }

  container.style.display = 'block';
  
  // 保存當前焦點
  const previousFocus = document.activeElement;
  container._previousFocus = previousFocus;
  
  // 簡單的焦點陷阱實現（如果 Utils.focus 不存在）
  if (Utils.focus && Utils.focus.trapFocus) {
  const cleanupFocusTrap = Utils.focus.trapFocus(container);
  container._focusTrapCleanup = cleanupFocusTrap;
  }
  
  // 聚焦到第一個可聚焦元素
  const firstInput = container.querySelector('input, select, textarea, button');
  if (firstInput) {
    Utils.timers.setTimeout(() => firstInput.focus(), 100);
  }

  addMessage(t('issueFormOpened'), false);
}

// 更新設備問題回報表單語言
function updateIssueFormLanguage() {
  const formTitle = document.querySelector('.issue-form-header h3');
  if (formTitle) formTitle.textContent = t('issueFormTitle');
  
  const formDesc = document.querySelector('.issue-form-description');
  if (formDesc) formDesc.textContent = t('issueFormDesc');
  
  const campusLabel = document.querySelector('label[for="issue-campus"]');
  if (campusLabel) campusLabel.textContent = t('issueCampus');
  
  const campusSelect = document.getElementById('issue-campus');
  if (campusSelect) {
    const firstOption = campusSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('issueSelectCampus');
    
    const options = campusSelect.querySelectorAll('option[value^="campus"]');
    if (options.length >= 3) {
      options[0].textContent = t('campus1');
      options[1].textContent = t('campus2');
      options[2].textContent = t('campus3');
    }
  }
  
  const buildingLabel = document.querySelector('label[for="issue-building"]');
  if (buildingLabel) buildingLabel.textContent = t('issueBuilding');
  
  const buildingSelect = document.getElementById('issue-building');
  if (buildingSelect) {
    const firstOption = buildingSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('issueSelectBuilding');
  }
  
  const floorLabel = document.querySelector('label[for="issue-floor"]');
  if (floorLabel) floorLabel.textContent = t('issueFloor');
  
  const floorInput = document.getElementById('issue-floor');
  if (floorInput) floorInput.placeholder = t('issueFloorPlaceholder');
  
  const statusLabel = document.querySelector('label[for="issue-status"]');
  if (statusLabel) statusLabel.textContent = t('issueStatus');
  
  const statusSelect = document.getElementById('issue-status');
  if (statusSelect) {
    const firstOption = statusSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('issueSelectStatus');
    
    const options = statusSelect.querySelectorAll('option[value]');
    options.forEach(option => {
      const value = option.getAttribute('value');
      if (value === '正常') option.textContent = t('issueStatusNormal');
      else if (value === '部分損壞') option.textContent = t('issueStatusDamaged');
      else if (value === '待清潔') option.textContent = t('issueStatusCleaning');
      else if (value === '無法使用') option.textContent = t('issueStatusUnavailable');
    });
  }
  
  const genderLabel = document.querySelector('label[for="issue-gender"]');
  if (genderLabel) genderLabel.textContent = t('issueGender') || '類型 *';
  
  const genderSelect = document.getElementById('issue-gender');
  if (genderSelect) {
    const firstOption = genderSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('issueSelectGender') || '請選擇類型';
    
    const options = genderSelect.querySelectorAll('option[value]');
    options.forEach(option => {
      const value = option.getAttribute('value');
      if (value === '男') option.textContent = '♂️ 男廁';
      else if (value === '女') option.textContent = '♀️ 女廁';
      else if (value === '性別友善') option.textContent = '🚻 性別友善廁所';
      else if (value === '無障礙') option.textContent = '♿ 無障礙廁所';
    });
  }
  
  const remarkLabel = document.querySelector('label[for="issue-remark"]');
  if (remarkLabel) remarkLabel.textContent = t('issueRemark');
  
  const remarkInput = document.getElementById('issue-remark');
  if (remarkInput) remarkInput.placeholder = t('issueRemarkPlaceholder');
  
  const photoLabel = document.querySelector('label[for="issue-photo"]');
  if (photoLabel) photoLabel.textContent = t('issuePhoto');
  
  const photoRemoveBtn = document.getElementById('issue-photo-remove');
  if (photoRemoveBtn) photoRemoveBtn.textContent = t('issuePhotoRemove');
  
  const formCloseBtn = document.getElementById('issue-form-close-btn');
  if (formCloseBtn) {
    formCloseBtn.setAttribute('aria-label', t('issueFormClose'));
  }
  
  const cancelBtn = document.getElementById('issue-cancel-btn');
  if (cancelBtn) cancelBtn.textContent = t('issueCancel');
  
  const submitBtn = document.querySelector('#issue-form button[type="submit"]');
  if (submitBtn) submitBtn.textContent = t('issueSubmit');
}

// 關閉設備問題回報表單
function closeIssueForm() {
  const container = document.getElementById('issue-form-container');
  if (container) {
    container.style.display = 'none';
    
    // 清理焦點陷阱並恢復焦點
    if (container._focusTrapCleanup) {
      container._focusTrapCleanup();
      delete container._focusTrapCleanup;
    }
    if (container._previousFocus) {
      if (Utils.focus && Utils.focus.restoreFocus) {
      Utils.focus.restoreFocus(container._previousFocus);
      } else if (container._previousFocus.focus) {
        try {
          container._previousFocus.focus();
        } catch (e) {
          // 忽略焦點錯誤
        }
      }
      delete container._previousFocus;
    }
    
    // 清除自動保存的表單數據（表單已關閉）
    clearFormAutoSave();
  }
}

// 表單自動保存功能
function setupFormAutoSave() {
  const form = document.getElementById('issue-form');
  if (!form) return;
  
  // 移除舊的監聽器（如果有的話）
  if (form._autoSaveCleanup) {
    form._autoSaveCleanup();
  }
  
  const saveFormData = Utils.performance.debounce(function() {
    const campusSelect = document.getElementById('issue-campus');
    const buildingSelect = document.getElementById('issue-building');
    const floorInput = document.getElementById('issue-floor');
    const statusSelect = document.getElementById('issue-status');
    const remarkInput = document.getElementById('issue-remark');
    const genderSelect = document.getElementById('issue-gender');
    
    const formData = {
      campus: campusSelect ? campusSelect.value : '',
      building: buildingSelect ? buildingSelect.value : '',
      floor: floorInput ? floorInput.value : '',
      status: statusSelect ? statusSelect.value : '',
      remark: remarkInput ? remarkInput.value : '',
      gender: genderSelect ? genderSelect.value : '',
      timestamp: Date.now()
    };
    
    // 只保存有內容的數據
    const hasData = Object.values(formData).some(v => v && v !== '' && v !== 'timestamp');
    if (hasData) {
      Utils.storage.set('issueFormDraft', formData);
      Utils.logger.debug('表單數據已自動保存');
    }
  }, 1000); // 1秒防抖
  
  // 監聽所有表單輸入變化
  const inputs = form.querySelectorAll('input, select, textarea');
  const cleanupFunctions = [];
  
  inputs.forEach(input => {
    const cleanup1 = Utils.events.on(input, 'input', saveFormData);
    const cleanup2 = Utils.events.on(input, 'change', saveFormData);
    cleanupFunctions.push(cleanup1, cleanup2);
  });
  
  // 保存清理函數
  form._autoSaveCleanup = function() {
    cleanupFunctions.forEach(cleanup => {
      if (typeof cleanup === 'function') cleanup();
    });
    delete form._autoSaveCleanup;
  };
}

// 恢復自動保存的表單數據
function restoreFormData() {
  const draft = Utils.storage.get('issueFormDraft', null);
  if (!draft) return;
  
  // 檢查數據是否過期（超過1小時）
  const oneHour = 60 * 60 * 1000;
  if (Date.now() - (draft.timestamp || 0) > oneHour) {
    Utils.storage.remove('issueFormDraft');
    return;
  }
  
  // 恢復數據
  const campusSelect = document.getElementById('issue-campus');
  const buildingSelect = document.getElementById('issue-building');
  const floorInput = document.getElementById('issue-floor');
  const statusSelect = document.getElementById('issue-status');
  const remarkInput = document.getElementById('issue-remark');
  const genderSelect = document.getElementById('issue-gender');
  
  if (draft.campus && campusSelect) {
    campusSelect.value = draft.campus;
    // 觸發建築選單更新
    const updateBuildingOptions = window.updateBuildingOptions;
    if (typeof updateBuildingOptions === 'function') {
      updateBuildingOptions();
      // 等待建築選單更新後再設置建築值
      setTimeout(() => {
        if (draft.building && buildingSelect) {
          buildingSelect.value = draft.building;
        }
      }, 200);
    }
  }
  
  if (draft.floor && floorInput) floorInput.value = draft.floor;
  if (draft.status && statusSelect) statusSelect.value = draft.status;
  if (draft.remark && remarkInput) remarkInput.value = draft.remark;
  if (draft.gender && genderSelect) genderSelect.value = draft.gender;
  
  Utils.logger.log('✅ 已恢復自動保存的表單數據');
}

// 清除自動保存的表單數據
function clearFormAutoSave() {
  Utils.storage.remove('issueFormDraft');
}

// 設置即時驗證反饋
function setupFormValidation() {
  const campusSelect = document.getElementById('issue-campus');
  const buildingSelect = document.getElementById('issue-building');
  const floorInput = document.getElementById('issue-floor');
  const statusSelect = document.getElementById('issue-status');
  const genderSelect = document.getElementById('issue-gender');
  
  // 驗證函數
  const validateField = function(field, validator) {
    if (!field) return;
    
    const validate = function() {
      const value = field.value ? field.value.trim() : '';
      const isValid = validator(value);
      
      // 移除舊的驗證樣式
      field.classList.remove('field-valid', 'field-invalid');
      
      // 添加驗證樣式
      if (value) {
        field.classList.add(isValid ? 'field-valid' : 'field-invalid');
      }
      
      // 更新表單進度
      updateFormProgress();
    };
    
    Utils.events.on(field, 'input', validate);
    Utils.events.on(field, 'change', validate);
    Utils.events.on(field, 'blur', validate);
  };
  
  // 樓層驗證（格式：數字+F 或 數字樓）
  if (floorInput) {
    validateField(floorInput, function(value) {
      if (!value) return false;
      // 允許：3F, 3, 3樓, 三樓 等格式
      return /^[\d一二三四五六七八九十]+[Ff樓層]?$/.test(value);
    });
  }
  
  // 建築驗證
  if (buildingSelect) {
    validateField(buildingSelect, function(value) {
      return value && value !== '';
    });
  }
  
  // 狀態驗證
  if (statusSelect) {
    validateField(statusSelect, function(value) {
      return value && value !== '';
    });
  }
}

// 設置樓層輸入自動格式化
function setupFloorAutoFormat() {
  const floorInput = document.getElementById('issue-floor');
  if (!floorInput) return;
  
  Utils.events.on(floorInput, 'blur', function() {
    let value = floorInput.value.trim();
    if (!value) return;
    
    // 中文數字轉換
    const chineseNumbers = {
      '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
      '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
    };
    
    // 如果包含中文數字，轉換為阿拉伯數字
    for (const [chinese, arabic] of Object.entries(chineseNumbers)) {
      if (value.includes(chinese)) {
        value = value.replace(chinese, arabic);
      }
    }
    
    // 移除"樓"、"層"等字
    value = value.replace(/[樓層層]/g, '');
    
    // 提取數字
    const match = value.match(/\d+/);
    if (match) {
      const num = match[0];
      // 格式化為 XF
      if (!value.toUpperCase().endsWith('F')) {
        floorInput.value = num + 'F';
      } else {
        floorInput.value = num + 'F';
      }
    }
  });
}

// 更新表單填寫進度
function updateFormProgress() {
  let progressIndicator = document.getElementById('issue-form-progress');
  if (!progressIndicator) {
    // 創建進度指示器（如果不存在）
    const formHeader = document.querySelector('.issue-form-header');
    if (formHeader) {
      const progress = document.createElement('div');
      progress.id = 'issue-form-progress';
      progress.className = 'issue-form-progress';
      formHeader.appendChild(progress);
      progressIndicator = progress;
    } else {
      return;
    }
  }
  
  const campusSelect = document.getElementById('issue-campus');
  const buildingSelect = document.getElementById('issue-building');
  const floorInput = document.getElementById('issue-floor');
  const statusSelect = document.getElementById('issue-status');
  const genderRow = document.getElementById('issue-gender-row');
  const genderSelect = document.getElementById('issue-gender');
  
  const requiredFields = [
    { field: campusSelect, name: '校區' },
    { field: buildingSelect, name: '建築' },
    { field: floorInput, name: '樓層' },
    { field: statusSelect, name: '狀態' }
  ];
  
  // 如果是廁所，性別也是必填
  if (genderRow && genderRow.style.display !== 'none') {
    requiredFields.push({ field: genderSelect, name: '類型' });
  }
  
  const filledCount = requiredFields.filter(item => {
    if (!item.field) return false;
    const value = item.field.value ? item.field.value.trim() : '';
    return value !== '';
  }).length;
  
  const totalCount = requiredFields.length;
  const progress = totalCount > 0 ? Math.round((filledCount / totalCount) * 100) : 0;
  
  if (progressIndicator) {
    progressIndicator.textContent = currentLanguage === 'en'
      ? `Progress: ${filledCount}/${totalCount} fields completed (${progress}%)`
      : `填寫進度：${filledCount}/${totalCount} 項必填欄位（${progress}%）`;
    
    // 添加進度條樣式
    progressIndicator.style.cssText = `
      margin-top: 8px;
      font-size: 12px;
      color: ${progress === 100 ? '#4CAF50' : '#666'};
      font-weight: ${progress === 100 ? 'bold' : 'normal'};
    `;
  }
}

// 保存問題到歷史記錄
function saveIssueToHistory(issueData) {
  const historyKey = 'nfu_issue_history';
  let history = JSON.parse(localStorage.getItem(historyKey) || '[]');
  
  // 添加新記錄
  history.unshift({
    id: Date.now().toString(),
    ...issueData,
    createdAt: new Date().toISOString()
  });
  
  // 只保留最近 100 條記錄
  if (history.length > 100) {
    history = history.slice(0, 100);
  }
  
  localStorage.setItem(historyKey, JSON.stringify(history));
}

// 獲取問題歷史記錄（使用統一工具函數）
function getIssueHistory() {
  const historyKey = AppConfig.STORAGE_KEYS.ISSUE_HISTORY;
  return Utils.storage.get(historyKey, []);
}

// 顯示問題歷史記錄
function showIssueHistory() {
  const history = getIssueHistory();
  const actionLang = currentLanguage;
  
  if (history.length === 0) {
    const msg = actionLang === 'en'
      ? '📋 No issue history found.'
      : '📋 目前沒有問題歷史記錄。';
    addMessage(msg, false);
    return;
  }
  
  let msg = actionLang === 'en'
    ? `📋 <strong>Issue History (${history.length} records):</strong><br><br>`
    : `📋 <strong>問題歷史記錄（${history.length} 筆）：</strong><br><br>`;
  
  history.slice(0, 20).forEach((issue, index) => {
    const date = new Date(issue.timestamp || issue.createdAt);
    const dateStr = actionLang === 'en'
      ? date.toLocaleString('en-US')
      : date.toLocaleString('zh-TW');
    
    const statusInfo = getStatusInfo(issue.status || '正常', actionLang);
    const priorityIcons = {
      'critical': '🔴',
      'moderate': '🟠',
      'minor': '🟡'
    };
    const priorityIcon = priorityIcons[issue.priority] || '🟡';
    
    msg += `<div style="margin: 8px 0; padding: 8px; background: rgba(15, 23, 42, 0.3); border-radius: 6px;">
      <strong>#${index + 1}</strong> ${priorityIcon} ${statusInfo.icon} ${statusInfo.text}<br>
      📍 ${issue.building || ''} ${issue.floor || ''}<br>
      ${issue.notes ? `📝 ${issue.notes}<br>` : ''}
      🕒 ${dateStr}
    </div>`;
  });
  
  if (history.length > 20) {
    msg += actionLang === 'en'
      ? `<br>... and ${history.length - 20} more records`
      : `<br>... 還有 ${history.length - 20} 筆記錄`;
  }
  
  addMessage(msg, false);
}

// 檢查 Rasa 伺服器是否可用
// 導出到全局，讓手機版可以調用
// 導出函數到 window 對象，供手機版使用（立即導出，不等待初始化）
// 確保函數在定義後立即導出
// 設置虛擬測試位置的函數
function setTestLocation(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    Utils.logger.error('setTestLocation: 無效的座標');
    return false;
  }
  
  currentUserLocation = { lat, lng };
  AppState.userLocation = currentUserLocation;
  
  // 如果地圖已初始化，在地圖上標示位置
  if (aiMap && typeof L !== 'undefined') {
    // 清除舊的位置標記
    if (typeof userLocationMarker !== 'undefined' && userLocationMarker) {
      aiMap.removeLayer(userLocationMarker);
    }
    
    // 創建新的位置標記
    const locationPopupText = '📍 測試位置（虛擬）';
    userLocationMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: 'custom-marker user-location',
        html: '<div style="background: #ff0000; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">📍</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      })
    }).addTo(aiMap).bindPopup(locationPopupText).openPopup();
    
    // 移動地圖到測試位置
    aiMap.setView([lat, lng], 18);
    
    Utils.logger.log('✅ 虛擬位置已設置:', { lat, lng });
    Utils.logger.log('📍 地圖已移動到測試位置');
  } else {
    Utils.logger.warn('⚠️ 地圖尚未初始化，位置已設置但無法顯示標記');
  }
  
  return true;
}

window.handleUserInput = handleUserInput;
window.setTestLocation = setTestLocation;
Utils.logger.log('✅ handleUserInput 已導出到 window');

// 網絡狀態監聽（優化版：防止內存洩漏）
let isOnline = navigator.onLine;
let networkStatusListeners = [];
let networkStatusCleanup = null;

function updateNetworkStatus(online) {
  isOnline = online;
  // 使用 try-catch 保護監聽器調用
  networkStatusListeners.forEach(listener => {
    try {
      listener(online);
    } catch (error) {
      Utils.logger.error('網絡狀態監聽器錯誤:', error);
    }
  });
  
  if (online) {
    Utils.logger.log('✅ 網絡已連接');
    // 如果之前離線，嘗試重新連接 Rasa（防抖處理）
    if (useRasa === false || rasaConnectionState !== RasaConnectionState.CONNECTED) {
      // 使用防抖避免頻繁重連
      clearTimeout(window.rasaReconnectTimeout);
      window.rasaReconnectTimeout = Utils.timers.setTimeout(() => {
        Utils.logger.log('🔄 網絡恢復，嘗試重新連接 Rasa 伺服器...');
        rasaConnectionRetries = 0; // 重置重試計數
        checkRasaConnection(true).then(connected => {
          if (connected) {
            Utils.logger.log('✅ Rasa 伺服器重新連接成功');
            // 只在沒有健康檢查運行時才啟動
            if (!rasaHealthCheckInterval) {
              startRasaHealthCheck();
            }
          } else {
            Utils.logger.warn('❌ Rasa 伺服器重新連接失敗');
          }
        }).catch(err => {
          Utils.logger.warn('重新連接 Rasa 失敗:', err);
        });
      }, 2000); // 延遲 2 秒重連
    }
  } else {
    Utils.logger.warn('⚠️ 網絡已斷開');
    rasaConnectionState = RasaConnectionState.DISCONNECTED;
    useRasa = false;
    // 清除重連定時器
    if (window.rasaReconnectTimeout) {
      clearTimeout(window.rasaReconnectTimeout);
      window.rasaReconnectTimeout = null;
    }
    // 暫停健康檢查
    stopRasaHealthCheck();
  }
}

// 網絡狀態事件處理函數（命名以便移除）
function handleOnline() {
  updateNetworkStatus(true);
}

function handleOffline() {
  updateNetworkStatus(false);
}

// 監聽網絡狀態變化
window.addEventListener('online', handleOnline);
window.addEventListener('offline', handleOffline);

// 導出網絡狀態監聽函數（帶清理機制）
window.addNetworkStatusListener = function(listener) {
  if (typeof listener !== 'function') {
    Utils.logger.warn('網絡狀態監聽器必須是函數');
    return;
  }
  networkStatusListeners.push(listener);
  
  // 返回清理函數
  return function() {
    const index = networkStatusListeners.indexOf(listener);
    if (index > -1) {
      networkStatusListeners.splice(index, 1);
    }
  };
};

// 清理函數（頁面卸載時調用）
function cleanupNetworkListeners() {
  window.removeEventListener('online', handleOnline);
  window.removeEventListener('offline', handleOffline);
  networkStatusListeners = [];
  if (window.rasaReconnectTimeout) {
    clearTimeout(window.rasaReconnectTimeout);
    window.rasaReconnectTimeout = null;
  }
  // 停止 Rasa 健康檢查
  stopRasaHealthCheck();
}

// 頁面卸載時清理
window.addEventListener('beforeunload', () => {
  cleanupNetworkListeners();
  stopRasaHealthCheck();
});

// 帶重試機制的 fetch 請求（優化版：更好的錯誤處理和資源清理）
async function fetchWithRetry(url, options = {}, maxRetries = 3, retryDelay = 1000) {
  // 參數驗證
  if (!url || typeof url !== 'string') {
    throw new Error('無效的 URL');
  }
  
  // 檢查網絡狀態
  if (!isOnline) {
    throw new Error('網絡未連接');
  }
  
  let timeoutId = null;
  let controller = null;
  
  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        controller = new AbortController();
        // 增加超時時間到 30 秒，因為 Rasa 處理複雜查詢可能需要更長時間
        timeoutId = setTimeout(() => {
          if (controller) {
            controller.abort();
          }
        }, 30000); // 30 秒超時
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        });
        
        // 清理定時器
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        return response;
      } catch (error) {
        // 清理定時器
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        
        // 如果網絡已斷開，不再重試
        if (!isOnline) {
          throw new Error('網絡未連接');
        }
        
        // 如果是取消請求，直接拋出
        if (error.name === 'AbortError') {
          if (attempt === maxRetries) {
            throw new Error('請求超時');
          }
        } else if (attempt === maxRetries) {
          throw error;
        }
        
        // 記錄重試信息（僅在開發環境或前幾次重試時）
        if (attempt <= 2) {
          Utils.logger.log(`⚠️ 請求失敗（嘗試 ${attempt}/${maxRetries}），${retryDelay}ms 後重試...`);
        }
        
        // 等待重試（使用 Promise 以便可以取消）
        await new Promise((resolve, reject) => {
          const retryTimeoutId = Utils.timers.setTimeout(resolve, retryDelay);
          // 如果網絡斷開，取消重試
          if (!isOnline) {
            clearTimeout(retryTimeoutId);
            reject(new Error('網絡未連接'));
          }
        });
        
        retryDelay = Math.min(retryDelay * 1.5, 10000); // 指數退避，最大 10 秒
      }
    }
  } finally {
    // 確保清理資源
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    controller = null;
  }
  
  // 理論上不會到達這裡，但為了類型安全
  throw new Error('請求失敗');
}

// Rasa 連接狀態管理
const RasaConnectionState = {
  UNKNOWN: 'unknown',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error'
};

let rasaConnectionState = RasaConnectionState.UNKNOWN;
let rasaHealthCheckInterval = null;
let rasaLastHealthCheck = 0;
let rasaConnectionRetries = 0;
let rasaLastSuccessfulCheck = 0; // 最後一次成功檢查的時間
const MAX_RETRIES = 5;
const BASE_HEALTH_CHECK_INTERVAL = 30000; // 基礎檢查間隔 30 秒
const MAX_HEALTH_CHECK_INTERVAL = 300000; // 最大檢查間隔 5 分鐘
const HEALTH_CHECK_TIMEOUT = 5000; // 健康檢查超時 5 秒

/**
 * 執行 Rasa 健康檢查（輕量級，只檢查 /status 端點）
 */
async function performRasaHealthCheck() {const rasaUrl = getRasaServerURLDynamic();if (!rasaUrl) {
    Utils.logger.warn('⚠️ 健康檢查：Rasa URL 未設置');
    rasaConnectionState = RasaConnectionState.DISCONNECTED;
    useRasa = false;return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);const response = await fetch(`${rasaUrl}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);if (response.ok) {
      const statusData = await response.json();
      Utils.logger.log('✅ 健康檢查通過:', statusData);
      rasaConnectionState = RasaConnectionState.CONNECTED;
      useRasa = true;
      rasaConnectionRetries = 0; // 重置重試計數
      rasaLastHealthCheck = Date.now();
      rasaLastSuccessfulCheck = Date.now(); // 記錄成功時間
      // 注意：不要在這裡重新啟動健康檢查，讓 scheduleNextCheck 自然處理return true;
    } else {
      Utils.logger.warn(`⚠️ 健康檢查失敗：HTTP ${response.status}`);
      rasaConnectionState = RasaConnectionState.ERROR;
      useRasa = false;
      rasaConnectionRetries++;
      rasaLastHealthCheck = Date.now();return false;
    }
  } catch (error) {
    Utils.logger.warn('⚠️ 健康檢查失敗:', error.message || String(error));
    rasaConnectionState = RasaConnectionState.DISCONNECTED;
    useRasa = false;
    rasaConnectionRetries++;
    rasaLastHealthCheck = Date.now();return false;
  }
}

/**
 * 計算動態健康檢查間隔（指數退避）
 * @returns {number} 檢查間隔（毫秒）
 */
function calculateHealthCheckInterval() {
  if (rasaConnectionRetries === 0) {
    return BASE_HEALTH_CHECK_INTERVAL; // 30 秒
  }
  
  // 指數退避：30秒 * 2^重試次數，最大 5 分鐘
  const interval = Math.min(
    BASE_HEALTH_CHECK_INTERVAL * Math.pow(2, rasaConnectionRetries),
    MAX_HEALTH_CHECK_INTERVAL
  );
  
  return interval;
}

/**
 * 啟動 Rasa 健康檢查機制（使用動態間隔）
 */
function startRasaHealthCheck() {
  // 如果已經有健康檢查在運行，先停止它
  if (rasaHealthCheckInterval) {
    clearTimeout(rasaHealthCheckInterval);
    rasaHealthCheckInterval = null;
  }
  
  // 使用動態間隔定期執行健康檢查
  const scheduleNextCheck = () => {
    // 防止重複調用：如果已經有定時器在運行，先清除它
    if (rasaHealthCheckInterval) {
      clearTimeout(rasaHealthCheckInterval);
      rasaHealthCheckInterval = null;
    }
    
    const interval = calculateHealthCheckInterval();
    
    // 如果超過最大重試次數，停止健康檢查或使用最大間隔
    if (rasaConnectionRetries >= MAX_RETRIES) {
      Utils.logger.warn(`⚠️ Rasa 連接失敗次數過多（${rasaConnectionRetries}/${MAX_RETRIES}），停止定期健康檢查`);
      Utils.logger.log('💡 將在用戶發送消息時自動嘗試重新連接');
      stopRasaHealthCheck();
      return;
    }
    
    rasaHealthCheckInterval = setTimeout(() => {
      // 清除定時器標記，允許下一次調用
      const currentInterval = rasaHealthCheckInterval;
      rasaHealthCheckInterval = null;
      
      performRasaHealthCheck().then(success => {
        // 無論成功還是失敗，都安排下一次檢查
        // 但只在沒有其他實例在運行的情況下
        if (!rasaHealthCheckInterval || rasaHealthCheckInterval === currentInterval) {
          scheduleNextCheck();
        }
      }).catch(err => {
        Utils.logger.warn('健康檢查失敗:', err);
        rasaConnectionRetries++;
        // 只在沒有其他實例在運行的情況下安排下一次檢查
        if (!rasaHealthCheckInterval || rasaHealthCheckInterval === currentInterval) {
          scheduleNextCheck();
        }
      });
    }, interval);
    
    if (rasaConnectionRetries > 0) {
      Utils.logger.log(`⏱️ 下次健康檢查將在 ${Math.round(interval / 1000)} 秒後執行（重試次數: ${rasaConnectionRetries}/${MAX_RETRIES}）`);
    } else {
      Utils.logger.debug(`⏱️ 下次健康檢查將在 ${Math.round(interval / 1000)} 秒後執行`);
    }
  };
  
  // 立即執行一次檢查，然後安排下一次
  performRasaHealthCheck().then(success => {
    // 只在沒有其他實例在運行的情況下安排下一次檢查
    if (!rasaHealthCheckInterval) {
      scheduleNextCheck();
    }
  }).catch(err => {
    Utils.logger.warn('初始健康檢查失敗:', err);
    // 即使失敗也安排下一次檢查
    if (!rasaHealthCheckInterval) {
      scheduleNextCheck();
    }
  });
}

/**
 * 停止 Rasa 健康檢查機制
 */
function stopRasaHealthCheck() {
  if (rasaHealthCheckInterval) {
    clearTimeout(rasaHealthCheckInterval);
    rasaHealthCheckInterval = null;
  }
}

window.checkRasaConnection = async function checkRasaConnection(forceCheck = false) {// 動態獲取最新的 Rasa URL（支持運行時更新）- 移到 try 外以便在 catch 中訪問
  let rasaUrl;
  try {
    rasaUrl = getRasaServerURLDynamic();
    console.log('[DEBUG] checkRasaConnection started:', { rasaUrl, forceCheck, hostname: window.location.hostname });if (!rasaUrl) {const hostname = window.location.hostname;
      const isTunnel = hostname.includes('loca.lt') || hostname.includes('ngrok.io');
      if (isTunnel) {
        Utils.logger.log('ℹ️ 檢測到內網穿透服務，但未設置 Rasa 伺服器地址');
        Utils.logger.log('💡 解決方法：');
        Utils.logger.log('   1. 在 URL 中添加參數：?rasa_url=https://your-rasa-server.loca.lt');
        Utils.logger.log('   2. 或在控制台執行：localStorage.setItem("nfu_rasa_server_url", "https://your-rasa-server.loca.lt")');
        Utils.logger.log('   3. 然後重新載入頁面（按 F5）');
      }
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
      useRasa = false;
      stopRasaHealthCheck();return false;
    }
    
    // 避免重複檢查：如果最近 10 秒內已檢查過且失敗，且不是強制檢查，則跳過
    const timeSinceLastCheck = Date.now() - rasaLastHealthCheck;
    if (!forceCheck && timeSinceLastCheck < 10000) {
      // 如果最近檢查過且連接狀態為錯誤，跳過重複檢查
      if (rasaConnectionState === RasaConnectionState.ERROR || 
          rasaConnectionState === RasaConnectionState.DISCONNECTED) {
        Utils.logger.debug(`⏭️ 跳過重複檢查（${Math.round(timeSinceLastCheck / 1000)} 秒前已檢查，狀態: ${rasaConnectionState}）`);
        return useRasa;
      }
      // 如果最近檢查過且連接正常，直接返回
      if (rasaConnectionState === RasaConnectionState.CONNECTED && useRasa) {
        return true;
      }
    }
    
    rasaConnectionState = RasaConnectionState.CONNECTING;
    
    // 檢查 /status 端點（使用更短的超時時間）
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);
    
    try {const statusResponse = await fetch(`${rasaUrl}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);if (!statusResponse.ok) {
        const statusCode = statusResponse.status;
        let errorMessage = `HTTP ${statusCode} ${statusResponse.statusText}`;
        
        // 針對不同錯誤碼提供更詳細的診斷信息
        if (statusCode === 502) {
          errorMessage += ' (Bad Gateway - 後端服務器可能未運行或配置錯誤)';
          Utils.logger.warn(`⚠️ Rasa 伺服器返回 502 Bad Gateway`);
          Utils.logger.warn(`💡 可能的原因：`);
          Utils.logger.warn(`   1. Zeabur Rasa 服務器未啟動或已停止`);
          Utils.logger.warn(`   2. 服務器配置錯誤`);
          Utils.logger.warn(`   3. 網絡連接問題`);
          Utils.logger.warn(`💡 建議：檢查 Zeabur 儀表板中的服務狀態和日誌`);
        } else if (statusCode === 503) {
          errorMessage += ' (Service Unavailable - 服務暫時不可用)';
          Utils.logger.warn(`⚠️ Rasa 伺服器返回 503 Service Unavailable`);
          Utils.logger.warn(`💡 服務器可能正在重啟或過載，請稍後再試`);
        } else if (statusCode === 504) {
          errorMessage += ' (Gateway Timeout - 請求超時)';
          Utils.logger.warn(`⚠️ Rasa 伺服器返回 504 Gateway Timeout`);
        }
        
        Utils.logger.warn(`⚠️ Rasa 伺服器響應錯誤：${errorMessage}`);
        rasaConnectionState = RasaConnectionState.ERROR;
        useRasa = false;
        rasaConnectionRetries++;
        return false;
      }
      
      const statusData = await statusResponse.json();
      Utils.logger.log('✅ Rasa 伺服器狀態檢查通過:', statusData);
      console.log('[DEBUG] Status check passed:', { statusData, rasaUrl, rasaConnectionState, rasaConnectionRetries, rasaLastHealthCheck });// 進一步測試實際的 webhook 端點（確保真正可用）
      // 只在首次連接或連接狀態異常時才執行完整測試，避免頻繁測試
      // 注意：此時 rasaConnectionState 是 CONNECTING，所以應該測試 webhook
      const shouldTestWebhook = rasaConnectionState !== RasaConnectionState.CONNECTED || 
                                rasaConnectionRetries > 0 ||
                                !rasaLastHealthCheck ||
                                (Date.now() - rasaLastHealthCheck) > 60000; // 超過1分鐘未檢查
      console.log('[DEBUG] shouldTestWebhook:', { shouldTestWebhook, rasaConnectionState, rasaConnectionRetries, rasaLastHealthCheck, timeSinceLastCheck: rasaLastHealthCheck ? Date.now() - rasaLastHealthCheck : null });if (shouldTestWebhook) {
      Utils.logger.log('🔍 測試 Rasa webhook 端點...');
      try {
        const webhookTestController = new AbortController();
        const webhookTimeoutId = setTimeout(() => webhookTestController.abort(), 3000);
        
        const webhookTestUrl = buildRasaWebhookUrl(rasaUrl);
        const webhookTestResponse = await fetch(webhookTestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            sender: getRasaSessionId(), // 使用會話 ID 而不是臨時 ID
            message: '你好' // 使用實際的問候語測試，確保能匹配意圖
          }),
          signal: webhookTestController.signal
        });
        
        clearTimeout(webhookTimeoutId);
        
        if (!webhookTestResponse.ok) {
          Utils.logger.warn(`⚠️ Webhook 端點響應異常：${webhookTestResponse.status}`);
          console.log('[DEBUG] Webhook test failed:', { status: webhookTestResponse.status, rasaUrl });
          // 即使狀態碼異常，如果端點有響應，也認為可用
          if (webhookTestResponse.status === 400 || webhookTestResponse.status === 500) {
            // 400/500 可能是正常的（例如意圖識別問題），但端點可用
            Utils.logger.log('✅ Webhook 端點可用（響應狀態碼：' + webhookTestResponse.status + '）');
            rasaConnectionState = RasaConnectionState.CONNECTED;
            useRasa = true;
            rasaConnectionRetries = 0;
            rasaLastHealthCheck = Date.now();
            
            if (!rasaHealthCheckInterval) {
              startRasaHealthCheck();
            }
            console.log('[DEBUG] Webhook test passed (400/500), returning true');
            return true;
          } else {
            // 其他狀態碼（如 404、503 等），但 status 端點已經可用，所以仍然認為連接成功
            // 這可能是暫時性問題或 webhook 端點配置問題，但不影響基本連接
            Utils.logger.warn(`⚠️ Webhook 端點響應異常（${webhookTestResponse.status}），但 status 端點可用，將繼續使用`);
            console.log('[DEBUG] Webhook test failed but status OK, still using Rasa');
            rasaConnectionState = RasaConnectionState.CONNECTED;
            useRasa = true;
            rasaConnectionRetries = 0;
            rasaLastHealthCheck = Date.now();
            
            if (!rasaHealthCheckInterval) {
              startRasaHealthCheck();
            }
            return true;
          }
        }
        
        // 嘗試解析響應
        try {
          const webhookTestText = await webhookTestResponse.text();
          Utils.logger.log('📄 Webhook 測試響應原始內容:', webhookTestText);
          
          let webhookData;
          try {
            webhookData = JSON.parse(webhookTestText);
          } catch (parseError) {
            Utils.logger.warn('⚠️ Webhook 測試響應解析失敗:', parseError);
            Utils.logger.warn('📄 原始響應:', webhookTestText);
            // 即使解析失敗，如果狀態碼是 200，也認為端點可用
            if (webhookTestResponse.status === 200) {
              Utils.logger.log('✅ Webhook 端點可用（響應格式異常但狀態碼正常）');
              rasaConnectionState = RasaConnectionState.CONNECTED;
              useRasa = true;
              rasaConnectionRetries = 0;
              rasaLastHealthCheck = Date.now();
              if (!rasaHealthCheckInterval) {
                startRasaHealthCheck();
              }
              return true;
            }
            throw parseError;
          }
          
          Utils.logger.log('📊 Webhook 測試響應數據:', JSON.stringify(webhookData, null, 2));
          
          if (Array.isArray(webhookData)) {
            if (webhookData.length > 0) {
              Utils.logger.log('✅ Webhook 端點測試成功，收到有效響應（', webhookData.length, '條）');
            } else {
              Utils.logger.warn('⚠️ Webhook 端點測試返回空數組');
              Utils.logger.warn('💡 這可能表示：');
              Utils.logger.warn('   1. Rasa 模型沒有匹配的意圖');
              Utils.logger.warn('   2. Rasa 動作沒有返回響應');
              Utils.logger.warn('   3. 測試消息 "test" 沒有對應的意圖');
              Utils.logger.warn('💡 建議：使用實際的問候語測試，如 "你好" 或 "greet"');
            }
            // 即使返回空數組，如果格式正確（數組），也認為端點可用
            rasaConnectionState = RasaConnectionState.CONNECTED;
            useRasa = true;
            rasaConnectionRetries = 0;
            rasaLastHealthCheck = Date.now();
            
            if (!rasaHealthCheckInterval) {
              startRasaHealthCheck();
            }return true;
          } else {
            Utils.logger.warn('⚠️ Webhook 響應格式異常，但端點可用');
            rasaConnectionState = RasaConnectionState.CONNECTED;
            useRasa = true;
            rasaConnectionRetries = 0;
            rasaLastHealthCheck = Date.now();
            
            if (!rasaHealthCheckInterval) {
              startRasaHealthCheck();
            }return true;
          }
        } catch (parseError) {
          Utils.logger.warn('⚠️ Webhook 響應解析失敗，但端點有響應:', parseError);
          // 即使解析失敗，如果 HTTP 狀態是 200，也認為可用
          rasaConnectionState = RasaConnectionState.CONNECTED;
          useRasa = true;
          rasaConnectionRetries = 0;
          rasaLastHealthCheck = Date.now();
          
          if (!rasaHealthCheckInterval) {
            startRasaHealthCheck();
          }return true;
        }
      } catch (webhookError) {
        // Webhook 測試失敗，但 status 端點可用
        if (webhookError.name === 'AbortError') {
          Utils.logger.warn('⏱️ Webhook 測試超時，但 status 端點可用');
        } else {
          Utils.logger.warn('⚠️ Webhook 測試失敗，但 status 端點可用:', webhookError.message);
        }
        
        // 如果 status 端點可用，仍然嘗試使用（可能是暫時性問題）
        Utils.logger.log('ℹ️ 將嘗試使用 Rasa（status 端點可用）');
        rasaConnectionState = RasaConnectionState.CONNECTED;
        useRasa = true;
        rasaConnectionRetries = 0;
        rasaLastHealthCheck = Date.now();
        
        if (!rasaHealthCheckInterval) {
          startRasaHealthCheck();
        }return true;
      }
    } else {
        // 不需要測試 webhook，直接使用已連接狀態
        Utils.logger.log('✅ 使用已連接的 Rasa 狀態（跳過 webhook 測試）');
        rasaConnectionState = RasaConnectionState.CONNECTED;
        useRasa = true;
        rasaConnectionRetries = 0;
        rasaLastHealthCheck = Date.now();
        
        if (!rasaHealthCheckInterval) {
          startRasaHealthCheck();
        }return true;
      }
    } catch (fetchError) {
      clearTimeout(timeoutId);throw fetchError;
    }
  } catch (error) {
    // 網絡錯誤處理
    console.error('[DEBUG] checkRasaConnection error:', { error: error.message, name: error.name, stack: error.stack, rasaUrl });if (error.name === 'AbortError') {
      Utils.logger.warn('⏱️ Rasa 連接檢查超時');
      console.warn('[DEBUG] Connection timeout:', { rasaUrl, timeout: HEALTH_CHECK_TIMEOUT });
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
    } else if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      Utils.logger.warn('🌐 網絡連接失敗，請檢查網絡連接');
      console.warn('[DEBUG] Network error:', { rasaUrl, error: error.message });
      rasaConnectionState = RasaConnectionState.DISCONNECTED;
    } else {
      Utils.logger.warn('❌ Rasa 伺服器連接失敗:', error.message || String(error));
      console.error('[DEBUG] Connection failed:', { rasaUrl, error: error.message, name: error.name });
      rasaConnectionState = RasaConnectionState.ERROR;
    }
    
    useRasa = false;
    rasaConnectionRetries++;
    console.log('[DEBUG] Returning false from checkRasaConnection:', { rasaConnectionState, useRasa, rasaConnectionRetries });// 如果是內網穿透但未設置 Rasa URL，顯示友好提示
    const hostname = window.location.hostname;
    const isTunnel = hostname.includes('loca.lt') || hostname.includes('ngrok.io');
    
    if (isTunnel) {
      console.log('ℹ️ 檢測到內網穿透服務，但未設置 Rasa 伺服器地址');
      console.log('💡 解決方法：');
      console.log('   1. 在 URL 中添加參數：?rasa_url=https://your-rasa-server.loca.lt');
      console.log('   2. 或在控制台執行：localStorage.setItem("nfu_rasa_server_url", "https://your-rasa-server.loca.lt")');
      console.log('   3. 然後重新載入頁面（按 F5）');
    } else {
      Utils.logger.log('ℹ️ Rasa 伺服器未啟動，使用本地處理模式');
    }
    
    return false;
  }
};
Utils.logger.log('✅ checkRasaConnection 已導出到 window');

// 導出其他必要的函數供測試和調試使用
window.getRasaServerURL = getRasaServerURL;
window.getRasaServerURLDynamic = getRasaServerURLDynamic;
window.sendToRasa = sendToRasa;
Utils.logger.log('✅ getRasaServerURL, getRasaServerURLDynamic, sendToRasa 已導出到 window');

/**
 * 診斷 Rasa 連接問題的工具函數
 */
window.diagnoseRasaConnection = async function diagnoseRasaConnection() {
  console.log('🔍 開始診斷 Rasa 連接...');
  console.log('='.repeat(50));
  
  // 1. 檢查 URL 設置
  const rasaUrl = getRasaServerURLDynamic();
  console.log('1️⃣ Rasa URL 檢查:');
  console.log('   URL:', rasaUrl || '❌ 未設置');
  
  if (!rasaUrl) {
    console.log('   ⚠️ 問題：Rasa URL 未設置');
    console.log('   💡 解決方法：');
    console.log('      - 在 URL 中添加參數：?rasa_url=http://localhost:5005');
    console.log('      - 或在控制台執行：localStorage.setItem("nfu_rasa_server_url", "http://localhost:5005")');
    return;
  }
  
  // 2. 檢查網絡連接
  console.log('\n2️⃣ 網絡連接檢查:');
  console.log('   在線狀態:', navigator.onLine ? '✅ 在線' : '❌ 離線');
  
  // 3. 測試 /status 端點
  console.log('\n3️⃣ 測試 /status 端點:');
  try {
    const statusController = new AbortController();
    const statusTimeout = setTimeout(() => statusController.abort(), 5000);
    
    const statusResponse = await fetch(`${rasaUrl}/status`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: statusController.signal
    });
    
    clearTimeout(statusTimeout);
    
    console.log('   HTTP 狀態:', statusResponse.status, statusResponse.statusText);
    
    if (statusResponse.ok) {
      const statusData = await statusResponse.json();
      console.log('   ✅ /status 端點可用');
      console.log('   響應數據:', statusData);
    } else {
      console.log('   ❌ /status 端點響應異常');
    }
  } catch (error) {
    console.log('   ❌ /status 端點測試失敗');
    console.log('   錯誤:', error.message);
    if (error.name === 'AbortError') {
      console.log('   ⚠️ 請求超時（5秒）');
    } else if (error.message.includes('Failed to fetch')) {
      console.log('   ⚠️ 無法連接到伺服器');
      console.log('   💡 可能的原因：');
      console.log('      - Rasa 伺服器未啟動');
      console.log('      - URL 錯誤');
      console.log('      - CORS 問題');
      console.log('      - 防火牆阻擋');
    }
  }
  
  // 4. 測試 /webhooks/rest/webhook 端點
  console.log('\n4️⃣ 測試 /webhooks/rest/webhook 端點:');
  try {
    const webhookController = new AbortController();
    const webhookTimeout = setTimeout(() => webhookController.abort(), 5000);
    
    const webhookUrl = buildRasaWebhookUrl(rasaUrl);
    const webhookResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: 'diagnostic_test_' + Date.now(),
        message: '你好'
      }),
      signal: webhookController.signal
    });
    
    clearTimeout(webhookTimeout);
    
    console.log('   HTTP 狀態:', webhookResponse.status, webhookResponse.statusText);
    
      if (webhookResponse.ok) {
        const responseText = await webhookResponse.text();
        console.log('   📄 原始響應內容:', responseText);
        console.log('   📄 響應長度:', responseText.length, '字符');
        
        let webhookData;
        try {
          webhookData = JSON.parse(responseText);
        } catch (parseError) {
          console.log('   ❌ 響應解析失敗:', parseError.message);
          console.log('   📄 原始響應:', responseText);
          return;
        }
        
        console.log('   ✅ /webhooks/rest/webhook 端點可用');
        console.log('   📊 響應數據類型:', typeof webhookData);
        console.log('   📊 響應數據:', JSON.stringify(webhookData, null, 2));
        
        if (Array.isArray(webhookData)) {
          if (webhookData.length > 0) {
            console.log('   ✅ 響應格式正確（數組，長度:', webhookData.length, '）');
            webhookData.forEach((item, index) => {
              console.log(`   📦 項目 ${index + 1}:`, JSON.stringify(item, null, 2));
            });
          } else {
            console.log('   ⚠️ 響應為空數組');
            console.log('   💡 可能的原因：');
            console.log('      1. Rasa 模型沒有匹配的意圖');
            console.log('      2. Rasa 動作沒有返回任何響應');
            console.log('      3. Rasa 配置問題（domain.yml 或 stories.yml）');
            console.log('      4. Rasa 會話狀態問題');
            console.log('   💡 建議：');
            console.log('      - 檢查 Rasa 伺服器日誌');
            console.log('      - 確認 Rasa 模型已正確訓練');
            console.log('      - 測試其他消息（如 "你好"、"greet"）');
          }
        } else if (webhookData && typeof webhookData === 'object') {
          console.log('   ⚠️ 響應是對象而不是數組');
          console.log('   📊 對象內容:', JSON.stringify(webhookData, null, 2));
        } else {
          console.log('   ⚠️ 響應格式異常（不是數組或對象）');
        }
      } else {
      console.log('   ❌ /webhooks/rest/webhook 端點響應異常');
      if (webhookResponse.status === 404) {
        console.log('   ⚠️ 端點不存在（404）');
      } else if (webhookResponse.status >= 500) {
        console.log('   ⚠️ 伺服器錯誤（' + webhookResponse.status + '）');
      }
    }
  } catch (error) {
    console.log('   ❌ /webhooks/rest/webhook 端點測試失敗');
    console.log('   錯誤:', error.message);
    if (error.name === 'AbortError') {
      console.log('   ⚠️ 請求超時（5秒）');
    }
  }
  
  // 5. 測試多個消息以檢查響應模式
  console.log('\n5️⃣ 測試多個消息:');
  const testMessages = [
    { msg: '你好', desc: '問候語' },
    { msg: '最近的廁所在哪', desc: '設施查詢' },
    { msg: 'greet', desc: '英文問候' }
  ];
  
  for (const test of testMessages) {
    try {
      console.log(`\n   測試消息: "${test.msg}" (${test.desc})`);
      const testWebhookUrl = buildRasaWebhookUrl(rasaUrl);
      const testResponse = await fetch(testWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: 'diagnostic_test_' + Date.now(),
          message: test.msg,
          metadata: {
            language: 'zh',
            timestamp: Date.now(),
            source: 'diagnostic'
          }
        })
      });
      
      if (testResponse.ok) {
        const responseText = await testResponse.text();
        let testData;
        try {
          testData = JSON.parse(responseText);
        } catch (e) {
          console.log(`   ❌ "${test.msg}" 響應解析失敗:`, e.message);
          console.log(`   📄 原始響應:`, responseText);
          continue;
        }
        
        if (Array.isArray(testData) && testData.length > 0) {
          console.log(`   ✅ "${test.msg}" 返回了響應（${testData.length} 條）`);
          testData.forEach((item, idx) => {
            console.log(`      ${idx + 1}.`, JSON.stringify(item));
          });
        } else {
          console.log(`   ⚠️ "${test.msg}" 返回空數組`);
        }
      } else {
        console.log(`   ❌ "${test.msg}" 請求失敗: ${testResponse.status}`);
      }
    } catch (error) {
      console.log(`   ❌ "${test.msg}" 測試失敗:`, error.message);
    }
  }
  
  // 6. 檢查當前連接狀態
  console.log('\n6️⃣ 當前連接狀態:');
  console.log('   連接狀態:', rasaConnectionState);
  console.log('   使用 Rasa:', useRasa);
  console.log('   重試次數:', rasaConnectionRetries);
  console.log('   最後檢查時間:', rasaLastHealthCheck ? new Date(rasaLastHealthCheck).toLocaleString() : '從未檢查');
  
  // 7. 檢查 Action Server 連接
  console.log('\n7️⃣ 檢查 Action Server:');
  // 根據環境自動選擇 Action Server URL
  const actionServerUrl = getActionServerURLDynamic();
  const hostname = window.location.hostname;
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  try {
    const actionController = new AbortController();
    const actionTimeout = setTimeout(() => actionController.abort(), 3000);
    
    const actionWebhookUrl = isLocalhost ? `${actionServerUrl}/webhook` : actionServerUrl;
    const actionResponse = await fetch(actionWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        next_action: 'action_listen',
        tracker: {
          latest_message: {
            text: 'test'
          }
        }
      }),
      signal: actionController.signal
    });
    
    clearTimeout(actionTimeout);
    
    if (actionResponse.ok) {
      console.log('   ✅ Action Server 正在運行');
      console.log('   📍 URL:', actionServerUrl);
    } else {
      console.log('   ⚠️ Action Server 響應異常:', actionResponse.status);
      console.log('   💡 這可能導致 webhook 返回空數組');
      console.log('   💡 解決方法：在終端執行 "rasa run actions"');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('   ⚠️ Action Server 連接超時');
    } else if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      console.log('   ❌ Action Server 未運行或無法連接');
      console.log('   📍 預期 URL:', actionServerUrl);
      console.log('   💡 這是導致 webhook 返回空數組的主要原因！');
      console.log('   💡 解決方法：');
      console.log('      1. 打開新的終端窗口');
      console.log('      2. 進入 rasa 目錄：cd rasa');
      console.log('      3. 啟動 Action Server：rasa run actions');
      console.log('      4. 確認 Action Server 運行在端口 5055');
    } else {
      console.log('   ❌ Action Server 檢查失敗:', error.message);
    }
  }
  
  // 8. 檢查 CORS 配置
  console.log('\n8️⃣ 檢查 CORS 配置:');
  try {
    // 嘗試發送 OPTIONS 請求檢查 CORS
    const corsWebhookUrl = buildRasaWebhookUrl(rasaUrl);
    const corsResponse = await fetch(corsWebhookUrl, {
      method: 'OPTIONS',
      headers: {
        'Origin': window.location.origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type'
      }
    });
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': corsResponse.headers.get('Access-Control-Allow-Origin'),
      'Access-Control-Allow-Methods': corsResponse.headers.get('Access-Control-Allow-Methods'),
      'Access-Control-Allow-Headers': corsResponse.headers.get('Access-Control-Allow-Headers')
    };
    
    if (corsHeaders['Access-Control-Allow-Origin']) {
      console.log('   ✅ CORS 已配置');
      console.log('   📊 CORS 標頭:', corsHeaders);
    } else {
      console.log('   ⚠️ 未檢測到 CORS 配置');
      console.log('   💡 如果遇到 CORS 錯誤，需要在 Rasa 的 credentials.yml 中配置：');
      console.log('      rest:');
      console.log('        cors_origins:');
      console.log('          - "*"  # 或指定具體域名');
    }
  } catch (corsError) {
    console.log('   ⚠️ CORS 檢查失敗:', corsError.message);
  }
  
  // 9. 檢查健康檢查機制
  console.log('\n9️⃣ 健康檢查機制:');
  console.log('   健康檢查間隔:', rasaHealthCheckInterval ? '運行中' : '未啟動');
  
  // 7. 建議
  console.log('\n💡 建議:');
  if (rasaConnectionState !== RasaConnectionState.CONNECTED) {
    console.log('   - 檢查 Rasa 伺服器是否正在運行');
    console.log('   - 確認 Rasa 伺服器地址是否正確');
    console.log('   - 檢查瀏覽器控制台是否有 CORS 錯誤');
    console.log('   - 嘗試手動執行：await checkRasaConnection(true)');
  } else {
    console.log('   ✅ 連接狀態正常');
  }
  
  console.log('='.repeat(50));
  console.log('✅ 診斷完成');
};

Utils.logger.log('✅ diagnoseRasaConnection 已導出到 window');

// 主題切換功能
const THEME_KEY = 'nfu_theme_mode';

// 已移除 system 模式，此函數不再使用
// function getSystemTheme() {
//   return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
//     ? 'dark'
//     : 'light';
// }

function applyThemeMode(mode) {
  // 只支持 dark 和 light，移除 system 模式
  const effectiveMode = mode === 'system' ? 'dark' : (mode === 'light' ? 'light' : 'dark');
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(effectiveMode === 'light' ? 'theme-light' : 'theme-dark');
  
  // 更新按鈕文字（根據當前語言）
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    const icons = {
      'dark': '🌙',
      'light': '☀️'
    };
    const themeText = currentLanguage === 'en' ? 'Theme' : '主題';
    themeBtn.textContent = `${icons[effectiveMode] || '🌙'} ${themeText}`;
  }
}

function toggleTheme() {
  const current = Utils.storage.getString(THEME_KEY, AppConfig.DEFAULTS.THEME);
  let nextMode;
  
  // 只在 dark 和 light 之間切換
  if (current === 'dark') {
    nextMode = 'light';
  } else {
    nextMode = 'dark';
  }
  
  Utils.storage.setString(THEME_KEY, nextMode);
  applyThemeMode(nextMode);
}

function initTheme() {
  const saved = Utils.storage.getString(THEME_KEY, AppConfig.DEFAULTS.THEME);
  applyThemeMode(saved);
}

// 事件監聽
// 請求通知權限
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        Utils.logger.log('通知權限已授予');
      }
    });
  }
}

// ============================================
// 全局錯誤處理（改進：錯誤邊界）
// ============================================

// 全局錯誤處理器（改進：過濾 CSP 錯誤和資源載入錯誤）
let errorDisplayed = false; // 防止重複顯示錯誤消息

window.addEventListener('error', (event) => {
  // 過濾掉資源載入錯誤（如圖片、CSS等），這些通常已經有備用處理
  if (event.target && (event.target.tagName === 'LINK' || event.target.tagName === 'SCRIPT' || event.target.tagName === 'IMG')) {
    // 資源載入錯誤已在其他地方處理，這裡只記錄警告
    if (Utils.logger.isDev()) {
      Utils.logger.warn('資源載入錯誤（已處理）:', event.target.href || event.target.src || '未知資源');
    }
    return; // 不處理資源載入錯誤
  }
  
  // 過濾掉 CSP (Content Security Policy) 錯誤
  if (event.message && (
    event.message.includes('Content Security Policy') ||
    event.message.includes('CSP') ||
    event.message.includes('violates the following Content Security Policy')
  )) {
    // CSP 錯誤只記錄，不顯示給用戶
    if (Utils.logger.isDev()) {
      Utils.logger.debug('CSP 錯誤（已忽略）:', event.message);
    }
    return;
  }
  
  // 過濾掉 data: URI 相關的 CSP 錯誤（常見於追蹤像素等）
  if (event.message && event.message.includes('data:')) {
    if (Utils.logger.isDev()) {
      Utils.logger.debug('Data URI 錯誤（已忽略）:', event.message);
    }
    return;
  }
  
  // 在初始化完成前，記錄錯誤但不顯示給用戶（避免干擾）
  // 但對於嚴重的錯誤（如語法錯誤），仍然需要記錄
  if (!AppState.initialized) {
    // 初始化期間的錯誤仍然記錄詳細信息，但不顯示給用戶
      const hasErrorInfo = event.message || event.filename || event.error;
      if (hasErrorInfo) {
      let errorDetails = {
        message: event.message || '未知錯誤',
        filename: event.filename || '未知文件',
        lineno: event.lineno || '未知行號',
        colno: event.colno || '未知列號'
      };
      
      if (event.error) {
        errorDetails.error = {
          name: event.error?.name,
          message: event.error?.message,
          stack: event.error?.stack
        };
      }
      
      // 記錄錯誤但不顯示給用戶（避免在初始化過程中干擾）
      console.error('[ERROR] 初始化期間的錯誤:', errorDetails);
      Utils.logger.debug('初始化期間的錯誤:', errorDetails);
      
      // 如果是嚴重的語法錯誤或引用錯誤，可能需要提前標記為已初始化
      // 以便錯誤處理器能夠正確處理後續錯誤
      if (event.error && (
        event.error.name === 'SyntaxError' || 
        event.error.name === 'ReferenceError' ||
        event.error.name === 'TypeError'
      )) {
        // 對於嚴重的錯誤，延遲標記為已初始化，讓錯誤處理器能夠處理
        setTimeout(() => {
          if (!AppState.initialized) {
            AppState.initialized = true;
            Utils.logger.warn('⚠️ 因嚴重錯誤提前標記為已初始化');
          }
        }, 2000);
      }
    }
    return;
  }
  
  // 只記錄有實際錯誤信息的錯誤
  const hasErrorInfo = event.message || event.filename || event.error;
  if (!hasErrorInfo) {
    // 沒有實際錯誤信息，可能是誤報，只記錄警告
    if (Utils.logger.isDev()) {
      Utils.logger.warn('捕獲到無詳細信息的錯誤事件（已忽略）');
    }
    return;
  }
  
  // 檢查是否為真正的 JavaScript 錯誤（必須有 error 對象或有效的錯誤消息）
  const isRealError = event.error && (
    event.error.stack || 
    event.error.message || 
    event.error.name
  );
  
  if (!isRealError && !event.message) {
    // 不是真正的錯誤，可能是誤報
    if (Utils.logger.isDev()) {
      Utils.logger.debug('非真正的錯誤事件（已忽略）:', event);
    }
    return;
  }
  
  // 記錄實際的 JavaScript 錯誤
  let errorInfo = '無堆疊信息';
  try {
    if (event.error) {
      if (event.error.stack) {
        errorInfo = event.error.stack;
      } else if (event.error.message) {
        errorInfo = event.error.message;
      } else if (typeof event.error.toString === 'function') {
        errorInfo = event.error.toString();
      } else if (typeof event.error === 'string') {
        errorInfo = event.error;
      } else {
        // 嘗試序列化錯誤對象
        try {
          errorInfo = JSON.stringify(event.error, Object.getOwnPropertyNames(event.error), 2);
        } catch (e) {
          errorInfo = String(event.error);
        }
      }
    }
  } catch (e) {
    // 如果獲取錯誤信息時出錯，使用默認值
    errorInfo = '無法解析錯誤信息';
  }
  
  // 提取更詳細的錯誤信息
  let errorDetails = {
    message: event.message || '未知錯誤',
    filename: event.filename || '未知文件',
    lineno: event.lineno || '未知行號',
    colno: event.colno || '未知列號'
  };
  
  // 如果有錯誤對象，提取更多信息
  if (event.error) {
    errorDetails.error = {
      name: event.error.name,
      message: event.error.message,
      stack: event.error.stack
    };
  } else if (errorInfo && errorInfo !== '無堆疊信息') {
    errorDetails.error = errorInfo;
  }
  
  // 記錄詳細錯誤信息
  console.error('[ERROR] 全局錯誤詳細信息:', errorDetails);
  Utils.logger.error('全局錯誤:', errorDetails);
  
  // 顯示用戶友好的錯誤提示（僅對實際的 JavaScript 錯誤，且避免重複顯示）
  // 確保 addMessage 函數已定義且頁面已初始化
  // 只有在初始化完成後才顯示錯誤消息，避免在初始化過程中干擾
  if (typeof addMessage === 'function' && AppState.initialized && event.error && !errorDisplayed) {
    // 設置標記，防止短時間內重複顯示
    errorDisplayed = true;
    setTimeout(() => {
      errorDisplayed = false;
    }, 5000); // 5 秒後重置標記
    
    try {
      // 確保消息容器存在
      const messagesContainer = document.getElementById('chat-messages');
      if (!messagesContainer) {
        Utils.logger.warn('消息容器不存在，跳過顯示錯誤消息');
        return;
      }
      
    const errorMsg = currentLanguage === 'en'
      ? 'An unexpected error occurred. Please refresh the page and try again.'
      : '發生未預期的錯誤。請重新整理頁面後再試。';
    addMessage(errorMsg, false);
    } catch (err) {
      // 如果 addMessage 也出錯，只記錄到控制台
      Utils.logger.error('顯示錯誤消息時出錯:', err);
    }
  }
  
  // 阻止默認的錯誤輸出（已記錄）
  event.preventDefault();
}, true);

// Promise 錯誤處理
window.addEventListener('unhandledrejection', (event) => {
  Utils.logger.error('未處理的 Promise 拒絕:', event.reason);
  
  // 顯示用戶友好的錯誤提示
  // 確保 addMessage 函數已定義且頁面已初始化
  if (typeof addMessage === 'function' && AppState.initialized) {
    try {
    const errorMsg = currentLanguage === 'en'
      ? 'A network error occurred. Please check your connection and try again.'
      : '發生網絡錯誤。請檢查您的連接後再試。';
    addMessage(errorMsg, false);
    } catch (err) {
      // 如果 addMessage 也出錯，只記錄到控制台
      Utils.logger.error('顯示錯誤消息時出錯:', err);
    }
  }
  
  // 阻止默認的錯誤輸出
  event.preventDefault();
});

// 頁面卸載時清理資源
// 清理函數（改進：內存管理）
function cleanupResources() {
  try {
    // 清理所有計時器
    Utils.timers.clearAll();
    
    // 清理 DOM 緩存
    Utils.dom.clearCache();
    
    // 清理所有事件監聽器
    Utils.events.clearAll();
    
    // 清理緩存（可選：保留部分緩存以提高性能）
    // Utils.cache.clear();
    
    // 清理地圖標記
    if (AppState.markers && AppState.markers.length > 0) {
      AppState.markers.forEach(marker => {
        try {
          if (AppState.map && AppState.map.hasLayer(marker)) {
            AppState.map.removeLayer(marker);
          }
        } catch (e) {
          Utils.logger.warn('清理標記時出錯:', e);
        }
      });
      AppState.markers = [];
    }
    
    // 清理地圖實例
    if (AppState.map) {
      try {
        AppState.map.remove();
      } catch (e) {
        Utils.logger.warn('清理地圖時出錯:', e);
      }
      AppState.map = null;
    }
    
    Utils.logger.log('✅ 資源清理完成');
  } catch (error) {
    Utils.logger.error('清理資源時發生錯誤:', error);
  }
}

window.addEventListener('beforeunload', function() {
  cleanupResources();
  // 清理所有定時器
  Utils.timers.clearAll();
  
  // 清理 DOM 緩存
  Utils.dom.clearCache();
  
  // 清理事件監聽器
  Utils.events.clearAll();
  
  // 清理請求緩存
  Utils.cache.clear();
  
  // 清理快速按鈕處理器
  if (window.quickButtonHandlers) {
    window.quickButtonHandlers.forEach((handler, btn) => {
      try {
        btn.removeEventListener('click', handler);
      } catch (e) {
        Utils.logger.warn('[Cleanup] 移除事件監聽器失敗:', e);
      }
    });
    window.quickButtonHandlers.clear();
  }
  
  // 重置應用狀態
  AppState.reset();
  
  Utils.logger.log('🧹 已清理頁面資源');
});

document.addEventListener('DOMContentLoaded', async function() {
  try {
  // 初始化應用狀態
  AppState.init();
  
  // 請求通知權限
  requestNotificationPermission();
  Utils.logger.log('📄 AI 頁面 DOM 載入完成，開始初始化...');
  
  // 檢查 Leaflet 是否已載入
  if (typeof L === 'undefined') {
    Utils.logger.error('❌ Leaflet 庫未載入！');
    const loadingEl = document.getElementById('map-loading');
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      loadingEl.innerHTML = '<div class="spinner"></div><div>地圖庫載入失敗，請重新整理頁面</div>';
    }
    return;
  }
  
  // 初始化主題
  initTheme();
  
  // 確保測試數據已初始化
    Utils.logger.log('🔧 初始化 AI 測試數據...');
  initAITestData();
  
  // 重新載入設施數據
  const updatedFacilities = loadFacilities();
  Utils.logger.log('📊 AI 設施數據:', updatedFacilities);
  
  // 初始化地圖（延遲一點確保 DOM 準備好）
  Utils.timers.setTimeout(function() {
    try {
      Utils.logger.log('🗺️ 開始初始化 AI 地圖...');
      initAIMap();
      Utils.logger.log('✅ AI 地圖初始化完成');
    } catch (error) {
      Utils.logger.error('❌ AI 地圖初始化錯誤:', error);
      const loadingEl = document.getElementById('map-loading');
      if (loadingEl) {
        loadingEl.style.display = 'flex';
        loadingEl.textContent = '';
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        const errorMsg = document.createElement('div');
        errorMsg.textContent = '地圖載入失敗';
        loadingEl.appendChild(spinner);
        loadingEl.appendChild(errorMsg);
      }
    }
  }, 300);

  // 更新 Rasa URL（支持動態更新）
  RASA_SERVER_URL = getRasaServerURLDynamic();
  
  // 檢查 Rasa 連接
  Utils.logger.log('🔍 開始檢查 Rasa 連接...');
  const rasaUrl = getRasaServerURLDynamic();
  Utils.logger.log('📍 Rasa URL:', rasaUrl || '未設置');
  
  const rasaConnected = await checkRasaConnection(true); // 強制檢查// 顯示連接狀態給用戶（統一處理，避免重複）
  if (rasaConnected) {
    Utils.logger.log('✅ Rasa AI 已成功連接');
    Utils.logger.log('📊 連接狀態:', rasaConnectionState);
    Utils.logger.log('🔗 使用 Rasa:', useRasa);
    // 不再自動執行測試請求，避免產生不必要的日誌
    // 如果需要測試連接，可以在控制台執行 await diagnoseRasaConnection()
    Utils.logger.log('💡 提示：如需測試連接，可在控制台執行 await diagnoseRasaConnection()');
  } else {
    Utils.logger.warn('⚠️ Rasa AI 未連接，使用本地處理模式');
    Utils.logger.log('📊 連接狀態:', rasaConnectionState);
    Utils.logger.log('🔗 使用 Rasa:', useRasa);
    Utils.logger.log('📈 重試次數:', rasaConnectionRetries);
    Utils.logger.warn('💡 建議：在控制台執行 await diagnoseRasaConnection() 進行詳細診斷');// 不再顯示提示消息，避免在頁面載入時顯示
  }
  
  // 初始化語言
  initLanguage();
  
  // 標記初始化完成（在錯誤處理器啟用前）
  // 使用 setTimeout 確保所有初始化代碼都執行完畢後再標記為已初始化
  setTimeout(() => {
  AppState.initialized = true;
    Utils.logger.log('✅ 頁面初始化完成');
  }, 100);
  
  if (rasaConnected && useRasa) {
    Utils.logger.log('✅ 已連接到 Rasa 伺服器');
    // 不再顯示連接成功訊息
  } else {
    Utils.logger.log('ℹ️ 使用本地處理模式（Rasa 伺服器未啟動）');
    useRasa = false; // 確保 useRasa 變量正確設置
  }
  
  // 語言切換按鈕
  const languageBtn = document.getElementById('language-toggle-btn');
  if (languageBtn) {
    Utils.events.on(languageBtn, 'click', toggleLanguage);
  }

  // 主題切換按鈕
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    Utils.events.on(themeBtn, 'click', toggleTheme);
  }

  // 輸入框事件（優化版：添加防抖和錯誤處理、鍵盤導航，使用 DOM 緩存）
  const chatInput = Utils.dom.get('chat-input');
  const sendBtn = Utils.dom.get('send-btn');
  
  // 可訪問性：為輸入框添加鍵盤導航提示
  if (chatInput) {
    chatInput.setAttribute('aria-describedby', 'chat-input-description');
    // 支持 Escape 鍵清除輸入
    Utils.events.on(chatInput, 'keydown', function(e) {
      if (e.key === 'Escape') {
        chatInput.value = '';
        chatInput.blur();
        // 隱藏自動完成建議
        hideAutocomplete();
      }
    });
    
    // 初始化輸入增強功能
    initInputEnhancements(chatInput);
  }

  // 防抖的發送函數（防止重複提交，使用性能優化工具）
  let isSending = false;
  const sendMessage = Utils.performance.debounce(function() {
    if (isSending) {
      Utils.logger.log('⏳ 正在處理中，請稍候...');
      return;
    }
    
    const query = chatInput?.value?.trim();
    if (!query) {
      // 空輸入時的視覺反饋
      if (chatInput) {
        chatInput.style.animation = 'shake 0.3s';
        Utils.timers.setTimeout(() => {
          if (chatInput) chatInput.style.animation = '';
        }, 300);
      }
      return;
    }
    
    try {
      isSending = true;
      
      // 添加按鈕點擊反饋
      if (sendBtn) {
        sendBtn.style.transform = 'scale(0.95)';
        sendBtn.disabled = true;
        setTimeout(() => {
          if (sendBtn) {
            sendBtn.style.transform = '';
            sendBtn.disabled = false;
          }
        }, 150);
      }
      
      // 清空輸入框
      if (chatInput) {
        chatInput.value = '';
      }
      
      // 處理用戶輸入
      if (typeof handleUserInput === 'function') {
        handleUserInput(query).finally(() => {
          isSending = false;
          // 聚焦輸入框以便繼續輸入
          if (chatInput) {
            setTimeout(() => {
              chatInput.focus();
            }, 100);
          }
        });
      } else {
        Utils.logger.error('handleUserInput 函數不存在');
        isSending = false;
      }
    } catch (error) {
      Utils.logger.error('發送消息時出錯:', error);
      isSending = false;
      if (sendBtn) sendBtn.disabled = false;
      Utils.error.handle(error, 'sendMessage');
    }
  }, 300); // 300ms 防抖延遲

  if (sendBtn) {
    Utils.events.on(sendBtn, 'click', sendMessage);
  }
  
  if (chatInput) {
    Utils.events.on(chatInput, 'keypress', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    
    // 支持 Ctrl+Enter 或 Cmd+Enter 發送
    Utils.events.on(chatInput, 'keydown', function(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // 快速按鈕（優化版：避免重複綁定和內存洩漏）
  const quickButtons = document.querySelectorAll('.quick-btn');
  const quickButtonHandlers = new Map(); // 存儲處理函數以便清理
  
  quickButtons.forEach((btn, index) => {
    // 使用命名函數以便移除
    const handler = function(e) {
      e.preventDefault();
      e.stopPropagation();
      
      // 防止重複點擊
      if (btn.disabled) {
        return;
      }
      
      try {
        const query = btn.getAttribute('data-query');
        const btnId = btn.getAttribute('id');
        
        if (query) {
          if (typeof handleUserInput === 'function') {
            // 防止重複提交
            btn.disabled = true;
            handleUserInput(query).finally(() => {
              btn.disabled = false;
            });
          }
        }
      } catch (error) {
        Utils.logger.error('快速按鈕處理錯誤:', error);
        btn.disabled = false;
      }
    };
    
    btn.addEventListener('click', handler, { passive: false });
    quickButtonHandlers.set(btn, handler);
  });
  
  // 存儲處理函數映射以便清理
  window.quickButtonHandlers = quickButtonHandlers;

  // 定位按鈕
  const locationBtn = document.getElementById('location-btn');
  if (locationBtn) {
    locationBtn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      getCurrentLocation(true);
    });
  }

  // 校區選擇
  const campusSelect = document.getElementById('map-campus-select');
  if (campusSelect) {
    campusSelect.addEventListener('change', function() {
      const selectedCampus = this.value;
      if (selectedCampus && campusLocations[selectedCampus]) {
        const campusInfo = campusLocations[selectedCampus];
        if (aiMap) {
    aiMap.setView(campusInfo.center, campusInfo.zoom);
        }
      }
      // 更新建築物顯示（根據校區過濾）
      if (typeof updateBuildingMarkers === 'function') {
        updateBuildingMarkers();
      }
    });
  }

  // 查看地圖按鈕
  const viewMapBtn = document.getElementById('view-map-btn');
  if (viewMapBtn) {
    viewMapBtn.addEventListener('click', function() {
    window.location.href = 'index.html';
  });
  }

  // 設備問題回報表單事件
  const issueForm = document.getElementById('issue-form');
  const issueCancelBtn = document.getElementById('issue-cancel-btn');
  const issueCloseBtn = document.getElementById('issue-form-close-btn');

  if (issueForm) {
    issueForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      
      // 在驗證前，移除所有隱藏欄位的 required 屬性，避免瀏覽器驗證錯誤
      const genderRow = document.getElementById('issue-gender-row');
      const genderSelect = document.getElementById('issue-gender');
      if (genderRow && genderRow.style.display === 'none' && genderSelect) {
        genderSelect.removeAttribute('required');
      } else if (genderRow && genderRow.style.display !== 'none' && genderSelect) {
        genderSelect.setAttribute('required', 'required');
      }
      
      // 獲取表單元素和值
      const campusSelect = document.getElementById('issue-campus');
      const buildingSelect = document.getElementById('issue-building');
      const floorInput = document.getElementById('issue-floor');
      const statusSelect = document.getElementById('issue-status');
      const remarkInput = document.getElementById('issue-remark');
      const facilityIdInput = document.getElementById('issue-facility-id');
      const photoBase64Input = document.getElementById('issue-photo-base64');
      
      const campus = campusSelect ? campusSelect.value : '';
      const building = buildingSelect ? buildingSelect.value.trim() : '';
      const floor = floorInput ? floorInput.value.trim() : '';
      const status = statusSelect ? statusSelect.value.trim() : '';
      const gender = genderSelect ? genderSelect.value.trim() : '';
      const remark = remarkInput ? remarkInput.value.trim() : '';
      const facilityId = facilityIdInput ? facilityIdInput.value : '';
      const photoBase64 = photoBase64Input ? photoBase64Input.value.trim() : '';
      
      // 檢查是否為廁所（通過檢查性別欄位是否顯示）
      const isToilet = genderRow && genderRow.style.display !== 'none';

      // 驗證必填欄位
      if (!campus || !building || !floor || !status) {
        const errorMsg = currentLanguage === 'en' 
          ? 'Please complete all required fields (Campus, Building, Floor, and Status) before submitting the report.'
          : '請完整填寫「校區」、「建築」、「樓層」與「設施狀態」後再送出回報。';
        addMessage(errorMsg, false);
        return;
      }
      
      // 如果是廁所，驗證類型
      if (isToilet && !gender) {
        const errorMsg = currentLanguage === 'en' 
          ? 'Please select the type of restroom before submitting the report.'
          : '請選擇廁所類型後再送出回報。';
        addMessage(errorMsg, false);
        return;
      }
      
      // 處理舊值「無性別」，轉換為「性別友善」
      if (gender === '無性別') {
        gender = '性別友善';
      }

      // 標準化樓層格式
      let floorNormalized = floor.trim();
      if (floorNormalized && !floorNormalized.toUpperCase().endsWith('F')) {
        floorNormalized = floorNormalized + 'F';
      }

      const campusText = campus === 'campus1' ? t('campus1') : 
                         campus === 'campus2' ? t('campus2') : t('campus3');

      // 構建發送給AI的消息（包含狀態）
      const statusText = status ? (currentLanguage === 'en' 
        ? (status === '正常' ? 'Normal' : status === '部分損壞' ? 'Partially Damaged' : status === '待清潔' ? 'Needs Cleaning' : 'Unavailable')
        : status) : '';
      
      const genderText = gender ? (currentLanguage === 'en' 
        ? (gender === '男' ? 'Men\'s' : gender === '女' ? 'Women\'s' : 'Unisex')
        : gender) : '';
      
      const reportMessage = currentLanguage === 'en'
        ? `Report facility status: Campus ${campusText}, Building ${building}, Floor ${floorNormalized}.${genderText ? ` Gender: ${genderText}.` : ''}${statusText ? ` Status: ${statusText}.` : ''}${remark ? ` Note: ${remark}` : ''}${photoBase64 ? ' [Photo attached]' : ''}`
        : `回報設施狀態：校區${campusText}，建築${building}，樓層${floorNormalized}。${genderText ? `性別：${genderText}。` : ''}${statusText ? `狀態：${statusText}。` : ''}${remark ? `備註：${remark}` : ''}${photoBase64 ? ' [已附加照片]' : ''}`;

      // 顯示提交按鈕loading狀態
      const submitBtn = issueForm.querySelector('button[type="submit"]');
      const originalSubmitText = submitBtn ? submitBtn.textContent : '';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = currentLanguage === 'en' ? '⏳ Submitting...' : '⏳ 提交中...';
        submitBtn.style.opacity = '0.6';
        submitBtn.style.cursor = 'not-allowed';
      }
      
      // 清除自動保存的表單數據（已提交）
      clearFormAutoSave();
      
      // 關閉表單（在更新狀態之前關閉，避免重複彈出）
      closeIssueForm();

      // 設置標記，防止 AI 響應時再次打開表單
      if (!window.formSubmissionInProgress) {
        window.formSubmissionInProgress = true;
      }

      // 直接更新設施狀態（不發送給 AI，避免重複處理）
      try {
        // 確定設施類型
        let facilityType = 'trash'; // 默認為垃圾桶
        if (isToilet) {
          facilityType = 'toilet';
        } else if (facilityId) {
          // 如果有 facilityId，從設施數據中獲取類型
          const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
          const allFacilities = [
            ...(facilityData.campus1 || []),
            ...(facilityData.campus2 || []),
            ...(facilityData.campus3 || [])
          ];
          const facility = allFacilities.find(f => f.id === facilityId);
          if (facility) {
            facilityType = facility.type || 'trash';
          }
        }
        
        // 獲取原始設施數據
        const facilityData = window.AI_FACILITY_DATA || facilities || AppState.facilities || loadFacilities();
        const allFacilities = [
          ...(facilityData.campus1 || []),
          ...(facilityData.campus2 || []),
          ...(facilityData.campus3 || [])
        ];
        
        // 如果有 facilityId，直接使用它來查找設施
        let matchingFacilities = [];
        if (facilityId) {
          const facility = allFacilities.find(f => f.id === facilityId);
          if (facility) {
            matchingFacilities = [facility];
            facilityType = facility.type || facilityType; // 更新設施類型
          }
        }
        
        // 如果沒有找到，根據建築、樓層、類型、性別匹配
        if (matchingFacilities.length === 0) {
          // 先嘗試所有類型，找到匹配的設施
          const candidates = allFacilities.filter(f => {
            const buildingMatch = f.building === building || 
                                 f.building?.includes(building) || 
                                 building.includes(f.building);
            const floorMatch = f.floor === floorNormalized || 
                              f.floor?.includes(floorNormalized) || 
                              floorNormalized.includes(f.floor);
            const genderMatch = !isToilet || !gender || f.gender === gender || 
                               (gender === '性別友善' && (f.gender === '性別友善' || f.gender === '無性別'));
            return buildingMatch && floorMatch && genderMatch;
          });
          
          // 如果只有一個候選，使用它；否則優先選擇廁所（如果 isToilet 為 true）
          if (candidates.length === 1) {
            matchingFacilities = candidates;
            facilityType = candidates[0].type || facilityType; // 更新設施類型
          } else if (candidates.length > 1) {
            if (isToilet) {
              matchingFacilities = candidates.filter(f => f.type === 'toilet');
              facilityType = 'toilet';
            } else {
              // 優先選擇垃圾桶或飲水機（根據候選數量判斷）
              const trashCandidates = candidates.filter(f => f.type === 'trash');
              const waterCandidates = candidates.filter(f => f.type === 'water');
              if (trashCandidates.length > 0) {
                matchingFacilities = trashCandidates;
                facilityType = 'trash';
              } else if (waterCandidates.length > 0) {
                matchingFacilities = waterCandidates;
                facilityType = 'water';
              } else {
                matchingFacilities = candidates;
                facilityType = candidates[0]?.type || facilityType; // 使用第一個候選的類型
              }
            }
          }
        }
        
        if (matchingFacilities.length > 0) {
          // 更新所有匹配的設施
          const facilityIds = matchingFacilities.map(f => f.id);
          
          ['campus1', 'campus2', 'campus3'].forEach(campusKey => {
            const campusFacilities = facilityData[campusKey] || [];
            campusFacilities.forEach(facility => {
              if (facilityIds.includes(facility.id)) {
                const oldStatus = facility.status || '正常';
                facility.status = status;
                facility.updatedAt = new Date().toISOString();
                
                if (remark) {
                  if (!facility.notes) facility.notes = [];
                  facility.notes.push({
                    text: remark,
                    timestamp: facility.updatedAt,
                    severity: 'minor'
                  });
                }
                
                Utils.logger.log(`✅ 更新設施狀態: ${facility.building} ${facility.floor} - ${oldStatus} → ${status}`);
              }
            });
          });
          
          // 同步更新全局變量
          if (facilities) {
            ['campus1', 'campus2', 'campus3'].forEach(campusKey => {
              if (facilities[campusKey]) {
                facilities[campusKey] = facilityData[campusKey];
              }
            });
          }
          
          AppState.facilities = facilityData;
          window.AI_FACILITY_DATA = facilityData;
          
          // 保存到 localStorage
          Utils.storage.set(AppConfig.STORAGE_KEYS.FACILITIES, facilityData);
          
          // 使用 BroadcastChannel 通知其他標籤頁
          if (typeof BroadcastChannel !== 'undefined') {
            const channel = new BroadcastChannel('facility_updates');
            matchingFacilities.forEach(facility => {
              channel.postMessage({
                type: 'status_update',
                facilityId: facility.id,
                oldStatus: facility.status,
                newStatus: status,
                timestamp: facility.updatedAt
              });
            });
          }
          
          // 更新地圖顯示
          loadAndDisplayFacilities();
          
          // 顯示成功訊息
          const statusInfo = getStatusInfo(status, currentLanguage);
          const statusColor = getStatusColor(status);
          const facilityName = facilityType === 'toilet' 
            ? (currentLanguage === 'en' ? 'restroom' : '廁所')
            : facilityType === 'water'
            ? (currentLanguage === 'en' ? 'water fountain' : '飲水機')
            : (currentLanguage === 'en' ? 'trash can' : '垃圾桶');
          
          const successMsg = currentLanguage === 'en'
            ? `✅ Successfully updated ${matchingFacilities.length} ${facilityName}(s)!<br><br>
               📍 <strong>${campusText} - ${building} ${floorNormalized}</strong><br>
               <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} Status: ${statusInfo.text}</span><br>
               ${remark ? `<br>📝 Note: ${remark}` : ''}<br><br>
               The map has been updated in real-time.`
            : `✅ 已成功更新 ${matchingFacilities.length} 個${facilityName}！<br><br>
               📍 <strong>${campusText} - ${building} ${floorNormalized}</strong><br>
               <span style="color: ${statusColor}; font-weight: bold;">${statusInfo.icon} 狀態：${statusInfo.text}</span><br>
               ${remark ? `<br>📝 備註：${remark}` : ''}<br><br>
               地圖已即時更新。`;
          
          addMessage(successMsg, false);
          
          // 在地圖上高亮顯示更新的設施
          if (aiMap && matchingFacilities.length > 0) {
            const firstFacility = matchingFacilities[0];
            if (AppState.map) {
              AppState.map.setView([firstFacility.lat, firstFacility.lng], 19);
            }
          }
        } else {
          // 如果找不到匹配的設施，顯示警告訊息
          const warningMsg = currentLanguage === 'en'
            ? `⚠️ Could not find matching facility at ${building} ${floorNormalized}. The report has been recorded but the status was not updated.`
            : `⚠️ 找不到 ${building} ${floorNormalized} 的匹配設施。回報已記錄，但狀態未更新。`;
          addMessage(warningMsg, false);
        }
      } catch (error) {
        Utils.logger.error('更新設施狀態時出錯:', error);
        const errorMsg = currentLanguage === 'en'
          ? '❌ Failed to update facility status. Please try again.'
          : '❌ 更新設施狀態失敗，請重試。';
        addMessage(errorMsg, false);
      } finally {
        // 恢復提交按鈕狀態
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = originalSubmitText;
          submitBtn.style.opacity = '1';
          submitBtn.style.cursor = 'pointer';
        }
        
        // 清除標記（延遲清除，確保 AI 響應不會再次打開表單）
        setTimeout(() => {
          window.formSubmissionInProgress = false;
        }, 3000);
      }
    });
  }

  if (issueCancelBtn) {
    Utils.events.on(issueCancelBtn, 'click', function(e) {
      e.preventDefault();
      closeIssueForm();
    });
  }

  if (issueCloseBtn) {
    Utils.events.on(issueCloseBtn, 'click', function(e) {
      e.preventDefault();
      closeIssueForm();
    });
  }
  } catch (error) {
    Utils.logger.error('❌ 頁面初始化錯誤:', error);
    
    // 顯示友好的錯誤提示（在標記為已初始化之前）
    if (typeof addMessage === 'function') {
      try {
        // 確保消息容器存在
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
          const errorMsg = currentLanguage === 'en'
            ? '⚠️ An error occurred during initialization. Some features may not work properly. Please refresh the page.'
            : '⚠️ 初始化時發生錯誤，部分功能可能無法正常使用。請重新整理頁面。';
          addMessage(errorMsg, false);
        }
      } catch (err) {
        // 如果 addMessage 也出錯，只記錄到控制台
        Utils.logger.error('顯示錯誤消息時出錯:', err);
      }
    }
    
    // 確保即使出錯也標記為已初始化，避免錯誤處理器重複顯示錯誤
    // 使用 requestAnimationFrame 確保錯誤消息已顯示後再標記為已初始化
    requestAnimationFrame(() => {
      AppState.initialized = true;
      Utils.logger.log('✅ 頁面初始化完成（發生錯誤但已處理）');
    });
  }
});

