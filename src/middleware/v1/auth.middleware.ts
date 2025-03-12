import {NextFunction, Request, Response} from "express";
import jwt from "jsonwebtoken";
import User from "../../models/user";
import {SECRET_ACCESS_TOKEN, SECRET_REFRESH_TOKEN} from "../../config/app";

interface TokenPayload {
    id: string;
}

const refreshTokens = async (refreshToken: string, req: Request, res: Response): Promise<TokenPayload | null> => {
    try {
        const decodedRefresh = jwt.verify(refreshToken, SECRET_REFRESH_TOKEN) as TokenPayload;
        const user = await User.findByPk(decodedRefresh.id);

        if (!user) {
            console.warn(`[SECURITY] Invalid refresh token used. User not found: ${decodedRefresh.id}`);
            return null;
        }

        const newAccessToken = user.generateAccessJWT();
        const newRefreshToken = user.generateRefreshJWT();

        res.cookie("accessToken", newAccessToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 20 * 60 * 1000,
        });

        res.cookie("refreshToken", newRefreshToken, {
            httpOnly: true,
            secure: true,
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return jwt.verify(newAccessToken, SECRET_ACCESS_TOKEN) as TokenPayload;
    } catch (error) {
        console.error("[AUTH ERROR] Failed to refresh token:", error);
        return null;
    }
};

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const accessToken = req.cookies.accessToken;
    const refreshToken = req.cookies.refreshToken;

    if (!accessToken) {
        res.status(401).json({message: "Access denied. No token provided."});
        return;
    }

    try {
        req.user = jwt.verify(accessToken, SECRET_ACCESS_TOKEN) as TokenPayload;
        next();
    } catch (e) {
        if (!refreshToken) {
            res.status(401).json({message: "Session expired. Please log in again."});
            return;
        }

        const newUser = await refreshTokens(refreshToken, req, res);

        if (!newUser) {
            res.status(403).json({message: "Invalid refresh token."});
            return;
        }

        req.user = newUser;
        next();
    }
};
