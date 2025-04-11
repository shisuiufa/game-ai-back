export interface LobbyJoinResult {
    newPlayer: {
        id: number;
        username: string;
        status: string;
    };
    lobbyId: number;
}