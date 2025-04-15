import {UserResource} from "../schemas/v1/user.schema";

declare global {
    namespace Express {
        interface Request {
            user?: UserResource;
        }
    }
}
