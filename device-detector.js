// 統一的設備檢測和自動切換系統
(function() {
  'use strict';

  // 檢測設備類型
  function detectDevice() {
    const userAgent = navigator.userAgent || navigator.vendor || window.opera;
    const isMobileUA = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
    const isTablet = /ipad|android(?!.*mobile)|tablet/i.test(userAgent.toLowerCase());
    const screenWidth = window.innerWidth || document.documentElement.clientWidth;
    const screenHeight = window.innerHeight || document.documentElement.clientHeight;
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    // 判斷是否為移動設備
    const isMobile = (isMobileUA || isTablet || screenWidth <= 768) && isTouchDevice;
    
    return {
      isMobile: isMobile,
      isTablet: isTablet,
      isDesktop: !isMobile && !isTablet,
      screenWidth: screenWidth,
      screenHeight: screenHeight,
      isTouchDevice: isTouchDevice,
      userAgent: userAgent
    };
  }

  // 自動重定向到合適的版本
  function autoRedirect() {
    const device = detectDevice();
    const currentPath = window.location.pathname;
    const isMobilePage = currentPath.includes('mobile');
    const isDesktopPage = currentPath.includes('ai-chat.html') && !isMobilePage;

    // 如果在桌面版頁面但檢測到是移動設備
    if (isDesktopPage && device.isMobile) {
      const mobilePath = currentPath.replace('ai-chat.html', 'ai-chat-mobile.html');
      window.location.replace(mobilePath);
      return;
    }

    // 移除從 mobile 跳回桌面版的邏輯，避免來回跳動
    // 一旦進入 mobile 版本，就保持在 mobile 版本
    // 如果用戶真的需要桌面版，可以手動訪問桌面版 URL
  }

  // 更新連結指向
  function updateLinks() {
    const device = detectDevice();
    const aiChatLinks = document.querySelectorAll('a[href*="ai-chat"]');
    
    aiChatLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (device.isMobile && href && !href.includes('mobile')) {
        link.setAttribute('href', href.replace('ai-chat.html', 'ai-chat-mobile.html'));
      } else if (device.isDesktop && href && href.includes('mobile')) {
        link.setAttribute('href', href.replace('ai-chat-mobile.html', 'ai-chat.html'));
      }
    });
  }

  // 移除 resize 事件監聽器，避免窗口大小變化時觸發跳轉
  // 這會導致來回跳動的問題，特別是對於平板設備
  // 如果需要響應式切換，應該由用戶手動選擇，而不是自動跳轉

  // 導出到全局
  window.DeviceDetector = {
    detect: detectDevice,
    autoRedirect: autoRedirect,
    updateLinks: updateLinks
  };

  // 如果不在手機版頁面，執行自動重定向
  // 注意：只在桌面版頁面執行，mobile 版本不會跳回桌面版
  if (!window.location.pathname.includes('mobile')) {
    // 延遲執行，避免影響頁面載入
    // 但由於 ai-chat.html 已經在 head 中執行了檢測，這裡可以跳過或延遲更長時間
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        // 延遲更長時間，讓 head 中的檢測先執行
        setTimeout(function() {
          // 檢查是否已經跳轉（通過檢查 sessionStorage）
          const redirectKey = 'ai-chat-redirect-attempted';
          if (!sessionStorage.getItem(redirectKey)) {
            autoRedirect();
          }
          updateLinks();
        }, 500);
      });
    } else {
      setTimeout(function() {
        const redirectKey = 'ai-chat-redirect-attempted';
        if (!sessionStorage.getItem(redirectKey)) {
          autoRedirect();
        }
        updateLinks();
      }, 500);
    }
  }

})();

