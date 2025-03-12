import * as dotenv from "dotenv";
dotenv.config();

const PORT: number = Number(process.env.PORT) || 3000;
const SECRET_ACCESS_TOKEN: string = process.env.SECRET_ACCESS_TOKEN || "";
const SECRET_REFRESH_TOKEN: string = process.env.SECRET_REFRESH_TOKEN || "";
const DB_HOST: string = process.env.DB_HOST || "localhost";
const DB_PORT: number = Number(process.env.DB_PORT) || 5432;
const DB_USER: string = process.env.DB_USER || "user";
const DB_PASSWORD: string = process.env.DB_PASSWORD || "password";
const DB_NAME: string = process.env.DB_NAME || "database";

const REDIS_HOST: string = process.env.REDIS_HOST || "localhost";
const REDIS_PASSWORD: string = process.env.REDIS_PASSWORD || "redis";
const REDIS_PORT: number = Number(process.env.REDIS_PORT) || 6379;

export {
    PORT,
    SECRET_ACCESS_TOKEN,
    SECRET_REFRESH_TOKEN,
    DB_HOST,
    DB_PORT,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    REDIS_HOST,
    REDIS_PASSWORD,
    REDIS_PORT
};

