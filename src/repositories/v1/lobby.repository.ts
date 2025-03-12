import Lobby from "../../models/lobby";

class LobbyRepository {
    async createLobby(player1Id: number, player2Id: number, uuid: string): Promise<Lobby> {
        return await Lobby.create({player1Id, player2Id, uuid});
    }

    async setWinner(lobbyUuid: string, winnerId: number): Promise<void> {
        await Lobby.update({ winnerId }, { where: { uuid: lobbyUuid } });
    }
}

export default new LobbyRepository();
