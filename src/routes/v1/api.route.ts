import { Router, Request, Response } from "express";
import {authMiddleware} from "../../middleware/v1/auth.middleware";
import {refreshToken} from "../../controllers/v1/auth.controller";

const router = Router();

router.use(authMiddleware);


router.get('/refresh_token', refreshToken)

router.get('/home', (request: Request, response: Response) => {
    response.status(200).json({
        status: "success",
        data: [],
        message: "Welcome to our API homepage!",
    });
})

export default router;