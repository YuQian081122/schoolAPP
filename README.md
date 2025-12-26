# 國立虎尾科技大學 - 校園 AI 助手

## 項目簡介

這是一個校園設施地圖系統，提供校園內廁所、飲水機、垃圾桶等設施的位置查詢，並整合 AI 智能助手功能。

## 技術棧

- **前端**: HTML, CSS, JavaScript
- **後端**: Rasa (Python) - 部署在 Zeabur
- **地圖**: Leaflet.js
- **部署**: 
  - 前端: Vercel
  - 後端: Zeabur

## 功能特色

- 🗺️ 校園設施地圖查詢
- 🤖 AI 智能助手（基於 Rasa）
- 📱 響應式設計
- 🌐 中英文雙語支持

## 部署說明

### Vercel 部署

前端部署在 Vercel，配置如下：
- `vercel.json`: Vercel 配置文件
- `.vercelignore`: 忽略 Python 相關文件
- `package.json`: Node.js 項目配置

### Zeabur 部署

後端 Rasa 服務部署在 Zeabur：
- Rasa API: `https://rasa-service.zeabur.app`
- Action Server: `https://schoolapp.zeabur.app`

## 環境變數

在 Vercel Dashboard 中設置：
- `RASA_API_URL`: `https://rasa-service.zeabur.app`
- `ACTION_SERVER_URL`: `https://schoolapp.zeabur.app`
