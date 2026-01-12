import { UIManager } from './ui.js';
import { RAGEngine } from './ragengine.js';
import { LLMClient } from './llmclient.js';

class App {
    constructor() {
        this.ui = new UIManager();
        this.rag = new RAGEngine();
        this.llm = new LLMClient();

        this.init();
    }

    init() {
        console.log("App initializing... (Clean Version)");

        // Trigger background loading immediately
        this.ui.addMessage("System: Pre-loading AI Model... (This downloads ~2GB once)", 'ai');
        this.llm.init((progress) => {
            this.ui.updateModelStatus(progress.text, 'text-yellow-600');
        }).then(() => {
            this.ui.updateModelStatus('Model Ready', 'text-green-600');
            this.ui.addMessage("System: AI Model is ready to chat!", 'ai');
        }).catch(e => {
            this.ui.addMessage(`System: Model load failed - ${e.message}`, 'ai');
        });

        this.ui.onFileSelect = async (files) => {
            for (const file of files) {
                if (file.type === 'application/pdf') {
                    this.ui.addFileChip(file.name);
                }
            }

            this.ui.addMessage(`System: Reading ${files.length} file(s)...`, 'ai');

            try {
                const results = await this.rag.processFiles(files, (status) => {
                    this.ui.updateModelStatus(status, 'text-blue-500');
                });

                if (results.length > 0) {
                    this.ui.addMessage(`System: Successfully read ${results.length} documents.`, 'ai');
                    this.ui.updateModelStatus('Ready', 'text-green-600');
                }

            } catch (error) {
                console.error(error);
                this.ui.addMessage(`System: Error reading files - ${error.message}`, 'ai');
            }
        };

        this.ui.onMessageSend = async (text) => {
            // Ensure LLM is ready (wait for the pre-loading promise)
            if (!this.llm.engine) {
                try {
                    // It should be loading, so we await the existing promise
                    await this.llm.init((p) => this.ui.updateModelStatus(p.text, 'text-yellow-600'));
                } catch (e) {
                    this.ui.addMessage(`System: Failed to load model - ${e.message}`, 'ai');
                    return;
                }
            }

            // Perform RAG Search
            let context = "";
            if (this.rag.vectorStore.length > 0) {
                this.ui.updateModelStatus('Searching Knowledge Base...', 'text-blue-500');

                // Add Global Context (Metadata)
                const files = this.rag.getUniqueSources();
                if (files.length > 0) {
                    context += `Available Documents in Knowledge Base:\n- ${files.join('\n- ')}\n\n`;
                }

                try {
                    const results = await this.rag.search(text, 3);
                    if (results.length > 0) {
                        context += "Relevant Content:\n" + results.map(r => `[Source: ${r.source}]\n${r.text}`).join("\n\n");
                    }
                } catch (e) {
                    console.error("RAG Search failed:", e);
                }
            }

            // Generate Answer
            this.ui.updateModelStatus('Generating Answer...', 'text-purple-500');
            const msgId = this.ui.addMessage("", 'ai');
            this.ui.setLoading(true); // Disable input, show stop

            // Get Settings
            const options = {
                systemPrompt: this.ui.getSystemPrompt(),
                temperature: this.ui.getTemperature()
            };

            try {
                const response = await this.llm.chat(text, context, options, (partial) => {
                    this.ui.updateMessage(msgId, partial);
                });

                this.ui.updateMessage(msgId, response);
                this.ui.updateModelStatus('Ready', 'text-green-600');

            } catch (e) {
                if (e.message.includes("interrupted") || e.message.includes("aborted")) {
                    this.ui.updateMessage(msgId, "**[Generation Stopped by User]**");
                    this.ui.updateModelStatus('Stopped', 'text-yellow-600');
                } else {
                    console.error(e);
                    this.ui.updateMessage(msgId, `**Error**: ${e.message}`);
                    this.ui.updateModelStatus('Error', 'text-red-600');
                }
            } finally {
                this.ui.setLoading(false); // Re-enable input
            }
        };

        this.ui.onStopGeneration = async () => {
            await this.llm.interrupt();
            this.ui.setLoading(false);
            this.ui.updateModelStatus('Stopped', 'text-yellow-600');
        };
    }
}

const app = new App();
