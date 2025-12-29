/**
 * 校園地圖系統 - 主腳本
 * 功能：地圖顯示、設施管理、搜索篩選、多語言支持
 */

// ==================== 全局變量 ====================
let map; // Leaflet 地圖實例
let markers = []; // 地圖標記數組
let activeTypes = ['toilet', 'water', 'trash']; // 當前激活的設施類型
let currentCampus = 'campus1'; // 當前選中的校區
// 搜索功能已移除
let statusFilter = 'all'; // 狀態篩選（'all' 表示全部）

// 語言設定（統一使用 Utils 工具函數）
const LANGUAGE_KEY = 'nfu_language';

// 安全的日誌函數（如果 Utils 可用則使用，否則回退到 console）
const safeLog = {
  log: (...args) => {
    if (typeof Utils !== 'undefined' && Utils.logger) {
      Utils.logger.log(...args);
    } else {
      console.log(...args);
    }
  },
  warn: (...args) => {
    if (typeof Utils !== 'undefined' && Utils.logger) {
      Utils.logger.warn(...args);
    } else {
      console.warn(...args);
    }
  },
  error: (...args) => {
    if (typeof Utils !== 'undefined' && Utils.logger) {
      Utils.logger.error(...args);
    } else {
      console.error(...args);
    }
  }
};

let currentLanguage = (() => {
  try {
    return localStorage.getItem(LANGUAGE_KEY) || 'zh';
  } catch (e) {
    safeLog.warn('[Language] 讀取失敗，使用默認值:', e);
    return 'zh';
  }
})(); // 'zh' 或 'en'

// 語言翻譯
const translations = {
  zh: {
    title: '國立虎尾科技大學 - 校園地圖',
    subtitle: '校園設施地圖系統',
    aiAssistant: '🤖 AI 助手',
    selectCampus: '選擇校區：',
    filterFacilities: '篩選設施：',
    search: '🔍 搜索：',
    statusFilter: '狀態篩選：',
    searchPlaceholder: '搜索設施名稱、建築...',
    statusAll: '全部狀態',
    addMarker: '➕ 新增點位',
    facilityStats: '📊 設施統計',
    toilet: '廁所',
    water: '飲水機',
    trash: '垃圾桶',
    total: '總計',
    legend: '圖例說明',
    theme: '主題：',
    dark: '深色',
    light: '淺色',
    system: '系統',
    loadingMap: '載入地圖中...',
    campus1: '第一校區',
    campus2: '第二校區',
    campus3: '第三校區',
    addFacilityTitle: '📍 新增設施點位',
    facilityType: '設施類型 *',
    selectFacilityType: '請選擇設施類型',
    building: '館別 *',
    selectBuilding: '請選擇館別',
    floor: '樓層 *',
    selectFloor: '請選擇樓層',
    gender: '性別 *',
    selectGender: '請選擇性別',
    unisex: '男女共用',
    male: '男',
    female: '女',
    status: '設施狀況 *',
    selectStatus: '請選擇設施狀況',
    normal: '✅ 正常',
    maintenance: '🔧 維修中',
    broken: '⚠️ 故障',
    paused: '⏸️ 暫停使用',
    unavailable: '🚫 無法使用',
    full: '📦 滿出',
    cleaning: '🧹 清潔中',
    partialDamage: '⚠️ 部分損壞',
    gpsLocation: 'GPS 定位 *',
    getCurrentLocation: '📍 取得目前位置',
    uploadPhotos: '上傳照片 *（可上傳多張）',
    photoHint: '可選擇多張照片，建議上傳 1-5 張',
    saveMarker: '💾 儲存點位',
    facilityDetail: '設施詳細資料',
    campus: '校區：',
    buildingLabel: '建築：',
    floorLabel: '樓層：',
    genderLabel: '性別：',
    statusLabel: '狀況：',
    createdAt: '新增時間：',
    viewDetails: '📋 查看詳細資料',
    toastFillAll: '請填寫所有必填欄位！',
    toastToiletGender: '廁所必須選擇性別！',
    toastSuccess: '點位新增成功！',
    toastNoGPS: '您的瀏覽器不支援 GPS 定位',
    toastGPSSuccess: '定位成功，已使用目前位置。',
    toastGPSDenied: '定位權限被拒絕。',
    toastGPSUnavailable: '無法取得位置資訊。',
    toastGPSTimeout: '定位請求超時。',
    toastMaxPhotos: '最多只能上傳 5 張照片，已選擇前 5 張',
    toastFacilityNotFound: '找不到該設施資料',
    outdoor: '戶外',
    footerText: '育秀杯創意獎《AI賦能 永續未來》AI Enables a Sustainable Future',
    universityName: '國立虎尾科技大學'
  },
  en: {
    title: 'National Formosa University - Campus Map',
    subtitle: 'Campus Facility Map System',
    aiAssistant: '🤖 AI Assistant',
    selectCampus: 'Select Campus:',
    filterFacilities: 'Filter Facilities:',
    search: '🔍 Search:',
    statusFilter: 'Status Filter:',
    searchPlaceholder: 'Search facility name, building...',
    statusAll: 'All Status',
    addMarker: '➕ Add Location',
    facilityStats: '📊 Facility Statistics',
    toilet: 'Restroom',
    water: 'Water Fountain',
    trash: 'Trash Can',
    total: 'Total',
    legend: 'Legend',
    theme: 'Theme:',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
    loadingMap: 'Loading map...',
    campus1: 'Campus 1',
    campus2: 'Campus 2',
    campus3: 'Campus 3',
    addFacilityTitle: '📍 Add Facility Location',
    facilityType: 'Facility Type *',
    selectFacilityType: 'Please select facility type',
    building: 'Building *',
    selectBuilding: 'Please select building',
    floor: 'Floor *',
    selectFloor: 'Please select floor',
    gender: 'Gender *',
    selectGender: 'Please select gender',
    unisex: 'Unisex',
    male: 'Male',
    female: 'Female',
    status: 'Facility Status *',
    selectStatus: 'Please select facility status',
    normal: '✅ Normal',
    maintenance: '🔧 Under Maintenance',
    broken: '⚠️ Out of Order',
    paused: '⏸️ Temporarily Closed',
    unavailable: '🚫 Unavailable',
    full: '📦 Full',
    cleaning: '🧹 Cleaning in Progress',
    partialDamage: '⚠️ Partially Damaged',
    gpsLocation: 'GPS Location *',
    getCurrentLocation: '📍 Get Current Location',
    uploadPhotos: 'Upload Photos * (Multiple allowed)',
    photoHint: 'You can select multiple photos, recommended 1-5 photos',
    saveMarker: '💾 Save Location',
    facilityDetail: 'Facility Details',
    campus: 'Campus:',
    buildingLabel: 'Building:',
    floorLabel: 'Floor:',
    genderLabel: 'Gender:',
    statusLabel: 'Status:',
    createdAt: 'Created At:',
    viewDetails: '📋 View Details',
    toastFillAll: 'Please fill in all required fields!',
    toastToiletGender: 'Restroom must select gender!',
    toastSuccess: 'Location added successfully!',
    toastNoGPS: 'Your browser does not support GPS location.',
    toastGPSSuccess: 'Location obtained successfully, using current location.',
    toastGPSDenied: 'Location permission denied.',
    toastGPSUnavailable: 'Unable to get location information.',
    toastGPSTimeout: 'Location request timed out.',
    toastMaxPhotos: 'Maximum 5 photos allowed, first 5 selected',
    toastFacilityNotFound: 'Facility data not found',
    outdoor: 'Outdoor',
    footerText: 'Yushow Cup Creative Award《AI Enables a Sustainable Future》',
    universityName: 'National Formosa University'
  }
};

/**
 * 獲取翻譯文字
 * @param {string} key - 翻譯鍵
 * @returns {string} 翻譯後的文字
 */
function t(key) {
  return translations[currentLanguage][key] || key;
}

/**
 * 更新界面語言
 * 更新所有 UI 元素的文字為當前語言
 */
function updateUILanguage() {
  // 更新標題
  document.title = t('title');
  document.documentElement.lang = currentLanguage === 'zh' ? 'zh-Hant' : 'en';
  
  // 更新頁面標題（h1）
  const headerH1 = document.querySelector('header h1');
  if (headerH1) {
    headerH1.textContent = `🏫 ${t('universityName')}`;
  }
  
  // 更新副標題
  const subtitle = document.querySelector('header p');
  if (subtitle) {
    subtitle.textContent = t('subtitle');
  }
  
  // 更新語言切換按鈕
  const languageBtn = document.getElementById('language-toggle-btn');
  if (languageBtn) {
    languageBtn.textContent = currentLanguage === 'zh' ? '🌐 中文' : '🌐 English';
  }
  
  // 更新 AI 助手按鈕
  const aiBtn = document.getElementById('ai-assistant-btn');
  if (aiBtn) {
    aiBtn.textContent = t('aiAssistant');
    // 添加 hover 效果
    aiBtn.onmouseenter = function() {
      this.style.transform = 'scale(1.05)';
    };
    aiBtn.onmouseleave = function() {
      this.style.transform = 'scale(1)';
    };
  }
  
  // 更新選擇校區標籤（使用更具體的選擇器）
  const controlsDiv = document.querySelector('.controls > div');
  if (controlsDiv) {
    const firstH3 = controlsDiv.querySelector('div:first-child h3');
    if (firstH3) {
      const labelText = firstH3.textContent;
      if (labelText.includes('選擇校區') || labelText.includes('Select Campus')) {
        firstH3.textContent = t('selectCampus');
      }
    }
  }
  
  // 更新校區選項
  const campusSelect = document.getElementById('campus-select');
  if (campusSelect) {
    const options = campusSelect.querySelectorAll('option');
    if (options.length >= 3) {
      options[0].textContent = t('campus1');
      options[1].textContent = t('campus2');
      options[2].textContent = t('campus3');
    }
  }
  
  // 更新篩選設施標籤
  const filterLabel = document.querySelector('.controls > div > div:nth-child(2) h3');
  if (filterLabel) {
    // 檢查是否包含篩選設施相關文字（中英文都檢查）
    const labelText = filterLabel.textContent;
    if (labelText.includes('篩選設施') || labelText.includes('Filter Facilities')) {
      filterLabel.textContent = t('filterFacilities');
    }
  }
  
  // 更新篩選按鈕
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    const type = btn.getAttribute('data-type');
    if (type === 'toilet') btn.textContent = `🚻 ${t('toilet')}`;
    else if (type === 'water') btn.textContent = `🚰 ${t('water')}`;
    else if (type === 'trash') btn.textContent = `🗑️ ${t('trash')}`;
  });
  
  // 更新主題標籤
  const themeLabel = document.querySelector('.theme-toggle h3');
  if (themeLabel) themeLabel.textContent = t('theme');
  
  // 更新主題按鈕
  const themeBtns = document.querySelectorAll('.theme-btn');
  themeBtns.forEach(btn => {
    const mode = btn.getAttribute('data-mode');
    if (mode === 'dark') btn.textContent = t('dark');
    else if (mode === 'light') btn.textContent = t('light');
  });
  
  // 新增點位功能已移除
  
  // 更新設施統計標題
  const statsTitle = document.querySelector('.info-panel h2');
  if (statsTitle) statsTitle.textContent = t('facilityStats');
  
  // 更新統計標籤
  const statLabels = document.querySelectorAll('.stat-card .label');
  statLabels.forEach((label, index) => {
    if (index === 0) label.textContent = t('toilet');
    else if (index === 1) label.textContent = t('water');
    else if (index === 2) label.textContent = t('trash');
    else if (index === 3) label.textContent = t('total');
  });
  
  // 更新圖例標題
  const legendTitle = document.querySelector('.legend h3');
  if (legendTitle) legendTitle.textContent = t('legend');
  
  // 更新圖例項目
  const legendItems = document.querySelectorAll('.legend-item span');
  legendItems.forEach((item, index) => {
    if (index === 0) item.textContent = t('toilet');
    else if (index === 1) item.textContent = t('water');
    else if (index === 2) item.textContent = t('trash');
  });
  
  // 搜索功能已移除
  
  // 狀態篩選功能已移除
  
  const statusMaintenanceOption = document.getElementById('status-maintenance');
  if (statusMaintenanceOption) statusMaintenanceOption.textContent = t('maintenance');
  
  const statusCleaningOption = document.getElementById('status-cleaning');
  if (statusCleaningOption) statusCleaningOption.textContent = t('cleaning');
  
  const statusFullOption = document.getElementById('status-full');
  if (statusFullOption) statusFullOption.textContent = t('full');
  
  const statusDamagedOption = document.getElementById('status-damaged');
  if (statusDamagedOption) statusDamagedOption.textContent = t('partialDamage');
  
  // 更新載入文字
  const loadingText = document.querySelector('#loading div:last-child');
  if (loadingText && loadingText.textContent.includes('載入')) {
    loadingText.textContent = t('loadingMap');
  }
  
  // 更新設施詳細資料模態框標題
  const detailModalTitle = document.getElementById('detail-facility-name');
  if (detailModalTitle) {
    const titleText = detailModalTitle.textContent;
    if (titleText === '設施詳細資料' || titleText === 'Facility Details') {
      detailModalTitle.textContent = t('facilityDetail');
    }
  }
  
  // 更新 Footer 文字
  const footer = document.querySelector('footer p');
  if (footer) {
    footer.textContent = t('footerText');
  }
  
  // 更新模態框
  updateModalLanguage();
}

// 更新模態框語言
function updateModalLanguage() {
  // 新增點位模態框
  const addModalTitle = document.querySelector('#add-marker-modal .modal-header h2');
  if (addModalTitle) addModalTitle.textContent = t('addFacilityTitle');
  
  // 設施類型
  const facilityTypeLabel = document.querySelector('label[for="facility-type"]');
  if (facilityTypeLabel) facilityTypeLabel.textContent = t('facilityType');
  
  const facilityTypeSelect = document.getElementById('facility-type');
  if (facilityTypeSelect) {
    const firstOption = facilityTypeSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('selectFacilityType');
    
    const options = facilityTypeSelect.querySelectorAll('option[value]');
    options.forEach(opt => {
      if (opt.value === 'toilet') opt.textContent = `🚻 ${t('toilet')}`;
      else if (opt.value === 'water') opt.textContent = `🚰 ${t('water')}`;
      else if (opt.value === 'trash') opt.textContent = `🗑️ ${t('trash')}`;
    });
  }
  
  // 館別
  const buildingLabel = document.querySelector('label[for="building-select"]');
  if (buildingLabel) buildingLabel.textContent = t('building');
  
  const buildingSelect = document.getElementById('building-select');
  if (buildingSelect) {
    const firstOption = buildingSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('selectBuilding');
  }
  
  // 樓層
  const floorLabel = document.querySelector('label[for="floor-select"]');
  if (floorLabel) floorLabel.textContent = t('floor');
  
  const floorSelect = document.getElementById('floor-select');
  if (floorSelect) {
    const firstOption = floorSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('selectFloor');
    
    const outdoorOption = floorSelect.querySelector('option[value="戶外"]');
    if (outdoorOption) outdoorOption.textContent = t('outdoor');
  }
  
  // 性別
  const genderLabel = document.querySelector('label[for="gender-select"]');
  if (genderLabel) genderLabel.textContent = t('gender');
  
  const genderSelect = document.getElementById('gender-select');
  if (genderSelect) {
    const firstOption = genderSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('selectGender');
    
    const options = genderSelect.querySelectorAll('option[value]');
    options.forEach(opt => {
      if (opt.value === '男女共用') opt.textContent = t('unisex');
      else if (opt.value === '男') opt.textContent = t('male');
      else if (opt.value === '女') opt.textContent = t('female');
    });
  }
  
  // 設施狀況
  const statusLabel = document.querySelector('label[for="status-select"]');
  if (statusLabel) statusLabel.textContent = t('status');
  
  const statusSelect = document.getElementById('status-select');
  if (statusSelect) {
    const firstOption = statusSelect.querySelector('option[value=""]');
    if (firstOption) firstOption.textContent = t('selectStatus');
    
    const options = statusSelect.querySelectorAll('option[value]');
    options.forEach(opt => {
      if (opt.value === '正常') opt.textContent = t('normal');
      else if (opt.value === '維修中') opt.textContent = t('maintenance');
      else if (opt.value === '故障') opt.textContent = t('broken');
      else if (opt.value === '暫停使用') opt.textContent = t('paused');
      else if (opt.value === '無法使用') opt.textContent = t('unavailable');
      else if (opt.value === '滿出') opt.textContent = t('full');
      else if (opt.value === '清潔中') opt.textContent = t('cleaning');
      else if (opt.value === '部分損壞') opt.textContent = t('partialDamage');
    });
  }
  
  // GPS 定位
  const gpsLabel = document.querySelector('label[for="get-gps-btn"]');
  if (gpsLabel) gpsLabel.textContent = t('gpsLocation');
  
  const gpsBtn = document.getElementById('get-gps-btn');
  if (gpsBtn) gpsBtn.textContent = t('getCurrentLocation');
  
  // 上傳照片（已移除，修復 null 錯誤）
  const photoUpload = document.querySelector('#photo-upload');
  if (photoUpload) {
    const photoLabel = document.querySelector('label[for="photo-upload"]');
    if (photoLabel) photoLabel.textContent = t('uploadPhotos');
    
    const photoHint = photoUpload.nextElementSibling;
    if (photoHint && photoHint.tagName === 'SMALL') {
      photoHint.textContent = t('photoHint');
    }
  }
  
  // 儲存按鈕
  const saveBtn = document.querySelector('#add-marker-form button[type="submit"]');
  if (saveBtn) saveBtn.textContent = t('saveMarker');
}

// 切換語言（統一錯誤處理）
// 語言切換防抖標記
let isLanguageToggling = false;

function toggleLanguage() {
  // 防止重複點擊
  if (isLanguageToggling) {
    safeLog.warn('[Language] 語言切換進行中，忽略重複點擊');
    return;
  }
  
  // 獲取按鈕元素
  const languageBtn = document.getElementById('language-toggle-btn');
  if (languageBtn) {
    // 添加點擊動畫效果
    languageBtn.classList.add('clicking');
    setTimeout(() => {
      languageBtn.classList.remove('clicking');
    }, 300);
    
    languageBtn.disabled = true;
    languageBtn.style.opacity = '0.6';
    languageBtn.style.cursor = 'not-allowed';
  }
  
  isLanguageToggling = true;
  
  try {
    // 切換語言
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
    
    // 保存語言設置
    try {
      localStorage.setItem(LANGUAGE_KEY, currentLanguage);
    } catch (e) {
      safeLog.warn('[Language] 保存失敗:', e);
      // 降級方案：嘗試使用 sessionStorage
      try {
        sessionStorage.setItem(LANGUAGE_KEY, currentLanguage);
      } catch (e2) {
        safeLog.error('[Language] sessionStorage 也失敗:', e2);
      }
    }
    
    // 更新 UI
    try {
      updateUILanguage();
    } catch (e) {
      safeLog.error('[Language] UI 更新失敗:', e);
    }
    
    // 重新渲染標記（更新 popup 文字）
    try {
      renderMarkers();
    } catch (e) {
      safeLog.error('[Language] 標記渲染失敗:', e);
    }
    
  } catch (error) {
    safeLog.error('[Language] 語言切換錯誤:', error);
    // 發生錯誤時恢復語言狀態
    currentLanguage = currentLanguage === 'zh' ? 'en' : 'zh';
  } finally {
    // 恢復按鈕狀態
    isLanguageToggling = false;
    if (languageBtn) {
      // 延遲恢復，讓動畫完成
      setTimeout(() => {
        languageBtn.disabled = false;
        languageBtn.style.opacity = '1';
        languageBtn.style.cursor = 'pointer';
      }, 200);
    }
  }
}

// 初始化語言（統一錯誤處理）
function initLanguage() {
  try {
    currentLanguage = localStorage.getItem(LANGUAGE_KEY) || 'zh';
  } catch (e) {
    safeLog.warn('[Language] 讀取失敗，使用默認值:', e);
    currentLanguage = 'zh';
  }
  updateUILanguage();
}

// ========================================
// 設施點位座標配置區（可直接修改）
// ========================================

/**
 * 綜三館 1~10F 男生廁所座標配置
 * 
 * 修改方式：
 * 1. 直接修改下面的 lat 和 lng 數值
 * 2. 度分秒轉換公式：度 + 分/60 + 秒/3600
 *    例如：23°42'12.3"N = 23 + 42/60 + 12.3/3600 = 23.7034167
 *         120°25'53.1"E = 120 + 25/60 + 53.1/3600 = 120.4314167
 */
// 預設設施點位配置（可直接修改座標和照片）
const defaultFacilities = {
  campus2: [
    // 綜三館 1~10F 男生廁所 - 每個樓層獨立狀態（無障礙屬性由 accessible 標記，不再放在名稱中）
    ...Array.from({ length: 10 }, (_, i) => ({
      id: 2001 + i,
      type: 'toilet',
      name: `綜三館 ${i + 1}F 男生廁所`,
      building: '綜三館',
      floor: `${i + 1}F`,
      campus: 'campus2',
      // 照片：將 base64 字串放入此陣列（最多3張）
      // 格式：'data:image/jpeg;base64,/9j/4AAQSkZJRg...' 或 'data:image/png;base64,iVBORw0KGgo...'
      // 照片：將 base64 字串放入此陣列（最多3張）
      // 格式：'data:image/jpeg;base64,/9j/4AAQSkZJRg...' 或 'data:image/png;base64,iVBORw0KGgo...'
      photos: [
        // 第一張照片
          'data:image/jpeg;base64,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',
          // 第二張照片
          'data:image/jpeg;base64,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',
          // 第三張照片
          'data:image/jpeg;base64,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'
      ],
      photo: null, // 會自動設為 photos[0]
      lat: 23.7034167,  // 緯度（23°42'12.3"N）- 可直接修改此值
      lng: 120.4314167, // 經度（120°25'53.1"E）- 可直接修改此值
      gender: '男',
      status: '正常',
      accessible: true,
      createdAt: new Date().toISOString()
    }))
  ]
};

// ========================================
// 虎尾科技大學各校區座標（根據 Google Maps 連結定位）
// ========================================
// 第一校區：https://maps.app.goo.gl/qd39uBkqo3H26ep8A
// 第二校區：https://maps.app.goo.gl/yrgJsJY2cfKoeqgJ7
// 第三校區：https://maps.app.goo.gl/oyZBXqg2x7BZg7oT7
const campusLocations = {
  campus1: {
    center: [23.7024, 120.4295],  // 第一校區（根據 Google Maps 連結更新）
    zoom: 19,
    name: '第一校區（第一教學區）'
  },
  campus2: {
    center: [23.7032, 120.4309],  // 第二校區（根據 Google Maps 連結）
    zoom: 19,  // 縮放級別調整為 19
    name: '第二校區（第二教學區）'
  },
  campus3: {
    center: [23.7016, 120.4324],  // 第三校區（根據 Google Maps 連結）
    zoom: 19,
    name: '第三校區（第三教學區）'
  }
};

// 館別列表
const buildings = {
  campus1: [
    '第一教學大樓',
    '第二教學大樓',
    '第三教學大樓',
    '第四教學大樓',
    '行政大樓',
    '飛機館',
    '圖書館',
    '學生活動中心',
    '機械工程館',
    '紅館',
    '綠館'
  ],
  campus2: [
    '綜一館',
    '綜二館',
    '綜三館',
    '電機館',
    '科技研究中心(跨領域)'
  ],
  campus3: [
    '體育館(經國館)',
    '文理暨管理大樓',
    '人文大樓',
    '操場'
  ]
};

// 建築物位置資料（用於在地圖上顯示建築物標記）
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
      name: '文理暨管理大樓', 
      lat: 23.701234, 
      lng: 120.432456, 
      info: '文理暨管理大樓，提供文理學科與管理學科的教學空間，設有各類專業教室和實驗室。大樓內配備現代化教學設備，支援文理與管理相關課程的教學。',
      details: '文理暨管理大樓是第三校區重要的教學場所，提供文理學科與管理學科的專業教學空間，支援各類文理與管理相關課程的教學與研究活動。'
    },
    { 
      name: '人文大樓', 
      lat: 23.701567, 
      lng: 120.432789, 
      info: '人文大樓，提供人文學科的教學與研究空間，設有語言教室、研討室等專業空間。大樓內配備人文學科教學所需的專業設備，支援人文相關課程的教學。',
      details: '人文大樓是第三校區人文學科的主要教學場所，提供語言教學、人文研究等各類人文相關課程所需的專業空間與設備。'
    }
  ]
};

// 設施資料（從 localStorage 載入）
function loadFacilities() {
  const saved = localStorage.getItem('nfu_facilities');
  let data;
  
  if (saved) {
    data = JSON.parse(saved);
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
  } else {
    // 如果沒有保存的數據，使用預設數據
    data = {
      campus1: [],
      campus2: [],
      campus3: []
    };
  }
  
  // 確保所有校區數組存在
  if (!data.campus1) data.campus1 = [];
  if (!data.campus2) data.campus2 = [];
  if (!data.campus3) data.campus3 = [];
  
  // 只移除舊的「1~10F」合併點位，保留新的分開點位（1F, 2F, ..., 10F）
  const beforeCount = data.campus2.length;
  data.campus2 = data.campus2.filter(f => 
    !(f.building === '綜三館' && 
      f.type === 'toilet' && 
      f.gender === '男' &&
      f.floor === '1~10F') // 只移除舊的合併點位
  );
  
  if (data.campus2.length < beforeCount) {
    safeLog.log(`✅ 已移除 ${beforeCount - data.campus2.length} 個舊的綜三館廁所合併點位`);
  }
  
  // 從預設配置添加點位（如果不存在）
  let hasNewFacility = false;
  if (defaultFacilities.campus2 && defaultFacilities.campus2.length > 0) {
    defaultFacilities.campus2.forEach(defaultFacility => {
      const exists = data.campus2.some(f => f.id === defaultFacility.id);
      if (!exists) {
        // 創建新對象，避免引用問題
        // 注意：不將 Base64 照片保存到 localStorage（避免超出存儲限制）
        const newFacility = {
          ...defaultFacility,
          createdAt: new Date().toISOString(),
          // 移除照片數據，只保留標記（照片會從 defaultFacilities 中獲取）
          hasPhotos: defaultFacility.photos && defaultFacility.photos.length > 0,
          photos: [], // 不保存 Base64 數據到 localStorage
          photo: null
        };
        data.campus2.push(newFacility);
        hasNewFacility = true;
        safeLog.log(`✅ 已添加預設設施：${newFacility.name}，座標：[${newFacility.lat}, ${newFacility.lng}]，照片數：${defaultFacility.photos ? defaultFacility.photos.length : 0}（照片存儲在代碼中）`);
      } else {
        // 如果已存在，更新座標（從預設配置）
        const existingIndex = data.campus2.findIndex(f => f.id === defaultFacility.id);
        if (existingIndex !== -1) {
          const existing = data.campus2[existingIndex];
          // 更新座標（如果預設配置有新的座標）
          if (existing.lat !== defaultFacility.lat || existing.lng !== defaultFacility.lng) {
            data.campus2[existingIndex].lat = defaultFacility.lat;
            data.campus2[existingIndex].lng = defaultFacility.lng;
            hasNewFacility = true;
            safeLog.log(`🔄 已更新設施座標：${existing.name} -> [${defaultFacility.lat}, ${defaultFacility.lng}]`);
          }
          // 更新照片標記（不保存 Base64 數據）
          if (defaultFacility.photos && defaultFacility.photos.length > 0) {
            data.campus2[existingIndex].hasPhotos = true;
            data.campus2[existingIndex].photos = []; // 不保存 Base64 數據
            data.campus2[existingIndex].photo = null;
            hasNewFacility = true;
            safeLog.log(`📷 已更新設施照片標記：${existing.name}，${defaultFacility.photos.length} 張（照片存儲在代碼中）`);
          }
        }
      }
    });
  }
  
  // 如果有新增或更新，保存到 localStorage
  // 注意：在保存前移除所有 Base64 照片數據（避免超出存儲限制）
  if (hasNewFacility || data.campus2.length > beforeCount) {
    // 創建一個不包含 Base64 照片的副本用於保存
    const dataToSave = JSON.parse(JSON.stringify(data));
    dataToSave.campus2 = dataToSave.campus2.map(f => {
      // 如果是預設設施且有照片，只保存標記
      const defaultFacility = defaultFacilities.campus2?.find(df => df.id === f.id);
      if (defaultFacility && defaultFacility.photos && defaultFacility.photos.length > 0) {
        return {
          ...f,
          hasPhotos: true,
          photos: [],
          photo: null
        };
      }
      return f;
    });
    
    try {
      localStorage.setItem('nfu_facilities', JSON.stringify(dataToSave));
    } catch (e) {
      if (e.name === 'QuotaExceededError') {
        safeLog.warn('⚠️ localStorage 存儲空間不足，嘗試清理後重試...');
        // 嘗試清理舊數據
        try {
          localStorage.removeItem('nfu_facilities');
          localStorage.setItem('nfu_facilities', JSON.stringify(dataToSave));
          safeLog.log('✅ 已清理舊數據並重新保存');
        } catch (e2) {
          safeLog.error('❌ 無法保存到 localStorage，數據過大：', e2);
        }
      } else {
        safeLog.error('❌ 保存到 localStorage 時出錯：', e);
      }
    }
  }
  
  return data;
}

function saveFacilities() {
  // 創建一個不包含 Base64 照片的副本用於保存
  const dataToSave = JSON.parse(JSON.stringify(facilities));
  dataToSave.campus2 = dataToSave.campus2.map(f => {
    // 如果是預設設施且有照片，只保存標記
    const defaultFacility = defaultFacilities.campus2?.find(df => df.id === f.id);
    if (defaultFacility && defaultFacility.photos && defaultFacility.photos.length > 0) {
      return {
        ...f,
        hasPhotos: true,
        photos: [],
        photo: null
      };
    }
    return f;
  });
  
  try {
    localStorage.setItem('nfu_facilities', JSON.stringify(dataToSave));
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      safeLog.warn('⚠️ localStorage 存儲空間不足，嘗試清理後重試...');
      try {
        localStorage.removeItem('nfu_facilities');
        localStorage.setItem('nfu_facilities', JSON.stringify(dataToSave));
        safeLog.log('✅ 已清理舊數據並重新保存');
      } catch (e2) {
        safeLog.error('❌ 無法保存到 localStorage，數據過大：', e2);
      }
    } else {
      safeLog.error('❌ 保存到 localStorage 時出錯：', e);
    }
  }
}

// 將所有「故障 / 無法使用 / 暫停使用」的廁所狀態重置為「正常」
// 說明：啟動時執行一次，方便先把目前資料中的廁所都當成「好的」來展示與測試
function normalizeToiletStatuses() {
  try {
    const campuses = ['campus1', 'campus2', 'campus3'];
    let changed = false;

    campuses.forEach(campusKey => {
      const list = facilities[campusKey];
      if (!Array.isArray(list)) return;

      list.forEach(f => {
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
      saveFacilities();
      safeLog.log('✅ 已將所有故障 / 無法使用 / 暫停使用的廁所狀態重置為「正常」');
    }
  } catch (e) {
    safeLog.error('❌ 正常化廁所狀態時發生錯誤：', e);
  }
}

let facilities = loadFacilities();
// 啟動時先把廁所狀態「歸零」，故障的先一律當作正常
normalizeToiletStatuses();

// 初始化測試數據（強制添加三個測試設備到第一校區）
function initTestData() {
  // 預設設施點位已在 loadFacilities() 中處理，這裡只處理測試數據
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
    safeLog.log('✅ 測試數據已存在');
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
      lat: campus1Center[0] + 0.0002, // 稍微偏移
      lng: campus1Center[1] + 0.0001,
      photos: [], // 暫時沒有照片
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
  
  // 保存到 localStorage
  saveFacilities();
  
  safeLog.log('✅ 已添加測試數據：3 個設備（廁所、飲水機、垃圾桶）到第一校區');
}

// 在頁面載入時初始化測試數據
initTestData();

// 自動添加預設設施點位（已整合到 loadFacilities 中，此函數保留用於地圖更新）
function autoAddZongSanToilets() {
  // 重新載入設施數據（會自動添加預設點位）
  facilities = loadFacilities();
  
  // 如果地圖已初始化，更新地圖顯示
  if (typeof map !== 'undefined' && map) {
    if (currentCampus === 'campus2') {
      safeLog.log('🔄 當前在第二校區，更新地圖顯示...');
      renderMarkers();
      updateStats();
    }
  }
}

// 在地圖初始化完成後執行自動添加
  // 這個函數會在 initMap 成功後被調用

// ========================================
// 建築物標記功能
// ========================================

// 用戶位置標記
let userLocationMarker = null;
let currentUserLocation = null;

/**
 * 判斷是否應該顯示該校區的建築物
 * @param {string} campusKey - 校區鍵值
 * @returns {boolean} 是否顯示
 */
function shouldShowBuilding(campusKey) {
  const campusSelect = document.getElementById('campus-select');
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
  if (!window.buildingMarkers || !map) return;
  
  window.buildingMarkers.forEach(markerData => {
    if (markerData.marker) {
      if (shouldShowBuilding(markerData.campus)) {
        if (!map.hasLayer(markerData.marker)) {
          markerData.marker.addTo(map);
        }
      } else {
        if (map.hasLayer(markerData.marker)) {
          map.removeLayer(markerData.marker);
        }
      }
    }
  });
}

/**
 * 添加建築物標記（顯示在地圖上）
 */
function addBuildingMarkers() {
  if (!map) return;
  
  // 存儲建築物標記
  if (!window.buildingMarkers) {
    window.buildingMarkers = [];
  }
  
  // 清除舊的建築物標記
  if (window.buildingMarkers.length > 0) {
    window.buildingMarkers.forEach(markerData => {
      if (markerData.marker && map.hasLayer(markerData.marker)) {
        map.removeLayer(markerData.marker);
      }
    });
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
          marker.addTo(map);
        }
        
        // 生成彈出窗口內容的函數
        const getPopupContent = (lat, lng) => {
          const popupId = `building-popup-${campusKey}-${building.name.replace(/\s+/g, '-')}`;
          const buildingDetails = building.details || '';
          // 轉義單引號以避免 JavaScript 錯誤
          const escapedName = building.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const escapedInfo = (building.info || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const escapedDetails = buildingDetails.replace(/'/g, "\\'").replace(/"/g, '&quot;');
          const campusName = campusKey === 'campus1' ? '第一校區' : campusKey === 'campus2' ? '第二校區' : '第三校區';
          
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
      } catch (error) {
        safeLog.error(`添加建築物標記時出錯 (${building.name}):`, error);
      }
    });
  });
}

/**
 * 取得用戶當前位置
 */
function getCurrentLocation(showMessage = false) {
  if (!navigator.geolocation) {
    if (showMessage) {
      showToast(currentLanguage === 'en' ? 'Your browser does not support geolocation' : '您的瀏覽器不支援定位功能', 'error');
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
      showToast(msg, 'error');
    }
    return;
  }

  // 顯示載入狀態
  if (showMessage) {
    showToast(currentLanguage === 'en' ? 'Getting your location...' : '正在取得您的位置...', 'info');
  }

  navigator.geolocation.getCurrentPosition(
    function(position) {
      currentUserLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      
      // 清除舊的使用者位置標記
      if (userLocationMarker) {
        if (map) map.removeLayer(userLocationMarker);
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
      }).addTo(map).bindPopup(locationPopupText).openPopup();
      
      // 移動地圖到使用者位置
      if (map) {
        map.setView([currentUserLocation.lat, currentUserLocation.lng], 18);
      }
      
      // 更新地圖資訊
      if (showMessage) {
        showToast(currentLanguage === 'en' ? 'Location obtained successfully!' : '已成功取得位置！', 'success');
      }
    },
    function(error) {
      safeLog.log('無法取得位置:', error);
      let errorMessage = currentLanguage === 'en' ? 'Unable to get your location.' : '無法取得您的位置。';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = currentLanguage === 'en' 
            ? 'Location access denied. Please allow location access in your browser settings.'
            : '定位權限被拒絕。請在瀏覽器設定中允許定位權限。';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = currentLanguage === 'en'
            ? 'Location information unavailable.'
            : '位置資訊無法取得。';
          break;
        case error.TIMEOUT:
          errorMessage = currentLanguage === 'en'
            ? 'Location request timed out.'
            : '定位請求逾時。';
          break;
      }
      
      if (showMessage) {
        showToast(errorMessage, 'error');
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

// Toast 通知
// 使用 utils.js 中的 showToast，如果不存在則使用本地版本
function showToast(message, type = 'info', language = currentLanguage) {
  if (typeof window.showToast === 'function' && window.showToast !== showToast) {
    return window.showToast(message, type, language);
  }
  
  // 本地 fallback 版本
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'toast-icon';
  iconSpan.textContent = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';

  const messageSpan = document.createElement('span');
  messageSpan.className = 'toast-message';
  messageSpan.textContent = message;

  toast.appendChild(iconSpan);
  toast.appendChild(messageSpan);
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => {
      toast.remove();
    }, 200);
  }, 2600);
}

// 主題切換
const THEME_KEY = 'nfu_theme_mode';

function applyThemeMode(mode) {
  // 移除所有主題類別
  document.body.classList.remove('theme-light', 'theme-dark');
  
  // 應用選定的主題
  if (mode === 'light') {
    document.body.classList.add('theme-light');
  } else {
    // 默認為深色模式
    document.body.classList.add('theme-dark');
  }

  // 更新按鈕狀態
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
}

function setThemeMode(mode) {
  // 只允許 'dark' 或 'light'
  if (mode !== 'dark' && mode !== 'light') {
    mode = 'dark'; // 默認使用深色
  }
  localStorage.setItem(THEME_KEY, mode);
  applyThemeMode(mode);
}

function initTheme() {
  // 默認使用深色模式
  const saved = localStorage.getItem(THEME_KEY) || 'dark';
  const validMode = (saved === 'light' || saved === 'dark') ? saved : 'dark';
  applyThemeMode(validMode);

  // 綁定按鈕事件
  const buttons = document.querySelectorAll('.theme-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      if (mode === 'dark' || mode === 'light') {
        setThemeMode(mode);
        // 更新按鈕文字（確保語言正確）
        updateUILanguage();
      }
    });
  });
}

// 初始化地圖
function initMap() {
  // 檢查地圖容器是否存在
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    safeLog.error('❌ 地圖容器不存在');
    const loadingEl = document.getElementById('loading');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    return;
  }
  
  // 如果地圖已經初始化，先銷毀
  if (map) {
    try {
      map.remove();
    } catch (e) {
      safeLog.warn('清除舊地圖時出錯:', e);
    }
    map = null;
  }
  
  // 取得載入動畫元素（稍後使用）
  const loadingEl = document.getElementById('loading');

  const campusInfo = campusLocations[currentCampus];

  // 建立地圖
  try {
    map = L.map('map').setView(campusInfo.center, campusInfo.zoom);
  } catch (error) {
    safeLog.error('地圖初始化失敗:', error);
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      const errorMsg = currentLanguage === 'en' 
        ? 'Map loading failed, please refresh the page'
        : '地圖載入失敗，請重新整理頁面';
      loadingEl.innerHTML = `<div class="spinner"></div><div>${errorMsg}</div>`;
    }
    return;
  }

  // 使用 OpenStreetMap 圖層
  try {
    safeLog.log('🗺️ 正在添加地圖圖層...');
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    safeLog.log('✅ 地圖圖層添加成功');
    
    // 地圖初始化成功，立即隱藏載入動畫（使用多種方法確保隱藏）
    if (loadingEl) {
      loadingEl.style.display = 'none';
      loadingEl.style.visibility = 'hidden';
      loadingEl.style.opacity = '0';
      loadingEl.classList.add('hidden');
      loadingEl.setAttribute('hidden', 'true');
      safeLog.log('✅ 載入動畫已隱藏');
    }
  } catch (error) {
    safeLog.error('❌ 添加地圖圖層失敗:', error);
    if (loadingEl) {
      loadingEl.style.display = 'flex';
      const errorMsg = currentLanguage === 'en'
        ? 'Map layer loading failed'
        : '地圖圖層載入失敗';
      loadingEl.innerHTML = `<div class="spinner"></div><div>${errorMsg}</div>`;
    }
    return;
  }

  // 添加三個校區的位置標記
  const campusIcons = {
    campus1: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">🏫</div>',
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    }),
    campus2: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">🏫</div>',
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    }),
    campus3: L.divIcon({
      className: 'custom-marker',
      html: '<div style="background: linear-gradient(135deg, #43e97b 0%, #38f9d7 100%); border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">🏫</div>',
      iconSize: [50, 50],
      iconAnchor: [25, 25]
    })
  };

  // 在地圖上標示三個校區的位置
  let currentCampusMarker = null;
  Object.keys(campusLocations).forEach(campusKey => {
    const campus = campusLocations[campusKey];
    const isCurrentCampus = campusKey === currentCampus;
    
    const marker = L.marker(campus.center, { 
      icon: campusIcons[campusKey],
      opacity: isCurrentCampus ? 1.0 : 0.7
    })
      .addTo(map)
      .bindPopup(`<b>${campus.name}</b><br>${isCurrentCampus ? (currentLanguage === 'en' ? '📍 Currently viewing campus' : '📍 當前查看的校區') : (currentLanguage === 'en' ? 'Click above to select this campus' : '點擊上方選擇此校區')}`);
    
    if (isCurrentCampus) {
      currentCampusMarker = marker;
    }
  });
  
  // 當前校區的標記自動打開
  if (currentCampusMarker) {
    currentCampusMarker.openPopup();
  }

  // 繪製所有標記
  try {
    renderMarkers();
    updateStats();
    safeLog.log('✅ 地圖標記和統計已更新');
    
    // 添加建築物標記
    addBuildingMarkers();
    safeLog.log('✅ 建築物標記已添加');
    
    // 自動取得用戶位置（不顯示訊息）
    getCurrentLocation(false);
  } catch (error) {
    safeLog.error('❌ 渲染標記時出錯:', error);
  }
  
  // 確保載入動畫已隱藏（多重保險）
  const loadingElFinal = document.getElementById('loading');
  if (loadingElFinal) {
    loadingElFinal.style.display = 'none';
    loadingElFinal.style.visibility = 'hidden';
    loadingElFinal.style.opacity = '0';
    loadingElFinal.classList.add('hidden');
    loadingElFinal.setAttribute('hidden', 'true');
    safeLog.log('✅ 最終確認：載入動畫已完全隱藏');
  }
}

// 切換校區
function switchCampus(campusId) {
  currentCampus = campusId;
  const campusInfo = campusLocations[campusId];
  
  if (map) {
    // 平滑移動並放大到該校區位置
    map.flyTo(campusInfo.center, campusInfo.zoom, {
      animate: true,
      duration: 1.0
    });
    
    // 更新所有校區標記的透明度
    setTimeout(() => {
      map.eachLayer(function(layer) {
        if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.className === 'custom-marker') {
          const markerCampus = Object.keys(campusLocations).find(key => {
            const markerLat = layer.getLatLng().lat;
            const markerLng = layer.getLatLng().lng;
            const campusLat = campusLocations[key].center[0];
            const campusLng = campusLocations[key].center[1];
            // 允許小範圍誤差（約 0.0001 度）
            return Math.abs(markerLat - campusLat) < 0.0001 && Math.abs(markerLng - campusLng) < 0.0001;
          });
          if (markerCampus) {
            layer.setOpacity(markerCampus === campusId ? 1.0 : 0.7);
            if (markerCampus === campusId) {
              layer.openPopup();
            }
          }
        }
      });
    }, 500);
  }

  renderMarkers();
  updateStats();
  
  // 更新建築物標記顯示
  updateBuildingMarkers();
}

function createMarkerIcon(type) {
  const icons = {
    toilet: '🚻',
    water: '🚰',
    trash: '🗑️'
  };

  const colors = {
    toilet: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    water: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    trash: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)'
  };

  return L.divIcon({
    className: `custom-marker ${type}`,
    html: `<div class="custom-marker ${type}" style="background: ${colors[type]}; border-radius: 50%; width: 50px; height: 50px; display: flex; align-items: center; justify-content: center; font-size: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">${icons[type]}</div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25]
  });
}


function updateStats() {
  const currentFacilities = facilities[currentCampus] || [];
  
  // 只統計好的設備（排除壞的設備）
  const availableFacilities = currentFacilities.filter(f => isFacilityAvailable(f));
  
  const counts = {
    toilet: availableFacilities.filter(f => f.type === 'toilet').length,
    water: availableFacilities.filter(f => f.type === 'water').length,
    trash: availableFacilities.filter(f => f.type === 'trash').length
  };

  document.getElementById('toilet-count').textContent = counts.toilet;
  document.getElementById('water-count').textContent = counts.water;
  document.getElementById('trash-count').textContent = counts.trash;
  document.getElementById('total-count').textContent = availableFacilities.length;
}

// 篩選按鈕事件
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const type = this.dataset.type;
    this.classList.toggle('active');

    if (this.classList.contains('active')) {
      if (!activeTypes.includes(type)) {
        activeTypes.push(type);
      }
    } else {
      activeTypes = activeTypes.filter(t => t !== type);
    }

    renderMarkers();
  });
});

// 校區選擇事件
const campusSelectEl = document.getElementById('campus-select');
if (campusSelectEl) {
  campusSelectEl.addEventListener('change', function() {
    switchCampus(this.value);
    // 新增點位功能已移除
  });
}

// 取得位置按鈕事件
const getLocationBtn = document.getElementById('get-location-btn');
if (getLocationBtn) {
  getLocationBtn.addEventListener('click', function() {
    getCurrentLocation(true); // 顯示訊息
  });
}

// 搜索功能已移除

// 狀態篩選功能已移除

// 新增點位功能已移除

// 更新館別選項
function updateBuildingOptions() {
  const buildingSelect = document.getElementById('building-select');
  buildingSelect.innerHTML = `<option value="">${t('selectBuilding')}</option>`;
  
  const currentBuildings = buildings[currentCampus] || [];
  currentBuildings.forEach(building => {
    const option = document.createElement('option');
    option.value = building;
    option.textContent = building;
    buildingSelect.appendChild(option);
  });
}

// 新增點位功能已移除 - 以下代碼已禁用
if (false) {
  // 設施類型變更時顯示/隱藏性別欄位
  const facilityTypeEl = document.getElementById('facility-type');
  if (facilityTypeEl) {
    facilityTypeEl.addEventListener('change', function() {
      const genderGroup = document.getElementById('gender-group');
      const genderSelect = document.getElementById('gender-select');
      
      if (this.value === 'toilet') {
        genderGroup.style.display = 'block';
        genderSelect.required = true;
      } else {
        genderGroup.style.display = 'none';
        genderSelect.required = false;
        genderSelect.value = '';
      }
    });
  }

  // GPS 定位
  const gpsBtn = document.getElementById('get-gps-btn');
  if (gpsBtn) {
    gpsBtn.addEventListener('click', function() {
          const statusDiv = document.getElementById('gps-status');
      statusDiv.textContent = currentLanguage === 'en' ? 'Locating...' : '定位中...';
      statusDiv.className = 'gps-status';

      if (!navigator.geolocation) {
        const errorMsg = t('toastNoGPS');
        statusDiv.textContent = `❌ ${errorMsg}`;
        statusDiv.className = 'gps-status error';
        showToast(errorMsg, 'error');
        return;
      }

      navigator.geolocation.getCurrentPosition(
        function(position) {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          
          document.getElementById('gps-lat').value = lat;
          document.getElementById('gps-lng').value = lng;
          
          const successMsg = t('toastGPSSuccess');
          statusDiv.textContent = `✅ ${successMsg} (${lat.toFixed(6)}, ${lng.toFixed(6)})`;
          statusDiv.className = 'gps-status success';
          showToast(successMsg, 'success');

          // 在地圖上標示位置
          if (map) {
            map.setView([lat, lng], 19);
            L.marker([lat, lng], {
              icon: L.divIcon({
                className: 'custom-marker',
                html: '<div style="background: #ff0000; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; font-size: 20px; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 3px solid white;">📍</div>',
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              })
            }).addTo(map).bindPopup(currentLanguage === 'en' ? '📍 Your Current Location' : '📍 您的目前位置').openPopup();
          }
        },
        function(error) {
          let errorMsg = '';
          switch(error.code) {
            case error.PERMISSION_DENIED:
              errorMsg = currentLanguage === 'en'
                ? `❌ Location failed: ${t('toastGPSDenied')}`
                : `❌ 定位失敗：${t('toastGPSDenied')}`;
              break;
            case error.POSITION_UNAVAILABLE:
              errorMsg = currentLanguage === 'en'
                ? `❌ Location failed: ${t('toastGPSUnavailable')}`
                : `❌ 定位失敗：${t('toastGPSUnavailable')}`;
              break;
            case error.TIMEOUT:
              errorMsg = currentLanguage === 'en'
                ? `❌ Location failed: ${t('toastGPSTimeout')}`
                : `❌ 定位失敗：${t('toastGPSTimeout')}`;
              break;
            default:
              errorMsg = currentLanguage === 'en'
                ? '❌ Location failed: Unknown error'
                : '❌ 定位失敗：未知錯誤';
              break;
          }
          statusDiv.textContent = errorMsg;
          statusDiv.className = 'gps-status error';
          showToast(errorMsg, 'error');
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }
}

// 照片預覽功能已移除（原用於新增點位）
if (false) {
  const photoUpload = document.getElementById('photo-upload');
  if (photoUpload) {
    photoUpload.addEventListener('change', function(e) {
  const files = Array.from(e.target.files);
  const previewContainer = document.getElementById('photo-preview-container');
  previewContainer.innerHTML = '';
  
  if (files.length === 0) return;
  
  // 限制最多 5 張
  const filesToShow = files.slice(0, 5);
  
  filesToShow.forEach((file, index) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const previewDiv = document.createElement('div');
      previewDiv.className = 'photo-preview-item';
      previewDiv.innerHTML = `
        <img src="${e.target.result}" alt="預覽圖片 ${index + 1}" class="preview-image">
        <span class="photo-index">${index + 1}</span>
      `;
      previewContainer.appendChild(previewDiv);
    };
    reader.readAsDataURL(file);
  });
  
  if (files.length > 5) {
    showToast(t('toastMaxPhotos'), 'info');
  }
    });
  }
}

// 表單提交功能已移除（原用於新增點位）
if (false) {
  const form = document.getElementById('add-marker-form');
  if (form) {
    form.addEventListener('submit', function(e) {
      e.preventDefault();

      const type = document.getElementById('facility-type').value;
      const building = document.getElementById('building-select').value;
      const floor = document.getElementById('floor-select').value;
      const lat = parseFloat(document.getElementById('gps-lat').value);
      const lng = parseFloat(document.getElementById('gps-lng').value);
      const photoFiles = Array.from(document.getElementById('photo-upload').files).slice(0, 5); // 最多 5 張
      const gender = document.getElementById('gender-select').value;
      const status = document.getElementById('status-select').value;

      // 使用工具函數進行驗證
      const facilityData = {
        type: type,
        building: building,
        floor: floor,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        gender: gender,
        status: status,
        photos: []
      };
      
      // 驗證照片文件
      for (let i = 0; i < photoFiles.length; i++) {
        const file = photoFiles[i];
        const photoValidation = validatePhotoFile(file, currentLanguage);
        if (!photoValidation.valid) {
          showToast(photoValidation.error, 'error', currentLanguage);
          return;
        }
      }
      
      // 驗證設施數據
      const validation = validateFacility(facilityData, currentLanguage);
      if (!validation.valid) {
        validation.errors.forEach(error => {
          showToast(error, 'error', currentLanguage);
        });
        return;
      }
      
      // 基本檢查（保留原有邏輯作為備份）
      if (!type || !building || !floor || !lat || !lng || photoFiles.length === 0 || !status) {
        showToast(t('toastFillAll'), 'error');
        return;
      }

      // 如果是廁所，必須選擇性別
      if (type === 'toilet' && !gender) {
        showToast(t('toastToiletGender'), 'error');
        return;
      }

      // 讀取所有照片為 base64
      const photoPromises = photoFiles.map(file => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = function(e) {
            resolve(e.target.result);
          };
          reader.readAsDataURL(file);
        });
      });

      Promise.all(photoPromises).then(photos => {
        try {
          // 生成新點位
          const newFacility = {
            id: Date.now(),
            type: type,
            name: `${building} ${floor} ${type === 'toilet' ? t('toilet') : type === 'water' ? t('water') : t('trash')}`,
            building: building,
            floor: floor,
            campus: currentCampus,
            photos: photos, // 多張照片數組
            photo: photos[0], // 保留第一張作為預覽（向後兼容）
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            gender: gender,  // 性別（僅廁所有）
            status: status,  // 狀況
            createdAt: new Date().toISOString()
          };

          // 最終驗證（如果 utils.js 已載入）
          if (typeof validateFacility === 'function') {
            const finalValidation = validateFacility(newFacility, currentLanguage);
            if (!finalValidation.valid) {
              finalValidation.errors.forEach(error => {
                showToast(error, 'error', currentLanguage);
              });
              return;
            }
          }

          // 添加到設施列表
          if (!facilities[currentCampus]) {
            facilities[currentCampus] = [];
          }
          facilities[currentCampus].push(newFacility);

          // 儲存到 localStorage
          saveFacilities();

          // 重新渲染標記
          renderMarkers();
          updateStats();

          // 關閉模態框
          const modal = document.getElementById('add-marker-modal');
          if (modal) modal.style.display = 'none';
          form.reset();
          const photoPreview = document.getElementById('photo-preview-container');
          if (photoPreview) photoPreview.innerHTML = '';
          const genderGroup = document.getElementById('gender-group');
          if (genderGroup) genderGroup.style.display = 'none';
          const genderSelect = document.getElementById('gender-select');
          if (genderSelect) genderSelect.required = false;

          showToast(t('toastSuccess'), 'success', currentLanguage);
        } catch (error) {
          safeLog.error('保存設施時發生錯誤:', error);
          const errorMsg = currentLanguage === 'en'
            ? 'Failed to save facility. Please try again.'
            : '保存設施失敗，請稍後再試。';
          showToast(errorMsg, 'error', currentLanguage);
        }
      }).catch(error => {
        safeLog.error('讀取照片時發生錯誤:', error);
        const errorMsg = currentLanguage === 'en'
          ? 'Failed to read photo files. Please check the file format.'
          : '讀取照片失敗，請檢查檔案格式。';
        showToast(errorMsg, 'error', currentLanguage);
      });
    });
  }
}

/**
 * 翻譯狀態文字
 * @param {string} status - 狀態文字（中文）
 * @returns {string} 翻譯後的狀態文字
 */
function translateStatus(status) {
  if (!status) return currentLanguage === 'en' ? 'Normal' : '正常';
  
  const statusMap = {
    '正常': currentLanguage === 'en' ? 'Normal' : '正常',
    '維修中': currentLanguage === 'en' ? 'Under Maintenance' : '維修中',
    '故障': currentLanguage === 'en' ? 'Out of Order' : '故障',
    '暫停使用': currentLanguage === 'en' ? 'Temporarily Closed' : '暫停使用',
    '無法使用': currentLanguage === 'en' ? 'Unavailable' : '無法使用',
    '滿出': currentLanguage === 'en' ? 'Full' : '滿出',
    '清潔中': currentLanguage === 'en' ? 'Cleaning in Progress' : '清潔中',
    '部分損壞': currentLanguage === 'en' ? 'Partially Damaged' : '部分損壞',
    '待清潔': currentLanguage === 'en' ? 'Needs Cleaning' : '待清潔'
  };
  
  return statusMap[status] || status;
}

/**
 * 判斷設備是否可用（好的設備）
 * @param {Object} facility - 設施對象
 * @returns {boolean} 是否可用
 */
function isFacilityAvailable(facility) {
  if (!facility || !facility.status) return true; // 沒有狀態資訊，視為可用
  
  // 完全無法使用的設備狀態（這些設備不應該被顯示或計算）
  // 注意：「部分損壞」仍然可以導航，因為只是部分功能有問題，不是完全不能用
  const badStatuses = ['故障', '無法使用', '暫停使用'];
  return !badStatuses.includes(facility.status);
}

/**
 * 更新標記彈出視窗以顯示照片
 * 根據當前篩選條件（類型、搜索、狀態）渲染地圖標記
 */
function renderMarkers() {
  // 檢查地圖是否已初始化
  if (!map) {
    safeLog.warn('地圖尚未初始化，無法渲染標記');
    return;
  }
  
  // 清除現有標記
  try {
    markers.forEach(marker => {
      if (marker && map.hasLayer(marker)) {
        map.removeLayer(marker);
      }
    });
  } catch (e) {
      safeLog.warn('清除標記時出錯:', e);
  }
  markers = [];

  // 取得當前校區的設施
  const currentFacilities = facilities[currentCampus] || [];

  // 過濾要顯示的設施：1. 符合類型篩選 2. 設備可用（不是壞的）3. 符合搜索條件
  const visibleFacilities = currentFacilities.filter(f => {
    // 類型篩選
    if (!activeTypes.includes(f.type)) return false;
    
    // 設備可用性篩選
    if (!isFacilityAvailable(f)) return false;
    
    // 搜索功能已移除
    // 狀態篩選功能已移除
    
    return true;
  });
  
  safeLog.log(`📍 當前校區 ${currentCampus} 有 ${currentFacilities.length} 個設施，其中 ${visibleFacilities.length} 個可用且符合篩選`);
  
  // 調試：列出所有設施名稱
  if (currentCampus === 'campus2' && currentFacilities.length > 0) {
    safeLog.log('📋 第二校區所有設施:', currentFacilities.map(f => `${f.name} (${f.building} ${f.floor})`));
    safeLog.log('📋 第二校區可見設施:', visibleFacilities.map(f => `${f.name} (${f.building} ${f.floor})`));
  }

  // 創建標記
  visibleFacilities.forEach(facility => {
    try {
      // 檢查座標是否有效
      if (!facility.lat || !facility.lng || isNaN(facility.lat) || isNaN(facility.lng)) {
        console.warn('設施座標無效:', facility);
        return;
      }
      
      const marker = L.marker([facility.lat, facility.lng], {
        icon: createMarkerIcon(facility.type)
      }).addTo(map);

    // 彈出視窗（包含照片）
    let popupContent = `
      <div style="padding: 5px; min-width: 200px;">
        <h3 style="margin: 0 0 8px 0; color: #1e3c72; font-size: 16px; font-weight: 700;">${facility.name}</h3>
        <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${t('buildingLabel')}</strong>${facility.building}</p>
        <p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${t('floorLabel')}</strong>${facility.floor}</p>
    `;
    
    // 如果是廁所且有性別資訊，顯示類型（包含無障礙資訊）
    if (facility.type === 'toilet' && facility.gender) {
      let genderText = currentLanguage === 'en'
        ? (facility.gender === '男' ? '♂️ Men\'s' : 
           facility.gender === '女' ? '♀️ Women\'s' : 
           facility.gender === '性別友善' ? '🚻 Gender-Inclusive' :
           '🚻 All-Gender')
        : (facility.gender === '男' ? '♂️ 男廁' : 
           facility.gender === '女' ? '♀️ 女廁' : 
           facility.gender === '性別友善' ? '🚻 性別友善' :
           '🚻 性別友善');
      
      // 如果是無障礙設施，在類型中加上無障礙標記
      if (facility.accessible) {
        // 如果是綜三館廁所，顯示為「男生與無障礙」
        if (facility.building === '綜三館' && facility.gender === '男') {
          genderText = currentLanguage === 'en' ? '♂️ Men\'s & Accessible' : '♂️ 男生與無障礙';
        } else {
          genderText += currentLanguage === 'en' ? ' (Accessible)' : '（無障礙）';
        }
      }
      
      popupContent += `<p style="margin: 4px 0; color: #6c757d; font-size: 13px;"><strong>${currentLanguage === 'en' ? 'Type:' : '類型：'}</strong>${genderText}</p>`;
    }
    
    // 顯示設施狀況
    if (facility.status) {
      const statusIcons = {
        '正常': '✅',
        '維修中': '🔧',
        '故障': '⚠️',
        '暫停使用': '⏸️',
        '無法使用': '🚫',
        '滿出': '📦',
        '清潔中': '🧹',
        '部分損壞': '⚠️'
      };
      const statusColors = {
        '正常': '#28a745',
        '故障': '#dc3545',
        '無法使用': '#dc3545',
        '滿出': '#ff9800',
        '維修中': '#ffc107',
        '清潔中': '#17a2b8',
        '暫停使用': '#6c757d',
        '部分損壞': '#ff9800'
      };
      const statusIcon = statusIcons[facility.status] || 'ℹ️';
      const statusColor = statusColors[facility.status] || '#6c757d';
      // 翻譯狀態文字
      const statusText = translateStatus(facility.status);
      popupContent += `<p style="margin: 4px 0; color: ${statusColor}; font-size: 13px; font-weight: 600;"><strong>${t('statusLabel')}</strong>${statusIcon} ${statusText}</p>`;
    }
    
    popupContent += `
      <button onclick="window.openFacilityDetail('${facility.id}')" style="margin-top: 8px; padding: 6px 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px; width: 100%;">
        ${t('viewDetails')}
      </button>
    </div>`;
    
    // 顯示第一張照片作為預覽
    const previewPhoto = getFacilityPhoto(facility);
    if (previewPhoto) {
      const photoAltText = currentLanguage === 'en' ? 'Facility Photo' : '設施照片';
      popupContent += `<img src="${previewPhoto}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 8px; margin-top: 8px;" alt="${photoAltText}">`;
    }
    
    popupContent += `</div>`;

    marker.bindPopup(popupContent);
    
    // 添加點擊事件，點擊標記時打開詳細資料
    marker.on('click', function() {
      window.openFacilityDetail(facility.id);
    });

    markers.push(marker);
    } catch (error) {
      safeLog.error('創建設施標記時出錯:', error, facility);
    }
  });
  
  safeLog.log(`✅ 已在地圖上顯示 ${markers.length} 個設施標記`);
}

// 打開設施詳細資料模態框（全局函數）
window.openFacilityDetail = function(facilityId) {
  // 在所有校區中查找設施
  let facility = null;
  for (const campus of Object.keys(facilities)) {
    facility = facilities[campus].find(f => f.id == facilityId);
    if (facility) break;
  }
  
  if (!facility) {
    showToast(t('toastFacilityNotFound'), 'error');
    return;
  }
  
  const modal = document.getElementById('facility-detail-modal');
  const detailBody = document.getElementById('facility-detail-body');
  const detailName = document.getElementById('detail-facility-name');
  
  if (!modal || !detailBody || !detailName) {
    safeLog.error('設施詳細資料模態框元素不存在');
    showToast(t('toastFacilityNotFound'), 'error');
    return;
  }
  
  // 設置標題
  const typeText = facility.type === 'toilet' 
    ? (currentLanguage === 'en' ? 'Restroom' : '廁所')
    : facility.type === 'water'
    ? (currentLanguage === 'en' ? 'Water Fountain' : '飲水機')
    : (currentLanguage === 'en' ? 'Trash Can' : '垃圾桶');
  detailName.textContent = `${facility.name} - ${typeText}`;
  
  // 獲取照片（支持多張）
  const photos = getFacilityPhotos(facility);
  
  // 狀態顯示
  const statusIcons = {
    '正常': '✅',
    '維修中': '🔧',
    '故障': '⚠️',
    '暫停使用': '⏸️',
    '無法使用': '🚫',
    '滿出': '📦',
    '清潔中': '🧹',
    '部分損壞': '⚠️'
  };
  const statusColors = {
    '正常': '#28a745',
    '故障': '#dc3545',
    '無法使用': '#dc3545',
    '滿出': '#ff9800',
    '維修中': '#ffc107',
    '清潔中': '#17a2b8',
    '暫停使用': '#6c757d',
    '部分損壞': '#ff9800'
  };
  const statusIcon = statusIcons[facility.status] || 'ℹ️';
  const statusColor = statusColors[facility.status] || '#6c757d';
  
  // 校區名稱
  const campusName = currentLanguage === 'en'
    ? (facility.campus === 'campus1' ? t('campus1') : facility.campus === 'campus2' ? t('campus2') : t('campus3'))
    : (facility.campus === 'campus1' ? t('campus1') : facility.campus === 'campus2' ? t('campus2') : t('campus3'));
  
  // 構建詳細資料 HTML
  const basicInfoTitle = currentLanguage === 'en' ? '📍 Basic Information' : '📍 基本資訊';
  const facilityNameLabel = currentLanguage === 'en' ? 'Facility Name:' : '設施名稱：';
  const facilityTypeLabel = currentLanguage === 'en' ? 'Facility Type:' : '設施類型：';
  const statusLabel = currentLanguage === 'en' ? 'Current Status:' : '目前狀態：';
  const photosTitle = currentLanguage === 'en' 
    ? `📷 Photos (${photos.length})`
    : `📷 照片（${photos.length} 張）`;
  
  let detailHTML = `
    <div class="facility-detail-info">
      <div class="detail-section">
        <h3>${basicInfoTitle}</h3>
        <div class="detail-item">
          <span class="detail-label">${facilityNameLabel}</span>
          <span class="detail-value">${facility.name}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">${facilityTypeLabel}</span>
          <span class="detail-value">${typeText}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">${t('campus')}</span>
          <span class="detail-value">${campusName}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">${t('buildingLabel')}</span>
          <span class="detail-value">${facility.building}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">${t('floorLabel')}</span>
          <span class="detail-value">${facility.floor}</span>
        </div>
        ${facility.type === 'toilet' && facility.gender ? `
        <div class="detail-item">
          <span class="detail-label">${currentLanguage === 'en' ? 'Type:' : '類型：'}</span>
          <span class="detail-value">${(() => {
            let typeText = currentLanguage === 'en'
              ? (facility.gender === '男' ? '♂️ Men\'s' : facility.gender === '女' ? '♀️ Women\'s' : facility.gender === '性別友善' ? '🚻 Gender-Inclusive' : '🚻 All-Gender')
              : (facility.gender === '男' ? '♂️ 男廁' : facility.gender === '女' ? '♀️ 女廁' : facility.gender === '性別友善' ? '🚻 性別友善' : '🚻 性別友善');
            
            // 如果是無障礙設施，加上無障礙標記
            if (facility.accessible) {
              typeText += currentLanguage === 'en' ? ' (Accessible)' : '（無障礙）';
            }
            
            // 如果是綜三館廁所，顯示為「男生與無障礙」
            if (facility.building === '綜三館' && facility.gender === '男' && facility.accessible) {
              typeText = currentLanguage === 'en' ? '♂️ Men\'s & Accessible' : '♂️ 男生與無障礙';
            }
            
            return typeText;
          })()}</span>
        </div>
        ` : ''}
               <div class="detail-item">
                 <span class="detail-label">${statusLabel}</span>
                 <span class="detail-value" style="color: ${statusColor}; font-weight: 600;">
                   ${statusIcon} ${translateStatus(facility.status || '正常')}
                 </span>
               </div>
               ${facility.notes && facility.notes.length > 0 ? `
               <div class="detail-item">
                 <span class="detail-label">${currentLanguage === 'en' ? '📝 Notes:' : '📝 備註：'}</span>
                 <div class="detail-value" style="margin-top: 8px;">
                   ${facility.notes.map(note => `
                     <div style="padding: 8px; margin: 4px 0; background: rgba(15, 23, 42, 0.3); border-radius: 6px; border-left: 3px solid ${statusColor};">
                       ${note}
                     </div>
                   `).join('')}
                 </div>
               </div>
               ` : ''}
             </div>
      
      ${facility.building === '綜三館' && facility.type === 'toilet' && facility.gender === '男' ? `
      <div class="detail-section">
        <h3>${currentLanguage === 'en' ? '🏢 All Floors Status' : '🏢 各樓層狀態'}</h3>
        <div class="floor-status-collapsible">
          <button class="floor-status-toggle" onclick="toggleFloorStatus(this)">
            <span class="toggle-icon">▼</span>
            <span>${currentLanguage === 'en' ? 'Click to view all floors' : '點擊查看所有樓層'}</span>
          </button>
          <div class="floor-status-list" style="display: none;">
            ${generateFloorStatusList(facility, currentLanguage)}
          </div>
        </div>
      </div>
      ` : ''}
      
      ${photos.length > 0 ? `
      <div class="detail-section">
        <h3>${photosTitle}</h3>
        <div class="photo-gallery">
          ${photos.map((photo, index) => `
            <div class="photo-item">
              <img src="${photo}" alt="設施照片 ${index + 1}" class="detail-photo" onclick="window.openPhotoViewer(${index}, ${JSON.stringify(photos).replace(/"/g, '&quot;')})">
              <span class="photo-number">${index + 1}</span>
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `;
  
  detailBody.innerHTML = detailHTML;
  modal.style.display = 'block';
}

/**
 * 獲取設施照片（從 localStorage 或 defaultFacilities）
 */
function getFacilityPhoto(facility) {
  // 如果設施有照片，直接返回
  if (facility.photos && facility.photos.length > 0) {
    return facility.photos[0];
  }
  if (facility.photo) {
    return facility.photo;
  }
  
  // 如果設施有 hasPhotos 標記但照片為空，從 defaultFacilities 中獲取
  if (facility.hasPhotos) {
    const defaultFacility = defaultFacilities.campus2?.find(f => f.id === facility.id);
    if (defaultFacility && defaultFacility.photos && defaultFacility.photos.length > 0) {
      return defaultFacility.photos[0];
    }
  }
  
  return null;
}

/**
 * 獲取設施所有照片（從 localStorage 或 defaultFacilities）
 */
function getFacilityPhotos(facility) {
  // 如果設施有照片，直接返回
  if (facility.photos && facility.photos.length > 0) {
    return facility.photos;
  }
  if (facility.photo) {
    return [facility.photo];
  }
  
  // 如果設施有 hasPhotos 標記但照片為空，從 defaultFacilities 中獲取
  if (facility.hasPhotos) {
    const defaultFacility = defaultFacilities.campus2?.find(f => f.id === facility.id);
    if (defaultFacility && defaultFacility.photos && defaultFacility.photos.length > 0) {
      return [...defaultFacility.photos];
    }
  }
  
  return [];
}

/**
 * 生成樓層狀態列表（用於綜三館廁所）
 */
function generateFloorStatusList(currentFacility, currentLanguage) {
  // 獲取所有綜三館廁所設施
  const allFloors = facilities.campus2.filter(f => 
    f.building === '綜三館' && 
    f.type === 'toilet' && 
    f.gender === '男' &&
    f.name && f.name.includes('綜三館') && f.name.includes('F')
  ).sort((a, b) => {
    // 按樓層排序
    const floorA = parseInt(a.floor.replace('F', ''));
    const floorB = parseInt(b.floor.replace('F', ''));
    return floorA - floorB;
  });
  
  const statusIcons = {
    '正常': '✅',
    '維修中': '🔧',
    '故障': '⚠️',
    '暫停使用': '⏸️',
    '無法使用': '🚫',
    '滿出': '📦',
    '清潔中': '🧹',
    '部分損壞': '⚠️'
  };
  
  const statusColors = {
    '正常': '#28a745',
    '故障': '#dc3545',
    '無法使用': '#dc3545',
    '滿出': '#ff9800',
    '維修中': '#ffc107',
    '清潔中': '#17a2b8',
    '暫停使用': '#6c757d',
    '部分損壞': '#ff9800'
  };
  
  if (allFloors.length === 0) {
    return `<div style="padding: 10px; color: #6c757d;">${currentLanguage === 'en' ? 'No floor data available' : '暫無樓層資料'}</div>`;
  }
  
  return allFloors.map(facility => {
    const status = facility.status || '正常';
    const statusIcon = statusIcons[status] || 'ℹ️';
    const statusColor = statusColors[status] || '#6c757d';
    const isCurrent = facility.id === currentFacility.id;
    
    return `
      <div class="floor-status-item ${isCurrent ? 'current-floor' : ''}" style="
        padding: 12px;
        margin: 8px 0;
        background: ${isCurrent ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.3)'};
        border-radius: 8px;
        border-left: 3px solid ${isCurrent ? '#38bdf8' : statusColor};
        display: flex;
        justify-content: space-between;
        align-items: center;
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-weight: 600; color: #e5e7eb;">${facility.floor}</span>
          ${isCurrent ? '<span style="font-size: 12px; color: #38bdf8;">（當前）</span>' : ''}
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="color: ${statusColor}; font-weight: 600;">
            ${statusIcon} ${translateStatus(status)}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 切換樓層狀態列表的顯示/隱藏
 */
window.toggleFloorStatus = function(button) {
  const list = button.nextElementSibling;
  const icon = button.querySelector('.toggle-icon');
  
  if (list.style.display === 'none') {
    list.style.display = 'block';
    icon.textContent = '▲';
  } else {
    list.style.display = 'none';
    icon.textContent = '▼';
  }
};

// 照片查看器（全屏查看）
window.openPhotoViewer = function(index, photos) {
  const viewer = document.createElement('div');
  viewer.className = 'photo-viewer';
  viewer.innerHTML = `
    <div class="photo-viewer-content">
      <button class="photo-viewer-close" onclick="window.closePhotoViewer()">&times;</button>
      <button class="photo-viewer-nav photo-viewer-prev" onclick="window.changePhoto(-1)">‹</button>
      <img src="${photos[index]}" alt="${currentLanguage === 'en' ? 'Photo' : '照片'} ${index + 1}" id="viewer-photo">
      <button class="photo-viewer-nav photo-viewer-next" onclick="window.changePhoto(1)">›</button>
      <div class="photo-viewer-info">${index + 1} / ${photos.length}</div>
    </div>
  `;
  document.body.appendChild(viewer);
  
  // 存儲當前索引和照片數組到全局變量
  window.currentPhotoIndex = index;
  window.currentPhotos = photos;
  window.currentViewer = viewer;
  
  // 添加鍵盤事件（左右箭頭切換照片，ESC 關閉）
  const keyHandler = function(e) {
    if (e.key === 'ArrowLeft') {
      window.changePhoto(-1);
    } else if (e.key === 'ArrowRight') {
      window.changePhoto(1);
    } else if (e.key === 'Escape') {
      window.closePhotoViewer();
    }
  };
  document.addEventListener('keydown', keyHandler);
  window.currentKeyHandler = keyHandler;
};

// 關閉照片查看器
window.closePhotoViewer = function() {
  if (window.currentViewer) {
    window.currentViewer.remove();
    window.currentViewer = null;
    window.currentPhotos = null;
    window.currentPhotoIndex = null;
    if (window.currentKeyHandler) {
      document.removeEventListener('keydown', window.currentKeyHandler);
      window.currentKeyHandler = null;
    }
  }
};

// 切換照片
window.changePhoto = function(direction) {
  if (!window.currentPhotos || !window.currentViewer) return;
  
  window.currentPhotoIndex += direction;
  if (window.currentPhotoIndex < 0) {
    window.currentPhotoIndex = window.currentPhotos.length - 1;
  } else if (window.currentPhotoIndex >= window.currentPhotos.length) {
    window.currentPhotoIndex = 0;
  }
  
  const photoImg = window.currentViewer.querySelector('#viewer-photo');
  const photoInfo = window.currentViewer.querySelector('.photo-viewer-info');
  if (photoImg && photoInfo) {
    photoImg.src = window.currentPhotos[window.currentPhotoIndex];
    photoInfo.textContent = `${window.currentPhotoIndex + 1} / ${window.currentPhotos.length}`;
  }
};

// 關閉詳細資料模態框
document.getElementById('close-detail-modal').addEventListener('click', function() {
  document.getElementById('facility-detail-modal').style.display = 'none';
});

window.addEventListener('click', function(event) {
  const modal = document.getElementById('facility-detail-modal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
});

// 實時同步機制（用於 index.html）
let facilityUpdateChannelIndex = null;

// 初始化實時同步（index.html）
function initRealtimeSyncIndex() {
  // 使用 BroadcastChannel 監聽其他標籤頁的更新
  if (typeof BroadcastChannel !== 'undefined') {
    facilityUpdateChannelIndex = new BroadcastChannel('facility_updates');
    facilityUpdateChannelIndex.onmessage = function(event) {
      const data = event.data;
      if (data.type === 'status_update') {
        safeLog.log('📢 收到設施狀態更新:', data);
        // 重新載入設施數據
        facilities = loadFacilities();
        // 更新地圖顯示
        if (map) {
          renderMarkers();
          updateStats();
        }
      }
    };
  }
  
  // 監聽 localStorage 變化
  window.addEventListener('storage', function(event) {
    if (event.key === 'nfu_facilities') {
      safeLog.log('📢 檢測到設施數據更新');
      facilities = loadFacilities();
      if (map) {
        renderMarkers();
        updateStats();
      }
    }
  });
  
  // 定期檢查設施數據更新（每 5 秒）- 優化版：支持清理
  const checkInterval = setInterval(function() {
    try {
      const saved = localStorage.getItem('nfu_facilities');
      if (saved) {
        const currentData = JSON.stringify(facilities);
        if (saved !== currentData) {
          safeLog.log('📢 檢測到設施數據變化，更新顯示');
          facilities = loadFacilities();
          if (map) {
            renderMarkers();
            updateStats();
          }
        }
      }
    } catch (e) {
      safeLog.warn('檢查設施數據更新時出錯:', e);
    }
  }, 5000);
  
  // 存儲 interval ID 以便清理
  window.facilityCheckInterval = checkInterval;
  
  // 頁面卸載時清理
  window.addEventListener('beforeunload', function() {
    if (window.facilityCheckInterval) {
      clearInterval(window.facilityCheckInterval);
    }
    if (facilityUpdateChannelIndex) {
      facilityUpdateChannelIndex.close();
    }
  });
}

// 頁面載入完成後初始化地圖（使用 DOMContentLoaded，與 ai-chat.html 相同）
document.addEventListener('DOMContentLoaded', function() {
  safeLog.log('📄 DOM 載入完成，開始初始化...');
  
  // 初始化主題
  initTheme();
  
  // 確保測試數據已初始化
  safeLog.log('🔧 初始化測試數據...');
  initTestData();
  
  // 重新載入設施數據（會自動添加預設點位）
  facilities = loadFacilities();
  safeLog.log('📊 設施數據:', facilities);
  
  // 檢查綜三館廁所是否已添加
  if (facilities.campus2 && facilities.campus2.length > 0) {
    const zongSanToilet = facilities.campus2.find(f => 
      f.building === '綜三館' && 
      f.type === 'toilet' && 
      f.gender === '男' &&
      f.name && f.name.includes('1~10')
    );
    if (zongSanToilet) {
      safeLog.log('✅ 已發現綜三館廁所設施:', zongSanToilet.name);
      safeLog.log('   座標:', [zongSanToilet.lat, zongSanToilet.lng]);
      safeLog.log('   照片數:', zongSanToilet.photos ? zongSanToilet.photos.length : 0);
      safeLog.log('   完整設施資料:', zongSanToilet);
    } else {
      safeLog.log('🔍 未發現綜三館廁所，將在 loadFacilities 中自動添加');
      safeLog.log('   第二校區所有設施:', facilities.campus2.map(f => `${f.name} (${f.building})`));
    }
  }
  
  // 初始化實時同步
  initRealtimeSyncIndex();
  
  // 等待 Leaflet 載入完成後再初始化地圖
  function waitForLeaflet(callback, maxAttempts = 30, attempt = 0) {
    if (typeof L !== 'undefined' && L.map) {
      safeLog.log('✅ Leaflet 庫已載入');
      callback();
    } else if (attempt < maxAttempts) {
      setTimeout(() => waitForLeaflet(callback, maxAttempts, attempt + 1), 100);
    } else {
      safeLog.error('❌ Leaflet 庫載入超時！');
      const loadingEl = document.getElementById('loading');
      if (loadingEl) {
        loadingEl.style.display = 'flex';
        const errorMsg = currentLanguage === 'en'
          ? 'Map library loading failed, please check network connection or refresh the page'
          : '地圖庫載入失敗，請檢查網路連線或重新整理頁面';
        loadingEl.innerHTML = `<div class="spinner"></div><div>${errorMsg}</div>`;
      }
    }
  }
  
  // 初始化語言
  initLanguage();
  
  // 語言切換按鈕 - 使用更可靠的方式綁定事件
  function initLanguageButton() {
    const languageBtn = document.getElementById('language-toggle-btn');
    if (languageBtn) {
      // 使用命名函數，方便移除和重新綁定
      function handleLanguageToggle(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleLanguage();
      }
      
      function handleLanguageKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          toggleLanguage();
        }
      }
      
      // 移除可能存在的舊事件監聽器（通過設置新的處理函數）
      languageBtn.onclick = null;
      languageBtn.onkeydown = null;
      
      // 添加新的事件監聽器
      languageBtn.addEventListener('click', handleLanguageToggle, { passive: true });
      languageBtn.addEventListener('keydown', handleLanguageKeydown, { passive: true });
      
      // 確保按鈕可訪問
      languageBtn.setAttribute('tabindex', '0');
      languageBtn.setAttribute('role', 'button');
      languageBtn.setAttribute('aria-label', currentLanguage === 'zh' ? '切換語言' : 'Toggle Language');
      
      safeLog.log('✅ 語言切換按鈕已初始化');
      return true;
    } else {
      safeLog.warn('⚠️ 找不到語言切換按鈕，將在 100ms 後重試');
      setTimeout(initLanguageButton, 100);
      return false;
    }
  }
  
  // 立即嘗試初始化，如果失敗則延遲重試
  initLanguageButton();
  
  // 等待 Leaflet 載入完成後再初始化地圖
  waitForLeaflet(function() {
    // 延遲初始化地圖，確保 DOM 完全準備好
    setTimeout(function() {
      try {
        safeLog.log('🗺️ 開始初始化地圖...');
        initMap();
        safeLog.log('✅ 地圖初始化完成');
        
        // 地圖初始化完成後，執行自動添加綜三館廁所
        setTimeout(() => {
          autoAddZongSanToilets();
        }, 500);
      } catch (error) {
        safeLog.error('❌ 地圖初始化錯誤:', error);
        const loadingEl = document.getElementById('loading');
        if (loadingEl) {
          loadingEl.style.display = 'flex';
          const errorMsg = currentLanguage === 'en'
            ? 'Map loading failed, please check console'
            : '地圖載入失敗，請檢查控制台';
          loadingEl.innerHTML = `<div class="spinner"></div><div>${errorMsg}</div>`;
        }
      }
    }, 300);
  });
});

// ========================================
// 批量添加設施點位函數
// ========================================

/**
 * 添加綜三館 1~10 樓男生廁所（無障礙）- 單一點位
 * @param {Array<string>} photos - 照片的 base64 字串陣列（最多3張）
 * @param {Array<number>} coordinates - GPS 座標 [lat, lng]，如果不提供則使用綜三館廁所正確座標
 * @returns {Object} 添加結果
 */
function addZongSanBuildingToilets(photos = [], coordinates = null) {
  // 使用提供的座標或從預設配置讀取的座標
  const defaultFacility = defaultFacilities.campus2 && defaultFacilities.campus2[0];
  const [lat, lng] = coordinates || (defaultFacility ? [defaultFacility.lat, defaultFacility.lng] : [23.7034167, 120.4314167]);
  
  // 確保照片數組不超過3張
  const facilityPhotos = photos.slice(0, 3);
  
  // 如果沒有提供照片，使用空數組（後續可以通過界面添加）
  if (facilityPhotos.length === 0) {
    safeLog.warn('⚠️ 未提供照片，設施點位將使用空照片數組。您可以後續通過界面添加照片。');
  }
  
  // 確保第二校區設施數組存在
  if (!facilities.campus2) {
    facilities.campus2 = [];
  }
  
  // 檢查是否已經存在綜三館的男生廁所設施
  const existingFacility = facilities.campus2.find(f => 
    f.building === '綜三館' && 
    f.type === 'toilet' && 
    f.gender === '男' &&
    f.name && f.name.includes('1~10')
  );
  
  let shouldReplace = false;
  if (existingFacility) {
    safeLog.log('ℹ️ 已發現現有的綜三館男生廁所設施');
    shouldReplace = confirm('已存在綜三館男生廁所設施。\n\n點擊「確定」刪除舊的並添加新的\n點擊「取消」取消操作');
    
    if (shouldReplace) {
      // 刪除現有的綜三館男生廁所
      facilities.campus2 = facilities.campus2.filter(f => 
        !(f.building === '綜三館' && f.type === 'toilet' && f.gender === '男' && f.name && f.name.includes('1~10'))
      );
      safeLog.log('✅ 已刪除舊的綜三館男生廁所設施');
    } else {
      return {
        success: false,
        message: '操作已取消'
      };
    }
  }
  
  // 創建單一設施點位（代表1~10樓，無障礙屬性由 accessible 標記，不再放在名稱中）
  const newFacility = {
    id: Date.now(),
    type: 'toilet',
    name: '綜三館 1~10F 男生廁所',
    building: '綜三館',
    floor: '1~10F',
    campus: 'campus2',
    photos: facilityPhotos.length > 0 ? [...facilityPhotos] : [],
    photo: facilityPhotos.length > 0 ? facilityPhotos[0] : null,
    lat: lat,
    lng: lng,
    gender: '男',
    status: '正常',
    accessible: true, // 標記為無障礙設施
    createdAt: new Date().toISOString()
  };
  
  facilities.campus2.push(newFacility);
  
  // 保存到 localStorage
  saveFacilities();
  
  // 確保全局 facilities 變數已更新（因為我們直接修改了 facilities.campus2）
  // 不需要重新載入，因為我們直接操作的是同一個對象引用
  
  // 更新地圖顯示（如果地圖已初始化且當前在第二校區）
  if (typeof map !== 'undefined' && map) {
    // 重新載入設施數據以確保同步
    facilities = loadFacilities();
    
    // 如果當前在第二校區，立即更新地圖
    if (typeof currentCampus !== 'undefined' && currentCampus === 'campus2') {
      safeLog.log('🔄 當前在第二校區，立即更新地圖顯示...');
      renderMarkers();
      updateStats();
    } else {
      safeLog.log(`ℹ️ 當前校區為 ${currentCampus}，設施已添加但需切換到第二校區才能看到`);
    }
  } else {
    safeLog.warn('⚠️ 地圖尚未初始化，無法立即更新顯示');
  }
  
  // 返回結果
  const result = {
    success: true,
    added: 1,
    facility: newFacility,
    coordinates: [lat, lng],
    photosCount: facilityPhotos.length
  };
  
  safeLog.log('✅ 添加完成！', result);
  showToast('成功添加綜三館 1~10F 男生廁所設施點位', 'success');
  
  return result;
}

/**
 * 從 Google Maps 短連結獲取座標的輔助函數
 * 注意：由於瀏覽器安全限制，此函數需要手動輸入座標
 * 您可以在 Google Maps 中打開連結，右鍵點擊位置，選擇「這是什麼？」來獲取座標
 */
function getCoordinatesFromGoogleMaps() {
  // Google Maps 短連結：https://maps.app.goo.gl/MVZZdmsTk9hrH9Ap9
  // 請在 Google Maps 中打開此連結，然後：
  // 1. 右鍵點擊位置
  // 2. 選擇「這是什麼？」或「What's here?」
  // 3. 複製座標（格式：緯度, 經度）
  // 
  // 或者使用以下預設座標（綜三館廁所正確座標：23°42'12.3"N 120°25'53.1"E）：
  const defaultFacility = defaultFacilities.campus2 && defaultFacilities.campus2[0];
  return defaultFacility ? [defaultFacility.lat, defaultFacility.lng] : [23.7034167, 120.4314167];
}

/**
 * 手動更新綜三館廁所點位的座標
 * @param {number} lat - 新的緯度
 * @param {number} lng - 新的經度
 * @returns {Object} 更新結果
 * 
 * 使用範例：
 * updateZongSanToiletCoordinates(23.7034167, 120.4314167);
 */
function updateZongSanToiletCoordinates(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || isNaN(lat) || isNaN(lng)) {
    safeLog.error('❌ 錯誤：請提供有效的緯度和經度數值');
    return { success: false, error: '無效的座標值' };
  }
  
  // 重新載入設施數據
  facilities = loadFacilities();
  
  if (!facilities.campus2) {
    facilities.campus2 = [];
  }
  
  // 尋找綜三館廁所點位
  const zongSanToilet = facilities.campus2.find(f => 
    f.building === '綜三館' && 
    f.type === 'toilet' && 
    f.gender === '男' &&
    f.name && f.name.includes('1~10')
  );
  
  if (!zongSanToilet) {
    safeLog.warn('⚠️ 未找到綜三館廁所點位，將創建新的點位');
    // 如果不存在，創建新點位
    facilities.campus2.push({
      id: 2001,
      type: 'toilet',
      name: '綜三館 1~10F 男生廁所',
      building: '綜三館',
      floor: '1~10F',
      campus: 'campus2',
      photos: [],
      photo: null,
      lat: lat,
      lng: lng,
      gender: '男',
      status: '正常',
      accessible: true,
      createdAt: new Date().toISOString()
    });
  } else {
    // 更新現有點位的座標
    const oldLat = zongSanToilet.lat;
    const oldLng = zongSanToilet.lng;
    zongSanToilet.lat = lat;
    zongSanToilet.lng = lng;
    zongSanToilet.updatedAt = new Date().toISOString();
    safeLog.log(`✅ 已更新座標：從 [${oldLat}, ${oldLng}] 改為 [${lat}, ${lng}]`);
  }
  
  // 保存到 localStorage
  saveFacilities();
  
  // 如果地圖已初始化且當前在第二校區，更新地圖顯示
  if (typeof map !== 'undefined' && map) {
    if (currentCampus === 'campus2') {
      safeLog.log('🔄 更新地圖顯示...');
      renderMarkers();
      updateStats();
    } else {
      safeLog.log(`ℹ️ 當前校區為 ${currentCampus}，請切換到第二校區查看更新後的點位`);
    }
  }
  
  const result = {
    success: true,
    coordinates: [lat, lng],
    facility: zongSanToilet || facilities.campus2[facilities.campus2.length - 1]
  };
  
  safeLog.log('✅ 座標更新完成！', result);
  if (typeof showToast === 'function') {
    showToast(`已更新座標為：${lat}, ${lng}`, 'success');
  }
  
  return result;
}

/**
 * 將圖片檔案轉換為 base64 字串
 * @param {File} file - 圖片檔案
 * @returns {Promise<string>} base64 字符串
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * 批量將多個圖片檔案轉換為 base64 陣列
 * @param {FileList|Array<File>} files - 圖片檔案列表
 * @returns {Promise<Array<string>>} base64 字串陣列
 */
async function filesToBase64(files) {
  const fileArray = Array.from(files).slice(0, 3); // 最多3張
  return Promise.all(fileArray.map(file => fileToBase64(file)));
}

/**
 * 簡化版：使用檔案輸入元素批量添加設施
 * 此函數會從頁面上的檔案輸入元素讀取照片
 * @param {HTMLInputElement} fileInput - 檔案輸入元素（可選，如果不提供則不添加照片）
 * @param {Array<number>} coordinates - GPS 座標 [lat, lng]（可選）
 */
async function addZongSanToiletsWithFiles(fileInput = null, coordinates = null) {
  let photos = [];
  
  if (fileInput && fileInput.files && fileInput.files.length > 0) {
    try {
      photos = await filesToBase64(fileInput.files);
      safeLog.log(`✅ 已讀取 ${photos.length} 張照片`);
    } catch (error) {
      safeLog.error('❌ 讀取照片失敗：', error);
      showToast('讀取照片失敗，將繼續新增設施（無照片）', 'warning');
    }
  }
  
  return addZongSanBuildingToilets(photos, coordinates);
}

// ========================================
// 使用說明
// ========================================
// 
// 方法 1：最簡單 - 使用預設座標（綜三館廁所正確座標），不添加照片（照片可後續通過界面添加）
// addZongSanBuildingToilets();
//
// 方法 2：使用自訂座標
// addZongSanBuildingToilets([], [defaultFacilities.campus2[0].lat, defaultFacilities.campus2[0].lng]);
//
// 方法 3：從檔案輸入元素讀取照片（推薦）
// 1. 在頁面上創建一個臨時的檔案輸入：const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.accept = 'image/*';
// 2. 點擊選擇照片（3張）
// 3. 執行：addZongSanToiletsWithFiles(input);
//
// 方法 4：手動提供 base64 照片
// const photos = ['data:image/jpeg;base64,...', 'data:image/jpeg;base64,...', 'data:image/jpeg;base64,...'];
// addZongSanBuildingToilets(photos, [defaultFacilities.campus2[0].lat, defaultFacilities.campus2[0].lng]);
//
// 注意：此函數現在只創建一個點位，代表綜三館 1~10F 的男生廁所
//
// 方法 5：從現有圖片 URL 轉換（需要先下載並轉換）
// 注意：由於瀏覽器安全限制，無法直接從 Google Maps 圖片 URL 讀取
// 您需要先下載圖片到本機，然後使用方法 3


