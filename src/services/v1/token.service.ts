import User from "../../models/user";
import jwt from "jsonwebtoken";
import {SECRET_ACCESS_TOKEN, SECRET_REFRESH_TOKEN} from "../../config/app";
import { Response } from "express";

interface TokenPayload {
    id: string;
}

export class TokenService {
    static generateTokens(user: User) {
        const accessToken = user.generateAccessJWT();
        const refreshToken = user.generateRefreshJWT();
        return { accessToken, refreshToken };
    }
    static verifyToken(token: string, secret: string): TokenPayload | null {
        try {
            return jwt.verify(token, secret) as TokenPayload;
        } catch (error) {
            return null;
        }
    }
    static async refreshTokens(refreshToken: string, res: Response): Promise<{accessToken: string, decoded: TokenPayload | null; refreshToken: string } | null> {
        try {
            const decoded = this.verifyToken(refreshToken, SECRET_REFRESH_TOKEN);

            if (!decoded) return null;

            const user = await User.findByPk(decoded.id);

            if (!user) return null;

            const { accessToken, refreshToken: newRefreshToken } = this.generateTokens(user);

            res.cookie("refreshToken", newRefreshToken, {
                httpOnly: true,
                secure: true,
                sameSite: "none",
                maxAge: 30 * 24 * 60 * 60 * 1000,
            });

            return {
                decoded: this.verifyToken(accessToken, SECRET_ACCESS_TOKEN) ?? null,
                accessToken: accessToken,
                refreshToken: newRefreshToken,
            }
        } catch (error) {
            return null;
        }
    }
}
