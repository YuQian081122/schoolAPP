export default async function handler(req, res) {
  // 設置 CORS 頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 處理 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只處理 GET 請求
  if (req.method !== 'GET') {
    return res.status(405).json({
      status: 'error',
      message: 'Method not allowed. Only GET requests are supported.',
      allowed_methods: ['GET', 'OPTIONS']
    });
  }

  try {
    // 從環境變量獲取 Rasa 服務器 URL
    const rasaUrl = process.env.RASA_SERVER_URL || '';

    if (!rasaUrl) {
      console.warn('[Rasa Status API] Rasa 服務器 URL 未配置');
      return res.status(200).json({
        status: 'no_server',
        message: 'Rasa 服務器未配置。請設置環境變量 RASA_SERVER_URL',
        version: '3.6.0',
        timestamp: new Date().toISOString()
      });
    }

    // 驗證 URL 格式
    try {
      new URL(rasaUrl);
    } catch (urlError) {
      console.error('[Rasa Status API] 無效的 Rasa URL:', rasaUrl, urlError);
      return res.status(500).json({
        status: 'error',
        message: `無效的 Rasa 服務器 URL: ${rasaUrl}`,
        error: urlError.message
      });
    }

    // 轉發請求到外部 Rasa 服務器
    console.log(`[Rasa Status API] 檢查 Rasa 服務器狀態: ${rasaUrl}/status`);
    
    try {
      // 使用 AbortController 實現超時（兼容性更好）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Rasa Status API] 請求超時（5秒）');
        controller.abort();
      }, 5000); // 5秒超時

      const response = await fetch(`${rasaUrl}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error(`[Rasa Status API] Rasa 服務器響應錯誤: ${response.status} ${response.statusText}`, errorText);
        throw new Error(`HTTP error! status: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
      }

      const data = await response.json();
      console.log('[Rasa Status API] Rasa 服務器狀態檢查成功');
      return res.status(200).json(data);
    } catch (error) {
      // 外部服務器不可用
      const errorMessage = error.name === 'AbortError' 
        ? '請求超時（5秒）' 
        : error.message || '未知錯誤';
      
      console.error('[Rasa Status API] 連接失敗:', errorMessage, error);
      
      return res.status(503).json({
        status: 'error',
        message: `無法連接到 Rasa 服務器: ${errorMessage}`,
        rasa_url: rasaUrl,
        error_type: error.name || 'UnknownError',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('[Rasa Status API] 內部錯誤:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Internal server error',
      timestamp: new Date().toISOString()
    });
  }
}