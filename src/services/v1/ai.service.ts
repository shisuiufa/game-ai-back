import {FAL_AI_API_KEY, OPEN_AI_API_KEY} from "../../config/app";
import {fal} from "@fal-ai/client";
import {OpenAI} from 'openai';
import logger from "../../utils/logger";

export default class AiService {
    private static readonly MODEL = "fal-ai/flux/dev";
    private openai: OpenAI;

    constructor() {
        fal.config({
            credentials: FAL_AI_API_KEY
        });

        this.openai = new OpenAI({
            apiKey: OPEN_AI_API_KEY,
        });
    }

    async generatePrompt(): Promise<string | null> {
        try {
            const response = await this.openai.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a Prompt Engineer for FLUX — a neural network that generates images based on short, highly visual prompts.\n' +
                            'Your job is to define the rules for creating prompts that FLUX can use. FLUX only accepts prompts that follow these constraints:\n' +
                            'Only one prompt per request\n' +
                            'Maximum length: 120 characters\n' +
                            'The prompt must be visually rich, atmospheric, and imaginative\n' +
                            'Themes must be randomized from categories such as:\n' +
                            '– Cyberpunk\n' +
                            '– Space / Sci-Fi\n' +
                            '– Futuristic Tech\n' +
                            '– Medieval / Fantasy\n' +
                            '– Surrealism\n' +
                            '– Post-Apocalypse\n' +
                            '– Biopunk / Steampunk\n' +
                            'Prompts must be entirely unique every time — no reused structures, phrases, or visuals\n' +
                            'Output only the raw prompt text. No quotes, no labels, no explanations.\n' +
                            'Make it vivid, cinematic, and artistically inspiring.',
                    },
                    {
                        role: 'user',
                        content: `Generate a single random prompt for FLUX image generation`,
                    },
                ],
                max_tokens: 100,
            });

            return response.choices[0].message.content ?? null;
        } catch (e) {
            logger.error('[generatePrompt] Failed to generate:', e)
            throw e;
        }
    }

    async generateImage(prompt: string) {
        try {
            const result = await fal.subscribe(AiService.MODEL, {
                input: {
                    prompt: prompt,
                    image_size: "landscape_4_3",
                },
                logs: true,
                onQueueUpdate: (update) => {
                    if (update.status === "IN_PROGRESS") {
                        update.logs.map((log) => log.message).forEach(console.log);
                    }
                },
            });

            return {
                prompt: prompt,
                image: result.data.images[0].url
            }
        } catch (e) {
            logger.error('[generateImage] Failed to generate image:', e)
            throw e;
        }
    }

    async checkSimilarity(prompt: string, userAnswers: string[]) {
        try {
            const normalizedPrompt = prompt.toLowerCase();
            const normalizedAnswers = userAnswers.map(answer => answer.toLowerCase());

            const response = await this.openai.embeddings.create({
                model: 'text-embedding-3-large',
                input: [normalizedPrompt, ...normalizedAnswers],
            });

            const embeddings = response.data.map(item => item.embedding);
            const promptEmbedding = embeddings[0];
            const userEmbeddings = embeddings.slice(1);

            return userEmbeddings.map(userEmbedding => this.cosineSimilarity(promptEmbedding, userEmbedding));
        } catch (error) {
            console.error("Ошибка при вычислении схожести:", error);
            throw error;
        }
    }

    private cosineSimilarity(vecA: number[], vecB: number[]): number {
        const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
        const normA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
        const normB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
        return Number((dotProduct / (normA * normB) * 100));
    }
}