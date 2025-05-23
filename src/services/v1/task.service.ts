import TaskRepository from "../../repositories/v1/task.repository";
import AiService from "./ai.service";
import {GenerateTask, Task} from "../../types/task";
import redis from "../../config/redis";

export default class TaskService {
    private readonly aiService: AiService;

    constructor() {
        this.aiService = new AiService();
    }

    async generate(): Promise<GenerateTask> {
        const prompt = await this.aiService.generatePrompt();

        if (!prompt) {
            throw new Error("Failed to generate prompt.");
        }

        const task = await this.aiService.generateImage(prompt);

        if (!task || !task.image) {
            throw new Error("Failed to generate image.");
        }

        return {
            prompt: prompt,
            image: task.image,
        }
    }

    async create(lobbyId: number, prompt: string, image: string): Promise<Task> {
        await TaskRepository.create(lobbyId, prompt)

        return {
            question: 'The game has begun! Guess what the prompt for the image is.  \n' +
                'You have 60 seconds! ⏳',
            image: image,
        }
    }
}