# Zeabur Rasa API 端點配置說明

**配置日期**: 2025-12-23  
**Rasa 服務器 URL**: `https://rasa-service.zeabur.app`

---

## 配置變更

### 1. 更新 `ai-chat.js` 中的 Rasa URL 獲取邏輯

在 Vercel 部署環境中，系統現在會：
- 優先使用 Zeabur Rasa 服務器：`https://rasa-service.zeabur.app`
- 如果 localStorage 中有保存的 Zeabur URL，則使用保存的 URL
- 自動保存 URL 到 localStorage 以便下次使用

### 2. 更新允許的域名列表

在 `AppConfig.ALLOWED_DOMAINS` 中添加了：
- `'zeabur.app'` - Zeabur 部署域名

### 3. 更新 URL 驗證邏輯

允許連接到 Zeabur 域名（`*.zeabur.app`）

### 4. 更新 Content Security Policy (CSP)

在 `ai-chat.html` 中更新了 CSP，允許連接到：
- `*.zeabur.app`
- `*.railway.app`

---

## 配置詳情

### 修改的檔案

1. **`ai-chat.js`**
   - 修改 `getRasaServerURL()` 函數
   - 更新 `AppConfig.ALLOWED_DOMAINS`
   - 更新 URL 驗證邏輯

2. **`ai-chat.html`**
   - 更新 Content Security Policy

### 代碼變更

#### `ai-chat.js` - Rasa URL 獲取邏輯

```javascript
// 檢查是否為 Vercel 部署
const isVercel = hostname.includes('vercel.app') || hostname.includes('vercel.com');
if (isVercel) {
  // 優先檢查是否配置了 Zeabur Rasa 服務器 URL
  const zeaburRasaUrl = 'https://rasa-service.zeabur.app';
  
  // 檢查 localStorage 中是否有自定義 URL
  const savedRasaUrl = Utils.storage.getString(RASA_URL_STORAGE_KEY);
  if (savedRasaUrl && savedRasaUrl.includes('zeabur.app')) {
    Utils.logger.log(`🌐 Vercel 環境：使用保存的 Zeabur URL：${savedRasaUrl}`);
    return savedRasaUrl;
  }
  
  // 使用預設的 Zeabur Rasa 服務器 URL
  Utils.logger.log(`🌐 檢測到 Vercel 部署，使用 Zeabur Rasa 服務器：${zeaburRasaUrl}`);
  // 保存到 localStorage 以便下次使用
  Utils.storage.setString(RASA_URL_STORAGE_KEY, zeaburRasaUrl);
  return zeaburRasaUrl;
}
```

---

## 使用說明

### 自動配置

當應用在 Vercel 環境中運行時，會自動：
1. 檢測到 Vercel 部署環境
2. 使用 `https://rasa-service.zeabur.app` 作為 Rasa 服務器 URL
3. 將 URL 保存到 localStorage

### 手動配置（可選）

如果需要使用不同的 Zeabur URL，可以：

1. **通過 URL 參數**：
   ```
   https://your-app.vercel.app/ai-chat.html?rasa_url=https://your-custom-zeabur.app
   ```

2. **通過瀏覽器控制台**：
   ```javascript
   localStorage.setItem('nfu_rasa_server_url', 'https://your-custom-zeabur.app');
   location.reload();
   ```

---

## 測試

### 測試步驟

1. 部署到 Vercel
2. 訪問 AI 助手頁面
3. 打開瀏覽器開發者工具（F12）
4. 查看控制台日誌，應該看到：
   ```
   🌐 檢測到 Vercel 部署，使用 Zeabur Rasa 服務器：https://rasa-service.zeabur.app
   ```
5. 發送測試消息，確認 AI 回應正常

### 驗證連接

檢查網絡請求：
- 應該看到請求發送到 `https://rasa-service.zeabur.app/status`
- 應該看到請求發送到 `https://rasa-service.zeabur.app/webhooks/rest/webhook`

---

## 注意事項

1. **CORS 配置**：確保 Zeabur Rasa 服務器配置了正確的 CORS 設置，允許來自 Vercel 域名的請求

2. **HTTPS**：Zeabur 服務器必須使用 HTTPS（`https://`）

3. **環境變數**：如果之前使用 Vercel API 路由代理，現在不再需要設置 `RASA_SERVER_URL` 環境變數（因為直接連接）

4. **備用方案**：如果 Zeabur URL 無法連接，系統會嘗試其他備用方案

---

## 相關文檔

- `環境變數配置指南.md` - 環境變數設置說明
- `部署後測試報告.md` - 部署測試結果

---

**配置狀態**: ✅ 完成  
**最後更新**: 2025-12-23
