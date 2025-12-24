# Action 伺服器 MCP 部署完成指南

## ✅ 已通過 MCP 完成的步驟

1. **✅ 創建 Action Server 服務**
   - 服務 ID: `694bb583c992462a1b53decd`
   - 服務名稱: `rasa-action-server`
   - Dashboard: https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd

2. **✅ 上傳代碼**
   - 代碼已上傳到 Zeabur
   - 使用 Dockerfile: `rasa/Dockerfile.action-server`

3. **✅ 配置文件已準備**
   - `rasa/Dockerfile.action-server` ✅
   - `rasa/start_action_server.sh` ✅
   - `rasa/endpoints.yml` 已更新 ✅

## ⏳ 需要手動完成的步驟

### 步驟 1: 等待 Action Server 部署完成

1. 訪問 Action Server Dashboard:
   https://zeabur.com/projects/6947b69caf8440064790e62d/services/694bb583c992462a1b53decd

2. 等待部署完成（通常 2-5 分鐘）
   - 查看部署日誌確認沒有錯誤
   - 確認服務狀態為 "RUNNING"

3. **獲取 Action Server URL**:
   - 在 Dashboard 中找到 "Domains" 或 "URL" 部分
   - 記錄完整的 URL，例如: `https://rasa-action-server-xxx.zeabur.app`

### 步驟 2: 更新 Rasa 服務環境變數

獲取 Action Server URL 後，需要更新 Rasa 服務的環境變數。

**方法 1: 通過 Zeabur Dashboard（推薦）**

1. 訪問 Rasa 服務 Dashboard:
   https://zeabur.com/projects/6947b69caf8440064790e62d/services/6947b777ced85978abb40bb2

2. 進入 "Environment Variables" 或 "環境變數" 設置

3. 添加新的環境變數:
   - **變數名**: `ACTION_SERVER_URL`
   - **變數值**: `https://rasa-action-server-xxx.zeabur.app`（替換為步驟 1 獲取的實際 URL）

4. 保存設置

5. **重新部署 Rasa 服務**（重要！）
   - 點擊 "Redeploy" 或 "重新部署" 按鈕
   - 等待部署完成

**方法 2: 通過 MCP（如果 URL 已知）**

如果你已經獲取了 Action Server URL，我可以幫你通過 MCP 更新環境變數。

## 🔍 驗證部署

### 1. 檢查 Action Server

```bash
# 健康檢查
curl https://rasa-action-server-xxx.zeabur.app/health

# 檢查可用 Actions
curl https://rasa-action-server-xxx.zeabur.app/actions
```

### 2. 檢查 Rasa 服務

```bash
# 檢查 Status
curl https://rasa-service.zeabur.app/status
```

### 3. 測試 Action 執行

1. 訪問前端應用
2. 發送消息觸發需要 action 的意圖（例如：問候、查詢設施等）
3. 檢查是否正常回應
4. 查看 Zeabur 日誌確認沒有錯誤

## 📋 當前配置摘要

### Rasa 服務
- **服務 ID**: `6947b777ced85978abb40bb2`
- **服務名稱**: `rasa-service`
- **當前環境變數**:
  - `SUPABASE_MODEL_URL`: `https://ziqcqbhvcqahejczihwv.supabase.co/storage/v1/object/public/rasa-models/20251219-011229-humble-muenster.tar.gz`
- **需要添加**: `ACTION_SERVER_URL`（待設置）

### Action Server 服務
- **服務 ID**: `694bb583c992462a1b53decd`
- **服務名稱**: `rasa-action-server`
- **狀態**: 部署中
- **端口**: 5055
- **URL**: 待部署完成後獲取

## 🐛 故障排除

### 問題 1: Action Server 部署失敗

**檢查**:
- 查看部署日誌中的錯誤信息
- 確認 `rasa/Dockerfile.action-server` 路徑正確
- 確認 `rasa/actions/` 目錄存在

**解決**:
- 檢查 Dockerfile 語法
- 確認所有依賴都已安裝
- 查看 Zeabur 部署日誌

### 問題 2: Rasa 無法連接到 Action Server

**檢查**:
- `ACTION_SERVER_URL` 環境變數是否正確設置
- Action Server 是否正在運行
- URL 是否可訪問（使用 curl 測試）

**解決**:
- 確認環境變數格式正確（包含 `https://`）
- 確認 Action Server URL 正確
- 重新部署 Rasa 服務

### 問題 3: Actions 執行失敗

**檢查**:
- Action Server 日誌
- Rasa 日誌中的錯誤信息
- Actions 代碼是否有錯誤

**解決**:
- 檢查 Action Server 日誌
- 確認 actions 模塊可以正確導入
- 檢查 actions 代碼語法

## 📞 需要幫助？

如果你已經獲取了 Action Server URL，請告訴我，我可以幫你通過 MCP 更新 Rasa 服務的環境變數。

或者，你可以：
1. 在 Zeabur Dashboard 中手動設置環境變數
2. 重新部署 Rasa 服務
3. 測試 Actions 是否正常工作

---

**狀態**: ✅ Action Server 已創建並上傳代碼
**下一步**: 等待部署完成，獲取 URL，更新環境變數
