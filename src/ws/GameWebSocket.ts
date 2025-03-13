import {Server} from "http";
import {WebSocketServer, WebSocket} from "ws";
import redis from "../config/redis";
import {TokenService} from "../services/v1/token.service";
import {SECRET_ACCESS_TOKEN} from "../config/app";
import LobbyService from "../services/v1/lobby.service";


interface ExtWebSocket extends WebSocket {
    userId: number;
    lobbyId?: string;
}

class GameWebSocket {
    private wss: WebSocketServer;
    private readonly TTL_SECONDS = 1800;
    private lobbyService: LobbyService;

    private sendMessageToPlayers(lobbyId: string, messageData: object) {
        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;

            if (wsClient.readyState === WebSocket.OPEN && wsClient.lobbyId === lobbyId) {
                wsClient.send(JSON.stringify(messageData));
            }
        });
    }

    constructor(server: Server) {
        this.wss = new WebSocketServer({server});
        this.lobbyService = new LobbyService(this.TTL_SECONDS);
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

                        let lobbyId = await this.lobbyService.getActiveLobbyIdByPlayer(ws.userId)

                        if (!lobbyId) {
                            lobbyId = await this.lobbyService.findExistingLobby();

                            if (!lobbyId) {
                                lobbyId = await this.lobbyService.createLobby(ws.userId);
                            } else {
                                await this.lobbyService.addPlayerToLobby(lobbyId, ws.userId);
                            }
                        }

                        ws.lobbyId = lobbyId;

                        const users = await this.lobbyService.getUsers(ws.lobbyId);

                        ws.send(JSON.stringify({status: "joined", lobbyId, users}));

                        const isStarted = await redis.zscore("lobbies:started", lobbyId);

                        if (isStarted) {
                            const taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");

                            const task = taskRaw ? JSON.parse(taskRaw) : null;

                            ws.send(JSON.stringify({status: "game", lobbyId, users, task}));
                        }

                        if (users.length === 2 && !isStarted) {
                            const idx = users.map(user => (user.id))

                            const tx = redis.multi();

                            await tx.exec();

                            this.sendMessageToPlayers(lobbyId, {
                                status: "full",
                                lobbyId,
                                users,
                                message: "Лобби сформировано, игра начинается!"
                            })

                            setTimeout(async () => {
                                let taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");

                                if (!taskRaw) {
                                    taskRaw = JSON.stringify(await this.lobbyService.generateTask())
                                    await redis.hset(`lobby:${lobbyId}`, "task", taskRaw);
                                    await this.lobbyService.updateLiveGameLobby(lobbyId, idx[0], idx[1])
                                }

                                const task = taskRaw ? JSON.parse(taskRaw) : null;

                                this.sendMessageToPlayers(lobbyId, {
                                    status: "game",
                                    lobbyId,
                                    users,
                                    task,
                                    message: "Start game!"
                                })
                            }, 10 * 1000);
                        }
                    } else if (data.type === "answer") {
                        if (!ws.lobbyId) {
                            ws.send(JSON.stringify({status: "error", message: "Вы не находитесь в лобби"}));
                            return;
                        }

                        const player1Id = Number(await redis.hget(`lobby:${ws.lobbyId}`, "player1"));
                        const player2Id = Number(await redis.hget(`lobby:${ws.lobbyId}`, "player2"));

                        const answerKey = ws.userId === player1Id ? "answer1" : ws.userId === player2Id ? "answer2" : null;

                        if (!answerKey) {
                            ws.send(JSON.stringify({status: "error", message: "Вы не являетесь игроком этого лобби"}));
                            return;
                        }

                        const existingAnswer = await redis.hget(`lobby:${ws.lobbyId}`, answerKey);

                        if (existingAnswer) {
                            ws.send(JSON.stringify({status: "game", message: "Вы уже отправили ответ"}));
                            return;
                        }

                        await redis.hset(`lobby:${ws.lobbyId}`, answerKey, data.answer);
                        await this.lobbyService.updateLiveGameLobby(ws.lobbyId, player1Id, player2Id)
                    }

                    if (!ws.lobbyId) return;

                    const isStarted = await redis.zscore("lobbies:started", ws.lobbyId);

                    if(isStarted){
                        const player1Id = Number(await redis.hget(`lobby:${ws.lobbyId}`, "player1"));
                        const player2Id = Number(await redis.hget(`lobby:${ws.lobbyId}`, "player2"));
                        const answers = await redis.hmget(`lobby:${ws.lobbyId}`, "answer1", "answer2");

                        this.sendMessageToPlayers(ws.lobbyId, {
                            status: "game",
                            lobbyId: ws.lobbyId,
                            answers: {
                                [player1Id]: answers[0] || null,
                                [player2Id]: answers[1] || null
                            }
                        })
                    }
                } catch (e) {
                    console.error(e)
                    console.error("❌ Ошибка обработки WebSocket-сообщения:", e);
                }
            })

            ws.on("close", async () => {
                console.log(`❌ Игрок ${ws.userId} отключился`);
                if (ws.lobbyId && ws.userId) {
                    await this.lobbyService.handlePlayerDisconnect(ws.lobbyId, ws.userId);
                }
            });
        })
    }
}

export default GameWebSocket;