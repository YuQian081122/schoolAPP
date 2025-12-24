# Action 伺服器部署狀態

## ✅ 已完成步驟

1. **創建 Action Server 服務**
   - 服務名稱: `rasa-action-server`
   - 服務 ID: `694bb583c992462a1b53decd`
   - 狀態: 已創建，代碼已上傳

2. **配置文件**
   - ✅ `rasa/Dockerfile.action-server` - 已創建
   - ✅ `rasa/start_action_server.sh` - 已創建
   - ✅ `zeabur.action-server.json` - 已創建

3. **代碼上傳**
   - ✅ 代碼已上傳到 Zeabur

## ⏳ 待完成步驟

### 步驟 1: 等待部署完成

Action Server 正在部署中。請：
1. 訪問 Zeabur Dashboard: https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd
2. 等待部署完成（通常需要 2-5 分鐘）
3. 確認服務狀態為 "RUNNING"

### 步驟 2: 獲取 Action Server URL

部署完成後：
1. 在 Zeabur Dashboard 中查看服務的域名
2. 域名格式通常為: `rasa-action-server-xxx.zeabur.app`
3. 記錄完整的 URL: `https://rasa-action-server-xxx.zeabur.app`

### 步驟 3: 更新 Rasa 服務環境變數

獲取 Action Server URL 後，需要更新 Rasa 服務的環境變數：

**環境變數設置**:
- 變數名: `ACTION_SERVER_URL`
- 變數值: `https://rasa-action-server-xxx.zeabur.app`（替換為實際的 URL）

**更新方式**:
1. 訪問 Rasa 服務 Dashboard
2. 進入 "Environment Variables" 設置
3. 添加或更新 `ACTION_SERVER_URL` 環境變數
4. 重新部署 Rasa 服務

### 步驟 4: 驗證部署

部署完成後，驗證：

1. **檢查 Action Server**:
   ```bash
   curl https://rasa-action-server-xxx.zeabur.app/health
   ```

2. **檢查可用 Actions**:
   ```bash
   curl https://rasa-action-server-xxx.zeabur.app/actions
   ```

3. **測試 Rasa 連接**:
   - 發送消息觸發需要 action 的意圖
   - 檢查日誌確認 action 是否成功執行

## 📋 當前配置

### Rasa 服務
- 服務 ID: `6947b777ced85978abb40bb2`
- 服務名稱: `rasa-service`
- 當前環境變數:
  - `SUPABASE_MODEL_URL`: `https://ziqcqbhvcqahejczihwv.supabase.co/storage/v1/object/public/rasa-models/20251219-011229-humble-muenster.tar.gz`

### Action Server 服務
- 服務 ID: `694bb583c992462a1b53decd`
- 服務名稱: `rasa-action-server`
- 狀態: 部署中

## 🔗 相關鏈接

- **Zeabur Dashboard**: https://zeabur.com/projects/6947b69caf8440064790e62d
- **Action Server Dashboard**: https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd
- **Rasa Service Dashboard**: https://zeabur.com/projects/6947b69caf8440064790e62d/services/6947b777ced85978abb40bb2

## ⚠️ 注意事項

1. **Dockerfile 路徑**: Action Server 使用 `rasa/Dockerfile.action-server`
2. **端口**: Action Server 使用端口 5055
3. **環境變數**: 必須在 Rasa 服務中設置 `ACTION_SERVER_URL`
4. **重新部署**: 更新環境變數後，需要重新部署 Rasa 服務

---

**下一步**: 等待部署完成，獲取 Action Server URL，然後更新 Rasa 服務的環境變數
