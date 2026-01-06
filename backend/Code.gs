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
 * 3. 返回快取的選項 (應該已在初始化時預生成)
 * 4. 如果快取為空 (邊界情況)，則臨時生成
 */
function handleGetQuestion() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
  const data = sheet.getDataRange().getValues();
  
  // 跳過標題行
  const vocabulary = data.slice(1).map((row, index) => ({
    index: index + 2, // Sheet 中的實際行號 (從 2 開始)
    id: row[0],
    word: row[1],
    optionsCache: row[2] ? tryParseJSON(row[2]) : null,
    weight: row[3] || 100,
    lastReviewed: row[4]
  }));
  
  // 加權隨機選字
  const selectedItem = weightedRandomSelection(vocabulary);
  
  if (!selectedItem) {
    return createJsonResponse({ error: 'No vocabulary found' }, 400);
  }
  
  // 優先使用快取的選項 (應該已在初始化時預生成)
  let options = selectedItem.optionsCache;
  
  if (!options || !options.correct) {
    // 如果快取為空或損壞，臨時生成 (不應該發生)
    Logger.log(`⚠️ 警告：${selectedItem.word} 的選項快取為空，臨時生成中...`);
    options = generateOptionsFromAI(selectedItem.word);
    
    // 保存到 Sheet 以備將來使用
    if (options) {
      sheet.getRange(selectedItem.index, 3).setValue(JSON.stringify(options)); // C 列
    }
  }
  
  // 記錄日誌 (可選)
  logQuestionServed(selectedItem.id, selectedItem.word);
  
  // 確保 options 有正確的結構
  if (options && options.correct && options.wrong && options.wrong.length === 3) {
    return createJsonResponse({
      id: selectedItem.id,
      word: selectedItem.word,
      options: [options.correct, ...options.wrong]  // 第一個是正確答案
    });
  } else {
    return createJsonResponse({ error: 'Invalid options format' }, 500);
  }
}

/**
 * 安全的 JSON 解析函數
 */
function tryParseJSON(jsonString) {
  try {
    if (!jsonString || typeof jsonString !== 'string') return null;
    return JSON.parse(jsonString);
  } catch (e) {
    Logger.log('JSON parse error: ' + e);
    return null;
  }
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
 * 支援多個模型版本，優先嘗試較新的模型
 */
function callGeminiAPI(word, apiKey) {
  try {
    // 嘗試 gemini-pro 模型 (最穩定)
    const models = [
      'gemini-pro',
      'gemini-1.5-pro-latest',
      'gemini-1.5-flash-latest'
    ];
    
    for (const model of models) {
      const result = tryGeminiModel(word, apiKey, model);
      if (result) {
        Logger.log(`✅ 使用模型 ${model} 成功生成 ${word} 的選項`);
        return result;
      }
    }
    
    Logger.log(`❌ 所有 Gemini 模型都失敗，請檢查 API Key 或模型可用性`);
  } catch (error) {
    Logger.log('Error calling Gemini API: ' + error);
  }
  
  return null;
}

/**
 * 嘗試使用特定的 Gemini 模型
 */
function tryGeminiModel(word, apiKey, model) {
  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    
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
    const responseCode = response.getResponseCode();
    const responseText = response.getContentText();
    
    if (responseCode === 200) {
      const result = JSON.parse(responseText);
      if (result.candidates && result.candidates[0]) {
        const content = result.candidates[0].content.parts[0].text;
        // 提取 JSON (可能在文本中)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
    } else {
      Logger.log(`模型 ${model} 返回錯誤 (${responseCode}): ${responseText}`);
    }
  } catch (error) {
    Logger.log(`模型 ${model} 呼叫失敗: ${error}`);
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
 * 首次設定：建立工作表結構並預生成所有選項
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
  
  // 示例單字清單
  const words = [
    { id: '1', word: 'Ubiquitous' },
    { id: '2', word: 'Ephemeral' },
    { id: '3', word: 'Pragmatic' },
    { id: '4', word: 'Eloquent' },
    { id: '5', word: 'Serendipity' },
    { id: '6', word: 'Melancholy' },
    { id: '7', word: 'Tenacious' },
    { id: '8', word: 'Enigmatic' },
    { id: '9', word: 'Altruistic' },
    { id: '10', word: 'Juxtapose' }
  ];
  
  // 為每個單字預生成選項並保存
  Logger.log('開始預生成選項...');
  let generatedCount = 0;
  
  for (const item of words) {
    const options = generateOptionsFromAI(item.word);
    
    if (options) {
      vocabSheet.appendRow([
        item.id, 
        item.word, 
        JSON.stringify(options),  // 立即保存選項快取
        '100', 
        ''
      ]);
      generatedCount++;
      Logger.log(`✅ 已生成 ${item.word} 的選項`);
    } else {
      // 如果 API 失敗，先添加空白選項，稍後手動補充
      vocabSheet.appendRow([
        item.id, 
        item.word, 
        '', 
        '100', 
        ''
      ]);
      Logger.log(`⚠️ ${item.word} 的選項生成失敗，請檢查 API Key`);
    }
    
    // 每個 API 呼叫間隔 1 秒，避免超過速率限制
    Utilities.sleep(1000);
  }
  
  // 建立 Logs 工作表
  let logsSheet = spreadsheet.getSheetByName(SHEET_LOGS);
  if (!logsSheet) {
    logsSheet = spreadsheet.insertSheet(SHEET_LOGS, 1);
  }
  logsSheet.clear();
  logsSheet.appendRow(['Timestamp', 'Word_ID', 'Word', 'Event', 'Time_Taken', 'Result']);
  
  Logger.log(`✅ Spreadsheet 初始化完成！成功生成 ${generatedCount}/${words.length} 個單字的選項`);
}
