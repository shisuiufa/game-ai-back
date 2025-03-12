import {Router} from "express";
import {validateData} from "../../middleware/v1/validation.middleware";
import {Login, Register} from "../../controllers/v1/auth.controller";
import { userRegistrationSchema, userLoginSchema } from '../../schemas/v1/user.schema'

const router = Router();

router.post("/register", validateData(userRegistrationSchema), Register);

router.post('/login', validateData(userLoginSchema), Login)

export default router;