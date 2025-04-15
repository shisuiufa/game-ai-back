import { Router } from "express";
import {authMiddleware} from "../../middleware/v1/auth.middleware";
import {refreshToken} from "../../controllers/v1/auth.controller";
import {getProfile} from "../../controllers/v1/profile.controller";
const router = Router();

router.use(authMiddleware);

router.get('/refresh_token', refreshToken)

router.get('/profile', getProfile)

export default router;