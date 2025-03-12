import { Router, Request, Response } from "express";
import {authMiddleware} from "../../middleware/v1/auth.middleware";

const router = Router();

router.use(authMiddleware);

router.get('/api/v1/home', (request: Request, response: Response) => {
    response.status(200).json({
        status: "success",
        data: [],
        message: "Welcome to our API homepage!",
    });
})

export default router;