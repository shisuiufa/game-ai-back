import LobbyRepository from "../../repositories/v1/lobby.repository";
import UserService from "./user.service";
import redis from "../../config/redis";
import {randomUUID} from "crypto";
import UserRepository from "../../repositories/v1/user.repository";
import User from "../../models/user";
import TaskService from "./task.service";
import {Task} from "../../types/task";
import AnswerService from "./answer.service";
import taskRepository from "../../repositories/v1/task.repository";
import {LobbyStatus} from "../../enums/lobbyStatus";
import {Answer, ScoredAnswer, ScoredAnswerWithUser} from "../../types/answer";
import LobbyAnswerRepository from "../../repositories/v1/lobbyAnswer.repository";
import {UserWs} from "../../types/user";
import {LobbyJoinResult, LobbyState} from "../../types/lobby";

export default class LobbyService {
    private readonly taskService: TaskService;
    private readonly answerService: AnswerService;

    constructor() {
        this.taskService = new TaskService()
        this.answerService = new AnswerService()
    }

    async getActiveLobbyUuidByPlayer(playerId: number): Promise<string | null> {
        const lobbyUuid = await redis.get(`player:${playerId}:lobby`);
        if (!lobbyUuid) return null;

        const exists = await redis.exists(`lobby:${lobbyUuid}`);
        return exists ? lobbyUuid : null;
    }

    async findExistingLobby(): Promise<string | null> {
        const lobbyUuid = await redis.lpop("lobbies:open");
        return lobbyUuid ?? null;
    }

    async createLobby(player1Id: number): Promise<string> {
        const existingLobby = await this.findExistingLobby();
        if (existingLobby) return existingLobby;

        const lobbyUuid = randomUUID();

        const tx = redis.multi();
        tx.hset(`lobby:${lobbyUuid}`, [
            'player1', player1Id,
            'player2', "",
            'answer1', "",
            'answer2', "",
            'status', LobbyStatus.WAITING,
            `player${player1Id}_online`, "true"
        ]);
        tx.rpush("lobbies:open", lobbyUuid);
        tx.set(`player:${player1Id}:lobby`, lobbyUuid);

        await tx.exec();
        return lobbyUuid;
    }

    async addPlayerToLobby(lobbyUuid: string, player2Id: number): Promise<LobbyJoinResult | null> {
        const newUser = await UserRepository.findById(player2Id);
        if (!newUser) return null

        const users = await this.getUsers(lobbyUuid);

        if (users.length >= 2 || users.some(user => user.id === player2Id)) return null;

        const formattedUser = {
            id: newUser.id,
            username: newUser.username,
            status: "ready",
        };

        users.push(formattedUser);

        const lobby = await LobbyRepository.create(Number(users[0].id), Number(users[1].id), lobbyUuid);

        const tx = redis.multi();

        tx.hset(`lobby:${lobbyUuid}`, [
            "lobbyId", lobby.id,
            "player2", player2Id,
            `player${player2Id}_online`, "true",
            "status", LobbyStatus.READY,
        ]);

        tx.set(`player:${player2Id}:lobby`, lobbyUuid);
        await redis.lrem("lobbies:open", 0, lobbyUuid);

        await tx.exec();

        return {
            newPlayer: formattedUser,
            lobbyId: lobby.id,
        };
    }

    async handlePlayerDisconnect(lobbyUuid: string, userId: number): Promise<void> {
        const idx = await this.getUsersIdxLobby(lobbyUuid)

        if (idx.length < 2) {
            await redis.del(`lobby:${lobbyUuid}`);

            await redis.lrem("lobbies:open", 0, lobbyUuid);

            await redis.del(`player:${userId}:lobby`);

            console.warn(`⚠️ Игрок ${userId} вышел из пустого лобби ${lobbyUuid}`);
        } else {
            await this.setPlayerOnlineStatus(lobbyUuid, userId, false)

            console.log(`📤 Игрок ${userId} вышел из лобби ${lobbyUuid}, отмечен как offline`);
        }
    }

    private async clearRedisData(lobbyUuid: string, usersIdx: [number, number]) {
        const tx = redis.multi();
        for (const userId of usersIdx) {
            if (userId != null) {
                tx.del(`player:${userId}:lobby`);
            }
        }
        if (lobbyUuid) {
            tx.del(`lobby:${lobbyUuid}`);
        }
        await tx.exec();
    }

    private async buildResult(scored: ScoredAnswer[]): Promise<ScoredAnswerWithUser[]> {
        const userIds = scored.map(a => a.userId);
        const users = await UserRepository.findByIdx(userIds);

        const userMap = new Map(
            users.map(user => [Number(user.dataValues.id), user.dataValues])
        );

        return scored.map(item => ({
            user: {
                id: item.userId,
                username: userMap.get(item.userId)?.username || 'unknown',
            },
            answer: item.answer,
            score: item.score,
            time: item.time,
        }));
    }

    private async getUserInfo(userId: number): Promise<UserWs | null> {
        const user = await UserRepository.findById(userId);
        return user ? { id: user.id, username: user.username } : null;
    }

    async endLobby(lobbyUuid: string, lobbyId: number, usersIdx: [number, number], answers: Answer[]) {
        const task = await taskRepository.getByLobbyId(lobbyId);
        if (!task) throw new Error("Task not found!");

        const scored  = await this.answerService.checkAnswers(task.dataValues.prompt, answers);

        if(!scored){
            await LobbyRepository.update(lobbyId, { status: LobbyStatus.ERROR_END_GAME });
            await this.clearRedisData(lobbyUuid, usersIdx);
            return { winner: null, result: null };
        }

        const winnerId = this.answerService.getWinnerByScores(scored);

        await Promise.all([
            LobbyRepository.update(lobbyId, { winnerId, status: LobbyStatus.FINISHED }),
            UserService.addPoints(winnerId, 100),
            LobbyAnswerRepository.bulkCreate(
                scored.map(item => ({
                    lobbyId,
                    userId: item.userId,
                    answer: item.answer,
                    time: item.time,
                    score: item.score,
                }))
            ),
            this.clearRedisData(lobbyUuid, usersIdx)
        ]);

        const result = await this.buildResult(scored);
        const winner = await this.getUserInfo(winnerId);

        return {
            winner: winner,
            result: result,
        }
    }

    async getUsersIdxLobby(lobbyUuid: string) {
        const idx = await redis.hmget(`lobby:${lobbyUuid}`, "player1", "player2");
        return idx
            .filter((item): item is string => item !== null && item !== '')
            .map(Number);
    }

    async getUsers(lobbyUuid: string) {
        let idx = await this.getUsersIdxLobby(lobbyUuid);

        const users = await UserRepository.findByIdx(idx);

        return users.map((user: User) => ({id: user.id, username: user.username, status: 'ready'}));
    }

    async getLobbyState(lobbyUuid: string): Promise<LobbyState>
    {
        const [
            player1,
            player2,
            taskRaw,
            answer1,
            answer2,
            lobbyIdRaw,
            endAtRaw
        ] = await redis.hmget(
            `lobby:${lobbyUuid}`,
            "player1",
            "player2",
            "task",
            "answer1",
            "answer2",
            "lobbyId",
            "endAt"
        );

        const idx = [player1, player2]
            .filter((item): item is string => item !== null && item !== '')
            .map(Number);

        const users = (await UserRepository.findByIdx(idx)).map((user: User) => ({
            id: user.id,
            username: user.username,
            status: 'ready'
        }));

        const task = taskRaw ? JSON.parse(taskRaw) : null;

        const answers: Answer[] = [];
        if (answer1) answers.push(JSON.parse(answer1));
        if (answer2) answers.push(JSON.parse(answer2));

        const lobbyId = lobbyIdRaw ? Number(lobbyIdRaw) : null;

        const endAt = endAtRaw ? Number(endAtRaw) : null;

        return {
            users,
            task,
            answers,
            lobbyId,
            endAt
        };
    }

    async getLobby(lobbyUuid: string) {
        const raw  = await redis.hgetall(`lobby:${lobbyUuid}`);

        if (Object.keys(raw).length === 0) return null;

        return {
            id: Number(raw.lobbyId),
            player1: Number(raw.player1),
            player2: Number(raw.player2),
            answer1: raw.answer1 ? JSON.parse(raw.answer1) : null,
            answer2: raw.answer2 ? JSON.parse(raw.answer2) : null,
            status: raw.status ? JSON.parse(raw.status) : null,
        };
    }

    async createTask(lobbyUuid: string): Promise<Task> {
        const lobbyId = Number(await redis.hget(`lobby:${lobbyUuid}`, "lobbyId"));

        const generateTask = await this.taskService.generate()

        return this.taskService.create(lobbyId, generateTask.prompt, generateTask.image)
    }

    async setPlayerOnlineStatus(lobbyUuid: string, userId: number, online: boolean) {
        await redis.hset(`lobby:${lobbyUuid}`, {
            [`player${userId}_online`]: online ? "true" : "false"
        });
    }

    async forceEndLobby(
        lobbyUuid: string,
        status: LobbyStatus,
    ): Promise<void> {
        const usersIdx = await this.getUsersIdxLobby(lobbyUuid);
        const lobbyIdRaw = await redis.hget(`lobby:${lobbyUuid}`, "lobbyId");
        const lobbyId = lobbyIdRaw ? Number(lobbyIdRaw) : null;

        if (!lobbyId || usersIdx.length === 0) {
            return;
        }

        await LobbyRepository.update(lobbyId, { status });

        for (const userId of usersIdx) {
            await UserRepository.addPoints(userId, 100);
        }

        await this.clearRedisData(lobbyUuid, usersIdx as [number, number]);

        console.log(`🏁 Lobby ${lobbyUuid} ended with status ${LobbyStatus[status]}`);
    }
}

