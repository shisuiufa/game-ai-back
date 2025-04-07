import LobbyAnswer from "../../models/lobbyAnswer";

class LobbyAnswerRepository {
    async bulkCreate(data: {
        lobbyId: number;
        userId: number;
        answer: string;
        time: string;
        score: number;
    }[]): Promise<LobbyAnswer[]> {
        return await LobbyAnswer.bulkCreate(data, {
            validate: true,
            returning: true,
        });
    }
}

export default new LobbyAnswerRepository();
