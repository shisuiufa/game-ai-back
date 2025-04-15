import User from "../../models/user";

class UserRepository {
    async addPoints(userId: number, points: number): Promise<void> {
        await User.increment("points", { by: points, where: { id: userId } });
    }

    async removePoints(userId: number, points: number): Promise<void> {
        await User.increment("points", { by: -points, where: { id: userId } });
    }

    async findByIdx(id: number[]): Promise<User[]> {
        return await User.findAll({ where: { id: id } });
    }

    async findById(id: number | string): Promise<User | null> {
        return await User.findOne({ where: { id: id } });
    }
}

export default new UserRepository();
