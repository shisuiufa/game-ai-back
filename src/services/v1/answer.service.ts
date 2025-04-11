import AiService from "./ai.service";
import redis from "../../config/redis";
import {Answer, ScoredAnswer} from "../../types/answer";

export default class AnswerService {
    private readonly aiService: AiService;

    constructor() {
        this.aiService = new AiService();
    }

    async getAnswersRedis(lobbyUuid: string): Promise<Answer[]> {
        const lobbyData = await redis.hmget(
            `lobby:${lobbyUuid}`,
            "answer1", "answer2",
        );

        const [answer1, answer2] = lobbyData;

        const data: Answer[] = [];

        if (answer1) {
            data.push(JSON.parse(answer1))
        }

        if (answer2) {
            data.push(JSON.parse(answer2))
        }

        return data;
    }

    async checkAnswers(prompt: string, answers: Answer[]): Promise<ScoredAnswer[] | null> {
        if (answers.length < 1) return null;

        const sorted = answers.sort((a, b) => a.userId - b.userId);
        const texts = sorted.map(a => a.answer?.trim() ?? "");

        const indexesWithNoAnswer = texts
            .map((t, i) => t === "" ? i : null)
            .filter(i => i !== null) as number[];

        const res = await this.aiService.checkSimilarity(prompt, texts);

        if (!res || res.length !== sorted.length) return null;

        for (const i of indexesWithNoAnswer) {
            res[i] = 0;
        }

        return sorted.map((a, i) => ({
            userId: a.userId,
            answer: a.answer ?? "",
            score: res[i],
            time: a.time,
        }));
    }

    getWinnerByScores(scores: ScoredAnswer[]) {
        if (scores.length === 0) {
            throw new Error("Невозможно определить победителя: нет данных");
        }

        const sorted = [...scores].sort((a, b) => b.score - a.score);
        const top = sorted[0];
        const second = sorted[1];

        if (second && top.score === second.score) {
            const topTime = parseInt(top.time);
            const secondTime = parseInt(second.time);

            return topTime <= secondTime ? top.userId : second.userId;
        }

        return top.userId;
    }
}