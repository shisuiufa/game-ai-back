import app from "./app";
import { PORT } from "./config/app";
import sequelize from "./config/database";
import { createServer } from "http";
import GameWebSocket from "../src/ws/GameWebSocket";
import cookieParser from "cookie-parser";

(async () => {
    try {
        await sequelize.authenticate();
        console.log("✅ Database connected successfully");

        await sequelize.sync();
        console.log("📌 Database synchronized");

        const server = createServer(app);

        new GameWebSocket(server);

        server.listen(PORT, () => {
            console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Error:", error);
    }
})();
