# 前後端連接設置完成指南

## ✅ 已完成的工作

1. **前端代碼已更新**：`ai-chat.js` 已修改為自動檢測 Vercel 部署環境，並使用相對路徑 `/rasa` 通過 Vercel API 路由代理連接後端
2. **API Routes 已配置**：`api/rasa/webhook.js` 和 `api/rasa/status.js` 已準備好通過環境變數連接 Zeabur Rasa 服務

## 🔧 需要手動完成的設置

### 步驟 1: 在 Vercel Dashboard 設置環境變數

1. 訪問 Vercel Dashboard：https://vercel.com/sl1314920-8853s-projects/school-app
2. 點擊項目名稱 "school-app"
3. 進入 **Settings** 標籤
4. 點擊左側菜單的 **Environment Variables**
5. 點擊 **Add New** 按鈕
6. 輸入以下信息：
   - **Key**: `RASA_SERVER_URL`
   - **Value**: `https://rasa-service.zeabur.app`
   - **Environment**: 選擇所有環境（Production、Preview、Development）
7. 點擊 **Save**

### 步驟 2: 提交代碼更改到 GitHub（觸發自動部署）

如果您還沒有將代碼更改提交到 GitHub，請執行以下操作：

```bash
git add ai-chat.js
git commit -m "配置前端自動檢測 Vercel 部署環境並使用相對路徑連接 Rasa 後端"
git push origin main
```

或者，如果您想手動觸發部署：
1. 在 Vercel Dashboard 中進入 **Deployments** 標籤
2. 點擊最新的部署右側的 **"..."** 菜單
3. 選擇 **Redeploy**

### 步驟 3: 驗證部署

部署完成後，訪問以下 URL 測試連接：
- 前端 URL: https://school-app-two-pi.vercel.app 或 https://school-app-sl1314920-8853s-projects.vercel.app
- AI 助手頁面: https://school-app-two-pi.vercel.app/ai-chat.html

## 📋 配置說明

### 前端連接邏輯
- 在 Vercel 部署時，前端會自動檢測 `vercel.app` 或 `vercel.com` 域名
- 自動使用相對路徑 `/rasa`，通過 `vercel.json` 的 rewrite 規則轉發到 `/api/rasa/*`
- API Routes 會從環境變數 `RASA_SERVER_URL` 讀取 Zeabur 服務 URL 並代理請求

### 環境變數配置
- **RASA_SERVER_URL**: Zeabur Rasa 服務的公開 URL
  - 值: `https://rasa-service.zeabur.app`
  - 用途: API Routes 使用此 URL 代理請求到 Zeabur Rasa 服務

## 🔍 故障排除

如果前端無法連接到後端：

1. **檢查環境變數是否正確設置**
   - 在 Vercel Dashboard 中確認 `RASA_SERVER_URL` 環境變數存在且值正確
   - 確認已選擇所有環境（Production、Preview、Development）

2. **檢查 Rasa 服務是否運行**
   - 訪問 https://rasa-service.zeabur.app/status 檢查服務狀態
   - 確認服務返回正常響應

3. **檢查 Vercel 部署日誌**
   - 在 Vercel Dashboard 的 Deployments 頁面查看構建和運行時日誌
   - 確認沒有錯誤信息

4. **檢查瀏覽器控制台**
   - 打開瀏覽器開發者工具（F12）
   - 查看 Console 和 Network 標籤，確認請求是否正確發送

## 📝 相關文件

- `vercel.json`: Vercel 路由配置，將 `/rasa/*` 轉發到 `/api/rasa/*`
- `api/rasa/webhook.js`: Rasa webhook API 路由，代理請求到 Zeabur
- `api/rasa/status.js`: Rasa 狀態檢查 API 路由
- `ai-chat.js`: 前端 AI 聊天邏輯，包含自動環境檢測
