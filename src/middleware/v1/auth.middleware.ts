import {NextFunction, Request, Response} from "express";
import {TokenService} from "../../services/v1/token.service";
import {SECRET_ACCESS_TOKEN} from "../../config/app";

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    let accessToken = req.headers.authorization;
    const refreshToken = req.cookies.refreshToken;

    if (accessToken && accessToken.startsWith("Bearer ")) {
        accessToken = accessToken.split(" ")[1];
    } else {
        accessToken = undefined;
    }

    if (!accessToken) {
        res.status(401).json({message: "Access denied. No token provided."});
        return;
    }

    let decoded = TokenService.verifyToken(accessToken, SECRET_ACCESS_TOKEN);

    if (decoded) {
        req.user = decoded;
        next();
        return
    }

    if (!refreshToken) {
        res.status(401).json({message: "Session expired. Please log in again."});
        return
    }

    const result = await TokenService.refreshTokens(refreshToken, res);

    if (!result || !result.decoded || !result.refreshToken || !result.accessToken) {
        res.status(403).json({message: "Invalid refresh token."});
        return
    }

    req.user = result.decoded;
    next();
};
