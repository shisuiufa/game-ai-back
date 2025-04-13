import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import api from "./routes/v1/api.route";
import auth from "./routes/v1/auth.route";
import dotenv from 'dotenv';

const app: Application = express();
dotenv.config();

const corsEnabled = process.env.CORS_ENABLED === 'true';
const allowedOrigins = process.env.CORS_ORIGINS?.split(',').map(origin => origin.trim());

if (corsEnabled) {
    app.use(
        cors({
            origin: allowedOrigins,
            credentials: true,
        })
    );
}


app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/auth", auth);
app.use("/api/v1", api);

export default app;
