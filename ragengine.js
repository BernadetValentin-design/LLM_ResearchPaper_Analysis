import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

// Skip local checks for browser
env.allowLocalModels = false;
env.useBrowserCache = true;

export class RAGEngine {
    constructor() {
        this.vectorStore = []; // { id, text, embedding, source }
        this.embedder = null;
        console.log("RAG Engine initialized (Step 3: Embeddings)");

        // Load model on init
        this.initEmbedder();
    }

    getUniqueSources() {
        const sources = new Set(this.vectorStore.map(v => v.source));
        return Array.from(sources);
    }

    async initEmbedder() {
        if (this.embedder) return;
        try {
            console.log("Loading embedding model...");
            this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
            console.log("Embedding model loaded.");
        } catch (e) {
            console.error("Failed to load embedding model", e);
        }
    }

    /**
     * Process a list of PDF files
     * @param {File[]} files 
     * @param {Function} onProgress 
     */
    async processFiles(files, onProgress) {
        const results = [];
        for (const file of files) {
            if (file.type !== 'application/pdf') continue;

            try {
                if (onProgress) onProgress(`Reading ${file.name}...`);
                const text = await this.extractTextFromPDF(file);

                if (onProgress) onProgress(`Chunking ${file.name}...`);
                const chunks = this.chunkText(text, 500, 100);

                if (onProgress) onProgress(`Embedding ${chunks.length} segments...`);

                // Ensure embedder is ready
                if (!this.embedder) await this.initEmbedder();

                for (const chunk of chunks) {
                    const vector = await this.getEmbedding(chunk);
                    if (vector) {
                        this.vectorStore.push({
                            id: Date.now() + Math.random().toString(36),
                            text: chunk,
                            embedding: vector,
                            source: file.name
                        });
                    }
                }

                results.push({
                    name: file.name,
                    textLength: text.length,
                    chunkCount: chunks.length,
                    vectorCount: this.vectorStore.length
                });

            } catch (e) {
                console.error(`Error reading ${file.name}:`, e);
            }
        }
        return results;
    }

    /**
     * Extracts text from a PDF file using pdf.js
     */
    async extractTextFromPDF(file) {
        const arrayBuffer = await file.arrayBuffer();
        if (!window.pdfjsLib) throw new Error("PDF.js library not loaded");

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = "";

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(" ");
            fullText += pageText + "\n";
        }
        return fullText;
    }

    /**
     * Split text into overlapping chunks
     */
    chunkText(text, chunkSize = 500, overlap = 100) {
        if (!text) return [];
        const chunks = [];
        let start = 0;
        const cleanText = text.replace(/\s+/g, ' ').trim();

        while (start < cleanText.length) {
            const end = start + chunkSize;
            let chunk = cleanText.slice(start, end);
            chunks.push(chunk);
            start += (chunkSize - overlap);
        }
        return chunks;
    }

    /**
     * Generate embedding for a text string
     */
    async getEmbedding(text) {
        if (!this.embedder) await this.initEmbedder();
        const output = await this.embedder(text, { pooling: 'mean', normalize: true });
        return output.data;
    }

    /**
     * Search the vector store for most relevant chunks
     */
    async search(query, topK = 3) {
        if (!this.embedder) await this.initEmbedder();
        console.log(`Searching for: "${query}"`);

        const queryVector = await this.getEmbedding(query);
        const results = this.vectorStore.map(doc => ({
            ...doc,
            score: this.cosineSimilarity(queryVector, doc.embedding)
        }));

        // Sort by score descending (closest to 1 is best)
        results.sort((a, b) => b.score - a.score);
        return results.slice(0, topK);
    }

    cosineSimilarity(vecA, vecB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
}
