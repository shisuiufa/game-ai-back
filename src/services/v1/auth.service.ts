import User from "../../models/user";
import bcrypt from "bcrypt";
import { UserRegistrationResource, UserLoginResource } from "../../schemas/v1/user.schema";
import {Op} from "sequelize";


export class AuthService {
    static async register(data: UserRegistrationResource) {
        const email = data.email.toLowerCase().trim();
        const username = data.username.trim();

        const existingUser = await User.findOne({
            where: {
                [Op.or]: [
                    { email },
                    { username }
                ]
            }
        });

        if (existingUser) {
            if (existingUser.email === email) {
                throw { status: 400, message: "User already exists. Please log in instead." };
            } else {
                throw { status: 400, message: "Username already taken. Please choose another one." };
            }
        }

        const user = await User.create({
            username: username,
            email: email,
            password: data.password,
            role: data.role,
        });

        const { password, ...userData } = user.get({ plain: true });

        return userData;
    }

    static async login(data: UserLoginResource) {
        const email = data.email.toLowerCase().trim();
        const password = data.password.trim();

        const user = await User.scope("withPassword").findOne({
            where: {email: email},
        });

        if(!user){
            throw { status: 401, message: "Invalid email or password." };
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

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