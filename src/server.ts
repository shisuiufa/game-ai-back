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

        const gameWs = new GameWebSocket(server);

        await gameWs.init();

        server.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
        });
    } catch (error) {
        console.error("❌ Error:", error);
    }
})();
