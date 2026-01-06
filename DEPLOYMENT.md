# AI 智慧背單字 - 部署指南

## 目錄
1. [GAS 後端部署](#gas-後端部署)
2. [Google Sheets 設定](#google-sheets-設定)
3. [前端部署到 GitHub Pages](#前端部署到-github-pages)
4. [完整工作流程](#完整工作流程)
5. [故障排除](#故障排除)

---

## GAS 後端部署

### 步驟 1: 建立 Google Spreadsheet

1. 開啟 [Google Sheets](https://sheets.google.com)
2. 建立新試算表，記下試算表的 ID（URL 中的字串）
   ```
   https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit
   ```
3. 將 `SPREADSHEET_ID` 複製並備用

### 步驟 2: 建立 Google Apps Script 專案

1. 在 Google Sheets 中，選擇 **工具** → **指令碼編輯器**
2. 系統會開啟 Google Apps Script 編輯器
3. 刪除預設的 `myFunction` 程式碼
4. 將 `backend/Code.gs` 的內容複製貼上
5. 修改第 6 行，將 `'YOUR_SPREADSHEET_ID'` 改為實際的試算表 ID
   ```javascript
   const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID';
   ```

### 步驟 3: 設定 API 密鑰

#### 選項 A: 使用 OpenAI API

1. 前往 [OpenAI API](https://platform.openai.com/account/api-keys) 取得 API Key
2. 在 GAS 編輯器中，選擇 **專案設定** → **指令碼屬性**
3. 新增以下屬性：
   - **屬性**: `OPENAI_API_KEY`
   - **值**: 貼上您的 OpenAI API Key

#### 選項 B: 使用 Google Gemini API

1. 前往 [Google AI Studio](https://makersuite.google.com/app/apikey) 取得 API Key
2. 新增屬性 `GEMINI_API_KEY` (需要自行修改程式碼以支援 Gemini)

### 步驟 4: 初始化試算表

1. 在 GAS 編輯器中，選擇函數 `initializeSpreadsheet`
2. 點擊執行 (▶)
3. 如果首次執行，會要求授權，按照提示授權即可
4. 等待完成後，回到 Google Sheets，應該看到 `Vocabulary` 和 `Logs` 兩個工作表已建立，並有 5 個範例單字

### 步驟 5: 部署為 Web App

1. 在 GAS 編輯器中，點擊 **部署** → **新增部署**
2. 選擇類型為 **Web 應用程式**
3. 設定如下：
   - **執行方式**: 選擇您的 Google 帳號
   - **誰可以存取**: 選擇 **我本人** (個人使用) 或 **任何人** (如果要分享)
4. 點擊 **部署**
5. 複製 **部署 ID** 和 **Web 應用程式 URL**，格式如下：
   ```
   https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercontent
   ```

---

## Google Sheets 設定

### Vocabulary (單字庫) 工作表

應自動建立以下結構：

| A | B | C | D | E |
|---|---|---|---|---|
| ID | Word | Options_Cache | Weight | Last_Reviewed |
| 1 | Ubiquitous | (自動填充) | 100 | |
| 2 | Ephemeral | (自動填充) | 100 | |
| ... | ... | ... | ... | ... |

**手動新增單字:**

1. 開啟 Google Sheets
2. 在 **Vocabulary** 工作表新增行
3. 填入：
   - **A**: 唯一編號 (如: 6)
   - **B**: 英文單字 (如: Serendipity)
   - **C**: 留空 (AI 會自動填充)
   - **D**: 權重 (預設 100)
   - **E**: 留空

### Logs (日誌) 工作表

應自動建立以下結構：

| A | B | C | D | E | F |
|---|---|---|---|---|---|
| Timestamp | Word_ID | Word | Event | Time_Taken | Result |
| (自動) | (自動) | (自動) | served/correct/wrong | (毫秒) | ✅/❌ |

---

## 前端部署到 GitHub Pages

### 步驟 1: 準備檔案

前端檔案位置：
```
frontend/
├── index.html
├── style.css
└── script.js
```

### 步驟 2: 推送到 GitHub

在您的 GAS 資料夾執行：

```bash
# 確保已初始化 git
git status

# 新增前端檔案
git add frontend/

# 提交
git commit -m "Add frontend files for Quiz App"

# 推送
git push origin main
```

### 步驟 3: 啟用 GitHub Pages

1. 進入 GitHub 倉庫設定
2. 找到 **Pages** 選項
3. 選擇 **Source** 為 `main` 分支，資料夾為 `/ (root)`
4. 按 **Save**
5. 等待幾秒，您會看到 GitHub Pages 的 URL：
   ```
   https://107course.github.io/GAS/
   ```

### 步驟 4: 設定前端 URL

1. 開啟 `https://107course.github.io/GAS/`
2. 點擊右下角的 **⚙️** 設定按鈕
3. 輸入 **GAS Web App URL**:
   ```
   https://script.google.com/macros/d/{DEPLOYMENT_ID}/usercontent
   ```
4. 點擊 **儲存設定**

---

## 完整工作流程

```
使用者在前端 (GitHub Pages) 
  ↓
點擊「開始答題」
  ↓
前端發送 GET 請求到 GAS: ?action=getQuestion
  ↓
GAS 讀取 Spreadsheet 中的單字庫和權重
  ↓
GAS 執行加權隨機演算法選出單字
  ↓
GAS 檢查該單字是否有快取選項
  ├─ 有 → 直接回傳
  └─ 無 → 呼叫 AI API 生成選項並保存
  ↓
GAS 回傳 JSON: {id, word, options[]}
  ↓
前端顯示單字和打亂後的選項，啟動計時
  ↓
使用者選擇答案
  ↓
前端停止計時，計算耗時
  ↓
前端發送 POST 請求到 GAS: {action: submitResult, id, isCorrect, timeTaken}
  ↓
GAS 根據結果更新 weight:
  ├─ 快速正確 (< 3秒): weight *= 0.6
  ├─ 普通正確 (≥ 3秒): weight *= 0.9
  └─ 錯誤: weight += 50
  ↓
GAS 更新 Spreadsheet 的 weight 和 last_reviewed
  ↓
前端顯示 2 秒的回饋動畫
  ↓
2 秒後自動載入下一題
```

---

## 故障排除

### 問題 1: "無法從 GAS 載入題目，請檢查 URL 設定"

**可能原因:**
- GAS Web App URL 設定錯誤
- GAS 未部署或部署已過期
- SPREADSHEET_ID 設定錯誤

**解決方案:**
1. 確認 GAS Web App URL 正確（應該包含 `macros/d/` 和 `usercontent`）
2. 重新部署 GAS：在編輯器中點擊 **部署** → **新增部署**
3. 確認 Code.gs 中的 `SPREADSHEET_ID` 是正確的

### 問題 2: "AI API Key not configured"

**可能原因:**
- 未在 Script Properties 中設定 API Key
- API Key 過期或無效

**解決方案:**
1. 開啟 GAS 編輯器
2. 點擊 **專案設定** → **指令碼屬性**
3. 檢查 `OPENAI_API_KEY` 或 `GEMINI_API_KEY` 是否正確設定
4. 確認 API Key 有效

### 問題 3: "No vocabulary found"

**可能原因:**
- Vocabulary 工作表為空

**解決方案:**
1. 開啟 Google Sheets
2. 檢查 **Vocabulary** 工作表是否有數據
3. 如果為空，執行 GAS 中的 `initializeSpreadsheet()` 函數

### 問題 4: CORS 錯誤

**可能原因:**
- GAS 部署設定有誤

**解決方案:**
1. 在 GAS 編輯器中重新部署
2. 確保選擇 **誰可以存取** 為 **任何人** 或至少 **我本人**
3. 檢查前端的 fetch 請求是否正確

---

## 進階配置

### 自訂 AI Prompt

在 `Code.gs` 中的 `generateOptionsFromAI` 函數，修改 prompt 文本：

```javascript
content: `Generate a JSON object for the English word '${word}'. ...`
```

### 調整權重演算法

在 `updateVocabularyWeight` 函數修改係數：

```javascript
if (timeTaken < 3000) {
  newWeight = Math.max(Math.round(currentWeight * 0.6), 1); // 改此值
} else {
  newWeight = Math.max(Math.round(currentWeight * 0.9), 1); // 改此值
}
```

### 新增更多 Sheet

在 `initializeSpreadsheet()` 中新增更多 Sheet 用於不同主題的單字庫。

---

## 成本估算

| 項目 | 免費額度 | 超額費用 |
|------|---------|---------|
| Google Sheets | 無限制 | 無 |
| Google Apps Script | 每月 13.6 GB | 按使用量計費 |
| OpenAI API | 無 | ~$0.002 / 1K tokens |
| GitHub Pages | 無限制 | 無 |

**每月成本估算 (50,000 次查詢):**
- 約 50,000 × $0.002 = $100 / 月 (OpenAI)
- 或可選擇使用 Google Gemini API (目前免費)

---

## 下一步

- [ ] 新增單字庫管理界面
- [ ] 實現統計分析儀表板
- [ ] 支援多個主題的單字庫
- [ ] 新增背誦模式（非選擇題）
- [ ] 實現同步功能 (多設備同步進度)
