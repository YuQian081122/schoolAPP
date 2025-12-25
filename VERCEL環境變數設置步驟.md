# Vercel 環境變數設置步驟（快速指南）

## 🎯 目標

在 Vercel 設置 `RASA_SERVER_URL` 環境變數，值為：`https://rasa-service.zeabur.app`

## 📝 詳細步驟

### 步驟 1：登入 Vercel Dashboard

1. 訪問 [https://vercel.com/dashboard](https://vercel.com/dashboard)
2. 使用您的帳號登入
3. 找到並選擇您的專案（例如：`schoolAPP` 或 `yushow-school-app`）

### 步驟 2：進入環境變數設置

1. 在專案頁面，點擊頂部導航欄的 **Settings**
2. 在左側選單中，點擊 **Environment Variables**

### 步驟 3：添加環境變數

1. 在環境變數列表下方，找到輸入框
2. 填寫以下信息：

   **Key（鍵）**: 
   ```
   RASA_SERVER_URL
   ```

   **Value（值）**: 
   ```
   https://rasa-service.zeabur.app
   ```

   **⚠️ 重要：只填寫基礎 URL，不要包含 `/webhooks/rest/webhook`**

3. 選擇環境（建議全部選擇）：
   - ✅ Production
   - ✅ Preview  
   - ✅ Development

4. 點擊 **Add** 或 **Save** 按鈕

### 步驟 4：確認設置

設置完成後，您應該在列表中看到：

| Key | Value | Environments |
|-----|-------|--------------|
| RASA_SERVER_URL | https://rasa-service.zeabur.app | Production, Preview, Development |

### 步驟 5：重新部署

環境變數設置後，需要重新部署才能生效：

**方法 1：手動重新部署**
1. 前往 **Deployments** 標籤
2. 找到最新的部署
3. 點擊右側的 **⋯**（三個點）
4. 選擇 **Redeploy**

**方法 2：觸發自動部署**
- 推送任何 commit 到 Git 倉庫
- Vercel 會自動觸發新的部署

### 步驟 6：驗證配置

部署完成後，在瀏覽器控制台執行：

```javascript
fetch('/api/rasa/status')
  .then(r => r.json())
  .then(data => {
    console.log('Rasa 狀態:', data);
    if (data.status === 'no_server') {
      console.error('❌ 環境變數未設置！');
    } else {
      console.log('✅ 配置成功！');
    }
  });
```

## ✅ 檢查清單

- [ ] 已登入 Vercel Dashboard
- [ ] 已進入專案的 Settings → Environment Variables
- [ ] 已添加 `RASA_SERVER_URL` 環境變數
- [ ] 值為 `https://rasa-service.zeabur.app`（不包含路徑）
- [ ] 已選擇所有環境（Production, Preview, Development）
- [ ] 已重新部署專案
- [ ] 已驗證配置是否生效

## 🔍 常見問題

### Q: 環境變數設置後仍然無效？

**A:** 請確認：
1. 已重新部署專案
2. 等待 1-2 分鐘讓環境變數生效
3. 清除瀏覽器緩存並強制刷新（Ctrl+F5）

### Q: 應該填寫完整 URL 還是基礎 URL？

**A:** 只填寫基礎 URL：
- ✅ 正確：`https://rasa-service.zeabur.app`
- ❌ 錯誤：`https://rasa-service.zeabur.app/webhooks/rest/webhook`

API 路由會自動添加 `/webhooks/rest/webhook` 或 `/status` 路徑。

### Q: 需要在所有環境都設置嗎？

**A:** 建議在所有環境都設置，這樣：
- Production（生產環境）可以正常使用
- Preview（預覽環境）可以正常測試
- Development（開發環境）可以本地開發

## 📞 需要幫助？

如果遇到問題：
1. 檢查 Vercel 部署日誌
2. 確認 Zeabur 服務是否正在運行
3. 使用瀏覽器開發者工具檢查網絡請求

