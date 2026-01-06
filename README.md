# AI 智慧背單字 App

一款輕量級網頁版背單字軟體，採用「間隔重複 (Spaced Repetition)」概念，結合 AI 自動生成干擾選項，幫助使用者高效記憶單字。

## 技術棧

- **前端**: HTML5 + CSS3 + JavaScript (Vanilla)
- **後端**: Google Apps Script (GAS)
- **資料庫**: Google Spreadsheet
- **部署**: GitHub Pages + GAS Web App
- **AI**: OpenAI GPT-3.5 Turbo (或 Google Gemini)

## 核心功能

✅ **智慧選字** - 根據熟悉度權重隨機挑選單字（不熟的字出現機率高）

✅ **AI 選項生成** - 針對挑出的單字，透過 AI 即時生成 1 個正確中文釋義 + 3 個錯誤干擾選項

✅ **學習回饋機制**
- 快速答對 (< 3秒)：視為「熟悉」，大幅降低出現頻率
- 慢速答對 (≥ 3秒)：視為「普通」，小幅降低出現頻率
- 答錯：視為「不熟悉」，增加出現頻率

✅ **進度統計** - 即時顯示正確/錯誤次數

✅ **雲端同步** - 所有數據儲存在 Google Sheets，可跨設備同步

## 快速開始

### 必要條件
- Google 帳號
- GitHub 帳號 (可選，用於部署前端)
- OpenAI 或 Google Gemini API Key

### 部署步驟

詳見 [部署指南](DEPLOYMENT.md)

簡要流程：
1. 建立 Google Spreadsheet
2. 使用 Google Apps Script 部署後端
3. 設定 API Key
4. 推送前端到 GitHub Pages
5. 在前端設定 GAS Web App URL

## 專案結構

```
GAS/
├── frontend/
│   ├── index.html          # 前端頁面
│   ├── style.css           # 樣式
│   └── script.js           # 前端邏輯
├── backend/
│   └── Code.gs             # Google Apps Script 後端
├── README.md               # 本檔案
├── DEPLOYMENT.md           # 詳細部署指南
└── DATABASE.md             # 資料庫設計說明
```

## 檔案說明

### 前端

- **index.html**: 包含 Loading、Quiz、Feedback 三個狀態的 UI
- **style.css**: 現代化的漸層設計，適應式佈局
- **script.js**: 狀態管理、計時器、API 呼叫、結果提交

### 後端

- **Code.gs**: 核心邏輯
  - `doGet()`: 處理前端的 GET 請求
  - `doPost()`: 處理前端的 POST 請求
  - `handleGetQuestion()`: 加權隨機選字、選項生成/快取
  - `handleSubmitResult()`: 權重更新、結果記錄
  - `generateOptionsFromAI()`: 呼叫 OpenAI API

### 資料庫

- **Vocabulary Sheet**: 單字庫、權重、選項快取
- **Logs Sheet**: 學習日誌、統計數據

詳見 [資料庫設計](DATABASE.md)

## API 設計

### 取得題目 (GET)

```
GET https://script.google.com/...?action=getQuestion

Response:
{
  "id": "1",
  "word": "Ubiquitous",
  "options": ["無所不在的", "稀有的", "昂貴的", "美味的"]
}
```

### 提交結果 (POST)

```
POST https://script.google.com/...

Payload:
{
  "action": "submitResult",
  "id": "1",
  "isCorrect": true,
  "timeTaken": 2000
}

Response:
{
  "success": true
}
```

## 權重演算法

$$P(x) = \frac{weight_x}{\sum_{i=1}^{n} weight_i}$$

**權重更新規則:**

- 快速答對 (< 3秒): $weight_{new} = weight_{old} \times 0.6$ (最低為 1)
- 普通答對 (≥ 3秒): $weight_{new} = weight_{old} \times 0.9$
- 答錯: $weight_{new} = weight_{old} + 50$ (最高為 500)

## 單字庫管理

### 新增單字

在 Google Sheets 的 Vocabulary 表中新增行：

| ID | Word | Options_Cache | Weight | Last_Reviewed |
|----|------|---|---|---|
| 1 | Ubiquitous | | 100 | |
| 2 | Ephemeral | | 100 | |

### 初始化

在 Google Apps Script 編輯器執行 `initializeSpreadsheet()` 函數自動建立工作表結構。

## 成本估算

| 項目 | 免費額度 | 超額費用 |
|------|---------|---------|
| Google Sheets | 無限制 | 無 |
| Google Apps Script | 每月 13.6 GB 配額 | 按使用量計費 |
| OpenAI API | 無 | ~$0.002 / 1K tokens |
| GitHub Pages | 無限制 | 無 |

**估計每月成本 (50,000 次查詢)**: 約 $100 (如使用 OpenAI)

## 故障排除

- **無法載入題目**: 檢查 GAS Web App URL 設定
- **選項為空**: 檢查 API Key 配置和網路連線
- **權重未更新**: 檢查 GAS 部署權限

詳見 [部署指南 - 故障排除](DEPLOYMENT.md#故障排除)

## 進階功能 (未來計劃)

- [ ] 單字庫管理界面 (CRUD)
- [ ] 統計分析儀表板
- [ ] 多個主題的單字庫
- [ ] 背誦模式 (非選擇題)
- [ ] 多設備同步
- [ ] 離線模式支援
- [ ] 語音發音功能
- [ ] 自訂難度等級

## 貢獻指南

歡迎提交 Issue 和 Pull Request！

## 授權

MIT License

## 聯絡方式

如有問題，請在 GitHub 上提交 Issue。
