export class UIManager {
    constructor() {
        this.chatContainer = document.getElementById('chat-container');
        this.userInput = document.getElementById('user-input');
        this.sendBtn = document.getElementById('send-btn');
        this.stopBtn = document.getElementById('stop-btn'); // New
        this.modelStatus = document.getElementById('model-status');
        this.filePreviewArea = document.getElementById('file-preview-area');

        // Callbacks (to be assigned by main.js)
        this.onFileSelect = null;
        this.onMessageSend = null;
        this.onStopGeneration = null; // New callback

        this.initEventListeners();
        this.initSettingsListeners();
    }

    setLoading(isLoading) {
        if (isLoading) {
            this.sendBtn.classList.add('hidden');
            this.stopBtn.classList.remove('hidden');
            this.userInput.disabled = true;
        } else {
            this.sendBtn.classList.remove('hidden');
            this.stopBtn.classList.add('hidden');
            this.userInput.disabled = false;
            this.userInput.focus();
        }
    }

    getSystemPrompt() {
        return document.getElementById('system-prompt')?.value || "You are a helpful academic research assistant.";
    }

    getTemperature() {
        return parseFloat(document.getElementById('temp-slider')?.value || 0.7);
    }

    initSettingsListeners() {
        const slider = document.getElementById('temp-slider');
        const display = document.getElementById('temp-value');
        if (slider && display) {
            slider.addEventListener('input', (e) => {
                display.textContent = e.target.value;
            });
        }
    }

    initEventListeners() {
        const dropZone = document.getElementById('drop-zone');
        if (!dropZone) return; // Guard in case element is missing

        const fileInput = document.getElementById('file-input');

        // Drag & Drop
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            });
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('border-brand-500', 'bg-brand-50');
            });
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('border-brand-500', 'bg-brand-50');
            });
        });

        dropZone.addEventListener('drop', (e) => {
            const files = e.dataTransfer.files;
            if (this.onFileSelect && files.length > 0) {
                const fileArray = Array.from(files);
                this.onFileSelect(fileArray);
            }
        });

        // Click to upload
        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            if (this.onFileSelect && e.target.files.length > 0) {
                // Convert FileList to Array to ensure proper handling
                const files = Array.from(e.target.files);
                this.onFileSelect(files);
                // Reset input to allow selecting the same file again if needed
                fileInput.value = '';
            }
        });

        // Chat Inputs
        if (this.sendBtn && this.userInput) {
            this.sendBtn.addEventListener('click', () => this.handleSend());
            this.stopBtn.addEventListener('click', () => {
                if (this.onStopGeneration) this.onStopGeneration();
            });

            this.userInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSend();
                }
            });
        }
    }

    handleSend() {
        const text = this.userInput.value.trim();
        if (!text) return;
        this.userInput.value = '';
        this.addMessage(text, 'user');
        if (this.onMessageSend) this.onMessageSend(text);
    }

    addMessage(text, sender) {
        const msgId = Date.now().toString();
        const msgDiv = document.createElement('div');
        msgDiv.id = msgId;
        msgDiv.className = sender === 'user'
            ? 'flex justify-end msg-enter'
            : 'flex justify-start gap-4 max-w-[85%] msg-enter';

        if (sender === 'user') {
            msgDiv.innerHTML = `
                <div class="bg-slate-800 text-white px-5 py-3 rounded-2xl rounded-tr-sm max-w-[80%] shadow-sm">
                    <p>${this.escapeHtml(text)}</p>
                </div>
            `;
        } else {
            // Handle empty/loading state
            const displayText = text || '<span class="animate-pulse">...</span>';
            // Use Marked if available, else simple text
            const parsedText = window.marked ? window.marked.parse(displayText) : displayText;

            msgDiv.innerHTML = `
                <div class="h-8 w-8 rounded-full bg-brand-100 flex-shrink-0 flex items-center justify-center text-brand-600 mt-1">
                    <i class="fa-solid fa-robot text-xs"></i>
                </div>
                <div class="space-y-2">
                    <div class="bg-white border border-slate-100 px-5 py-4 rounded-2xl rounded-tl-sm shadow-sm prose prose-sm max-w-none text-slate-700">
                        <div class="parsed-content">${parsedText}</div>
                    </div>
                </div>
            `;
        }
        this.chatContainer.appendChild(msgDiv);
        this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        return msgId; // Return ID for updates
    }

    updateMessage(msgId, text) {
        const msgDiv = document.getElementById(msgId);
        if (!msgDiv) return;

        const contentArea = msgDiv.querySelector('.parsed-content');
        if (contentArea) {
            const parsedText = window.marked ? window.marked.parse(text) : text;
            contentArea.innerHTML = parsedText;
            this.chatContainer.scrollTop = this.chatContainer.scrollHeight;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateModelStatus(status, color = 'text-slate-600') {
        const dot = document.querySelector('header span.animate-pulse');
        if (dot) {
            dot.className = `h-2 w-2 rounded-full animate-pulse ${status === 'Ready' ? 'bg-green-500' : 'bg-yellow-500'}`;
        }
        this.modelStatus.textContent = status;
        this.modelStatus.className = `text-sm font-medium ${color}`;
    }

    addFileChip(filename) {
        // Create chip
        const chip = document.createElement('div');
        chip.className = 'flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700 px-3 py-1.5 rounded-lg text-sm shadow-sm animate-in fade-in slide-in-from-bottom-2';
        chip.innerHTML = `
            <i class="fa-regular fa-file-pdf text-red-500"></i>
            <span class="max-w-[150px] truncate font-medium">${filename}</span>
            <button class="ml-1 text-slate-400 hover:text-red-500 transition-colors" onclick="this.parentElement.remove()">
                <i class="fa-solid fa-xmark text-xs"></i>
            </button>
        `;
        this.filePreviewArea.appendChild(chip);
    }
}
