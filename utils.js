/**
 * 工具函數庫
 * 提供統一的錯誤處理、數據驗證、用戶反饋等功能
 */

// ==================== 錯誤處理 ====================

/**
 * 統一的錯誤處理函數
 * @param {Error} error - 錯誤對象
 * @param {string} context - 錯誤上下文（用於日誌）
 * @param {string} userMessage - 顯示給用戶的錯誤訊息（可選）
 * @param {string} language - 語言 ('zh' 或 'en')
 */
function handleError(error, context = '', userMessage = null, language = 'zh') {
  // 記錄錯誤到控制台（使用統一的日誌系統，如果可用）
  if (typeof window !== 'undefined' && window.Utils && window.Utils.logger) {
    window.Utils.logger.error(`[${context}]`, error);
  } else {
    console.error(`[${context}]`, error);
  }
  
  // 顯示用戶友好的錯誤訊息
  const message = userMessage || getDefaultErrorMessage(error, language);
  showToast(message, 'error', language);
  
  // 可以在此處添加錯誤報告功能（如發送到服務器）
  // reportErrorToServer(error, context);
}

/**
 * 獲取默認錯誤訊息
 */
function getDefaultErrorMessage(error, language = 'zh') {
  const messages = {
    zh: {
      network: '網絡連接失敗，請檢查您的網絡連接。',
      timeout: '請求超時，請稍後再試。',
      permission: '權限被拒絕，請允許瀏覽器存取相關權限。',
      notFound: '找不到請求的資源。',
      server: '服務器錯誤，請稍後再試。',
      unknown: '發生未知錯誤，請稍後再試。'
    },
    en: {
      network: 'Network connection failed. Please check your network connection.',
      timeout: 'Request timeout. Please try again later.',
      permission: 'Permission denied. Please allow browser access to relevant permissions.',
      notFound: 'Requested resource not found.',
      server: 'Server error. Please try again later.',
      unknown: 'An unknown error occurred. Please try again later.'
    }
  };
  
  const lang = language === 'en' ? 'en' : 'zh';
  
  if (error.message) {
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return messages[lang].network;
    }
    if (error.message.includes('timeout')) {
      return messages[lang].timeout;
    }
    if (error.message.includes('permission') || error.message.includes('denied')) {
      return messages[lang].permission;
    }
    if (error.message.includes('404') || error.message.includes('not found')) {
      return messages[lang].notFound;
    }
    if (error.message.includes('500') || error.message.includes('server')) {
      return messages[lang].server;
    }
  }
  
  return messages[lang].unknown;
}

// ==================== 數據驗證 ====================

/**
 * 驗證設施數據
 * @param {Object} facility - 設施對象
 * @param {string} language - 語言
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateFacility(facility, language = 'zh') {
  const errors = [];
  const lang = language === 'en' ? 'en' : 'zh';
  
  const messages = {
    zh: {
      typeRequired: '設施類型是必填項',
      buildingRequired: '建築名稱是必填項',
      floorRequired: '樓層是必填項',
      genderRequired: '性別是必填項（廁所必須選擇性別）',
      statusRequired: '設施狀況是必填項',
      locationRequired: 'GPS 位置是必填項',
      photosRequired: '至少需要上傳一張照片',
      invalidType: '無效的設施類型',
      invalidGender: '無效的性別選項',
      invalidStatus: '無效的設施狀況',
      invalidLat: '無效的緯度',
      invalidLng: '無效的經度',
      photoSize: '照片大小不能超過 5MB',
      photoFormat: '照片格式必須是 JPG、PNG 或 WEBP'
    },
    en: {
      typeRequired: 'Facility type is required',
      buildingRequired: 'Building name is required',
      floorRequired: 'Floor is required',
      genderRequired: 'Gender is required (restroom must select gender)',
      statusRequired: 'Facility status is required',
      locationRequired: 'GPS location is required',
      photosRequired: 'At least one photo is required',
      invalidType: 'Invalid facility type',
      invalidGender: 'Invalid gender option',
      invalidStatus: 'Invalid facility status',
      invalidLat: 'Invalid latitude',
      invalidLng: 'Invalid longitude',
      photoSize: 'Photo size cannot exceed 5MB',
      photoFormat: 'Photo format must be JPG, PNG, or WEBP'
    }
  };
  
  const msg = messages[lang];
  
  // 驗證設施類型
  if (!facility.type || !['toilet', 'water', 'trash'].includes(facility.type)) {
    errors.push(msg.invalidType);
  }
  
  // 驗證建築名稱
  if (!facility.building || facility.building.trim() === '') {
    errors.push(msg.buildingRequired);
  }
  
  // 驗證樓層
  if (!facility.floor || facility.floor.trim() === '') {
    errors.push(msg.floorRequired);
  }
  
  // 驗證性別（廁所必須有性別）
  if (facility.type === 'toilet') {
    if (!facility.gender || !['男', '女', '男女共用'].includes(facility.gender)) {
      errors.push(msg.genderRequired);
    }
  }
  
  // 驗證設施狀況
  const validStatuses = ['正常', '維修中', '故障', '暫停使用', '無法使用', '滿出', '清潔中', '部分損壞'];
  if (!facility.status || !validStatuses.includes(facility.status)) {
    errors.push(msg.statusRequired);
  }
  
  // 驗證 GPS 位置
  if (typeof facility.lat !== 'number' || typeof facility.lng !== 'number') {
    errors.push(msg.locationRequired);
  } else {
    if (facility.lat < -90 || facility.lat > 90) {
      errors.push(msg.invalidLat);
    }
    if (facility.lng < -180 || facility.lng > 180) {
      errors.push(msg.invalidLng);
    }
  }
  
  // 驗證照片
  if (!facility.photos || facility.photos.length === 0) {
    errors.push(msg.photosRequired);
  }
  
  return {
    valid: errors.length === 0,
    errors: errors
  };
}

/**
 * 驗證照片文件
 * @param {File} file - 照片文件
 * @param {string} language - 語言
 * @returns {Object} { valid: boolean, error: string|null }
 */
function validatePhotoFile(file, language = 'zh') {
  const lang = language === 'en' ? 'en' : 'zh';
  const maxSize = 5 * 1024 * 1024; // 5MB
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  
  const messages = {
    zh: {
      tooLarge: '照片大小不能超過 5MB',
      invalidFormat: '照片格式必須是 JPG、PNG 或 WEBP',
      noFile: '請選擇照片文件'
    },
    en: {
      tooLarge: 'Photo size cannot exceed 5MB',
      invalidFormat: 'Photo format must be JPG, PNG, or WEBP',
      noFile: 'Please select a photo file'
    }
  };
  
  const msg = messages[lang];
  
  if (!file) {
    return { valid: false, error: msg.noFile };
  }
  
  if (file.size > maxSize) {
    return { valid: false, error: msg.tooLarge };
  }
  
  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: msg.invalidFormat };
  }
  
  return { valid: true, error: null };
}

// ==================== 用戶反饋 ====================

/**
 * 顯示 Toast 通知
 * @param {string} message - 訊息內容
 * @param {string} type - 類型 ('success', 'error', 'warning', 'info')
 * @param {string} language - 語言
 * @param {number} duration - 顯示時長（毫秒）
 */
function showToast(message, type = 'info', language = 'zh', duration = 3000) {
  // 創建 toast 元素
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  // 添加樣式
  Object.assign(toast.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    padding: '12px 24px',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    zIndex: '10000',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    animation: 'slideInRight 0.3s ease-out',
    maxWidth: '400px',
    wordWrap: 'break-word'
  });
  
  // 根據類型設置背景色
  const colors = {
    success: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    error: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    warning: 'linear-gradient(135deg, #ffc837 0%, #ff8008 100%)',
    info: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)'
  };
  
  toast.style.background = colors[type] || colors.info;
  
  // 添加到頁面
  document.body.appendChild(toast);
  
  // 自動移除
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, duration);
  
  // 添加點擊關閉功能
  toast.addEventListener('click', () => {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  });
}

/**
 * 顯示確認對話框
 * @param {string} message - 確認訊息
 * @param {string} language - 語言
 * @returns {Promise<boolean>} 用戶是否確認
 */
function showConfirm(message, language = 'zh') {
  return new Promise((resolve) => {
    const lang = language === 'en' ? 'en' : 'zh';
    const messages = {
      zh: {
        confirm: '確認',
        cancel: '取消'
      },
      en: {
        confirm: 'Confirm',
        cancel: 'Cancel'
      }
    };
    
    const msg = messages[lang];
    const result = window.confirm(message);
    resolve(result);
  });
}

// ==================== 數據處理 ====================

/**
 * 安全地解析 JSON
 * @param {string} jsonString - JSON 字符串
 * @param {any} defaultValue - 默認值
 * @returns {any} 解析結果或默認值
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    if (typeof window !== 'undefined' && window.Utils && window.Utils.logger) {
      window.Utils.logger.warn('JSON 解析失敗:', error);
    } else {
      console.warn('JSON 解析失敗:', error);
    }
    return defaultValue;
  }
}

/**
 * 深拷貝對象
 * @param {any} obj - 要拷貝的對象
 * @returns {any} 拷貝後的對象
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 防抖函數
 * @param {Function} func - 要執行的函數
 * @param {number} wait - 等待時間（毫秒）
 * @returns {Function} 防抖後的函數
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 節流函數
 * @param {Function} func - 要執行的函數
 * @param {number} limit - 時間限制（毫秒）
 * @returns {Function} 節流後的函數
 */
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ==================== 格式化 ====================

/**
 * 格式化日期時間
 * @param {Date|string} date - 日期對象或字符串
 * @param {string} language - 語言
 * @returns {string} 格式化後的日期字符串
 */
function formatDateTime(date, language = 'zh') {
  const d = date instanceof Date ? date : new Date(date);
  const lang = language === 'en' ? 'en' : 'zh';
  
  if (lang === 'en') {
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    return d.toLocaleString('zh-TW', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

/**
 * 格式化距離
 * @param {number} distance - 距離（米）
 * @param {string} language - 語言
 * @returns {string} 格式化後的距離字符串
 */
function formatDistance(distance, language = 'zh') {
  const lang = language === 'en' ? 'en' : 'zh';
  
  if (distance < 1000) {
    return lang === 'en' ? `${Math.round(distance)}m` : `${Math.round(distance)} 米`;
  } else {
    const km = (distance / 1000).toFixed(1);
    return lang === 'en' ? `${km}km` : `${km} 公里`;
  }
}

// ==================== 動畫樣式 ====================

// 添加 Toast 動畫樣式（如果尚未添加）
if (!document.getElementById('toast-styles')) {
  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    @keyframes slideInRight {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
    
    @keyframes slideOutRight {
      from {
        transform: translateX(0);
        opacity: 1;
      }
      to {
        transform: translateX(100%);
        opacity: 0;
      }
    }
  `;
  document.head.appendChild(style);
}

