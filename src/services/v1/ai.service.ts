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
                        content: 'You are an expert in creating prompts for text-based and multimodal AI models. Your task is to generate random but highly effective prompts that are perfectly suited for FLUX. The prompts should be universal, creative, and cover a wide range of topics, including art, design, technology, science, business, and entertainment.' +
                            'Each prompt must include the following elements:' +
                            '- A clear goal or task that needs to be solved (e.g., idea generation, data analysis, creating images or texts).' +
                            '- Context that will help the model better understand the request (e.g., audience, style, environment, or limitations).' +
                            '- Style or tone in which the work should be performed (e.g., professional, artistic, humorous, minimalist). ' +
                            '- Constraints or specific requirements, if necessary (e.g., response format, keywords, technical parameters).' +
                            'The prompts should be structured, concise, and easily adaptable for various tasks. Generate prompts in a format that can be immediately used for GPT-4o.' +
                            'This prompt provides clear instructions for the model to generate high-quality and versatile prompts that can be effectively used for working with FLUX.',
                    },
                    {
                        role: 'user',
                        content: `
                        Generate a random AI art prompt in English (≤120 chars) for an image-generation model like FLUX. The prompt should be creative, visually rich, and concise. 
                        Use a random style from: nature, fantasy, sci-fi, cyberpunk, horror, surreal, abstract, futuristic, dreamlike. 
                        Example outputs:  
                        - "Neon-lit cyberpunk alley, rain-soaked streets, glowing holograms."  
                        - "Ancient castle floating in the sky, surrounded by glowing clouds."  
                        - "Futuristic robot warrior standing in a ruined city at sunset."  
                        - "Dark enchanted forest with glowing mushrooms and misty fog."  
                        The prompt must not exceed 120 characters. Generate a new unique idea every time.
                        "`,
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