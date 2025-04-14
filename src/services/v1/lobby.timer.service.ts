import redis from "../../config/redis";
import {WsAnswers} from "../../enums/wsAnswers";

export class LobbyTimerManager {
    private inProgressLobbies = new Set<string>();

    constructor(
        private endGame: (lobbyUuid: string) => Promise<boolean>,
        private sendMessageToPlayers: (lobbyUuid: string, data: any) => void
    ) {}

    private readonly TIMER_ZSET_KEY = 'lobbyTimers';

    /**
     * Установка таймера: сохраняем в Redis и в хеш лобби
     */
    async setLobbyTimer(lobbyUuid: string, duration: number) {
        const endAt = Date.now() + duration;

        await redis.zadd(this.TIMER_ZSET_KEY, endAt.toString(), lobbyUuid);

        await redis.hset(`lobby:${lobbyUuid}`, {
            endAt: endAt.toString()
        });

        this.sendMessageToPlayers(lobbyUuid, {
            event: WsAnswers.GAME_TIMER_EXTENDED,
            endAt,
        });
    }


    /**
     * Запускает постоянную проверку истекших таймеров
     */
    startPolling(intervalMs = 2000) {
        setInterval(() => this.pollExpiredLobbies(), intervalMs);
    }

    /**
     * Обработка истекших таймеров
     */
    private async pollExpiredLobbies() {
        const now = Date.now();

        const expiredLobbies = await redis.zrangebyscore(
            this.TIMER_ZSET_KEY,
            0,
            now
        );

        for (const lobbyUuid of expiredLobbies) {
            if (this.inProgressLobbies.has(lobbyUuid)) {
                continue;
            }

            this.inProgressLobbies.add(lobbyUuid);

            try {
                const over = await this.endGame(lobbyUuid);
                if(!over){
                    await this.setLobbyTimer(lobbyUuid, 30_000);
                }
            } catch (e) {
                console.error(`❌ Ошибка завершения лобби ${lobbyUuid}:`, e);
            } finally {
                this.inProgressLobbies.delete(lobbyUuid);
            }
        }
    }
}
