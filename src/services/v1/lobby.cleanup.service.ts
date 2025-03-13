import redis from "../../config/redis";

class LobbyCleanupService {
    static async cleanupExpiredLobbies() {
        try {
            const now = Date.now();

            const tx = redis.multi();
            tx.zremrangebyscore("lobbies:open", 0, now);
            tx.zremrangebyscore("lobbies:active", 0, now);
            tx.zremrangebyscore("lobbies:started", 0, now);

            const results = await tx.exec();

            if (!results) throw new Error("Redis transaction failed");

            const removedOpen = (results[0]?.[1] as number) ?? 0;
            const removedActive = (results[1]?.[1] as number) ?? 0;
            const removedStarted = (results[2]?.[1] as number) ?? 0;

            if (removedOpen > 0) console.log(`🗑️ Удалено ${removedOpen} устаревших лобби из lobbies:open`);
            if (removedActive > 0) console.log(`🗑️ Удалено ${removedActive} устаревших лобби из lobbies:active`);
            if (removedStarted > 0) console.log(`🗑️ Удалено ${removedStarted} устаревших лобби из lobbies:started`);
        } catch (error) {
            console.error("❌ Ошибка при очистке устаревших лобби:", error);
        }
    }

    static startAutoCleanup(intervalMs = 10 * 1000) {
        setInterval(LobbyCleanupService.cleanupExpiredLobbies, intervalMs);
    }
}

export default LobbyCleanupService;
