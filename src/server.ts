import app from "./app";
import { PORT } from "./config/app";
import sequelize from "./config/database";
import { createServer } from "http";
import GameWebSocket from "./ws/GameWebSocket";

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    process.exit(1);
});

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
