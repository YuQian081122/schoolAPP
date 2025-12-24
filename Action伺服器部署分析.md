# Action 伺服器部署分析

## 當前配置狀態

### ✅ 當前使用：內聯 Actions（Inline Actions）

**配置**:
- `rasa/endpoints.yml`: `action_endpoint` 被註釋掉
- `rasa/start.sh`: 使用 `rasa run` 命令，不指定 action server
- `rasa/actions/`: 包含自定義 actions（使用 `rasa_sdk`）

**Rasa 版本**:
- Rasa: 3.5.17
- rasa-sdk: 3.5.1

### ⚠️ 潛在問題

從日誌中看到錯誤：
```
Failed to run custom action 'action_set_language'. 
Action server responded with a non 200 status code of None. 
Error: ${ACTION_SERVER_URL:http://localhost:5055}/webhook
```

這表示 Rasa 仍然嘗試連接到 action server，即使 `action_endpoint` 被註釋掉了。

## 是否需要獨立的 Action 伺服器？

### 選項 1: 繼續使用內聯 Actions（當前方式）

**優點**:
- ✅ 簡單：只需要一個服務
- ✅ 資源節省：不需要額外的服務器
- ✅ 部署簡單：Zeabur 只需要部署一個服務

**缺點**:
- ⚠️ Rasa 3.5 使用 rasa-sdk 時，內聯 actions 可能不穩定
- ⚠️ 日誌顯示有錯誤，可能導致 actions 無法正常執行
- ⚠️ 如果 actions 複雜，可能會影響 Rasa 主服務的性能

**修復方法**:
1. 確保 `endpoints.yml` 中 `action_endpoint` 完全註釋掉
2. 確保 `PYTHONPATH` 正確設置（已在 `start.sh` 中設置）
3. 確保 actions 模組可以正確導入

### 選項 2: 部署獨立的 Action 伺服器（推薦）

**優點**:
- ✅ 標準做法：Rasa 3.x 推薦使用獨立的 action server
- ✅ 更穩定：actions 與 Rasa 主服務分離
- ✅ 更好的性能：可以獨立擴展 action server
- ✅ 更好的錯誤隔離：action 錯誤不會影響 Rasa 主服務

**缺點**:
- ⚠️ 需要部署兩個服務（Rasa + Action Server）
- ⚠️ 需要配置服務間通信
- ⚠️ 資源消耗稍高

**部署方式**:
1. 在 Zeabur 創建兩個服務：
   - `rasa-service`: Rasa 主服務（端口 5005）
   - `rasa-action-server`: Action 伺服器（端口 5055）
2. 配置 `endpoints.yml`:
   ```yaml
   action_endpoint:
     url: "http://rasa-action-server:5055/webhook"
   ```
3. 創建 Action Server 的啟動腳本

## 建議

### 如果 Actions 正常工作
- **建議**: 繼續使用內聯 actions（當前方式）
- **原因**: 簡單且資源節省

### 如果 Actions 有問題
- **建議**: 部署獨立的 Action 伺服器
- **原因**: 更穩定且符合 Rasa 3.x 最佳實踐

## 檢查 Actions 是否正常工作

可以通過以下方式檢查：

1. **測試簡單的 Action**:
   - 發送消息觸發 `action_greet` 或 `action_set_language`
   - 檢查是否成功執行

2. **檢查日誌**:
   - 查看 Zeabur 日誌中是否有 action 執行錯誤
   - 檢查是否有 "Failed to run custom action" 錯誤

3. **測試複雜的 Action**:
   - 測試 `action_find_nearest_toilet` 等需要計算的 actions
   - 確認返回結果是否正確

## 下一步行動

1. **先測試當前配置**:
   - 在瀏覽器中測試各種 actions
   - 檢查日誌確認是否有錯誤

2. **如果發現問題**:
   - 考慮部署獨立的 Action 伺服器
   - 我可以幫你創建 Action Server 的配置和部署腳本

3. **如果一切正常**:
   - 繼續使用當前配置
   - 監控性能，如果未來有問題再考慮分離

---

**當前狀態**: 使用內聯 Actions
**建議**: 先測試，如果有問題再考慮獨立 Action 伺服器
