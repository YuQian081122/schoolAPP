# 🏫 國立虎尾科技大學 - 校園 AI 助手

一個智能校園設施查詢系統，提供校園內廁所、飲水機、垃圾桶等設施的位置查詢、智能導航和 AI 對話功能。

## ✨ 功能特色

### 🗺️ 校園地圖系統
- 互動式地圖顯示，支援多校區切換
- 設施標記與篩選功能
- GPS 定位與路線規劃
- 設施狀態即時更新

### 🤖 AI 智能助手
- **自然語言對話**：支援中英文雙語對話
- **智能錯別字修正**：自動修正常見輸入錯誤
- **輸入自動完成**：智能建議與歷史記錄
- **實體提取增強**：精確識別建築、樓層、設施類型
- **多輪對話記憶**：上下文理解與記憶功能

### 📍 設施查詢功能
- 尋找最近設施（廁所、飲水機、垃圾桶）
- 查詢特定建築的設施資訊
- 查詢校區設施統計
- 智能路線規劃

### 📊 設施管理
- 設施狀態回報系統
- 問題歷史記錄
- 設施狀態統計

### 🌐 多語言支援
- 完整的中英文介面
- 自動語言檢測
- 雙語對話支援

## 🚀 快速開始

### 環境需求
- Node.js 14+ (可選，用於本地開發)
- Python 3.8+ (Rasa 需要)
- 現代瀏覽器（Chrome, Firefox, Edge, Safari）

### 本地開發

1. **克隆倉庫**
```bash
git clone https://github.com/YuQian081122/schoolAPP.git
cd schoolAPP
```

2. **設置 Rasa 後端**
```bash
cd rasa
pip install -r requirements.txt
rasa train
rasa run -m models --enable-api --cors "*"
```

3. **啟動前端**
- 使用任何靜態文件伺服器（如 Python 的 `http.server`）
- 或直接打開 `index.html` 和 `ai-chat.html`

### 部署

#### 前端部署（Vercel）
1. 將前端文件推送到 GitHub
2. 在 Vercel 中導入專案
3. 配置環境變數（如需要）

#### 後端部署（Railway）
1. 在 Railway 中創建新專案
2. 連接 GitHub 倉庫
3. 設置啟動命令：`cd rasa && rasa run -m models --enable-api --cors "*"`
4. 配置環境變數

## 🛠️ 技術棧

### 前端
- **HTML5 / CSS3** - 結構與樣式
- **JavaScript (ES6+)** - 核心邏輯
- **Leaflet** - 地圖顯示
- **響應式設計** - 支援桌面與行動裝置

### 後端
- **Rasa** - 對話式 AI 框架
- **Python 3.8+** - 後端語言
- **Rasa NLU** - 自然語言理解
- **Rasa Core** - 對話管理

### 部署
- **Vercel** - 前端靜態網站託管
- **Railway** - 後端服務託管
- **GitHub** - 版本控制

## 📁 專案結構

```
schoolAPP/
├── index.html              # 主地圖頁面
├── ai-chat.html           # AI 助手頁面
├── ai-chat-mobile.html    # 行動版 AI 助手
├── ai-chat.js             # AI 助手核心邏輯
├── script.js              # 地圖系統邏輯
├── utils.js               # 工具函數庫
├── style.css              # 主樣式表
├── ai-chat.css            # AI 助手樣式
├── rasa/                  # Rasa 後端
│   ├── actions/           # 自定義動作
│   ├── data/              # 訓練數據
│   ├── models/            # 訓練好的模型
│   └── config.yml         # Rasa 配置
└── api/                   # API 端點
```

## 🎯 核心功能說明

### 1. 智能錯別字修正
系統自動修正常見輸入錯誤，例如：
- 「甚麼」→「什麼」
- 「那裡」→「哪裡」
- 英文拼寫錯誤自動修正

### 2. 輸入自動完成
- 基於歷史記錄的智能建議
- 建築名稱自動完成
- 設施類型關鍵詞匹配
- 鍵盤導航支援（↑↓ 箭頭選擇）

### 3. 實體提取增強
自動識別：
- 建築名稱（模糊匹配）
- 樓層資訊（支援多種格式）
- 設施類型（中英文同義詞）
- 校區資訊
- 性別標識（針對廁所）

### 4. 多輪對話記憶
- 上下文理解
- 對話歷史記錄
- 意圖澄清機制

## 🔧 配置說明

### Rasa 配置
編輯 `rasa/config.yml` 和 `rasa/domain.yml` 來調整 AI 行為。

### 前端配置
主要配置在 `ai-chat.js` 中的 `AppConfig` 對象。

## 📝 開發說明

### 訓練 Rasa 模型
```bash
cd rasa
rasa train
```

### 測試本地 Rasa
```bash
cd rasa
rasa run -m models --enable-api --cors "*"
```

### 添加新的設施類型
1. 在 `rasa/data/nlu.yml` 中添加訓練數據
2. 在 `rasa/domain.yml` 中更新領域定義
3. 重新訓練模型

## 🤝 貢獻

歡迎提交 Issue 和 Pull Request！

## 📄 授權

本專案採用 MIT 授權。

## 📧 聯絡方式

如有問題或建議，請透過 GitHub Issues 聯繫。

---

**國立虎尾科技大學** - 校園 AI 助手專案
