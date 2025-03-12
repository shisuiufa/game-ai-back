import express, { Application } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import api from "./routes/v1/api.route";
import auth from "./routes/v1/auth.route";

const app: Application = express();

app.use(
    cors({
        origin: "http://localhost:3000",
        credentials: true,
    })
);

app.disable("x-powered-by");
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api/auth", auth);
app.use("/api/v1", api);

export default app;
