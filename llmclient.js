import * as webllm from "https://esm.run/@mlc-ai/web-llm";

export class LLMClient {
    constructor() {
        this.engine = null;
        this.history = []; // [{role, content}]
        // Using a lightweight model for browser
        this.selectedModel = "Llama-3.2-1B-Instruct-q4f32_1-MLC";
        this.initPromise = null;
    }

    async init(onProgress) {
        if (this.engine) return;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async () => {
            try {
                console.log("Initializing LLM Engine...");
                this.engine = await webllm.CreateMLCEngine(
                    this.selectedModel,
                    { initProgressCallback: onProgress }
                );
                console.log("LLM Engine initialized");
            } catch (e) {
                console.error("Failed to initialize LLM", e);
                this.initPromise = null; // Allow retry
                throw e;
            }
        })();

        return this.initPromise;
    }

    async interrupt() {
        if (this.engine) {
            await this.engine.interruptGenerate();
        }
    }

    /**
     * Generate a response given the current history and new user input (with context)
     */
    async chat(userMessage, context = "", options = {}, onUpdate) {
        if (!this.engine) {
            // Try to recover if engine is missing but expected
            await this.init((p) => {
                if (onUpdate) onUpdate(`[System: Reloading model... ${p.text}]`);
            });
        }

        const systemPrompt = options.systemPrompt || "You are a helpful academic research assistant. Use the provided context to answer questions accurately. Cite your sources if possible.";
        const temperature = options.temperature !== undefined ? options.temperature : 0.7;

        // Construct the full prompt with RAG context if available
        let finalUserContent = userMessage;
        if (context) {
            finalUserContent = `
Here is some relevant context from the provided documents:
${context}

Based on this context, please answer the following question:
${userMessage}
            `.trim();
        }

        // Add to history
        this.history.push({ role: "user", content: finalUserContent });

        try {
            console.log("Using System Prompt:", systemPrompt); // Verify Prompt Update
            const chunks = await this.engine.chat.completions.create({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...this.history
                ],
                temperature: temperature,
                stream: true,
            });

            let fullResponse = "";
            for await (const chunk of chunks) {
                const content = chunk.choices[0]?.delta?.content || "";
                fullResponse += content;
                if (onUpdate) onUpdate(fullResponse);
            }

            // Append assistant response to history
            this.history.push({ role: "assistant", content: fullResponse });
            return fullResponse;

        } catch (e) {
            console.error("Chat error", e);

            // Auto-recovery for "disposed" error (GPU crash/context loss)
            if (e.message && e.message.includes("disposed")) {
                console.warn("GPU Context lost. Attempting recovery...");
                if (onUpdate) onUpdate("\n\n**[System: GPU Context lost. Rebooting model, please wait...]**");

                this.engine = null;
                this.initPromise = null;

                // Retry once with new options
                await this.init();
                return this.chat(userMessage, context, options, onUpdate);
            }

            throw e;
        }
    }
}
