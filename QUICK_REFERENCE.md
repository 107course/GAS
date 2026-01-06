# 快速參考指南 (Quick Reference)

## 一頁式檢查清單

### 部署前檢查清單

- [ ] 建立 Google Spreadsheet 並複製 ID
- [ ] 在 Google Apps Script 貼上 Code.gs 程式碼
- [ ] 修改 `SPREADSHEET_ID` 常數
- [ ] 設定 API Key (Script Properties)
- [ ] 執行 `initializeSpreadsheet()` 函數
- [ ] 部署為 Web App (複製 Deployment ID)
- [ ] 推送前端到 GitHub
- [ ] 啟用 GitHub Pages
- [ ] 在前端設定 GAS Web App URL

### 已部署檢查清單

- [ ] 前端可以從 GAS 載入題目
- [ ] 答題後權重有更新
- [ ] Logs Sheet 有紀錄
- [ ] AI 選項有生成並快取
- [ ] 統計計數正常顯示

---

## 關鍵 URL

| 功能 | URL | 說明 |
|------|-----|------|
| 前端應用 | https://107course.github.io/GAS | 使用者介面 |
| GAS Web App | https://script.google.com/macros/d/{ID}/usercontent | 後端 API |
| Google Sheets | https://docs.google.com/spreadsheets/d/{ID} | 資料庫 |
| GAS 編輯器 | 在 Google Sheets 內開啟 | 開發環境 |

---

## 常用程式碼片段

### 在 GAS 中手動執行命令

```javascript
// 初始化工作表
initializeSpreadsheet();

// 手動測試 getQuestion
Logger.log(handleGetQuestion());

// 手動測試 submitResult
handleSubmitResult({
  id: "1",
  isCorrect: true,
  timeTaken: 2000
});
```

### 在前端控制台測試 API

```javascript
// 測試 GET
fetch("https://script.google.com/macros/d/{ID}/usercontent?action=getQuestion")
  .then(r => r.json())
  .then(d => console.log(d));

// 測試 POST
fetch("https://script.google.com/macros/d/{ID}/usercontent", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "submitResult",
    id: "1",
    isCorrect: true,
    timeTaken: 2000
  })
})
.then(r => r.json())
.then(d => console.log(d));
```

---

## API 回應格式

### 成功 (getQuestion)

```json
{
  "id": "1",
  "word": "Ubiquitous",
  "options": ["無所不在的", "稀有的", "昂貴的", "美味的"]
}
```

### 成功 (submitResult)

```json
{
  "success": true
}
```

### 錯誤

```json
{
  "error": "錯誤描述"
}
```

---

## 權重更新示例

```
初始狀態:
Word: "Ubiquitous"
Weight: 100

事件 1: 快速答對 (耗時 1.5 秒)
Weight = 100 × 0.6 = 60

事件 2: 普通答對 (耗時 5 秒)
Weight = 60 × 0.9 = 54

事件 3: 答錯
Weight = 54 + 50 = 104

事件 4: 快速答對 (耗時 2 秒)
Weight = 104 × 0.6 ≈ 62
```

---

## 環境變數 (Script Properties)

### 必需

```
OPENAI_API_KEY: sk-xxxxxxx...
```

或

```
GEMINI_API_KEY: AIzaSyxxxxxxx...
```

### 可選

```
LOG_ENABLED: true
DEBUG_MODE: false
```

---

## Google Sheets 工作表名稱

```javascript
const SHEET_VOCABULARY = 'Vocabulary';  // 主要表
const SHEET_LOGS = 'Logs';              // 日誌表
```

---

## 常見 Logs 記錄

| Event | Meaning | 何時記錄 |
|-------|---------|--------|
| served | 題目被呈現 | handleGetQuestion 時 |
| correct | 答對 | submitResult(isCorrect: true) 時 |
| wrong | 答錯 | submitResult(isCorrect: false) 時 |

---

## 性能優化技巧

### GAS 側

```javascript
// 使用快取減少 Sheet 讀寫
const cache = CacheService.getScriptCache();
const data = cache.get('vocabulary');
if (!data) {
  // 讀取 Sheet
  cache.put('vocabulary', JSON.stringify(data), 3600);
}
```

### 前端側

```javascript
// 預先載入下一題
setTimeout(() => {
  // 同時載入下下一題到背景
}, 2000);

// 使用 Service Worker 快取靜態資源
```

---

## 除錯技巧

### 在 GAS 編輯器檢視日誌

```javascript
Logger.log('訊息'); // 在執行記錄中查看
```

執行後，點擊 **執行記錄** 查看輸出。

### 在前端開啟開發者工具

```javascript
// F12 → Console
console.log('訊息');
console.error('錯誤');
```

### 測試 API 連線

```bash
# 在終端測試
curl "https://script.google.com/macros/d/{ID}/usercontent?action=getQuestion"
```

---

## 配置修改快速參考

### 改變權重係數

位置: `Code.gs` → `updateVocabularyWeight()` 函數

```javascript
// 快速答對係數 (預設 0.6)
newWeight = Math.round(currentWeight * 0.6);

// 普通答對係數 (預設 0.9)
newWeight = Math.round(currentWeight * 0.9);

// 答錯增加值 (預設 50)
weight_new = weight_old + 50;
```

### 改變時間分界

位置: `Code.gs` → `updateVocabularyWeight()` 函數

```javascript
if (timeTaken < 3000) { // 改此值 (毫秒)
  // 快速答對
} else {
  // 普通答對
}
```

位置: `script.js` → `selectOption()` 方法

```javascript
const isCorrect = selectedOption === this.currentQuestion.options[0];
// options[0] 是正確答案
```

### 改變 AI Prompt

位置: `Code.gs` → `generateOptionsFromAI()` 函數

```javascript
content: `Generate a JSON object for the English word '${word}'. ...`
```

---

## 常見問題快速答案

| 問題 | 答案 |
|------|------|
| 怎樣新增單字? | 在 Vocabulary Sheet 新增行 |
| 怎樣改變難度? | 修改權重更新係數 |
| 怎樣查看統計? | 檢查 Logs Sheet 或加上 Dashboard |
| 怎樣備份資料? | 定期下載 Google Sheets |
| 怎樣提速? | 使用 GAS 快取，減少 Sheet 讀寫 |

---

## 技術支援流程

1. 檢查 [部署指南](DEPLOYMENT.md) 的故障排除部分
2. 檢查 GAS 執行記錄中是否有錯誤
3. 檢查前端開發者工具 (F12) 中是否有錯誤
4. 檢查 GitHub Issues
5. 提交新 Issue，附上錯誤訊息和重現步驟

---

## 重要提醒

⚠️ **安全性**
- 不要將 API Key 寫入代碼
- 使用 Script Properties 儲存敏感資訊
- 如果公開分享，使用 URL 參數驗證

⚠️ **成本**
- 監控 OpenAI 使用量
- 定期檢視 API 費用
- 考慮使用免費的 Gemini API

⚠️ **效能**
- 單字數量超過 10,000 時考慮優化
- 定期清理舊日誌
- 使用快取減少 API 呼叫

---

## 更新日誌

### v1.0 (2024-01-15)
- 初始發佈
- 完成基本功能
- 部署指南完善
