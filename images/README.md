# 圖片資料夾

此資料夾包含校園設施的圖片檔案。

## 圖片檔案

- `zongsan1.jpg` - 綜三館照片 1
- `zongsan2.jpg` - 綜三館照片 2
- `zongsan3.jpg` - 綜三館照片 3

## 使用方式

### GitHub Raw URL

圖片可以通過以下 URL 訪問：

```
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan1.jpg
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan2.jpg
https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan3.jpg
```

### 在 HTML 中使用

```html
<img src="https://raw.githubusercontent.com/YuQian081122/schoolAPP/main/images/zongsan1.jpg" alt="綜三館照片1">
```

### 在 Vercel 部署中使用相對路徑

如果圖片已推送到 GitHub 並部署到 Vercel，可以使用相對路徑：

```html
<img src="/images/zongsan1.jpg" alt="綜三館照片1">
```

## 上傳方式

由於圖片是二進制檔案，請通過以下方式上傳：

### 方法 1: GitHub 網頁介面上傳（推薦）

1. 訪問 https://github.com/YuQian081122/schoolAPP
2. 點擊 **Add file** → **Upload files**
3. 將 `photos/` 資料夾中的圖片拖放到上傳區域
4. 確保上傳路徑為 `images/` 資料夾
5. 點擊 **Commit changes** 提交

### 方法 2: 使用 Git 命令

```bash
# 複製圖片到 images 資料夾
cp photos/*.jpg images/

# 添加檔案
git add images/*.jpg

# 提交
git commit -m "添加校園設施圖片"

# 推送
git push origin main
```
