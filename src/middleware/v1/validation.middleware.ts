import { Request, Response, NextFunction } from 'express';
import {z, ZodError, ZodIssue} from 'zod';

import { StatusCodes } from 'http-status-codes';

export function validateData<T>(schema: z.ZodType<T>) {
    return (req: Request, res: Response, next: NextFunction) => {
        try {
            schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errorMessages = error.errors.map((issue: ZodIssue) => ({
                    field: issue.path.join("."),
                    message: issue.message,
                }))
                res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid data', details: errorMessages });
            } else {
                res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ error: 'Internal Server Error' });
            }
        }
    };
}