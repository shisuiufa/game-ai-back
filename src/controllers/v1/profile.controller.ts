import { Request, Response } from "express";

export async function getProfile(req: Request, res: Response): Promise<void> {
    try {
        const user = req.user;

        res.status(200).json({
            data: user,
        });
    } catch (error: any) {
        res.status(error.status || 500).json({
            status: "failed",
            message: error.message || "Internal Server Error",
        });
    }
}
