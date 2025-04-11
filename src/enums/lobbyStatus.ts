export enum LobbyStatus {
    WAITING = 0,
    STARTED = 1,
    FINISHED = 2,
    ERROR = 3,
    READY = 4,
}

export const LobbyStatusValues = Object.values(LobbyStatus);
