import { z } from 'zod';

export enum Role {
    USER = 'user',
    ADMIN = 'admin',
}

export const userRegistrationSchema = z.object({
    username: z.string(),
    email: z.string().email(),
    role: z.enum([Role.USER, Role.ADMIN]).optional().default(Role.USER),
    password: z.string().min(8),
});

export const userLoginSchema = z.object({
    email: z.string(),
    password: z.string(),
});

export const userSchema = z.object({
    id: z.number(),
    username: z.string(),
    email: z.string().email(),
    role: z.string(),
    points: z.number(),
});

export type UserRegistrationResource = z.infer<typeof userRegistrationSchema>;
export type UserLoginResource = z.infer<typeof userLoginSchema>;
export type UserResource = z.infer<typeof userSchema>;