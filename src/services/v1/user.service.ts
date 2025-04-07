import UserRepository from "../../repositories/v1/user.repository";

class UserService {
    async addPoints(userId: number, points: number) {
        await UserRepository.addPoints(userId, points);
    }
}

export default new UserService();
