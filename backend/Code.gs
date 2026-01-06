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
  
  // 添加這三行調試
  Logger.log('DEBUG: geminiKey = ' + (geminiKey ? '存在' : '不存在'));
  Logger.log('DEBUG: geminiKey 值 = ' + geminiKey);
  Logger.log('DEBUG: 所有 Properties = ' + JSON.stringify(PropertiesService.getScriptProperties().getProperties()));
  
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
 * 嘗試多個可能的端點和模型名稱
 */
function callGeminiAPI(word, apiKey) {
  try {
    // 嘗試不同的 API 端點和模型組合（根據最新 Google API 文檔）
    const endpoints = [
      {
        url: `https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        model: 'gemini-2.0-flash (v1)'
      },
      {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        model: 'gemini-1.5-flash (v1beta)'
      },
      {
        url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`,
        model: 'gemini-1.5-pro (v1beta)'
      },
      {
        url: `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        model: 'gemini-1.5-flash (v1)'
      }
    ];
    
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
    
    for (const endpoint of endpoints) {
      try {
        const options = {
          method: 'post',
          headers: {
            'Content-Type': 'application/json'
          },
          payload: JSON.stringify(payload),
          muteHttpExceptions: true
        };
        
        const response = UrlFetchApp.fetch(endpoint.url, options);
        const responseCode = response.getResponseCode();
        const responseText = response.getContentText();
        
        // 詳細調試日誌
        Logger.log(`🔍 ${endpoint.model} - HTTP ${responseCode}`);
        if (responseCode !== 200) {
          Logger.log(`   錯誤內容: ${responseText.substring(0, 200)}`);
        }
        
        if (responseCode === 200) {
          const result = JSON.parse(responseText);
          if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
            const content = result.candidates[0].content.parts[0].text;
            const jsonMatch = content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.correct && parsed.wrong && parsed.wrong.length === 3) {
                Logger.log(`✅ 使用 ${endpoint.model} 成功生成 ${word} 的選項`);
                return parsed;
              }
            }
          }
        }
      } catch (e) {
        Logger.log(`端點 ${endpoint.model} 異常: ${e}`);
      }
    }
    
    Logger.log(`❌ 所有 Gemini 端點都失敗，使用本地選項作為備用`);
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

// 無備用選項 - API 失敗時留空，待 API 可用時再生成

/**
 * 首次設定：建立工作表結構並預生成所有選項
 * 實現速率限制：每分鐘 60 次 API 呼叫
 * 在 GAS 編輯器中手動執行一次（或多次，會自動跳過已完成的單字）
 */
function initializeSpreadsheet() {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  // 建立 Vocabulary 工作表
  let vocabSheet = spreadsheet.getSheetByName(SHEET_VOCABULARY);
  if (!vocabSheet) {
    vocabSheet = spreadsheet.insertSheet(SHEET_VOCABULARY, 0);
  }
  
  // 如果工作表為空，初始化標題行
  if (vocabSheet.getLastRow() === 0) {
    vocabSheet.appendRow(['ID', 'Word', 'Options_Cache', 'Weight', 'Last_Reviewed']);
  }
  
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
  
  // 速率限制配置
  const RATE_LIMIT_PER_MINUTE = 60;
  const MS_PER_MINUTE = 60000;
  const MS_BETWEEN_REQUESTS = MS_PER_MINUTE / RATE_LIMIT_PER_MINUTE; // 1000ms
  
  Logger.log('====================================');
  Logger.log('開始預生成選項 (速率限制: 每分鐘 60 次)');
  Logger.log('====================================');
  
  let generatedCount = 0;
  let fallbackCount = 0;
  let skippedCount = 0;
  let requestCount = 0;
  const startTime = Date.now();
  
  // 獲取現有數據以檢查哪些單字已經完成
  const existingData = vocabSheet.getDataRange().getValues();
  const completedWords = new Set();
  
  for (let i = 1; i < existingData.length; i++) {
    const options = existingData[i][2];
    if (options && isValidOptions(options)) {
      completedWords.add(existingData[i][1]);
    }
  }
  
  // 處理每個單字
  for (const item of words) {
    // 檢查該單字是否已完成
    if (completedWords.has(item.word)) {
      Logger.log(`⏭️  ${item.word} 已完成，跳過`);
      skippedCount++;
      continue;
    }
    
    // 計算實際耗時和預期耗時，以確保遵守速率限制
    const elapsed = Date.now() - startTime;
    const expectedTime = (requestCount + 1) * MS_BETWEEN_REQUESTS;
    
    if (elapsed < expectedTime) {
      const waitTime = expectedTime - elapsed;
      Logger.log(`⏳ 等待 ${(waitTime/1000).toFixed(2)}s 以遵守速率限制 (每分鐘 ${RATE_LIMIT_PER_MINUTE} 次)...`);
      Utilities.sleep(waitTime);
    }
    
    requestCount++;
    const progress = `[${requestCount}/10]`;
    Logger.log(`📝 ${progress} 嘗試生成 ${item.word} 的選項...`);
    
    let options = generateOptionsFromAI(item.word);
    
    if (options) {
      // 尋找該單字在工作表中的位置，如果不存在則添加
      let found = false;
      for (let i = 1; i < existingData.length; i++) {
        if (existingData[i][1] === item.word) {
          // 更新現有行
          vocabSheet.getRange(i + 1, 3).setValue(JSON.stringify(options));
          found = true;
          break;
        }
      }
      
      if (!found) {
        // 新增行
        vocabSheet.appendRow([
          item.id, 
          item.word, 
          JSON.stringify(options),
          '100', 
          ''
        ]);
      }
      
      generatedCount++;
      Logger.log(`   ✅ 成功！`);
    } else {
      // API 失敗 - 留空，待稍後重試
      Logger.log(`   ⏳ API 暫時無法取得，留空待稍後重試`);
      
      // 確保該單字至少在工作表中有一行（即使選項為空）
      let found = false;
      for (let i = 1; i < existingData.length; i++) {
        if (existingData[i][1] === item.word) {
          found = true;
          break;
        }
      }
      
      if (!found) {
        vocabSheet.appendRow([
          item.id, 
          item.word, 
          '',  // 選項留空
          '100', 
          ''
        ]);
      }
    }
  }
  
  // 建立 Logs 工作表
  let logsSheet = spreadsheet.getSheetByName(SHEET_LOGS);
  if (!logsSheet) {
    logsSheet = spreadsheet.insertSheet(SHEET_LOGS, 1);
  }
  if (logsSheet.getLastRow() === 0) {
    logsSheet.appendRow(['Timestamp', 'Word_ID', 'Word', 'Event', 'Time_Taken', 'Result']);
  }
  
  const totalTime = (Date.now() - startTime) / 1000;
  
  Logger.log('====================================');
  Logger.log(`✅ 初始化完成！ (耗時 ${totalTime.toFixed(2)} 秒)`);
  Logger.log(`   - 成功生成: ${generatedCount} 個`);
  Logger.log(`   - 跳過已完成: ${skippedCount} 個`);
  Logger.log(`   - 失敗(留空): ${words.length - generatedCount - skippedCount} 個`);
  Logger.log(`   - 總計: ${generatedCount + skippedCount}/${words.length} 個單字`);
  Logger.log('====================================');
}

/**
 * 手動更新單字的選項 (當 API 正常時執行)
 * 例如: updateVocabularyOptions('1')
 */
function updateVocabularyOptions(wordId) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == wordId) {
      const word = data[i][1];
      const options = generateOptionsFromAI(word);
      
      if (options) {
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(options));
        Logger.log(`✅ 已更新 ${word} 的 AI 生成選項`);
      } else {
        Logger.log(`❌ 無法生成 ${word} 的選項`);
      }
      break;
    }
  }
}

/**
 * 批量更新所有單字的選項 (當 API 正常時執行)
 * 這個函數會為所有選項為空的單字生成選項
 */
function updateAllVocabularyOptions() {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_VOCABULARY);
  const data = sheet.getDataRange().getValues();
  let updatedCount = 0;
  
  Logger.log('開始批量更新選項...');
  
  for (let i = 1; i < data.length; i++) {
    const id = data[i][0];
    const word = data[i][1];
    const optionsCache = data[i][2];
    
    // 只更新為空或不是有效 JSON 的選項
    if (!optionsCache || !isValidOptions(optionsCache)) {
      const options = generateOptionsFromAI(word);
      
      if (options) {
        sheet.getRange(i + 1, 3).setValue(JSON.stringify(options));
        updatedCount++;
        Logger.log(`✅ 已更新 ${word} 的 AI 生成選項`);
      } else {
        Logger.log(`❌ 無法生成 ${word} 的選項`);
      }
      
      Utilities.sleep(1000);  // 避免超過 API 速率限制
    }
  }
  
  Logger.log(`✅ 批量更新完成！共更新 ${updatedCount} 個單字`);
}

/**
 * 檢驗選項是否有效
 */
function isValidOptions(jsonString) {
  try {
    const options = JSON.parse(jsonString);
    return options && options.correct && options.wrong && options.wrong.length === 3;
  } catch (e) {
    return false;
  }
}
