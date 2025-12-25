/**
 * Rasa API 配置檢查腳本
 * 用於驗證 Rasa API 配置是否正確
 */

async function checkRasaConfig() {
  console.log('🔍 開始檢查 Rasa API 配置...\n');

  const results = {
    statusCheck: null,
    webhookCheck: null,
    directZeaburCheck: null,
    configSummary: {}
  };

  // 1. 檢查 Status API
  console.log('1️⃣ 檢查 Status API (/api/rasa/status)...');
  try {
    const statusResponse = await fetch('/api/rasa/status');
    const statusData = await statusResponse.json();
    
    if (statusResponse.ok) {
      console.log('✅ Status API 正常');
      console.log('   回應:', statusData);
      results.statusCheck = { success: true, data: statusData };
      
      if (statusData.status === 'no_server') {
        console.log('⚠️  警告: Rasa 服務器未配置');
        console.log('   請在 Vercel Dashboard 設置 RASA_SERVER_URL 環境變數');
      }
    } else {
      console.log('❌ Status API 錯誤:', statusResponse.status);
      console.log('   回應:', statusData);
      results.statusCheck = { success: false, error: statusData };
    }
  } catch (error) {
    console.log('❌ Status API 連接失敗:', error.message);
    results.statusCheck = { success: false, error: error.message };
  }

  console.log('');

  // 2. 檢查 Webhook API
  console.log('2️⃣ 檢查 Webhook API (/rasa/webhooks/rest/webhook)...');
  try {
    const webhookResponse = await fetch('/rasa/webhooks/rest/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: 'config-check',
        message: '測試連接'
      })
    });
    const webhookData = await webhookResponse.json();
    
    if (webhookResponse.ok) {
      console.log('✅ Webhook API 正常');
      console.log('   回應:', webhookData);
      results.webhookCheck = { success: true, data: webhookData };
    } else {
      console.log('❌ Webhook API 錯誤:', webhookResponse.status);
      console.log('   回應:', webhookData);
      results.webhookCheck = { success: false, error: webhookData };
    }
  } catch (error) {
    console.log('❌ Webhook API 連接失敗:', error.message);
    results.webhookCheck = { success: false, error: error.message };
  }

  console.log('');

  // 3. 直接檢查 Zeabur 服務（可選）
  console.log('3️⃣ 直接檢查 Zeabur 服務...');
  try {
    const zeaburResponse = await fetch('https://rasa-service.zeabur.app/status');
    const zeaburData = await zeaburResponse.json();
    
    if (zeaburResponse.ok) {
      console.log('✅ Zeabur 服務正常');
      console.log('   回應:', zeaburData);
      results.directZeaburCheck = { success: true, data: zeaburData };
    } else {
      console.log('⚠️  Zeabur 服務響應異常:', zeaburResponse.status);
      console.log('   回應:', zeaburData);
      results.directZeaburCheck = { success: false, error: zeaburData };
    }
  } catch (error) {
    console.log('❌ Zeabur 服務連接失敗:', error.message);
    console.log('   這可能是 CORS 問題，屬於正常情況（應使用 API 代理）');
    results.directZeaburCheck = { success: false, error: error.message, note: 'CORS 正常' };
  }

  console.log('\n📊 配置摘要:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  if (results.statusCheck?.success) {
    console.log('✅ Status API: 正常');
  } else {
    console.log('❌ Status API: 異常');
    if (results.statusCheck?.error?.message?.includes('未配置')) {
      console.log('   → 請在 Vercel Dashboard 設置 RASA_SERVER_URL 環境變數');
      console.log('   → 值應為: https://rasa-service.zeabur.app');
    }
  }

  if (results.webhookCheck?.success) {
    console.log('✅ Webhook API: 正常');
  } else {
    console.log('❌ Webhook API: 異常');
  }

  if (results.directZeaburCheck?.success) {
    console.log('✅ Zeabur 服務: 正常');
  } else {
    console.log('⚠️  Zeabur 服務: 無法直接訪問（可能是 CORS，應使用 API 代理）');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // 返回結果供其他腳本使用
  return results;
}

// 如果在瀏覽器環境中，自動執行
if (typeof window !== 'undefined') {
  // 等待頁面載入完成
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(checkRasaConfig, 1000); // 等待 1 秒確保 API 路由已準備好
    });
  } else {
    setTimeout(checkRasaConfig, 1000);
  }
  
  // 導出到全局，方便在控制台手動調用
  window.checkRasaConfig = checkRasaConfig;
}

// 如果在 Node.js 環境中
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { checkRasaConfig };
}

