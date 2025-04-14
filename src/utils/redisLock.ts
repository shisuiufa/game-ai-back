import {Redis} from 'ioredis';

interface AcquireLockAndTrackAttemptsOptions {
    redis: Redis;
    lockKey: string;
    attemptsKey: string;
    maxAttempts: number;
    onMaxAttemptsReached: () => Promise<void>;
    onLockNotAcquired: () => void;
    lockTtl?: number;
    attemptsTtl?: number;
}

export async function acquireLockAndTrackAttempts({
                                                      redis,
                                                      lockKey,
                                                      attemptsKey,
                                                      maxAttempts,
                                                      onMaxAttemptsReached,
                                                      onLockNotAcquired,
                                                      lockTtl = 5,
                                                      attemptsTtl = 300,
                                                  }: AcquireLockAndTrackAttemptsOptions): Promise<boolean> {
    const lockAcquired = await (redis as any).set(lockKey, "1", "NX", "EX", lockTtl);

    if (!lockAcquired) {
        onLockNotAcquired();
        return false;
    }

    const attempts = Number(await redis.get(attemptsKey)) || 0;

    if (attempts >= maxAttempts) {
        await onMaxAttemptsReached();
        return false;
    }

    await redis.set(attemptsKey, attempts + 1, 'EX', attemptsTtl);
    return true;
}
