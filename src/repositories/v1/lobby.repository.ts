import Lobby from "../../models/lobby";
import {Attributes} from "sequelize";

class LobbyRepository {
    async create(player1Id: number, player2Id: number, uuid: string): Promise<Lobby> {
        return await Lobby.create({player1Id, player2Id, uuid});
    }

    async update(lobbyId: number, fields: Partial<Attributes<Lobby>>): Promise<void> {
        if (Object.keys(fields).length === 0) return;

        await Lobby.update(fields, {
            where: { id: lobbyId },
        });
    }
}

export default new LobbyRepository();
