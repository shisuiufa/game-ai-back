import { Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import UserService from "../services/v1/user.service";
import LobbyService from "../services/v1/lobby.service";
import redis from "../config/redis";

interface ExtWebSocket extends WebSocket {
    userId?: number;
    lobbyId?: string;
}

class GameWebSocket {
    private wss: WebSocketServer;

    constructor(server: Server) {
        this.wss = new WebSocketServer({ server });
        console.log("🔗 Game WebSocket сервер запущен");

        this.wss.on("connection", async (ws: ExtWebSocket) => {
            ws.on("message", async (message: string) => {
                try {
                    const data = JSON.parse(message);

                    if (data.type === "findGame") {
                        const user = await UserService.findUser(data.username);

                        if (!user) {
                            ws.send(JSON.stringify({ type: "error", message: "User not found!" }));
                            return;
                        }

                        ws.userId = user.id;

                        ws.send(JSON.stringify({ type: "searching", message: "Поиск игры начался..." }));

                        let lobbyId = await LobbyService.findExistingLobby(user.id);
                        let isLobbyFull = true;

                        if(!lobbyId){
                            lobbyId = await LobbyService.createLobby(user.id);
                            isLobbyFull = false;
                        } else {
                            await LobbyService.addPlayerToLobby(lobbyId, user.id);
                        }

                        ws.lobbyId = lobbyId;
                        ws.send(JSON.stringify({ type: "joined", lobbyId }));

                        if (isLobbyFull) {
                            const key = `lobby:${lobbyId}`;
                            const lobbyData = JSON.parse(await redis.get(key) || "{}");

                            if (lobbyData.players && lobbyData.players.length === 2) {
                                const [player1Id, player2Id] = lobbyData.players;

                                this.wss.clients.forEach((client: ExtWebSocket) => {
                                    if (client.readyState === WebSocket.OPEN && (client.userId === player1Id || client.userId === player2Id)) {
                                        client.send(JSON.stringify({ type: "start", lobbyId, message: "Лобби сформировано, игра начинается!" }));
                                    }
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error("❌ Ошибка обработки WebSocket-сообщения:", e);
                }
            })

            ws.on("close", async () => {
                console.log(`❌ Игрок ${ws.userId} отключился`);
                if (ws.lobbyId && ws.userId) {
                    console.log(ws.lobbyId)
                    await LobbyService.handlePlayerDisconnect(ws.lobbyId, ws.userId);
                }
            });
        })
    }
}

export default GameWebSocket;