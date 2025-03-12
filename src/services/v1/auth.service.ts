import User from "../../models/user";
import bcrypt from "bcrypt";
import { UserRegistrationResource, UserLoginResource } from "../../schemas/v1/user.schema";

export class AuthService {
    static async register(data: UserRegistrationResource) {
        const existingUser = await User.findOne({where: {email: data.email.toLowerCase().trim()}});

        if (existingUser) {
            throw { status: 400, message: "User already exists. Please log in instead." };
        }

        const user = await User.create({
            username: data.username,
            email: data.email.toLowerCase().trim(),
            password: data.password,
            role: data.role,
        });

        const { password, ...userData } = user.get({ plain: true });
        return userData;
    }

    static async login(data: UserLoginResource) {
        const user = await User.scope("withPassword").findOne({
            where: {email: data.email},
        });

        if(!user){
            throw { status: 401, message: "Invalid email or password." };
        }

        const isPasswordValid = await bcrypt.compare(data.password, user.password);

        if (!isPasswordValid) {
            throw { status: 401, message: "Invalid email or password." };
        }

        const { password: _, ...userData } = user.get({ plain: true });

        return {
            user: userData,
            accessToken: user.generateAccessJWT(),
            refreshToken: user.generateRefreshJWT(),
        };
    }
}