import LobbyRepository from "../../repositories/v1/lobby.repository";
import UserService from "./user.service";
import redis from "../../config/redis";
import { randomUUID } from "crypto";
import UserRepository from "../../repositories/v1/user.repository";

class LobbyService {
    async getActiveLobbyIdByPlayer(playerId: number): Promise<string | null> {
        const lobbyId = await redis.get(`player:${playerId}:lobby`);

        if (!lobbyId) return null;

        const isActive = await redis.sismember("lobbies:active", lobbyId);

        return isActive ? lobbyId : null;
    }

    async findExistingLobby() {
       return await redis.srandmember("lobbies:open");
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

        tx.expire(`lobby:${lobbyId}`, 1800)
        tx.sadd("lobbies:open", lobbyId);
        tx.sadd("lobbies:active", lobbyId);
        tx.set(`player:${player1Id}:lobby`, lobbyId);

        await tx.exec();

        return lobbyId;
    }

    async addPlayerToLobby(lobbyId: string, player2Id: number): Promise<void> {
        const idx = await this.getUsersIdxLobby(lobbyId);

        if(idx.length >= 2 || idx.includes(String(player2Id))) return;

        const tx = redis.multi();

        tx.hset(`lobby:${lobbyId}`, "player2", player2Id);
        tx.set(`player:${player2Id}:lobby`, lobbyId);

        tx.srem("lobbies:open", lobbyId);
        tx.sadd("lobbies:active", lobbyId);

        await tx.exec();

        idx.push(String(player2Id));

        await LobbyRepository.createLobby(Number(idx[0]), Number(idx[1]), lobbyId);

        console.log(`🔥 Лобби ${lobbyId} заполнено! Игра начинается!`);
    }

    async handlePlayerDisconnect(lobbyId: string, userId: number): Promise<void> {
        const idx = await this.getUsersIdxLobby(lobbyId)

        if (idx.length < 2) {
            await redis.del(`lobby:${lobbyId}`);

            await redis.srem("lobbies:open", lobbyId);
            await redis.srem("lobbies:active", lobbyId);

            await redis.del(`player:${userId}:lobby`);

            console.warn(`⚠️ Игрок ${userId} вышел из пустого лобби ${lobbyId}`);
        }

        // TODO Добавить обработку когда пользователь вышел из активного лобби
    }

    async endGame(lobbyId: string, winnerId: number): Promise<void> {
        const lobbyData = await redis.hgetall(`lobby:${lobbyId}`);

        if (lobbyData.player1 && lobbyData.player2) {
            await LobbyRepository.setWinner(lobbyId, winnerId);
            await UserService.addPoints(winnerId, 10);
        }

        await redis.srem("lobbies:open", lobbyId);
        await redis.srem("lobbies:active", lobbyId);
        await redis.srem("lobbies:started", lobbyId);
        await redis.del(`lobby:${lobbyId}`);

        console.log(`🎉 Лобби ${lobbyId} завершено! Победитель: ${winnerId}`);
    }

    async getUsersIdxLobby(lobbyId: string){
        const idx = await redis.hmget(`lobby:${lobbyId}`, "player1", "player2");

        return idx.filter((item): item is string => item !== null && item !== '');
    }

    async getUsers(lobbyId: string) {
        let idx = await this.getUsersIdxLobby(lobbyId);

        const users = await UserRepository.findByIds(idx);

        return users.map(user => ({ id: user.id, username: user.username, status: 'ready' }));
    }

    async generateTask() {
        return {
            question: 'Реши пример 1 + 1',
            image: 'https://habrastorage.org/getpro/habr/upload_files/a9f/2b3/4bc/a9f2b34bc409412fd453392c353597c5.jpg',
        }
    }
}

export default new LobbyService();
