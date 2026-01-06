/**
 * AI 智慧背單字 - 前端邏輯
 * 負責: UI 狀態管理、計時、API 呼叫、結果提交
 */

class QuizApp {
    constructor() {
        // GAS API 配置（需要在設定中配置）
        this.gasUrl = localStorage.getItem('gasUrl') || '';
        
        // 狀態管理
        this.currentQuestion = null;
        this.correctAnswer = null;  // 保存正確答案
        this.startTime = 0;
        this.timerInterval = null;
        this.isAnswered = false;
        
        // 統計
        this.correctCount = localStorage.getItem('correctCount') || 0;
        this.wrongCount = localStorage.getItem('wrongCount') || 0;
        
        // DOM 元素
        this.elements = {
            loadingState: document.getElementById('loadingState'),
            quizState: document.getElementById('quizState'),
            feedbackState: document.getElementById('feedbackState'),
            settingsModal: document.getElementById('settingsModal'),
            gasUrlInput: document.getElementById('gasUrl'),
            timer: document.getElementById('timer'),
            currentWord: document.getElementById('currentWord'),
            optionBtns: document.querySelectorAll('.option-btn'),
            correctCount: document.getElementById('correctCount'),
            wrongCount: document.getElementById('wrongCount'),
            feedbackIcon: document.getElementById('feedbackIcon'),
            feedbackText: document.getElementById('feedbackText'),
            feedbackDetails: document.getElementById('feedbackDetails'),
            progressFill: document.getElementById('progressFill'),
        };
        
        this.init();
    }
    
    init() {
        this.setupEventListeners();
        this.updateStats();
        
        // 延遲 500ms 確保 DOM 完全加載
        setTimeout(() => {
            // 如果已配置 GAS URL，開始載入題目
            if (this.gasUrl) {
                this.loadQuestion();
            } else {
                // 首次使用，自動打開設定
                this.showModal();
            }
        }, 500);
    }
    
    setupEventListeners() {
        // 選項按鈕點擊
        this.elements.optionBtns.forEach((btn, index) => {
            btn.addEventListener('click', () => this.selectOption(index));
        });
        
        // 設定按鈕
        document.getElementById('settingsToggle').addEventListener('click', () => {
            this.showModal();
        });
        
        // 關閉 Modal
        document.querySelector('.close-btn').addEventListener('click', () => {
            this.hideModal();
        });
        
        // 儲存設定
        document.getElementById('saveSettings').addEventListener('click', () => {
            this.saveSettings();
        });
        
        // 重置統計
        document.getElementById('resetStats').addEventListener('click', () => {
            this.resetStats();
        });
        
        // Modal 外部點擊關閉
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) {
                this.hideModal();
            }
        });
    }
    
    /**
     * 從 GAS 載入題目
     */
    async loadQuestion() {
        this.setState('loading');
        this.stopTimer();
        this.isAnswered = false;
        
        try {
            const url = `${this.gasUrl}?action=getQuestion`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            this.currentQuestion = data;
            this.displayQuestion(data);
            this.setState('quiz');
            this.startTimer();
        } catch (error) {
            console.error('載入題目失敗:', error);
            alert('無法從 GAS 載入題目，請檢查 URL 設定。\n錯誤: ' + error.message);
            this.showModal();
        }
    }
    
    /**
     * 顯示題目
     */
    displayQuestion(data) {
        // 顯示單字
        this.elements.currentWord.textContent = data.word;
        
        // 保存正確答案（在打亂前）
        this.correctAnswer = data.options[0];
        
        // 打亂選項順序
        const shuffledOptions = this.shuffleArray([...data.options]);
        
        // 更新按鈕
        this.elements.optionBtns.forEach((btn, index) => {
            btn.textContent = shuffledOptions[index];
            btn.disabled = false;
            btn.className = 'option-btn';
            btn.dataset.option = shuffledOptions[index];
        });
    }
    
    /**
     * 打亂陣列
     */
    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
    
    /**
     * 選擇選項
     */
    selectOption(index) {
        if (this.isAnswered) return;
        
        this.isAnswered = true;
        this.stopTimer();
        
        const timeTaken = Date.now() - this.startTime;
        const selectedOption = this.elements.optionBtns[index].dataset.option;
        
        // 與保存的正確答案比對
        const isCorrect = selectedOption === this.correctAnswer;
        
        // 視覺反饋
        this.elements.optionBtns[index].classList.add(isCorrect ? 'correct' : 'incorrect');
        this.elements.optionBtns.forEach((btn, i) => {
            btn.disabled = true;
            // 高亮顯示正確答案
            if (btn.dataset.option === this.correctAnswer) {
                btn.classList.add('correct');
            }
        });
        
        // 更新統計
        if (isCorrect) {
            this.correctCount++;
        } else {
            this.wrongCount++;
        }
        localStorage.setItem('correctCount', this.correctCount);
        localStorage.setItem('wrongCount', this.wrongCount);
        this.updateStats();
        
        // 顯示回饋
        this.showFeedback(isCorrect, timeTaken);
        
        // 提交結果到 GAS
        this.submitResult(this.currentQuestion.id, isCorrect, timeTaken);
        
        // 2 秒後載入下一題
        setTimeout(() => this.loadQuestion(), 2000);
    }
    
    /**
     * 顯示回饋
     */
    showFeedback(isCorrect, timeTaken) {
        this.setState('feedback');
        
        const icon = isCorrect ? '✅' : '❌';
        const text = isCorrect ? '答對！' : '答錯！';
        const seconds = (timeTaken / 1000).toFixed(1);
        
        this.elements.feedbackIcon.textContent = icon;
        this.elements.feedbackText.textContent = text;
        this.elements.feedbackDetails.textContent = `耗時: ${seconds} 秒`;
    }
    
    /**
     * 提交結果到 GAS
     */
    async submitResult(id, isCorrect, timeTaken) {
        try {
            const payload = {
                action: 'submitResult',
                id: id,
                isCorrect: isCorrect,
                timeTaken: timeTaken
            };
            
            await fetch(this.gasUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
        } catch (error) {
            console.error('提交結果失敗:', error);
        }
    }
    
    /**
     * 計時器管理
     */
    startTimer() {
        this.startTime = Date.now();
        this.timerInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
            const minutes = Math.floor(elapsed / 60);
            const seconds = elapsed % 60;
            this.elements.timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
            
            // 更新進度條（假設每題平均 30 秒）
            const progress = Math.min((elapsed / 30) * 100, 100);
            this.elements.progressFill.style.width = progress + '%';
        }, 100);
    }
    
    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }
    }
    
    /**
     * 狀態管理
     */
    setState(state) {
        document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
        
        const stateMap = {
            'loading': this.elements.loadingState,
            'quiz': this.elements.quizState,
            'feedback': this.elements.feedbackState,
        };
        
        if (stateMap[state]) {
            stateMap[state].classList.add('active');
        }
    }
    
    /**
     * 更新統計顯示
     */
    updateStats() {
        this.elements.correctCount.textContent = this.correctCount;
        this.elements.wrongCount.textContent = this.wrongCount;
    }
    
    /**
     * 設定管理
     */
    showModal() {
        this.elements.gasUrlInput.value = this.gasUrl;
        this.elements.settingsModal.classList.add('active');
    }
    
    hideModal() {
        this.elements.settingsModal.classList.remove('active');
    }
    
    saveSettings() {
        const url = this.elements.gasUrlInput.value.trim();
        if (!url) {
            alert('請輸入有效的 GAS Web App URL');
            return;
        }
        
        this.gasUrl = url;
        localStorage.setItem('gasUrl', url);
        this.hideModal();
        
        alert('設定已儲存！');
        this.loadQuestion();
    }
    
    resetStats() {
        if (confirm('確定要重置統計嗎？')) {
            this.correctCount = 0;
            this.wrongCount = 0;
            localStorage.setItem('correctCount', 0);
            localStorage.setItem('wrongCount', 0);
            this.updateStats();
            alert('統計已重置');
        }
    }
}

// 應用啟動
document.addEventListener('DOMContentLoaded', () => {
    window.quizApp = new QuizApp();
});
