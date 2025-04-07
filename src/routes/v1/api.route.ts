import { Router } from "express";
import {authMiddleware} from "../../middleware/v1/auth.middleware";
import {refreshToken} from "../../controllers/v1/auth.controller";
const router = Router();

router.use(authMiddleware);

router.get('/refresh_token', refreshToken)

export default router;