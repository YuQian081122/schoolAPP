import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// 中間件
app.use(express.json());
app.use(express.static(__dirname));

// CORS 中間件
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Rasa Webhook 代理
app.post('/api/rasa/webhook', async (req, res) => {
  try {
    const rasaUrl = process.env.RASA_API_URL || 'https://rasa-service.zeabur.app';
    
    console.log('[Rasa Proxy] 轉發請求到:', `${rasaUrl}/webhooks/rest/webhook`);
    console.log('[Rasa Proxy] 請求體:', req.body);
    
    const response = await fetch(`${rasaUrl}/webhooks/rest/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
      timeout: 30000
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Rasa Proxy] 錯誤響應:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Rasa 服務器錯誤: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('[Rasa Proxy] 成功回應:', data);
    res.json(data);
  } catch (error) {
    console.error('[Rasa Proxy] 錯誤:', error);
    res.status(500).json({ 
      error: 'Rasa API 調用失敗',
      message: error.message 
    });
  }
});

// Gemini API 代理
app.post('/api/gemini/chat', async (req, res) => {
  try {
    // 支持兩種環境變數名稱（向後兼容）
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVEAI_API_KEY;
    if (!apiKey) {
      console.error('[Gemini Proxy] API Key 未配置');
      return res.status(500).json({ 
        error: 'Gemini API key not configured',
        message: '請設置 GEMINI_API_KEY 或 GOOGLE_GENERATIVEAI_API_KEY 環境變數'
      });
    }

    // 驗證請求體
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ 
        error: '請求格式錯誤',
        message: '請求體必須是 JSON 對象'
      });
    }

    const { message, language = 'zh', conversation_context } = req.body;
    
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ 
        error: '請求格式錯誤',
        message: '缺少必要欄位 "message"'
      });
    }

    console.log('[Gemini Proxy] 調用 Gemini API:', {
      messageLength: message.length,
      language,
      hasContext: !!conversation_context
    });

    // 構建系統提示詞
    const systemPrompt = language === 'en'
      ? `You are a helpful campus assistant chatbot for National Formosa University (NFU). Keep responses concise and friendly.`
      : `你是一個友善的校園助手聊天機器人，服務於國立虎尾科技大學。保持回應簡潔且友善。`;

    // 構建完整提示詞
    let fullPrompt = systemPrompt;
    if (conversation_context && Array.isArray(conversation_context) && conversation_context.length > 0) {
      fullPrompt += '\n\n對話上下文：\n';
      conversation_context.slice(-5).forEach(ctx => {
        fullPrompt += `- ${ctx}\n`;
      });
    }
    fullPrompt += `\n\n用戶問題：${message}`;

    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: fullPrompt }]
          }],
          generationConfig: {
            temperature: 0.6,
            topP: 0.85,
            topK: 40,
            maxOutputTokens: 800
          }
        }),
        timeout: 30000
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Gemini Proxy] 錯誤響應:', response.status, errorText);
      return res.status(response.status).json({ 
        error: `Gemini API 錯誤: ${response.status}`,
        details: errorText 
      });
    }

    const data = await response.json();
    
    // 提取回應文本
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0];
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const responseText = candidate.content.parts[0].text;
        console.log('[Gemini Proxy] 成功回應，長度:', responseText.length);
        return res.json({
          text: responseText.trim(),
          language,
          source: 'gemini'
        });
      }
    }
    
    console.warn('[Gemini Proxy] API 返回了無效的響應格式');
    res.status(500).json({ 
      error: 'API 返回了無效的響應格式'
    });
  } catch (error) {
    console.error('[Gemini Proxy] 錯誤:', error);
    res.status(500).json({ 
      error: 'Gemini API 調用失敗',
      message: error.message 
    });
  }
});

// 提供 HTML 文件
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/ai-chat.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai-chat.html'));
});

app.get('/ai-chat-mobile.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'ai-chat-mobile.html'));
});

// 健康檢查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 School App 前端服務器運行在端口 ${PORT}`);
  console.log(`📍 訪問地址: http://localhost:${PORT}`);
  console.log(`🔗 Rasa API: ${process.env.RASA_API_URL || 'https://rasa-service.zeabur.app'}`);
});
