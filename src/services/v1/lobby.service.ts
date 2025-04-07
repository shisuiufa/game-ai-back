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
import {UserWs} from "../../types/user";
import {Answer} from "../../types/answer";
import LobbyAnswerRepository from "../../repositories/v1/lobbyAnswer.repository";

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

    async addPlayerToLobby(lobbyUuid: string, player2Id: number) {
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
            `player${player2Id}_online`, "true"
        ]);

        tx.set(`player:${player2Id}:lobby`, lobbyUuid);
        await redis.lrem("lobbies:open", 0, lobbyUuid);

        await tx.exec();

        return {
            player1: users[0],
            player2: users[1],
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

    async endGame(lobbyUuid: string, lobbyId: number, users: UserWs[], answers: Answer[]) {
        const task = await taskRepository.getByLobbyId(lobbyId);

        if (!task) {
            throw new Error("Task not found!");
        }

        const data = await this.answerService.checkAnswers(task.dataValues.prompt, answers);

        if (data) {
            const winnerId = await this.answerService.getWinnerByScores(data)
            await LobbyRepository.update(lobbyId, {winnerId, status: LobbyStatus.FINISHED});
            await UserService.addPoints(winnerId, 10)

            await LobbyAnswerRepository.bulkCreate(
                data.map(item => ({
                    lobbyId,
                    userId: item.userId,
                    answer: item.answer,
                    time: item.time,
                    score: item.score,
                }))
            );
        } else {
            await LobbyRepository.update(lobbyId, {status: LobbyStatus.ERROR});
        }

        const tx = redis.multi();
        tx.del(`player:${users[0].id}:lobby`);
        tx.del(`player:${users[1].id}:lobby`);
        tx.del(`lobby:${lobbyUuid}`);
        await tx.exec();
    }

    async getUsersIdxLobby(lobbyUuid: string) {
        const idx = await redis.hmget(`lobby:${lobbyUuid}`, "player1", "player2");
        return idx.filter((item): item is string => item !== null && item !== '');
    }

    async getUsers(lobbyUuid: string) {
        let idx = await this.getUsersIdxLobby(lobbyUuid);

        const users = await UserRepository.findByIdx(idx);

        return users.map((user: User) => ({id: user.id, username: user.username, status: 'ready'}));
    }

    async getLobbyId(lobbyUuid: string): Promise<number | null> {
        const lobbyId = await redis.hget(`lobby:${lobbyUuid}`, "lobbyId");
        return lobbyId ? Number(lobbyId) : null;
    }

    async createTask(lobbyUuid: string): Promise<Task> {
        const lobbyId = Number(await redis.hget(`lobby:${lobbyUuid}`, "lobbyId"));

        const generateTask = await this.taskService.generate()

        return this.taskService.create(lobbyId, generateTask.prompt, generateTask.image)
    }

    async restoreLobbyState(lobbyUuid: string) {
        const users = await this.getUsers(lobbyUuid);

        const task = await this.taskService.getTaskRedis(lobbyUuid);

        const answers = await this.answerService.getAnswersRedis(lobbyUuid)

        const lobbyId = await this.getLobbyId(lobbyUuid);

        return {
            users,
            task,
            answers,
            lobbyId
        }
    }

    async setPlayerOnlineStatus(lobbyUuid: string, userId: number, online: boolean) {
        await redis.hset(`lobby:${lobbyUuid}`, {
            [`player${userId}_online`]: online ? "true" : "false"
        });
    }
}

