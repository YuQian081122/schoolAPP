export default async function handler(req, res) {
  // 設置 CORS 頭
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 處理 OPTIONS 預檢請求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 只處理 POST 請求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 從環境變量獲取 Rasa 服務器 URL
    const rasaUrl = process.env.RASA_SERVER_URL || '';

    if (!rasaUrl) {
      console.warn('[Rasa Webhook API] Rasa 服務器 URL 未配置');
      return res.status(200).json([{
        text: '⚠️ Rasa 服務器未配置。請在 Vercel 環境變量中設置 RASA_SERVER_URL',
        recipient_id: 'default'
      }]);
    }

    // 驗證 URL 格式
    try {
      new URL(rasaUrl);
    } catch (urlError) {
      console.error('[Rasa Webhook API] 無效的 Rasa URL:', rasaUrl, urlError);
      return res.status(500).json([{
        text: `❌ 無效的 Rasa 服務器 URL: ${rasaUrl}`,
        recipient_id: req.body?.sender || 'default'
      }]);
    }

    // 驗證請求體
    if (!req.body || typeof req.body !== 'object') {
      console.warn('[Rasa Webhook API] 無效的請求體:', req.body);
      return res.status(400).json([{
        text: '❌ 請求格式錯誤：請求體必須是 JSON 對象',
        recipient_id: 'default'
      }]);
    }

    // 驗證必要欄位
    if (!req.body.message && !req.body.text) {
      console.warn('[Rasa Webhook API] 缺少必要欄位 (message 或 text):', req.body);
      return res.status(400).json([{
        text: '❌ 請求格式錯誤：缺少必要欄位 "message" 或 "text"',
        recipient_id: req.body?.sender || 'default'
      }]);
    }

    // 轉發請求到外部 Rasa 服務器
    const messageText = req.body.message || req.body.text || '';
    console.log(`[Rasa Webhook API] 轉發消息到 Rasa: ${rasaUrl}/webhooks/rest/webhook`, {
      sender: req.body.sender,
      message: messageText.substring(0, 100) // 只記錄前100個字符
    });
    
    try {
      // 使用 AbortController 實現超時（兼容性更好）
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.warn('[Rasa Webhook API] 請求超時（30秒）');
        controller.abort();
      }, 30000); // 30秒超時

      const response = await fetch(`${rasaUrl}/webhooks/rest/webhook`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(req.body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // 嘗試讀取錯誤訊息
        let errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
        try {
          const errorData = await response.text();
          if (errorData) {
            errorMessage += ` - ${errorData.substring(0, 200)}`; // 限制錯誤訊息長度
          }
        } catch (e) {
          // 忽略解析錯誤
        }
        console.error(`[Rasa Webhook API] Rasa 服務器響應錯誤: ${response.status}`, errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // 驗證回應格式
      if (!Array.isArray(data) && (!data || typeof data !== 'object')) {
        console.error('[Rasa Webhook API] Rasa 服務器返回了無效的響應格式:', typeof data, data);
        throw new Error('Rasa 服務器返回了無效的響應格式');
      }

      console.log(`[Rasa Webhook API] 成功收到 Rasa 響應，包含 ${Array.isArray(data) ? data.length : 1} 條消息`);
      return res.status(200).json(data);
    } catch (error) {
      // 外部服務器不可用
      const errorMessage = error.name === 'AbortError' 
        ? '請求超時（30秒）' 
        : error.message || '未知錯誤';
      
      console.error('[Rasa Webhook API] 連接失敗:', errorMessage, error);
      
      return res.status(503).json([{
        text: `❌ 無法連接到 Rasa 服務器: ${errorMessage}`,
        recipient_id: req.body?.sender || 'default'
      }]);
    }
  } catch (error) {
    console.error('[Rasa Webhook API] 內部錯誤:', error);
    return res.status(500).json([{
      text: `❌ 服務器錯誤: ${error.message || 'Internal server error'}`,
      recipient_id: req.body?.sender || 'default'
    }]);
  }
}