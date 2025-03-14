import LobbyRepository from "../../repositories/v1/lobby.repository";
import UserService from "./user.service";
import redis from "../../config/redis";
import { randomUUID } from "crypto";
import UserRepository from "../../repositories/v1/user.repository";
import User from "../../models/user";

export default class LobbyService {
    private readonly TTL_SECONDS: number;

    constructor(ttlSeconds: number) {
        this.TTL_SECONDS = ttlSeconds;
    }

    async getActiveLobbyIdByPlayer(playerId: number): Promise<string | null> {
        const lobbyId = await redis.get(`player:${playerId}:lobby`);

        if (!lobbyId) return null;

        const isActive = await redis.zscore("lobbies:active", lobbyId);

        return isActive ? lobbyId : null;
    }

    async findExistingLobby(): Promise<string | null> {
        const now = Date.now();

        const count = await redis.zcount("lobbies:open", now, "+inf");
        if (count === 0) return null;

        const randomIndex = Math.floor(Math.random() * count);

        const lobbies = await redis.zrangebyscore("lobbies:open", now, "+inf", "LIMIT", randomIndex, 1);

        return lobbies.length > 0 ? lobbies[0] : null;
    }

    async createLobby(player1Id: number): Promise<string> {
        const existingLobby = await this.findExistingLobby();

        if (existingLobby) return existingLobby;

        const lobbyId = randomUUID();

        const tx = redis.multi();

        tx.hset(`lobby:${lobbyId}` ,[
            'player1', player1Id,
            'player2', "",
            'answer1', "",
            'answer2', "",
            'status', "active"
        ]);

        tx.expire(`lobby:${lobbyId}`, this.TTL_SECONDS)

        tx.zadd("lobbies:open", Date.now() + this.TTL_SECONDS * 1000, lobbyId);
        tx.zadd("lobbies:active", Date.now() + this.TTL_SECONDS * 1000, lobbyId);

        tx.setex(`player:${player1Id}:lobby`, this.TTL_SECONDS, lobbyId);

        await tx.exec();

        return lobbyId;
    }

    async addPlayerToLobby(lobbyId: string, player2Id: number) {
        const newUser = await UserRepository.findById(player2Id);

        if (!newUser) {
            return null;
        }

        const users = await this.getUsers(lobbyId);

        if (users.length >= 2 || users.some(user => user.id === player2Id)) return null;

        const tx = redis.multi();

        tx.hset(`lobby:${lobbyId}`, "player2", player2Id);
        tx.expire(`lobby:${lobbyId}`, this.TTL_SECONDS);
        tx.setex(`player:${player2Id}:lobby`, this.TTL_SECONDS, lobbyId);
        tx.zrem("lobbies:open", lobbyId);
        tx.zadd("lobbies:active", Date.now() + this.TTL_SECONDS * 1000, lobbyId);

        await tx.exec();

        const formattedUser = {
            id: newUser.id,
            username: newUser.username,
            status: "ready",
        };

        users.push(formattedUser);

        await LobbyRepository.createLobby(Number(users[0].id), Number(users[1].id), lobbyId);

        console.log(`🔥 Лобби ${lobbyId} заполнено! Игра начинается!`);

        return {
            player1: users[0],
            player2: users[1],
        };
    }

    async handlePlayerDisconnect(lobbyId: string, userId: number): Promise<void> {
        const idx = await this.getUsersIdxLobby(lobbyId)

        if (idx.length < 2) {
            await redis.del(`lobby:${lobbyId}`);

            await redis.zrem("lobbies:open", lobbyId);
            await redis.zrem("lobbies:active", lobbyId);

            await redis.del(`player:${userId}:lobby`);

            console.warn(`⚠️ Игрок ${userId} вышел из пустого лобби ${lobbyId}`);
        }

        // TODO Добавить обработку когда пользователь вышел из активного лобби
    }

    async endGame(lobbyId: string, answers: any): Promise<void> {
        const lobbyData = await redis.hgetall(`lobby:${lobbyId}`);

        if (lobbyData.player1 && lobbyData.player2) {
            await LobbyRepository.setWinner(lobbyId, Number(lobbyData.player1));
            await UserService.addPoints(Number(lobbyData.player1), 10);
        }

        await redis.zrem("lobbies:open", lobbyId);
        await redis.zrem("lobbies:active", lobbyId);
        await redis.zrem("lobbies:started", lobbyId);
        await redis.del(`lobby:${lobbyId}`);

        console.log(`🎉 Лобби ${lobbyId} завершено! Победитель: ${lobbyData.player1}`);
    }

    async getUsersIdxLobby(lobbyId: string){
        const idx = await redis.hmget(`lobby:${lobbyId}`, "player1", "player2");
        return idx.filter((item): item is string => item !== null && item !== '');
    }

    async getUsers(lobbyId: string) {
        let idx = await this.getUsersIdxLobby(lobbyId);

        const users = await UserRepository.findByIdx(idx);

        return users.map((user: User) => ({ id: user.id, username: user.username, status: 'ready' }));
    }

    async generateTask() {
        return {
            question: 'Реши пример 1 + 1',
            image: 'https://habrastorage.org/getpro/habr/upload_files/a9f/2b3/4bc/a9f2b34bc409412fd453392c353597c5.jpg',
        }
    }

    async updateLiveGameLobby(lobbyId: string, player1: number, player2: number) {
        const  tx= redis.multi();
        tx.expire(`lobby:${lobbyId}`, this.TTL_SECONDS)
        tx.zadd("lobbies:active", Date.now() + this.TTL_SECONDS * 1000, lobbyId);
        tx.zadd("lobbies:started", Date.now() + this.TTL_SECONDS * 1000, lobbyId);
        tx.setex(`player:${player1}:lobby`, this.TTL_SECONDS, lobbyId);
        tx.setex(`player:${player2}:lobby`, this.TTL_SECONDS, lobbyId);
        await tx.exec();
    }
}

