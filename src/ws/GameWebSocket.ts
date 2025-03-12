import {Server} from "http";
import {WebSocketServer, WebSocket} from "ws";
import LobbyService from "../services/v1/lobby.service";
import redis from "../config/redis";
import {TokenService} from "../services/v1/token.service";
import {SECRET_ACCESS_TOKEN} from "../config/app";

interface ExtWebSocket extends WebSocket {
    userId: number;
    lobbyId?: string;
}

class GameWebSocket {
    private wss: WebSocketServer;

    constructor(server: Server) {
        this.wss = new WebSocketServer({server});
        console.log("🔗 Game WebSocket сервер запущен");

        this.wss.on("connection", async (ws: ExtWebSocket, req) => {
            const urlParams = new URLSearchParams(req.url?.split("?")[1]);
            const token = urlParams.get("token") ?? "";

            if (!token || token.length == 0) {
                ws.send(JSON.stringify({status: "error", message: "No token provided", code: 401, refresh: false}));
                ws.close();
                return;
            }

            const decoded = TokenService.verifyToken(token, SECRET_ACCESS_TOKEN);

            if (!decoded) {
                ws.send(JSON.stringify({
                    status: "error",
                    message: "Invalid or expired token",
                    code: 401,
                    refresh: true
                }));
                ws.close();
                return;
            }

            ws.userId = Number(decoded.id);

            ws.on("message", async (message: string) => {
                try {
                    const data = JSON.parse(message);

                    if (data.type === "findGame") {
                        ws.send(JSON.stringify({status: "searching", message: "Поиск игры начался..."}));

                        let lobbyId = await LobbyService.getActiveLobbyIdByPlayer(ws.userId)

                        if(!lobbyId) {
                            lobbyId = await LobbyService.findExistingLobby();

                            if (!lobbyId) {
                                lobbyId = await LobbyService.createLobby(ws.userId);
                            } else {
                                await LobbyService.addPlayerToLobby(lobbyId, ws.userId);
                            }
                        }

                        ws.lobbyId = lobbyId;

                        const users = await LobbyService.getUsers(ws.lobbyId);

                        ws.send(JSON.stringify({status: "joined", lobbyId, users}));

                        const isStarted = await redis.sismember("lobbies:started", lobbyId);

                        if(isStarted){
                            const taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");

                            const task = taskRaw ? JSON.parse(taskRaw) : null;

                            ws.send(JSON.stringify({ status: "game", lobbyId, users, task }));
                        }

                        if (users.length === 2 && !isStarted) {
                            const idx = users.map(user => (user.id))

                            this.wss.clients.forEach((client) => {
                                const wsClient = client as ExtWebSocket;

                                if (wsClient.readyState === WebSocket.OPEN && (wsClient.userId == idx[0] || wsClient.userId == idx[1])) {
                                    wsClient.send(JSON.stringify({
                                        status: "full",
                                        lobbyId,
                                        users,
                                        message: "Лобби сформировано, игра начинается!"
                                    }));
                                }
                            });

                            setTimeout(async () => {
                                redis.sadd("lobbies:started", lobbyId);

                                let taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");

                                if (!taskRaw) {
                                    taskRaw = JSON.stringify(await LobbyService.generateTask());
                                    await redis.hset(`lobby:${lobbyId}`, "task", taskRaw);
                                }

                                const task = taskRaw ? JSON.parse(taskRaw) : null;

                                this.wss.clients.forEach((client) => {
                                    const wsClient = client as ExtWebSocket;
                                    if (wsClient.readyState === WebSocket.OPEN && (wsClient.userId == idx[0] || wsClient.userId == idx[1])) {
                                        wsClient.send(JSON.stringify({
                                            status: "game",
                                            lobbyId,
                                            users,
                                            task,
                                            message: "Start game!"
                                        }));
                                    }
                                });
                            }, 10 * 1000);
                        }
                    } else if (data.type === "answer") {

                    }

                } catch (e) {
                    console.error(e)
                    console.error("❌ Ошибка обработки WebSocket-сообщения:", e);
                }
            })

            ws.on("close", async () => {
                console.log(`❌ Игрок ${ws.userId} отключился`);
                if (ws.lobbyId && ws.userId) {
                    await LobbyService.handlePlayerDisconnect(ws.lobbyId, ws.userId);
                }
            });
        })
    }
}

export default GameWebSocket;