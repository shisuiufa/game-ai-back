import {Request, Response} from "express";
import {
    UserLoginResource,
    userLoginSchema,
    UserRegistrationResource,
    userRegistrationSchema
} from "../../schemas/v1/user.schema";
import { AuthService } from "../../services/v1/auth.service";
import {TokenService} from "../../services/v1/token.service";

export async function Register(req: Request, res: Response): Promise<void> {
    try {
        const data: UserRegistrationResource = userRegistrationSchema.parse(req.body);

        await AuthService.register(data);

        const { user, accessToken, refreshToken } = await AuthService.login({ email: data.email, password: data.password });

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(201).json({
            status: "success",
            data: {
                user,
                accessToken,
            },
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

        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 30 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({
            status: "success",
            data: {
                user,
                accessToken,
            },
            message: "You have successfully logged in.",
        });
    } catch (error: any) {
        res.status(error.status || 500).json({
            status: "failed",
            message: error.message || "Internal Server Error",
        });
    }
}

export async function refreshToken(req: Request, res: Response): Promise<void>{
    try {
        const refreshToken = req.cookies.refreshToken;

        const result = await TokenService.refreshTokens(refreshToken, res);

        if (!result || !result.decoded || !result.refreshToken) {
            res.status(403).json({message: "Invalid refresh token."});
            return
        }

        res.status(200).json({
            status: "success",
            data: {
                accessToken: result.accessToken
            },
            message: "Refresh token successfully!",
        });
    } catch (error: any){
        res.status(error.status || 500).json({
            status: "failed",
            message: error.message || "Internal Server Error",
        });
    }
}

