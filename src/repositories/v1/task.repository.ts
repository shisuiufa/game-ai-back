import Task from "../../models/task";

class TaskRepository {
    async create(lobbyId: number, prompt: string): Promise<Task> {
        return await Task.create({lobbyId, prompt});
    }

    async getByLobbyId(lobbyId: number): Promise<Task | null> {
        return await Task.findOne({ where: { lobbyId } })
    }
}

export default new TaskRepository();
