# URL 設置詳細指南

本文檔提供最新的 Vercel、Zeabur 和 Supabase 介面設置步驟，確保您能正確配置所有環境變數和 URL。

## 📸 圖片檔案處理

### 圖片已推送到 GitHub

圖片檔案已推送到 `images/` 資料夾，您可以使用以下 URL 格式訪問：

```
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan1.jpg
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan2.jpg
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan3.jpg
```

### 在程式碼中使用圖片

在 HTML 或 JavaScript 中引用圖片：

```html
<img src="https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan1.jpg" alt="綜三館照片1">
```

或使用相對路徑（如果部署在 Vercel）：

```html
<img src="/images/zongsan1.jpg" alt="綜三館照片1">
```

---

## 🔧 Vercel 環境變數設置（2025 最新介面）

### 步驟 1: 登入 Vercel Dashboard

1. 訪問 https://vercel.com/dashboard
2. 使用您的 GitHub 帳號登入
3. 在左側選單中找到您的專案 `schoolAPP`（或您設定的專案名稱）

### 步驟 2: 進入專案設置

1. 點擊專案卡片進入專案頁面
2. 點擊頂部導航欄的 **Settings**（設置）按鈕
3. 在左側設置選單中，點擊 **Environment Variables**（環境變數）

### 步驟 3: 添加環境變數

#### 添加 RASA_SERVER_URL

1. 在環境變數頁面，點擊 **Add New**（新增）按鈕
2. 在彈出的表單中填寫：
   - **Key（鍵）**: `RASA_SERVER_URL`
   - **Value（值）**: `https://rasa-service.zeabur.app`（替換為您的實際 Zeabur Rasa 服務 URL）
   - **Environment（環境）**: 
     - ✅ 勾選 **Production**（生產環境）
     - ✅ 勾選 **Preview**（預覽環境）
     - ✅ 勾選 **Development**（開發環境）
3. 點擊 **Save**（保存）按鈕

#### 添加 GEMINI_API_KEY

1. 再次點擊 **Add New**（新增）按鈕
2. 填寫表單：
   - **Key（鍵）**: `GEMINI_API_KEY`
   - **Value（值）**: 您的 Gemini API 金鑰（從 Google AI Studio 獲取）
   - **Environment（環境）**: 
     - ✅ 勾選所有環境（Production、Preview、Development）
3. 點擊 **Save**（保存）按鈕

#### 添加 GEMINI_MODEL（可選）

1. 點擊 **Add New**（新增）按鈕
2. 填寫表單：
   - **Key（鍵）**: `GEMINI_MODEL`
   - **Value（值）**: `gemini-2.0-flash-exp`（或您想使用的模型名稱）
   - **Environment（環境）**: 
     - ✅ 勾選所有環境
3. 點擊 **Save**（保存）按鈕

### 步驟 4: 重新部署

1. 環境變數設置完成後，返回專案主頁
2. 點擊 **Deployments**（部署）標籤
3. 找到最新的部署記錄
4. 點擊右側的 **⋯**（三個點）選單
5. 選擇 **Redeploy**（重新部署）
6. 確認重新部署

### 步驟 5: 驗證設置

1. 部署完成後，訪問 `https://your-app.vercel.app/api/rasa/status`
2. 如果配置正確，應該返回 Rasa 服務狀態（不是 `{"status": "no_server"}`）
3. 如果返回 `{"status": "no_server"}`，請檢查：
   - `RASA_SERVER_URL` 是否正確設置
   - Zeabur Rasa 服務是否正常運行

---

## 🚀 Zeabur 環境變數設置（2025 最新介面）

### Zeabur Rasa 服務環境變數

#### 步驟 1: 登入 Zeabur Dashboard

1. 訪問 https://zeabur.com/dashboard
2. 使用您的帳號登入
3. 選擇您的專案

#### 步驟 2: 進入 Rasa 服務設置

1. 在專案頁面中，找到 **Rasa 服務**（或您命名的服務）
2. 點擊服務卡片進入服務詳情頁
3. 點擊頂部導航欄的 **Variables**（環境變數）標籤

#### 步驟 3: 添加 SUPABASE_MODEL_URL

1. 在環境變數頁面，點擊 **+ Add Variable**（新增變數）按鈕
2. 在彈出的表單中填寫：
   - **Key（鍵）**: `SUPABASE_MODEL_URL`
   - **Value（值）**: 您的 Supabase Storage URL
     - 格式：`https://your-project.supabase.co/storage/v1/object/public/bucket-name/filename.tar.gz`
     - 範例：`https://abcdefgh.supabase.co/storage/v1/object/public/rasa-models/20251219-011229-humble-muenster.tar.gz`
3. 點擊 **Save**（保存）或 **Add**（新增）按鈕

#### 步驟 4: 驗證部署

1. 環境變數設置後，Zeabur 會自動觸發重新部署
2. 點擊 **Logs**（日誌）標籤查看部署日誌
3. 應該看到類似以下訊息：
   ```
   📥 檢測到 SUPABASE_MODEL_URL，準備從 Supabase Storage 下載模型
   ✅ 模型從 Supabase Storage 下載成功: models/filename.tar.gz
   ```

### Zeabur Action Server 環境變數

#### 步驟 1: 進入 Action Server 服務

1. 在專案頁面中，找到 **Action Server 服務**
2. 點擊服務卡片進入服務詳情頁
3. 點擊 **Variables**（環境變數）標籤

#### 步驟 2: 添加 GEMINI_API_KEY

1. 點擊 **+ Add Variable**（新增變數）按鈕
2. 填寫表單：
   - **Key（鍵）**: `GEMINI_API_KEY`
   - **Value（值）**: 您的 Gemini API 金鑰（與 Vercel 相同）
3. 點擊 **Save**（保存）按鈕

#### 步驟 3: 獲取 Action Server URL

1. 在 Action Server 服務頁面，點擊 **Settings**（設置）標籤
2. 找到 **Domains**（域名）區塊
3. 複製顯示的 URL（格式：`https://rasa-action-server-xxx.zeabur.app`）
4. 這個 URL 會自動設置為 `ACTION_SERVER_URL` 環境變數

#### 步驟 4: 配置 Rasa 服務連接 Action Server

1. 返回 Rasa 服務頁面
2. 進入 **Variables**（環境變數）標籤
3. 檢查是否有 `ACTION_SERVER_URL` 環境變數
4. 如果沒有，手動添加：
   - **Key（鍵）**: `ACTION_SERVER_URL`
   - **Value（值）**: Action Server 的 URL（從步驟 3 獲取）

---

## 📦 Supabase Storage 設置（2025 最新介面）

### 步驟 1: 創建 Supabase 專案

1. 訪問 https://supabase.com
2. 點擊 **Start your project**（開始您的專案）或 **New Project**（新專案）
3. 使用 GitHub 帳號登入（推薦）或創建新帳號
4. 填寫專案資訊：
   - **Name（名稱）**: 輸入專案名稱（例如：`school-app-storage`）
   - **Database Password（資料庫密碼）**: 設置強密碼並記住
   - **Region（區域）**: 選擇離您最近的區域（例如：`Southeast Asia (Singapore)`）
5. 點擊 **Create new project**（創建新專案）
6. 等待專案初始化完成（約 2-3 分鐘）

### 步驟 2: 創建 Storage Bucket

1. 在 Supabase Dashboard 左側選單中，點擊 **Storage**（存儲）
2. 點擊 **New bucket**（新建儲存桶）按鈕
3. 在彈出的表單中填寫：
   - **Name（名稱）**: `rasa-models`（或您喜歡的名稱）
   - **Public bucket（公開儲存桶）**: 
     - ✅ **勾選此選項**（允許公開訪問）
     - 這樣才能通過 URL 直接訪問模型檔案
4. 點擊 **Create bucket**（創建儲存桶）

### 步驟 3: 上傳模型檔案

1. 在 Storage 頁面中，點擊創建的 bucket（`rasa-models`）
2. 點擊 **Upload file**（上傳檔案）按鈕
3. 在彈出的上傳對話框中：
   - 點擊 **Select files**（選擇檔案）或直接拖放檔案
   - 選擇您的模型檔案（例如：`20251219-011229-humble-muenster.tar.gz`）
   - 等待上傳完成（根據檔案大小，可能需要幾分鐘）
4. 上傳完成後，檔案會顯示在檔案列表中

### 步驟 4: 獲取公開 URL

1. 在檔案列表中，點擊上傳的模型檔案
2. 在檔案詳情頁面中，找到 **Public URL**（公開 URL）
3. 點擊 **Copy**（複製）按鈕複製 URL
4. URL 格式範例：
   ```
   https://abcdefghijklmnop.supabase.co/storage/v1/object/public/rasa-models/20251219-011229-humble-muenster.tar.gz
   ```

### 步驟 5: 設置 Zeabur 環境變數

1. 返回 Zeabur Dashboard
2. 進入 Rasa 服務的 **Variables**（環境變數）頁面
3. 添加環境變數：
   - **Key（鍵）**: `SUPABASE_MODEL_URL`
   - **Value（值）**: 從步驟 4 複製的 Public URL
4. 保存並等待重新部署

### 步驟 6: 驗證模型下載

1. 在 Zeabur Dashboard 中，進入 Rasa 服務的 **Logs**（日誌）頁面
2. 查看最新的部署日誌
3. 應該看到類似以下訊息：
   ```
   📥 檢測到 SUPABASE_MODEL_URL，準備從 Supabase Storage 下載模型
   📍 URL: https://...supabase.co/storage/v1/object/public/rasa-models/...
   📥 使用 wget 下載（超時 600 秒，重試 3 次）...
   ✅ 模型從 Supabase Storage 下載成功: models/20251219-011229-humble-muenster.tar.gz
   ```

---

## 🔗 獲取 Gemini API Key

### 步驟 1: 訪問 Google AI Studio

1. 訪問 https://aistudio.google.com/app/apikey
2. 使用您的 Google 帳號登入

### 步驟 2: 創建 API Key

1. 點擊 **Create API Key**（創建 API 金鑰）按鈕
2. 選擇 Google Cloud 專案（或創建新專案）
3. API Key 會自動生成並顯示
4. **立即複製並保存** API Key（只會顯示一次）

### 步驟 3: 設置環境變數

將複製的 API Key 設置到：
- **Vercel**: `GEMINI_API_KEY` 環境變數
- **Zeabur Action Server**: `GEMINI_API_KEY` 環境變數

---

## ✅ 驗證所有設置

### 驗證 Vercel 設置

1. 訪問 `https://your-app.vercel.app/api/rasa/status`
   - 應該返回 Rasa 服務狀態（不是 `{"status": "no_server"}`）

2. 訪問 `https://your-app.vercel.app/api/gemini/chat`
   - 使用 POST 請求測試（需要正確的請求體）

### 驗證 Zeabur Rasa 服務

1. 訪問 `https://rasa-service.zeabur.app/status`
   - 應該返回 Rasa 服務狀態 JSON

2. 檢查部署日誌：
   - 模型應該成功下載
   - 服務應該正常啟動

### 驗證 Zeabur Action Server

1. 訪問 `https://rasa-action-server-xxx.zeabur.app/health`
   - 應該返回 `{"status": "ok"}`

2. 訪問 `https://rasa-action-server-xxx.zeabur.app/`
   - 應該返回 Action Server 資訊

### 驗證 Supabase Storage

1. 在瀏覽器中直接訪問模型檔案的 Public URL
   - 應該能夠下載檔案
   - 如果無法訪問，檢查 bucket 是否設置為公開

---

## 📝 環境變數檢查清單

### Vercel 環境變數

- [ ] `RASA_SERVER_URL` - Zeabur Rasa 服務 URL
- [ ] `GEMINI_API_KEY` - Gemini API 金鑰
- [ ] `GEMINI_MODEL`（可選）- Gemini 模型名稱

### Zeabur Rasa 服務環境變數

- [ ] `SUPABASE_MODEL_URL` - Supabase Storage 模型 URL
- [ ] `ACTION_SERVER_URL`（自動設置）- Action Server URL

### Zeabur Action Server 環境變數

- [ ] `GEMINI_API_KEY` - Gemini API 金鑰

---

## 🆘 常見問題

### Q1: Vercel 環境變數設置後沒有生效？

**A**: 環境變數設置後需要重新部署才能生效。請在 Vercel Dashboard 中手動觸發重新部署。

### Q2: Zeabur 模型下載失敗？

**A**: 檢查以下項目：
- Supabase Storage URL 是否正確
- Bucket 是否設置為公開
- 檔案是否存在於 Supabase Storage 中
- 網路連接是否正常

### Q3: 如何確認 Action Server URL？

**A**: 在 Zeabur Dashboard 中，進入 Action Server 服務的 **Settings**（設置）頁面，查看 **Domains**（域名）區塊。

### Q4: 圖片無法顯示？

**A**: 檢查：
- GitHub 倉庫是否為公開
- 圖片 URL 是否正確
- 圖片檔案是否存在於 `images/` 資料夾中

---

**最後更新**: 2025-12-25  
**適用版本**: Vercel 2025, Zeabur 2025, Supabase 2025
