export enum LobbyStatus {
    WAITING = 1,
    STARTED = 2,
    FINISHED = 3,
    READY = 4,
    GENERATE_TASK= 5,
    GENERATE_RESULT = 6,
    ERROR_START_GAME = 7,
    ERROR_END_GAME = 8
}

export const LobbyStatusValues = Object.values(LobbyStatus);
