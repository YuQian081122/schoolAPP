/**
 * Gemini API Chat Endpoint
 * 安全地呼叫 Google Gemini API，API key 存於環境變數
 */

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
    return res.status(405).json({ 
      error: 'Method not allowed',
      message: '只支援 POST 請求'
    });
  }

  try {
    // 從環境變數獲取 Gemini API Key
    const apiKey = process.env.GEMINI_API_KEY;
    const modelName = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp';

    if (!apiKey) {
      console.warn('[Gemini API] GEMINI_API_KEY 環境變數未設置');
      return res.status(500).json({
        error: 'Gemini API 未配置',
        message: '請在 Vercel 環境變數中設置 GEMINI_API_KEY'
      });
    }

    // 驗證請求體
    if (!req.body || typeof req.body !== 'object') {
      console.warn('[Gemini API] 無效的請求體:', req.body);
      return res.status(400).json({
        error: '請求格式錯誤',
        message: '請求體必須是 JSON 對象'
      });
    }

    // 驗證必要欄位
    const { message, language = 'zh', conversation_context } = req.body;
    
    if (!message || typeof message !== 'string' || !message.trim()) {
      console.warn('[Gemini API] 缺少必要欄位 message:', req.body);
      return res.status(400).json({
        error: '請求格式錯誤',
        message: '缺少必要欄位 "message"'
      });
    }

    console.log(`[Gemini API] 收到請求:`, {
      messageLength: message.length,
      language,
      hasContext: !!conversation_context
    });

    // 構建系統提示詞（增強版，包含校園具體資訊）
    const systemPrompt = language === 'en'
      ? `You are a helpful campus assistant chatbot for National Formosa University (NFU).
You help students and visitors find facilities, answer questions about the campus, and provide friendly, accurate information.

**Campus Information:**
- NFU has 3 campuses: Campus 1 (第一校區), Campus 2 (第二校區), and Campus 3 (第三校區)
- Main buildings include: Zongsan Building (綜三館), and other campus buildings
- Facilities available: restrooms (toilets), water fountains, and trash cans

**Facility Types:**
- Restrooms (toilets): Can be men's (男), women's (女), or unisex/gender-inclusive (性別友善)
- Water fountains (飲水機): Drinking water dispensers
- Trash cans (垃圾桶): Waste bins

**Facility Status:**
- Normal (正常): Working properly
- Under maintenance (維修中): Currently being repaired
- Malfunction (故障): Not working
- Temporarily closed (暫停使用): Temporarily unavailable
- Unusable (無法使用): Cannot be used
- Overflowing (滿出): Trash can is full
- Cleaning (清潔中): Currently being cleaned
- Partially damaged (部分損壞): Some parts not working

**Response Guidelines:**
- Keep responses concise (under 200 words when possible)
- Be friendly and helpful
- If asked about facilities, guide users to use the map or ask specific questions
- If you don't know specific building or facility details, suggest users check the map
- Always respond in the same language as the user's question
- Use emojis sparingly and appropriately`
      : `你是一個友善的校園助手聊天機器人，服務於國立虎尾科技大學。
你幫助學生和訪客查找設施、回答校園相關問題，並提供友善、準確的資訊。

**校園資訊：**
- 虎尾科技大學有三個校區：第一校區、第二校區、第三校區
- 主要建築包括：綜三館等校園建築
- 可用設施：廁所、飲水機、垃圾桶

**設施類型：**
- 廁所：可分為男廁、女廁、性別友善廁所
- 飲水機：提供飲用水的設備
- 垃圾桶：廢棄物收集容器

**設施狀態：**
- 正常：運作正常
- 維修中：正在維修
- 故障：無法使用
- 暫停使用：暫時無法使用
- 無法使用：完全無法使用
- 滿出：垃圾桶已滿
- 清潔中：正在清潔
- 部分損壞：部分功能無法使用

**回應指南：**
- 保持回應簡潔（盡量在 200 字以內）
- 友善且有用
- 如果被問到設施相關問題，引導用戶使用地圖或詢問具體問題
- 如果不確定特定建築或設施的詳細資訊，建議用戶查看地圖
- 始終使用與用戶問題相同的語言回應
- 適度使用表情符號`;

    // 構建完整提示詞
    const promptParts = [systemPrompt];

    // 添加對話上下文（如果有的話）
    if (conversation_context && Array.isArray(conversation_context) && conversation_context.length > 0) {
      const contextText = language === 'en' ? 'Conversation context:' : '對話上下文：';
      promptParts.push(`\n\n${contextText}`);
      // 只使用最近 5 條對話
      conversation_context.slice(-5).forEach(ctx => {
        promptParts.push(`- ${ctx}`);
      });
    }

    // 添加用戶訊息
    const userQuestionLabel = language === 'en' ? 'User question:' : '用戶問題：';
    promptParts.push(`\n\n${userQuestionLabel}${message}`);

    // 添加回應指示
    const responseInstruction = language === 'en'
      ? '\n\nPlease provide a helpful response:'
      : '\n\n請提供有用的回應：';
    promptParts.push(responseInstruction);

    const fullPrompt = promptParts.join('\n');

    // 呼叫 Gemini API（帶重試機制）
    const maxRetries = 2;
    let lastError = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // 使用 AbortController 實現超時（15秒）
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          console.warn(`[Gemini API] 請求超時（15秒）- 嘗試 ${attempt + 1}/${maxRetries + 1}`);
          controller.abort();
        }, 15000);

        const geminiUrl = `https://generativeai.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        
        const response = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: fullPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.6, // 降低溫度以提高一致性
              topP: 0.85, // 稍微提高 topP
              topK: 40,
              maxOutputTokens: 800, // 減少最大輸出長度，確保回應簡潔
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          // 嘗試讀取錯誤訊息
          let errorMessage = `HTTP error! status: ${response.status} ${response.statusText}`;
          try {
            const errorData = await response.json();
            if (errorData.error && errorData.error.message) {
              errorMessage = errorData.error.message;
            }
          } catch (e) {
            // 忽略解析錯誤
          }
          
          console.error(`[Gemini API] API 響應錯誤: ${response.status}`, errorMessage);
          
          // 處理配額限制（429）- 使用指數退避重試
          if (response.status === 429) {
            if (attempt < maxRetries) {
              const retryDelay = Math.pow(2, attempt) * 1000; // 指數退避：1s, 2s, 4s
              console.warn(`[Gemini API] 配額限制，${retryDelay}ms 後重試 (${attempt + 1}/${maxRetries + 1})`);
              await new Promise(resolve => setTimeout(resolve, retryDelay));
              lastError = new Error(errorMessage);
              continue; // 重試
            } else {
              return res.status(429).json({
                error: '配額限制',
                message: language === 'en' 
                  ? 'API quota exceeded. Please try again later.'
                  : 'API 配額已達上限，請稍後再試。'
              });
            }
          }
          
          // 處理認證錯誤（401/403）- 不重試
          if (response.status === 401 || response.status === 403) {
            return res.status(401).json({
              error: '認證失敗',
              message: language === 'en'
                ? 'Invalid API key. Please check GEMINI_API_KEY environment variable.'
                : 'API key 無效，請檢查 GEMINI_API_KEY 環境變數。'
            });
          }
          
          // 其他錯誤：如果是 5xx 錯誤且還有重試機會，則重試
          if (response.status >= 500 && attempt < maxRetries) {
            const retryDelay = Math.pow(2, attempt) * 1000;
            console.warn(`[Gemini API] 服務器錯誤 ${response.status}，${retryDelay}ms 後重試 (${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            lastError = new Error(errorMessage);
            continue; // 重試
          }
          
          throw new Error(errorMessage);
        }

        const data = await response.json();
        
        // 提取回應文本
        if (data.candidates && data.candidates.length > 0) {
          const candidate = data.candidates[0];
          
          // 檢查是否被安全過濾器阻止
          if (candidate.finishReason === 'SAFETY') {
            console.warn('[Gemini API] 回應被安全過濾器阻止');
            throw new Error(language === 'en' 
              ? 'Response blocked by safety filter. Please rephrase your question.'
              : '回應被安全過濾器阻止，請重新表述您的問題。');
          }
          
          if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
            let responseText = candidate.content.parts[0].text;
            
            // 驗證回應長度（如果太長則截斷）
            if (responseText.length > 2000) {
              console.warn(`[Gemini API] 回應過長 (${responseText.length} 字元)，截斷至 2000 字元`);
              responseText = responseText.substring(0, 2000) + '...';
            }
            
            // 驗證回應不為空
            if (!responseText.trim()) {
              throw new Error('API 返回了空回應');
            }
            
            console.log(`[Gemini API] 成功生成回應，長度: ${responseText.length} (嘗試 ${attempt + 1})`);
            
            return res.status(200).json({
              text: responseText.trim(),
              language,
              source: 'gemini'
            });
          }
        }
        
        console.warn('[Gemini API] API 返回了無效的響應格式:', data);
        throw new Error('API 返回了無效的響應格式');
        
      } catch (error) {
        // 處理超時錯誤 - 如果有重試機會則重試
        if (error.name === 'AbortError') {
          if (attempt < maxRetries) {
            const retryDelay = Math.pow(2, attempt) * 1000;
            console.warn(`[Gemini API] 請求超時，${retryDelay}ms 後重試 (${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            lastError = error;
            continue; // 重試
          } else {
            console.error('[Gemini API] 請求超時，已達最大重試次數');
            return res.status(504).json({
              error: '請求超時',
              message: language === 'en'
                ? 'Request timeout. Please try again.'
                : '請求超時，請稍後再試。'
            });
          }
        }
        
        // 處理網絡錯誤 - 如果有重試機會則重試
        if (error.message && (error.message.includes('fetch') || error.message.includes('network'))) {
          if (attempt < maxRetries) {
            const retryDelay = Math.pow(2, attempt) * 1000;
            console.warn(`[Gemini API] 網絡錯誤，${retryDelay}ms 後重試 (${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            lastError = error;
            continue; // 重試
          }
        }
        
        // 其他錯誤：如果有重試機會則重試
        if (attempt < maxRetries) {
          const retryDelay = Math.pow(2, attempt) * 1000;
          console.warn(`[Gemini API] 錯誤: ${error.message}，${retryDelay}ms 後重試 (${attempt + 1}/${maxRetries + 1})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          lastError = error;
          continue; // 重試
        }
        
        // 已達最大重試次數，返回錯誤
        const errorMessage = (lastError || error).message || '未知錯誤';
        console.error(`[Gemini API] API 調用失敗（已重試 ${maxRetries} 次）:`, errorMessage);
        
        return res.status(500).json({
          error: 'API 調用失敗',
          message: language === 'en'
            ? `Failed to call Gemini API after ${maxRetries + 1} attempts: ${errorMessage}`
            : `無法呼叫 Gemini API（已重試 ${maxRetries} 次）：${errorMessage}`
        });
      }
    }
  } catch (error) {
    console.error('[Gemini API] 內部錯誤:', error);
    return res.status(500).json({
      error: '服務器錯誤',
      message: error.message || 'Internal server error'
    });
  }
}
