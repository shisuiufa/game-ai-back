import Redis from "ioredis";
import { REDIS_HOST, REDIS_PORT, REDIS_PASSWORD } from "./app";

const redis = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    retryStrategy: (times) => {
        const delay = Math.min(times * 500, 5000) // увеличиваем паузу между попытками
        console.log(`[Redis] retry #${times} in ${delay}ms`)
        return delay
    },
});

redis.on("connect", () => {
    console.log("[Redis] Connected ✅")
})

redis.on("error", (err) => {
    console.error("[Redis] Connection error ❌", err)
})

export default redis;
