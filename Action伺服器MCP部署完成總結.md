# Action 伺服器 MCP 部署完成總結

## ✅ 已完成的步驟

### 1. 創建 Action Server 服務
- ✅ **服務 ID**: `694bb583c992462a1b53decd`
- ✅ **服務名稱**: `rasa-action-server`
- ✅ **Dashboard**: https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd

### 2. 上傳代碼和配置
- ✅ 代碼已上傳到 Zeabur
- ✅ 使用 Dockerfile: `rasa/Dockerfile.action-server`
- ✅ 啟動腳本: `rasa/start_action_server.sh`

### 3. 更新 Rasa 服務環境變數
- ✅ **已設置**: `ACTION_SERVER_URL` = `http://service-694bb583c992462a1b53decd:5055`
- ✅ 使用 Zeabur 內部服務發現機制（內部主機名）
- ✅ 保留原有環境變數: `SUPABASE_MODEL_URL`

## 📋 當前配置

### Rasa 服務 (`rasa-service`)
- **服務 ID**: `6947b777ced85978abb40bb2`
- **環境變數**:
  - `ACTION_SERVER_URL`: `http://service-694bb583c992462a1b53decd:5055`
  - `SUPABASE_MODEL_URL`: `https://ziqcqbhvcqahejczihwv.supabase.co/storage/v1/object/public/rasa-models/20251219-011229-humble-muenster.tar.gz`
  - `RASA_ACTION_SERVER_HOST`: `service-694bb583c992462a1b53decd` (Zeabur 自動設置)

### Action Server 服務 (`rasa-action-server`)
- **服務 ID**: `694bb583c992462a1b53decd`
- **端口**: 5055
- **狀態**: 部署中

## ⏳ 下一步操作

### 1. 等待 Action Server 部署完成

1. 訪問 Action Server Dashboard:
   https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd

2. 等待部署完成（通常 2-5 分鐘）
   - 查看部署日誌確認沒有錯誤
   - 確認服務狀態為 "RUNNING"

### 2. 重新部署 Rasa 服務

環境變數已更新，但需要重新部署 Rasa 服務以應用更改：

1. 訪問 Rasa 服務 Dashboard:
   https://zeabur.com/projects/6947b69caf8440064790e62d/services/6947b777ced85978abb40bb2

2. 點擊 "Redeploy" 或 "重新部署" 按鈕

3. 等待部署完成

### 3. 驗證部署

部署完成後，驗證：

1. **檢查 Rasa 服務**:
   ```bash
   curl https://rasa-service.zeabur.app/status
   ```

2. **測試 Action 執行**:
   - 訪問前端應用
   - 發送消息觸發需要 action 的意圖（例如：問候、查詢設施等）
   - 檢查是否正常回應

3. **檢查日誌**:
   - 查看 Rasa 服務日誌，確認沒有 action 連接錯誤
   - 查看 Action Server 日誌，確認 actions 正常執行

## 🔧 配置說明

### 內部服務通信

我使用了 Zeabur 的內部服務發現機制：
- **內部主機名**: `service-694bb583c992462a1b53decd`
- **端口**: `5055`
- **協議**: `http`（內部通信）

這是在 Zeabur 中服務間通信的推薦方式，因為：
- ✅ 更安全（不經過公開網絡）
- ✅ 更快速（內部網絡）
- ✅ 更穩定（不受外部網絡影響）

### 如果需要使用公開 URL

如果內部通信有問題，可以改用公開 URL：

1. 在 Action Server Dashboard 中獲取公開 URL
2. 更新 Rasa 服務的環境變數:
   - `ACTION_SERVER_URL`: `https://rasa-action-server-xxx.zeabur.app/webhook`
3. 重新部署 Rasa 服務

## 🐛 故障排除

### 問題 1: Rasa 無法連接到 Action Server

**檢查**:
- Action Server 是否正在運行
- 環境變數 `ACTION_SERVER_URL` 是否正確
- 端口是否正確（5055）

**解決**:
- 確認 Action Server 狀態為 "RUNNING"
- 檢查環境變數設置
- 查看 Rasa 服務日誌中的錯誤信息

### 問題 2: Actions 執行失敗

**檢查**:
- Action Server 日誌
- Rasa 日誌中的錯誤信息
- Actions 代碼是否有錯誤

**解決**:
- 檢查 Action Server 日誌
- 確認 actions 模塊可以正確導入
- 檢查 actions 代碼語法

## 📊 部署架構

```
┌─────────────────┐
│  Vercel Frontend│
└────────┬────────┘
         │ HTTPS
         ▼
┌─────────────────┐         ┌──────────────────┐
│  Rasa Service   │ ──────> │ Action Server    │
│  (Port 5005)    │ HTTP    │ (Port 5055)      │
│                 │ Internal│                  │
└─────────────────┘         └──────────────────┘
```

## ✅ 完成狀態

- ✅ Action Server 服務已創建
- ✅ 代碼已上傳
- ✅ 環境變數已設置
- ⏳ 等待 Action Server 部署完成
- ⏳ 需要重新部署 Rasa 服務
- ⏳ 需要驗證部署

---

**狀態**: ✅ 配置完成，等待部署
**下一步**: 重新部署 Rasa 服務並驗證
