# 全面除錯報告

## 問題診斷

### 發現的問題

1. **自定義動作無法執行**
   - 錯誤：`Failed to execute custom action 'action_set_language' because no endpoint is configured`
   - 原因：`endpoints.yml` 中沒有配置 `action_endpoint`，Rasa 嘗試連接到 action server 但失敗
   - 影響：所有自定義動作（`action_greet`、`action_set_language` 等）無法執行，導致沒有回應

2. **Stories 配置使用自定義動作**
   - `stories.yml` 和 `rules.yml` 中配置了 `action_greet` 和 `action_set_language`
   - 這些動作需要在 action server 上運行，或使用內聯動作（inline actions）

3. **連接狀態正常但沒有回應**
   - Vercel API 路由正常工作（返回 200）
   - Zeabur Rasa 服務器正常運行
   - 前端連接正常
   - 但 AI 沒有返回文字回應，因為動作執行失敗

## 修復方案

### 已實施的修復

1. **啟用內聯動作支持**
   - 修改 `rasa/start.sh`，添加 `--actions actions` 參數
   - 這樣 Rasa 會使用內聯動作（inline actions），不需要單獨的 action server
   - 修改位置：第 188 行

```bash
rasa run --enable-api --cors "*" --port "$PORT" -i "0.0.0.0" --actions actions
```

### 修復說明

- `--actions actions` 參數告訴 Rasa 從 `actions` 模塊中載入自定義動作
- 這允許 Rasa 在本地執行自定義動作，而不需要連接到外部 action server
- PYTHONPATH 已經設置為包含 `/app/rasa`，所以可以找到 `actions` 模塊

## 測試建議

### 1. 重新部署服務

修復需要重新部署到 Zeabur 才會生效：

```bash
git add rasa/start.sh
git commit -m "fix: Enable inline actions support"
git push
```

### 2. 驗證修復

部署完成後，測試以下場景：

1. **問候測試**
   - 發送「早安」或「你好」
   - 預期：應該收到 `action_greet` 的完整回應（包含功能介紹）

2. **檢查日誌**
   - 在 Zeabur Dashboard 查看服務日誌
   - 確認不再出現 `Failed to execute custom action` 錯誤
   - 確認動作正常執行

3. **API 測試**
   ```bash
   curl -X POST https://school-app-two-pi.vercel.app/api/rasa/webhook \
     -H "Content-Type: application/json" \
     -d '{"message": "早安", "sender": "test"}'
   ```

## 相關文件

- `rasa/start.sh` - 啟動腳本（已修改）
- `rasa/endpoints.yml` - 端點配置（當前未配置 action_endpoint，使用內聯動作）
- `rasa/actions/actions.py` - 自定義動作實現
- `rasa/data/stories.yml` - 故事配置（使用 `action_greet`）
- `rasa/data/rules.yml` - 規則配置（使用 `action_set_language` 和 `action_greet`）

## 後續優化建議

1. **監控動作執行**
   - 在 Zeabur Dashboard 中監控服務日誌
   - 確認所有動作都能正常執行

2. **性能優化**
   - 如果動作執行變慢，考慮使用單獨的 action server
   - 但對於當前規模，內聯動作應該足夠

3. **錯誤處理**
   - 如果動作執行失敗，Rasa 會繼續運行但不會返回回應
   - 可以考慮添加 fallback 機制

## 狀態

- ✅ 問題已診斷
- ✅ 修復已實施
- ⏳ 等待重新部署驗證
