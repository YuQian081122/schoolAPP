# Rasa API 配置完成指南

## 📋 您的 Rasa API 信息

- **完整 Webhook URL**: `https://rasa-service.zeabur.app/webhooks/rest/webhook`
- **基礎 URL**: `https://rasa-service.zeabur.app`
- **Status 端點**: `https://rasa-service.zeabur.app/status`

## ✅ 已完成的配置檢查

### 1. API 路由配置 ✅

您的 Vercel API 路由已經正確配置：

- **`api/rasa/webhook.js`**: 會轉發請求到 `${RASA_SERVER_URL}/webhooks/rest/webhook`
- **`api/rasa/status.js`**: 會檢查 `${RASA_SERVER_URL}/status`

### 2. 前端配置 ✅

前端會自動檢測 Vercel 環境並使用相對路徑：
- `/rasa/webhooks/rest/webhook` → 通過 Vercel API 代理
- `/rasa/status` → 通過 Vercel API 代理

## 🔧 需要在 Vercel 設置的環境變數

### 步驟 1：登入 Vercel Dashboard

1. 訪問 [Vercel Dashboard](https://vercel.com/dashboard)
2. 選擇您的專案

### 步驟 2：設置環境變數

1. 前往 **Settings** → **Environment Variables**
2. 添加以下環境變數：

| 變數名稱 | 值 | 環境 |
|---------|-----|------|
| `RASA_SERVER_URL` | `https://rasa-service.zeabur.app` | Production, Preview, Development |

**重要注意事項：**
- ⚠️ **只填寫基礎 URL**，不要包含 `/webhooks/rest/webhook`
- ✅ 正確：`https://rasa-service.zeabur.app`
- ❌ 錯誤：`https://rasa-service.zeabur.app/webhooks/rest/webhook`

### 步驟 3：重新部署

設置環境變數後：
1. 前往 **Deployments** 標籤
2. 點擊最新部署右側的 **⋯** 選單
3. 選擇 **Redeploy**
4. 或推送新的 commit 觸發自動部署

## 🧪 測試配置

### 測試 1：檢查環境變數

在瀏覽器控制台執行：
```javascript
fetch('/api/rasa/status')
  .then(r => r.json())
  .then(data => {
    console.log('✅ Rasa 狀態:', data);
    if (data.status === 'error' && data.message.includes('未配置')) {
      console.error('❌ 環境變數未設置！請在 Vercel Dashboard 設置 RASA_SERVER_URL');
    }
  })
  .catch(err => console.error('❌ 連接失敗:', err));
```

### 測試 2：測試 Webhook

在瀏覽器控制台執行：
```javascript
fetch('/rasa/webhooks/rest/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    sender: 'test-user',
    message: '你好'
  })
})
  .then(r => r.json())
  .then(data => {
    console.log('✅ Rasa 回應:', data);
  })
  .catch(err => console.error('❌ 請求失敗:', err));
```

### 測試 3：直接測試 Zeabur 服務

在瀏覽器中訪問：
```
https://rasa-service.zeabur.app/status
```

應該返回 JSON 格式的 Rasa 狀態信息。

## 📊 配置流程圖

```
前端 (ai-chat.html)
    ↓
發送請求到: /rasa/webhooks/rest/webhook
    ↓
Vercel API Route (api/rasa/webhook.js)
    ↓
讀取環境變數: RASA_SERVER_URL = https://rasa-service.zeabur.app
    ↓
轉發請求到: https://rasa-service.zeabur.app/webhooks/rest/webhook
    ↓
Zeabur Rasa 服務器
    ↓
返回回應
```

## 🔍 故障排除

### 問題 1：503 錯誤

**症狀：**
```
rasa/status:1 Failed to load resource: the server responded with a status of 503
```

**解決方法：**
1. 確認 Vercel 環境變數 `RASA_SERVER_URL` 已設置
2. 確認值為 `https://rasa-service.zeabur.app`（不包含路徑）
3. 重新部署 Vercel 專案
4. 檢查 Zeabur 服務是否正在運行

### 問題 2：環境變數未生效

**症狀：**
API 返回 "Rasa 服務器未配置"

**解決方法：**
1. 確認環境變數設置在正確的環境（Production/Preview/Development）
2. 重新部署專案
3. 等待幾分鐘讓環境變數生效

### 問題 3：CORS 錯誤

**症狀：**
瀏覽器控制台顯示 CORS 相關錯誤

**解決方法：**
- ✅ 使用相對路徑（`/rasa/...`）而不是直接訪問 Zeabur URL
- ✅ Vercel API 路由已經處理了 CORS 頭部

## ✅ 配置檢查清單

- [ ] 在 Vercel Dashboard 設置 `RASA_SERVER_URL` 環境變數
- [ ] 環境變數值為 `https://rasa-service.zeabur.app`（不包含路徑）
- [ ] 環境變數設置在所有環境（Production, Preview, Development）
- [ ] 重新部署 Vercel 專案
- [ ] 測試 `/api/rasa/status` 端點
- [ ] 測試 `/rasa/webhooks/rest/webhook` 端點
- [ ] 在 AI 聊天界面發送測試消息

## 📝 快速參考

### 環境變數設置

**Vercel Dashboard → Settings → Environment Variables**

```
Key: RASA_SERVER_URL
Value: https://rasa-service.zeabur.app
Environments: Production, Preview, Development
```

### API 端點

- **Status**: `/api/rasa/status` 或 `/rasa/status`
- **Webhook**: `/api/rasa/webhook` 或 `/rasa/webhooks/rest/webhook`

### 直接測試 Zeabur

- **Status**: `https://rasa-service.zeabur.app/status`
- **Webhook**: `https://rasa-service.zeabur.app/webhooks/rest/webhook`

## 🎉 完成後

配置完成後，您的 AI 聊天功能應該可以正常使用！

如果遇到任何問題，請檢查：
1. Vercel 部署日誌
2. 瀏覽器控制台錯誤
3. Zeabur 服務狀態

