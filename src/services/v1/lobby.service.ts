import LobbyRepository from "../../repositories/v1/lobby.repository";
import UserService from "./user.service";
import redis from "../../config/redis";
import { randomUUID } from "crypto";
import UserRepository from "../../repositories/v1/user.repository";

class LobbyService {
    private LOBBY_EXPIRATION = 1800;

    async findExistingLobby(playerId: number) {
        let cursor = "0";
        const count = 50;

        do {
            const [newCursor, openLobbies] = await redis.sscan("open_lobbies", cursor, "COUNT", count);
            cursor = newCursor;

            for (const lobbyId of openLobbies) {
                try {
                    const lobbyData = await redis.get(`lobby:${lobbyId}`);
                    if (!lobbyData) continue;

                    const { players, status } = JSON.parse(lobbyData);

                    if (status === "open" && !players.includes(playerId)) {
                        return lobbyId;
                    }
                } catch (error) {
                    console.error(`Ошибка парсинга JSON для lobby:${lobbyId}:`, error);
                }
            }
        } while (cursor !== "0");

        return null;
    }

    async createLobby(player1Id: number): Promise<string> {
        const existingLobby = await this.findExistingLobby(player1Id);

        if (existingLobby) return existingLobby;

        const lobbyId = randomUUID();
        const lobbyData = {
            players: [player1Id],
            status: "open",
        };
        await redis.set(`lobby:${lobbyId}`, JSON.stringify(lobbyData), "EX", this.LOBBY_EXPIRATION);
        await redis.sadd("open_lobbies", lobbyId);
        return lobbyId;
    }

    async addPlayerToLobby(lobbyId: string, player2Id: number): Promise<void> {
        const key = `lobby:${lobbyId}`
        const lobbyData = JSON.parse(await redis.get(key) || "{}");

        if (!lobbyData.players || lobbyData.players.includes(player2Id)) return;
        if (lobbyData.status !== "open") return;

        lobbyData.players.push(player2Id);
        lobbyData.status = "full";

        await redis.set(key, JSON.stringify(lobbyData), "EX", this.LOBBY_EXPIRATION);
        await redis.srem("open_lobbies", lobbyId);

        await LobbyRepository.createLobby(lobbyData.players[0], lobbyData.players[1], lobbyId);
        console.log(`🔥 Лобби ${lobbyId} заполнено! Игра начинается!`);
    }

    async handlePlayerDisconnect(lobbyId: string, userId: number): Promise<void> {
        const key = `lobby:${lobbyId}`;

        const lobbyData = JSON.parse(await redis.get(key) || "{}");

        if (!lobbyData.players) return;

        if (lobbyData.players.length === 2) {
            const remainingPlayer = lobbyData.players.find((p: number) => p !== userId);
            if (remainingPlayer) {
                console.log(`🚨 Игрок ${userId} вышел. Победитель: ${remainingPlayer}`);
                await this.endGame(lobbyId, remainingPlayer);
            }
        } else {
            console.warn(`⚠️ Игрок ${userId} вышел из пустого лобби ${lobbyId}`);
        }

        await redis.srem("open_lobbies", lobbyId);
        await redis.del(key);
    }

    async endGame(lobbyId: string, winnerId: number): Promise<void> {
        const key = `lobby:${lobbyId}`;
        const lobbyData = JSON.parse(await redis.get(key) || "{}");

        if (lobbyData.players && lobbyData.players.length === 2) {
            await LobbyRepository.setWinner(lobbyId, winnerId);
            await UserService.addPoints(winnerId, 10);
        }

        await redis.srem("open_lobbies", lobbyId);
        await redis.del(key);
    }

    async getUsers(lobbyId: string) {
        const lobbyData = await redis.get(`lobby:${lobbyId}`);

        if(!lobbyData) return [];

        const players: string[] = JSON.parse(lobbyData).players;

        const users = await UserRepository.findByIds(players);

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
