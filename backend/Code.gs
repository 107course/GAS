/**
 * AI 智慧背單字 - Google Apps Script 後端
 * 主要功能:
 * 1. doGet/doPost: 處理前端的 HTTP 請求，支援 CORS
 * 2. getQuestion: 根據熟悉度權重隨機挑選單字，並生成或返回快取選項
 * 3. submitResult: 更新單字的熟悉度權重
 * 4. 與 AI API 整合，生成選項
 */

// ============================================
// 配置
// ============================================
const SPREADSHEET_ID = '17Rb9ckpztftDdeveZOLgYBHIJpDXKQlgNDTwRyPwZsI'; // 需要設定
const SHEET_VOCABULARY = 'Vocabulary';
const SHEET_LOGS = 'Logs';

// AI 配置 (在 Script Properties 中設定)
// Properties: OPENAI_API_KEY 或 GEMINI_API_KEY

// ============================================
// CORS 和路由
// ============================================

/**
 * 處理 GET 請求
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    switch (action) {
      case 'getQuestion':
        return handleGetQuestion();
      default:
        return createJsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

/**
 * 處理 POST 請求
 */
function doPost(e) {
  const payload = JSON.parse(e.postData.contents);
  const action = payload.action;
  
  try {
    switch (action) {
      case 'submitResult':
        return handleSubmitResult(payload);
      default:
        return createJsonResponse({ error: 'Unknown action' }, 400);
    }
  } catch (error) {
    return createJsonResponse({ error: error.toString() }, 500);
  }
}

/**
 * 建立 JSON 回應（帶 CORS header）
 */
function createJsonResponse(data, statusCode = 200) {
  const output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ============================================
// 獲取題目的核心邏輯
// ============================================

/**
 * 獲取題目
 * 1. 從 Sheet 讀取所有單字和權重
 * 2. 根據權重隨機挑選
 * 3. 檢查選項快取
 * 4. 如果沒有快取，呼叫 AI 生成並保存
 */
function handleGetQuestion() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
  const data = sheet.getDataRange().getValues();
  
  // 跳過標題行
  const vocabulary = data.slice(1).map((row, index) => ({
    index: index + 2, // Sheet 中的實際行號 (從 2 開始)
    id: row[0],
    word: row[1],
    optionsCache: row[2] ? JSON.parse(row[2]) : null,
    weight: row[3] || 100,
    lastReviewed: row[4]
  }));
  
  // 加權隨機選字
  const selectedItem = weightedRandomSelection(vocabulary);
  
  if (!selectedItem) {
    return createJsonResponse({ error: 'No vocabulary found' }, 400);
  }
  
  // 檢查選項快取
  let options = selectedItem.optionsCache;
  
  if (!options) {
    // 呼叫 AI 生成選項
    options = generateOptionsFromAI(selectedItem.word);
    
    // 保存到 Sheet
    if (options) {
      const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
      sheet.getRange(selectedItem.index, 3).setValue(JSON.stringify(options)); // C 列
    }
  }
  
  // 記錄日誌 (可選)
  logQuestionServed(selectedItem.id, selectedItem.word);
  
  return createJsonResponse({
    id: selectedItem.id,
    word: selectedItem.word,
    options: [options.correct, ...options.wrong]
  });
}

/**
 * 加權隨機選字
 * 根據 weight 欄位，計算每個單字被選中的機率
 */
function weightedRandomSelection(vocabulary) {
  const totalWeight = vocabulary.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const item of vocabulary) {
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }
  
  return vocabulary[0]; // 防故安全
}

/**
 * 從 AI API 生成選項
 * 優先使用免費的 Google Gemini API，如無法使用則改用 OpenAI
 */
function generateOptionsFromAI(word) {
  const geminiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  const openaiKey = PropertiesService.getScriptProperties().getProperty('OPENAI_API_KEY');
  
  // 優先嘗試 Gemini (免費)
  if (geminiKey) {
    const geminiResult = callGeminiAPI(word, geminiKey);
    if (geminiResult) return geminiResult;
  }
  
  // 次選 OpenAI
  if (openaiKey) {
    const openaiResult = callOpenAIAPI(word, openaiKey);
    if (openaiResult) return openaiResult;
  }
  
  Logger.log('Warning: No AI API Key configured. Please set GEMINI_API_KEY or OPENAI_API_KEY in Script Properties.');
  return null;
}

/**
 * 呼叫 Google Gemini API (免費)
 */
function callGeminiAPI(word, apiKey) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Generate a JSON object for the English word '${word}'. It must contain one 'correct' Chinese meaning and an array of three 'wrong' Chinese meanings that are plausible but incorrect. Format: {"correct": "...", "wrong": ["...", "...", "..."]} Only return JSON, no other text.`
            }
          ]
        }
      ]
    };
    
    const options = {
      method: 'post',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.candidates && result.candidates[0]) {
      const content = result.candidates[0].content.parts[0].text;
      // 提取 JSON (可能在文本中)
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } else {
      Logger.log('Gemini API Error: ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('Error calling Gemini API: ' + error);
  }
  
  return null;
}

/**
 * 呼叫 OpenAI API
 */
function callOpenAIAPI(word, apiKey) {
  try {
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that generates Chinese translations for English words. Always respond with ONLY valid JSON.'
        },
        {
          role: 'user',
          content: `Generate a JSON object for the English word '${word}'. It must contain one 'correct' Chinese meaning and an array of three 'wrong' Chinese meanings. Format: {"correct": "...", "wrong": ["...", "...", "..."]} Only return JSON.`
        }
      ],
      temperature: 0.7,
      max_tokens: 200
    };
    
    const options = {
      method: 'post',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(url, options);
    const result = JSON.parse(response.getContentText());
    
    if (response.getResponseCode() === 200 && result.choices && result.choices[0]) {
      const content = result.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } else {
      Logger.log('OpenAI API Error: ' + response.getContentText());
    }
  } catch (error) {
    Logger.log('Error calling OpenAI API: ' + error);
  }
  
  return null;
}

// ============================================
// 提交結果和權重更新
// ============================================

/**
 * 提交答題結果
 */
function handleSubmitResult(payload) {
  const { id, isCorrect, timeTaken } = payload;
  
  // 根據結果更新權重
  updateVocabularyWeight(id, isCorrect, timeTaken);
  
  // 記錄到 Logs (可選)
  logResult(id, isCorrect, timeTaken);
  
  return createJsonResponse({ success: true });
}

/**
 * 更新單字的熟悉度權重
 * - 快速答對 (< 3秒): weight *= 0.6
 * - 普通答對 (3-10秒): weight *= 0.9
 * - 答錯: weight += 50
 */
function updateVocabularyWeight(id, isCorrect, timeTaken) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) { // 找到對應的單字
      const currentWeight = data[i][3] || 100;
      let newWeight = currentWeight;
      
      if (isCorrect) {
        if (timeTaken < 3000) {
          // 快速答對
          newWeight = Math.max(Math.round(currentWeight * 0.6), 1);
        } else {
          // 普通答對
          newWeight = Math.max(Math.round(currentWeight * 0.9), 1);
        }
      } else {
        // 答錯
        newWeight = Math.min(currentWeight + 50, 500);
      }
      
      // 更新 weight 欄位 (D 列)
      sheet.getRange(i + 1, 4).setValue(newWeight);
      
      // 更新 last_reviewed 欄位 (E 列)
      sheet.getRange(i + 1, 5).setValue(new Date());
      
      break;
    }
  }
}

// ============================================
// 日誌記錄 (可選)
// ============================================

/**
 * 記錄題目被呈現
 */
function logQuestionServed(id, word) {
  // 可選：記錄每次題目被呈現的紀錄
  const logsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_LOGS);
  if (logsSheet) {
    logsSheet.appendRow([
      new Date(),
      id,
      word,
      'served'
    ]);
  }
}

/**
 * 記錄答題結果
 */
function logResult(id, isCorrect, timeTaken) {
  const logsSheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_LOGS);
  if (logsSheet) {
    logsSheet.appendRow([
      new Date(),
      id,
      '',
      isCorrect ? 'correct' : 'wrong',
      timeTaken,
      isCorrect ? '✅' : '❌'
    ]);
  }
}

// ============================================
// 初始化工具函數
// ============================================

/**
 * 首次設定：建立工作表結構
 * 在 GAS 編輯器中手動執行一次
 */
function initializeSpreadsheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 建立 Vocabulary 工作表
  let vocabSheet = spreadsheet.getSheetByName(SHEET_VOCABULARY);
  if (!vocabSheet) {
    vocabSheet = spreadsheet.insertSheet(SHEET_VOCABULARY, 0);
  }
  vocabSheet.clear();
  vocabSheet.appendRow(['ID', 'Word', 'Options_Cache', 'Weight', 'Last_Reviewed']);
  
  // 新增示例單字
  vocabSheet.appendRow(['1', 'Ubiquitous', '', '100', '']);
  vocabSheet.appendRow(['2', 'Ephemeral', '', '100', '']);
  vocabSheet.appendRow(['3', 'Pragmatic', '', '100', '']);
  vocabSheet.appendRow(['4', 'Eloquent', '', '100', '']);
  vocabSheet.appendRow(['5', 'Serendipity', '', '100', '']);
  
  // 建立 Logs 工作表
  let logsSheet = spreadsheet.getSheetByName(SHEET_LOGS);
  if (!logsSheet) {
    logsSheet = spreadsheet.insertSheet(SHEET_LOGS, 1);
  }
  logsSheet.clear();
  logsSheet.appendRow(['Timestamp', 'Word_ID', 'Word', 'Event', 'Time_Taken', 'Result']);
  
  Logger.log('Spreadsheet initialized successfully');
}
