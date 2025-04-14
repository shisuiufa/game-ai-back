export enum LobbyStatus {
    WAITING = 0,
    STARTED = 1,
    FINISHED = 2,
    ERROR = 3,
    READY = 4,
    GENERATE_TASK= 5,
    ERROR_START_GAME = 6
}

export const LobbyStatusValues = Object.values(LobbyStatus);
