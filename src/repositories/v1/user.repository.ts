import User from "../../models/user";

class UserRepository {
    async findByUsername(username: string): Promise<User | null> {
        return await User.findOne({ where: { username } });
    }

    async addPoints(userId: number, points: number): Promise<void> {
        await User.increment("points", { by: points, where: { id: userId } });
    }

    async findByIds(ids: string[]): Promise<User[]> {
        return await User.findAll({ where: { id: ids } });
    }
}

export default new UserRepository();
