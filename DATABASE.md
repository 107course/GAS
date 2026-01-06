# Google Sheets 資料庫設計

## 概述

本應用使用 Google Spreadsheet 作為資料庫，分為兩個工作表：
1. **Vocabulary** - 單字庫及其熟悉度權重
2. **Logs** - 學習日誌和統計數據

---

## 工作表 1: Vocabulary (單字庫)

### 欄位結構

| 欄位 | 變數名 | 資料型態 | 說明 | 範例 |
|------|--------|---------|------|------|
| A | ID | 整數 | 唯一識別碼 | 1 |
| B | Word | 文字 | 英文單字 | Ubiquitous |
| C | Options_Cache | JSON 文字 | AI 生成的選項快取 | `{"correct":"無所不在的","wrong":["稀有的","昂貴的","美味的"]}` |
| D | Weight | 整數 | 出現權重 (預設 100) | 100 |
| E | Last_Reviewed | 日期時間 | 上次複習時間 | 2024-01-15 14:30:00 |

### 詳細說明

#### A: ID (唯一識別碼)
- **用途**: 唯一識別每個單字
- **型態**: 整數或文字
- **必填**: 是
- **範例**: 1, 2, 3, ...

#### B: Word (英文單字)
- **用途**: 要背誦的英文單字
- **型態**: 文字
- **必填**: 是
- **範例**: Ubiquitous, Ephemeral, Pragmatic

#### C: Options_Cache (選項快取)
- **用途**: 儲存 AI 生成過的選項，避免重複呼叫 AI
- **型態**: JSON 字串
- **必填**: 否 (初始為空，AI 會自動填充)
- **格式**:
  ```json
  {
    "correct": "正確的中文釋義",
    "wrong": [
      "錯誤選項 1",
      "錯誤選項 2",
      "錯誤選項 3"
    ]
  }
  ```
- **範例**:
  ```json
  {
    "correct": "無所不在的",
    "wrong": ["稀有的", "昂貴的", "美味的"]
  }
  ```

#### D: Weight (熟悉度權重)
- **用途**: 控制單字被選中的機率
- **型態**: 整數 (1 ~ 500)
- **預設值**: 100
- **計算邏輯**:
  ```
  被選中的機率 = weight / (所有 weight 之和)
  
  例如：
  單字 1 的 weight = 100
  單字 2 的 weight = 50
  單字 3 的 weight = 150
  總和 = 300
  
  單字 1 被選中機率 = 100/300 = 33.3%
  單字 2 被選中機率 = 50/300 = 16.7%
  單字 3 被選中機率 = 150/300 = 50%
  ```

- **更新規則**:
  | 情況 | 計算公式 | 說明 |
  |------|---------|------|
  | 快速答對 (< 3秒) | `weight_new = weight_old × 0.6` | 大幅降低出現頻率 |
  | 普通答對 (≥ 3秒) | `weight_new = weight_old × 0.9` | 小幅降低出現頻率 |
  | 答錯 | `weight_new = weight_old + 50` | 增加出現頻率 |
  | 最小值 | `max(weight, 1)` | 防止變成 0 |
  | 最大值 | `min(weight, 500)` | 防止過度增長 |

- **範例演變**:
  ```
  初始: weight = 100
  
  快速答對一次: 100 × 0.6 = 60
  再快速答對一次: 60 × 0.6 = 36
  再快速答對一次: 36 × 0.6 = 21.6 ≈ 22
  
  如果答錯: 22 + 50 = 72
  再答錯: 72 + 50 = 122
  ```

#### E: Last_Reviewed (上次複習時間)
- **用途**: 記錄最後一次複習的時間
- **型態**: 日期時間
- **必填**: 否 (首次使用時自動更新)
- **自動更新**: 每次提交結果時更新為當前時間
- **用途**: 可用於統計和分析

### 初始化示例

| ID | Word | Options_Cache | Weight | Last_Reviewed |
|---|---|---|---|---|
| 1 | Ubiquitous | | 100 | |
| 2 | Ephemeral | | 100 | |
| 3 | Pragmatic | | 100 | |
| 4 | Eloquent | | 100 | |
| 5 | Serendipity | | 100 | |

---

## 工作表 2: Logs (學習日誌)

### 欄位結構

| 欄位 | 變數名 | 資料型態 | 說明 | 範例 |
|------|--------|---------|------|------|
| A | Timestamp | 日期時間 | 事件發生時間 | 2024-01-15 14:30:25 |
| B | Word_ID | 整數 | 對應的單字 ID | 1 |
| C | Word | 文字 | 單字內容 | Ubiquitous |
| D | Event | 文字 | 事件類型 | served / correct / wrong |
| E | Time_Taken | 整數 | 答題耗時 (毫秒) | 1500 |
| F | Result | 文字 | 結果符號 | ✅ / ❌ |

### 詳細說明

#### A: Timestamp (事件時間)
- **用途**: 記錄何時發生事件
- **型態**: 日期時間
- **自動填充**: GAS 會自動填入 `new Date()`
- **格式**: YYYY-MM-DD HH:MM:SS

#### B: Word_ID (單字 ID)
- **用途**: 關聯到 Vocabulary 表的 ID
- **型態**: 整數
- **用途**: 可用於匯總和分析

#### C: Word (單字)
- **用途**: 記錄單字內容（便於查閱）
- **型態**: 文字
- **用途**: 可用於快速搜尋和報表

#### D: Event (事件類型)
- **用途**: 標記發生的事件
- **可選值**: 
  - `served` - 題目被呈現
  - `correct` - 答對
  - `wrong` - 答錯

#### E: Time_Taken (耗時)
- **用途**: 記錄答題耗時
- **型態**: 整數 (毫秒)
- **範圍**: 0 ~ 10000 (預期)
- **用途**: 用於判斷快速/普通答對的分界

#### F: Result (結果符號)
- **用途**: 視覺化結果標記
- **可選值**: `✅` (正確) 或 `❌` (錯誤)
- **用途**: 便於快速掃描

### 示例日誌

| Timestamp | Word_ID | Word | Event | Time_Taken | Result |
|---|---|---|---|---|---|
| 2024-01-15 14:30:25 | 1 | Ubiquitous | served | | |
| 2024-01-15 14:30:27 | 1 | Ubiquitous | correct | 2000 | ✅ |
| 2024-01-15 14:30:28 | 2 | Ephemeral | served | | |
| 2024-01-15 14:30:35 | 2 | Ephemeral | wrong | 7000 | ❌ |
| 2024-01-15 14:30:36 | 1 | Ubiquitous | served | | |
| 2024-01-15 14:30:40 | 1 | Ubiquitous | correct | 4000 | ✅ |

---

## 資料關係

```
Vocabulary (主要資料)
├── ID (主鍵)
├── Word
├── Options_Cache (AI 選項)
├── Weight (熟悉度)
└── Last_Reviewed (更新時間)
        ↓
        相關聯
        ↓
Logs (詳細紀錄)
├── Word_ID (外鍵 → Vocabulary.ID)
├── Word
├── Event (行為)
├── Time_Taken
└── Result
```

---

## 資料流

```
1. 前端請求題目
   ↓
2. GAS 讀取 Vocabulary 表
   ↓
3. 根據 Weight 隨機選單字
   ↓
4. 檢查 Options_Cache 是否為空
   ├─ 有值 → 直接使用
   └─ 無值 → 呼叫 AI 生成，保存到 Options_Cache
   ↓
5. 在 Logs 記錄 "served" 事件
   ↓
6. 回傳題目給前端
   ↓
7. 使用者答題
   ↓
8. 前端提交結果
   ↓
9. GAS 更新 Vocabulary 的 Weight 和 Last_Reviewed
   ↓
10. GAS 在 Logs 記錄 "correct" 或 "wrong" 事件
```

---

## 手動管理建議

### 新增單字

1. 開啟 Google Sheets
2. 在 **Vocabulary** 表新增行
3. 填入:
   - **ID**: 遞增編號 (如: 6, 7, 8, ...)
   - **Word**: 英文單字
   - **Options_Cache**: 留空 (AI 會自動填充)
   - **Weight**: 100 (或自訂)
   - **Last_Reviewed**: 留空

### 批量匯入

1. 準備 CSV 或 Excel 檔案
2. 在 Google Sheets 中選擇 **檔案** → **匯入**
3. 選擇正確的欄位對應

### 統計分析

在 Google Sheets 中可使用以下公式：

**計算某單字的正確率:**
```
=COUNTIFS(Logs!$B$2:$B$1000, Vocabulary!A2, Logs!$D$2:$D$1000, "correct") / 
(COUNTIFS(Logs!$B$2:$B$1000, Vocabulary!A2, Logs!$D$2:$D$1000, "correct") + 
 COUNTIFS(Logs!$B$2:$B$1000, Vocabulary!A2, Logs!$D$2:$D$1000, "wrong"))
```

**計算平均耗時:**
```
=AVERAGEIF(Logs!$B$2:$B$1000, Vocabulary!A2, Logs!$E$2:$E$1000)
```

---

## 性能考慮

| 指標 | 建議限制 | 說明 |
|------|---------|------|
| 最大單字數 | 10,000 | 超過此數字可能影響隨機選擇性能 |
| 日誌保留天數 | 90 天 | 定期清理舊日誌以保持性能 |
| API 呼叫頻率 | < 100 次/分鐘 | Google Apps Script 限制 |
| Sheet 更新頻率 | < 1 次/秒 | 避免並發寫入衝突 |

---

## 備份建議

1. 定期 (每週) 下載 Google Sheets 為 Excel
2. 在 Google Drive 中啟用版本歷史
3. 使用 Google Sheets 的 `File → Version history` 功能
