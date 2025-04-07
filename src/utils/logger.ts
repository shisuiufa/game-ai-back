import { createLogger, transports, format } from "winston";
import path from "path";
import fs from "fs";

const logDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

const logger = createLogger({
    level: "info",
    format: format.combine(
        format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
    ),
    transports: [
        new transports.Console(),
        new transports.File({ filename: path.join(logDir, "error.log"), level: "error" }),
        new transports.File({ filename: path.join(logDir, "combined.log") }),
    ],
    exceptionHandlers: [
        new transports.File({ filename: path.join(logDir, "exceptions.log") }),
    ],
    rejectionHandlers: [
        new transports.File({ filename: path.join(logDir, "rejections.log") }),
    ]
});

export default logger;
