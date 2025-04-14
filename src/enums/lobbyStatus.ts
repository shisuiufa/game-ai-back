export enum LobbyStatus {
    WAITING = 1,
    STARTED = 2,
    FINISHED = 3,
    ERROR = 4,
    READY = 5,
    GENERATE_TASK= 6,
    ERROR_START_GAME = 7,
    GAME_GENERATE_RESULT = 8,
    ERROR_END_GAME = 9
}

export const LobbyStatusValues = Object.values(LobbyStatus);
