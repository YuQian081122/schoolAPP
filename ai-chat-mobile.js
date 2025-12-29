// 手機專用 AI 助手初始化
(function() {
  'use strict';

  // 檢測是否為移動設備
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // 如果不是移動設備，重定向到桌面版
  if (!isMobile && window.innerWidth > 768) {
    window.location.href = 'ai-chat.html';
    return;
  }

  // 等待 DOM 和 ai-chat.js 載入完成
  let waitAttempts = 0;
  const maxWaitAttempts = 100; // 最多等待 10 秒（100 * 100ms）
  
  function waitForAIChat() {
    waitAttempts++;
    
    // 檢查必要的函數是否已載入（需要兩個函數都存在）
    if (typeof window.handleUserInput === 'function' && typeof window.checkRasaConnection === 'function') {
      if (window.Utils && window.Utils.logger) {
        window.Utils.logger.log('✅ 檢測到 AI 核心函數已載入');
      }
      initMobileAI();
      
      // 立即嘗試檢查 Rasa 連接，然後再等待一下確保所有初始化完成
      const checkConnection = () => {
        window.checkRasaConnection().then(connected => {
          if (connected) {
            if (window.Utils && window.Utils.logger) {
              window.Utils.logger.log('✅ 手機版已連接到 Rasa 伺服器');
            }
            // 顯示連接成功訊息
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
              const connectionMsg = document.createElement('div');
              connectionMsg.className = 'message ai-message';
              connectionMsg.style.cssText = 'opacity: 0.8; font-size: 0.85em; margin-top: 8px; padding: 8px; background: rgba(76, 175, 80, 0.1); border-left: 3px solid #4CAF50;';
              connectionMsg.innerHTML = '<div class="message-content"><div class="message-text">✅ 已連接到 AI 伺服器</div></div>';
              messagesContainer.appendChild(connectionMsg);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          } else {
            if (window.Utils && window.Utils.logger) {
              window.Utils.logger.log('ℹ️ 手機版使用本地處理模式（Rasa 伺服器未啟動）');
            }
            // 顯示本地模式訊息
            const messagesContainer = document.getElementById('chat-messages');
            if (messagesContainer) {
              const localMsg = document.createElement('div');
              localMsg.className = 'message ai-message';
              localMsg.style.cssText = 'opacity: 0.7; font-size: 0.85em; margin-top: 8px; padding: 8px; background: rgba(255, 152, 0, 0.1); border-left: 3px solid #FF9800;';
              localMsg.innerHTML = '<div class="message-content"><div class="message-text">ℹ️ 使用本地處理模式（Rasa 伺服器未啟動）</div></div>';
              messagesContainer.appendChild(localMsg);
              messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
          }
        }).catch(err => {
          if (window.Utils && window.Utils.logger) {
            window.Utils.logger.error('Rasa 連接檢查錯誤:', err);
          }
        });
      };
      
      // 立即檢查一次
      checkConnection();
      
      // 再等待一下確保所有初始化完成後再檢查一次（以防第一次檢查時 Rasa 還沒完全啟動）
      if (window.Utils && window.Utils.timers) {
        window.Utils.timers.setTimeout(checkConnection, 2000);
      } else {
        setTimeout(checkConnection, 2000);
      }
    } else {
      // 如果函數還沒載入，繼續等待
      if (waitAttempts < maxWaitAttempts) {
        if (waitAttempts % 10 === 0) { // 每 1 秒記錄一次
          if (typeof window.handleUserInput !== 'function') {
            if (window.Utils && window.Utils.logger) {
              window.Utils.logger.log(`⏳ 等待 handleUserInput 函數載入... (${waitAttempts}/100)`);
            }
          }
          if (typeof window.checkRasaConnection !== 'function') {
            if (window.Utils && window.Utils.logger) {
              window.Utils.logger.log(`⏳ 等待 checkRasaConnection 函數載入... (${waitAttempts}/100)`);
            }
          }
        }
        if (window.Utils && window.Utils.timers) {
          window.Utils.timers.setTimeout(waitForAIChat, 100);
        } else {
          setTimeout(waitForAIChat, 100);
        }
      } else {
        if (window.Utils && window.Utils.logger) {
          window.Utils.logger.error('❌ 等待超時：無法載入 AI 核心函數');
        }
        const messagesContainer = document.getElementById('chat-messages');
        if (messagesContainer) {
          const errorMsg = document.createElement('div');
          errorMsg.className = 'message ai-message';
          errorMsg.style.cssText = 'opacity: 0.8; font-size: 0.85em; margin-top: 8px; padding: 8px; background: rgba(244, 67, 54, 0.1); border-left: 3px solid #f44336;';
          errorMsg.innerHTML = '<div class="message-content"><div class="message-text">❌ AI 核心功能載入失敗，請重新整理頁面</div></div>';
          messagesContainer.appendChild(errorMsg);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAIChat);
  } else {
    waitForAIChat();
  }

  function initMobileAI() {
    if (window.Utils && window.Utils.logger) {
      window.Utils.logger.log('📱 初始化手機版 AI 助手...');
    }

    // 地圖切換功能
    const mapToggleBtn = document.getElementById('mobile-map-toggle-btn');
    const mapPanel = document.getElementById('mobile-map-panel');
    const mapCloseBtn = document.getElementById('mobile-map-close-btn');

    if (mapToggleBtn && mapPanel) {
      mapToggleBtn.addEventListener('click', function() {
        mapPanel.style.display = 'flex';
        // 延遲初始化地圖，確保面板已顯示
        const initTimeout = window.Utils && window.Utils.timers 
          ? window.Utils.timers.setTimeout(() => {
              if (typeof initAIMap === 'function') {
                initAIMap();
              }
            }, 100)
          : setTimeout(() => {
              if (typeof initAIMap === 'function') {
                initAIMap();
              }
            }, 100);
      });
    }

    if (mapCloseBtn && mapPanel) {
      mapCloseBtn.addEventListener('click', function() {
        mapPanel.style.display = 'none';
      });
    }

    // 手機版使用與桌面版相同的元素 ID（chat-input, send-btn）
    // 這些元素的事件已經在 ai-chat.js 中綁定，這裡不需要重複綁定
    if (window.Utils && window.Utils.logger) {
      window.Utils.logger.log('✅ 手機版元素已使用桌面版 ID，事件由 ai-chat.js 處理');
    }

    // 快速按鈕事件已由 ai-chat.js 處理，這裡不需要重複綁定
    // 只需要確保歷史記錄按鈕能正常工作
    const historyBtn = document.getElementById('history-btn');
    if (historyBtn && typeof showIssueHistory === 'function') {
      // 移除可能存在的舊監聽器
      const newHistoryBtn = historyBtn.cloneNode(true);
      historyBtn.parentNode.replaceChild(newHistoryBtn, historyBtn);
      
      newHistoryBtn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showIssueHistory();
      });
    }

    // 語言切換
    const langBtn = document.getElementById('mobile-language-toggle-btn');
    if (langBtn && typeof toggleLanguage === 'function') {
      langBtn.addEventListener('click', toggleLanguage);
    }

    // 主題切換
    const themeBtn = document.getElementById('mobile-theme-toggle-btn');
    if (themeBtn && typeof toggleTheme === 'function') {
      themeBtn.addEventListener('click', toggleTheme);
    }

    // 表單處理
    const issueForm = document.getElementById('mobile-issue-form');
    if (issueForm) {
      issueForm.addEventListener('submit', function(e) {
        e.preventDefault();
        // 使用桌面版的表單處理邏輯
        if (typeof window.handleUserInput === 'function') {
          const campus = document.getElementById('mobile-issue-campus').value;
          const building = document.getElementById('mobile-issue-building').value;
          const floor = document.getElementById('mobile-issue-floor').value;
          const remark = document.getElementById('mobile-issue-remark').value;
          const problemType = document.getElementById('mobile-issue-problem-type').value;
          
          const reportMessage = `回報設施問題：校區${campus}，建築${building}，樓層${floor}。問題：${remark}`;
          window.handleUserInput(reportMessage);
          
          // 關閉表單
          document.getElementById('mobile-issue-form-container').style.display = 'none';
        }
      });
    }

    // 表單關閉按鈕
    const formCloseBtn = document.getElementById('mobile-issue-form-close-btn');
    const formCancelBtn = document.getElementById('mobile-issue-cancel-btn');
    const formContainer = document.getElementById('mobile-issue-form-container');
    
    if (formCloseBtn && formContainer) {
      formCloseBtn.addEventListener('click', () => {
        formContainer.style.display = 'none';
      });
    }
    
    if (formCancelBtn && formContainer) {
      formCancelBtn.addEventListener('click', () => {
        formContainer.style.display = 'none';
      });
    }

    // 照片上傳
    const photoInput = document.getElementById('mobile-issue-photo');
    const photoPreview = document.getElementById('mobile-issue-photo-preview');
    const photoImg = document.getElementById('mobile-issue-photo-img');
    const photoRemoveBtn = document.getElementById('mobile-issue-photo-remove');
    const photoBase64Input = document.getElementById('mobile-issue-photo-base64');

    if (photoInput && photoPreview && photoImg) {
      photoInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file && file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = function(event) {
            const base64 = event.target.result;
            if (photoBase64Input) photoBase64Input.value = base64;
            photoImg.src = base64;
            photoPreview.style.display = 'block';
          };
          reader.readAsDataURL(file);
        }
      });
    }

    if (photoRemoveBtn && photoPreview) {
      photoRemoveBtn.addEventListener('click', function() {
        if (photoInput) photoInput.value = '';
        if (photoBase64Input) photoBase64Input.value = '';
        photoPreview.style.display = 'none';
      });
    }

    // 地圖校區選擇
    const mapCampusSelect = document.getElementById('mobile-map-campus-select');
    if (mapCampusSelect && typeof campusLocations !== 'undefined') {
      mapCampusSelect.addEventListener('change', function() {
        const campusInfo = campusLocations[this.value];
        if (campusInfo && typeof aiMap !== 'undefined' && aiMap) {
          aiMap.setView(campusInfo.center, campusInfo.zoom);
        }
      });
    }

    // 定位按鈕
    const locationBtn = document.getElementById('mobile-location-btn');
    if (locationBtn && typeof getCurrentLocation === 'function') {
      locationBtn.addEventListener('click', function() {
        getCurrentLocation(true);
      });
    }

    // 防止輸入框聚焦時頁面滾動
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
      chatInput.addEventListener('focus', function(e) {
        // 防止鍵盤彈出時頁面滾動
        e.preventDefault();
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        }, 100);
      }, { passive: false });
      
      chatInput.addEventListener('blur', function() {
        // 鍵盤關閉時確保頁面位置正確
        setTimeout(() => {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
          document.documentElement.scrollTop = 0;
        }, 100);
      });
    }

    if (window.Utils && window.Utils.logger) {
      window.Utils.logger.log('✅ 手機版 AI 助手初始化完成');
    }
  }

  // 覆蓋桌面版的 addMessage 函數，使用手機版元素
  if (typeof window.addMessage === 'function') {
    const originalAddMessage = window.addMessage;
    window.addMessage = function(text, isUser) {
      const messagesContainer = document.getElementById('mobile-chat-messages') || document.getElementById('chat-messages');
      if (messagesContainer) {
        originalAddMessage.call(this, text, isUser);
      }
    };
  }

})();

