import {Request, Response} from "express";
import {
    UserLoginResource,
    userLoginSchema,
    UserRegistrationResource,
    userRegistrationSchema
} from "../../schemas/v1/user.schema";
import { AuthService } from "../../services/v1/auth.service";

export async function Register(req: Request, res: Response): Promise<void> {
    try {
        const data: UserRegistrationResource = userRegistrationSchema.parse(req.body);

        await AuthService.register(data);

        const { user, accessToken, refreshToken } = await AuthService.login({ email: data.email, password: data.password });

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 20 * 60 * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            status: "success",
            data: user,
            message: "Registration successful. Welcome!",
        });

        return;
    } catch (error: any) {
        res.status(error.status || 500).json({
            status: "failed",
            message: error.message || "Internal Server Error",
        });
    }
}

export async function Login(req: Request, res: Response): Promise<void> {
    try {
        const data: UserLoginResource = userLoginSchema.parse(req.body);
        const {user, accessToken, refreshToken } = await AuthService.login(data);

        res.cookie("accessToken", accessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 20 * 60 * 1000,
        });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            status: "success",
            data: user,
            message: "You have successfully logged in.",
        });
    } catch (error: any) {
        res.status(error.status || 500).json({
            status: "failed",
            message: error.message || "Internal Server Error",
        });
    }
}
