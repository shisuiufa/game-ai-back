import {Answer} from "./answer";
import {Task} from "./task";
import {UserWs} from "./user";

export interface LobbyJoinResult {
    newPlayer: {
        id: number;
        username: string;
        status: string;
    };
    lobbyId: number;
}

export interface LobbyState {
    users: UserWs[];
    task: Task | null;
    answers: Answer[];
    lobbyId: number | null;
    endAt: number | null;
}
