import {Server} from "http";
import {WebSocket, WebSocketServer} from "ws";
import redis from "../config/redis";
import {TokenService} from "../services/v1/token.service";
import {SECRET_ACCESS_TOKEN} from "../config/app";
import LobbyService from "../services/v1/lobby.service";
import {Task} from "../types/task";
import {UserWs} from "../types/user";
import {Answer} from "../types/answer";
import logger from "../utils/logger";
import {LobbyStatus} from "../enums/lobbyStatus";
import {WsAnswers} from "../enums/wsAnswers";
import UserRepository from "../repositories/v1/user.repository";
import {LobbyTimerManager} from "../services/v1/lobby.timer.service";

interface ExtWebSocket extends WebSocket {
    lobbyUuid: string;
    lobbyId: number,
    userId: number;
    users: UserWs[];
    task: Task | null;
    answers: Answer[] | null;
    isAlive: boolean;
    pongListenerSet?: boolean;
    endAt: number | null
}

class GameWebSocket {
    private wss: WebSocketServer;
    private lobbyService: LobbyService;
    private temporaryClients = new Set<ExtWebSocket>();
    private lobbyTimerManager: LobbyTimerManager;

    constructor(server: Server) {
        this.wss = new WebSocketServer({server});
        this.lobbyService = new LobbyService();
        console.log("🔗 Game WebSocket сервер запущен");
        this.wss.on("connection", this.handleConnection.bind(this));
        this.setupPingPong();

        this.lobbyTimerManager = new LobbyTimerManager(
            this.endGame.bind(this),
            this.sendMessageToPlayers.bind(this)
        );
    }

    public async init() {
        this.lobbyTimerManager.startPolling();
    }

    private async handleConnection(ws: ExtWebSocket, req: any) {
        try {
            const token = this.getTokenFromRequest(req);

            if (!token) {
                this.sendError(ws, "Invalid or expired token", 401);
                return;
            }

            const decoded = TokenService.verifyToken(token, SECRET_ACCESS_TOKEN) ?? null;

            if (!decoded) {
                this.sendError(ws, "Invalid or expired token", 401, true);
                return;
            }

            ws.userId = Number(decoded.id);

            const lobbyUuid = await this.lobbyService.getActiveLobbyUuidByPlayer(ws.userId);

            if (lobbyUuid) {
                ws.lobbyUuid = lobbyUuid;
            }

            const user = await UserRepository.findById(ws.userId);

            if (!user) {
                this.sendError(ws, "User not found", 401);
                return;
            }

            ws.users = ws.users ?? [];

            ws.users.push({
                id: user.id,
                username: user.username,
                status: 'ready'
            })

            ws.on("message", (message: string) => this.handleMessage(ws, message));
            ws.on("close", () => this.handleClose(ws));
        } catch (e) {
            logger.error("❌ Error:", e);
            ws.close();
        }
    }

    private async handleMessage(ws: ExtWebSocket, message: string) {
        try {
            const data = JSON.parse(message);
            if (data.type === "findGame") {
                await this.handleFindGame(ws);
            } else if (data.type === "answer") {
                await this.handleAnswer(ws, data);
            } else if (data.type === "typing") {
                if (!ws.lobbyUuid || typeof data.isTyping !== "boolean") return;

                this.sendToOtherPlayers(ws, {
                    event: WsAnswers.GAME_TYPING,
                    userId: ws.userId,
                    isTyping: data.isTyping
                })
            }
        } catch (error) {
            throw error
        }
    }

    private async handleFindGame(ws: ExtWebSocket) {
        try {
            ws.send(JSON.stringify({status: WsAnswers.GAME_SEARCH, message: "Start search!", users: ws.users}));

            let lobbyUuid: string | null = ws.lobbyUuid

            if (!lobbyUuid) {
                lobbyUuid = await this.lobbyService.findExistingLobby();

                if (!lobbyUuid) {
                    lobbyUuid = await this.lobbyService.createLobby(ws.userId);
                    ws.isAlive = true;
                    this.temporaryClients.add(ws);
                    if (!ws.pongListenerSet) {
                        ws.on("pong", () => {
                            ws.isAlive = true;
                        });
                        ws.pongListenerSet = true;
                    }
                } else {
                    const lobbyData = await this.lobbyService.addPlayerToLobby(lobbyUuid, ws.userId);

                    ws.lobbyUuid = lobbyUuid;

                    if (lobbyData) {
                        this.sendToOtherPlayers(ws, {
                            event: WsAnswers.GAME_USER_JOINED,
                            newPlayer: lobbyData.newPlayer,
                            message: "Второй игрок подключился, игра скоро начнется!"
                        }, (client) => {
                            client.users = client.users || [];
                            if (!client.users.some(user => user.id === lobbyData.newPlayer.id)) {
                                client.users.push({
                                    id: lobbyData.newPlayer.id,
                                    username: lobbyData.newPlayer.username,
                                    status: lobbyData.newPlayer.status
                                });
                            }
                            client.lobbyId = Number(lobbyData.lobbyId);
                        });
                    }
                }
            }

            ws.lobbyUuid = lobbyUuid;

            await this.lobbyService.setPlayerOnlineStatus(ws.lobbyUuid, ws.userId, true)

            const status = Number(await redis.hget(`lobby:${lobbyUuid}`, 'status'));

            if (status == LobbyStatus.WAITING) return;

            await this.restoreLobbyState(ws, status === LobbyStatus.STARTED ? WsAnswers.GAME_START : WsAnswers.GAME_JOINED);

            const users = ws.users;

            if (!users || users.length === 0) {
                this.sendError(ws, 'No users in the lobby', 500)
                return;
            }

            const validStatuses = new Set([LobbyStatus.WAITING, LobbyStatus.READY, LobbyStatus.ERROR_START_GAME]);

            if (users.length === 2 && validStatuses.has(status)) {
                await this.startGame(ws);
            }
        } catch (e) {
            throw e;
        }
    }

    private async handleAnswer(ws: ExtWebSocket, data: any) {
        try {
            const lobbyKey = `lobby:${ws.lobbyUuid}`;
            const lobbyStatusRaw = await redis.hget(lobbyKey, 'status');

            const lobbyStatus = Number(lobbyStatusRaw);

            if (isNaN(lobbyStatus) || lobbyStatus !== LobbyStatus.STARTED) {
                ws.send(JSON.stringify({
                    status: WsAnswers.GAME_ERROR,
                    message: "Игра не началась"
                }));
                return;
            }

            if (!ws.lobbyUuid || !ws.users) {
                ws.send(JSON.stringify({status: WsAnswers.GAME_ERROR, message: "Вы не находитесь в лобби"}));
                return;
            }

            if (!ws.users.some(user => user.id == ws.userId)) {
                return ws.send(JSON.stringify({status: WsAnswers.GAME_ERROR, message: "Вы не находитесь в лобби"}));
            }

            if (ws.answers?.some(item => item.userId == ws.userId)) {
                return ws.send(JSON.stringify({status: WsAnswers.GAME_ERROR, message: "Вы уже отправили ответ"}));
            }

            const lobbyEndAtRaw = await redis.hget(`lobby:${ws.lobbyUuid}`, "endAt");
            const lobbyEndAt = lobbyEndAtRaw ? Number(lobbyEndAtRaw) : null;

            if (!lobbyEndAt || Date.now() > lobbyEndAt) {
                return ws.send(JSON.stringify({
                    status: WsAnswers.GAME_ERROR,
                    message: "Время для отправки ответа истекло"
                }));
            }

            if (!ws.answers) {
                ws.answers = [];
            }

            const playerNumber =
                ws.answers.length === 0 ? 1 :
                    ws.answers.length === 1 ? 2 :
                        null;

            if (!playerNumber) {
                return ws.send(JSON.stringify({status: "error", message: "В лобби уже есть два ответа"}));
            }

            const timestamp = Date.now().toString();

            const answerKey = `answer${playerNumber}`;

            const answer: Answer = {
                userId: ws.userId,
                answer: data.answer,
                time: timestamp,
            }

            await redis.hset(`lobby:${ws.lobbyUuid}`, {
                [answerKey]: JSON.stringify(answer)
            });

            if (!ws.answers) {
                ws.answers = [];
            }

            ws.answers.push(answer);

            const otherPlayer = ws.users.find(item => item.id != ws.userId);

            if (otherPlayer) {
                const maskedAnswer: Answer = {
                    ...answer,
                    answer: '',
                    hidden: true
                };

                this.sendToOtherPlayers(ws, {
                    event: WsAnswers.GAME_NEW_ANSWER,
                    answer: maskedAnswer,
                    message: 'new message'
                }, (client) => {
                    if (!client.answers) {
                        client.answers = [];
                    }
                    client.answers.push(maskedAnswer);
                });
            }

            if (ws.answers.length >= 2 && ws.answers.every(a => a.answer !== null)) {
                try {
                    await this.endGame(ws.lobbyUuid);
                } catch (err) {
                    console.error("Error while ending game:", err);
                }
            }
        } catch (e) {
            throw e;
        }
    }

    private async handleClose(ws: ExtWebSocket) {
        if (ws.lobbyUuid && ws.userId) {
            await this.lobbyService.handlePlayerDisconnect(ws.lobbyUuid, ws.userId);
            this.temporaryClients.delete(ws);
        }
    }

    private async startGame(ws: ExtWebSocket) {
        const lobbyId = ws.lobbyUuid;
        const attemptsKey = `lobby:${lobbyId}:start_attempts`;
        const lockKey = `lobby:${lobbyId}:start_lock`;

        try {
            const status = await redis.hget(`lobby:${lobbyId}`, 'status');

            if (status == null || status === String(LobbyStatus.STARTED)) return;

            const lockAcquired = await (redis as any).set(lockKey, "1", "NX", "EX", 5);

            if (!lockAcquired) {
                setTimeout(() => {
                    this.startGame(ws);
                }, 10000);
                return;
            }

            const attempts = Number(await redis.get(attemptsKey)) || 0;

            if (attempts >= 3) {
                await this.lobbyService.forceEndLobby(ws.lobbyUuid, LobbyStatus.ERROR)
                this.sendMessageToPlayers(ws.lobbyUuid, {
                    status: WsAnswers.GAME_ERROR,
                    message: "Не удалось запустить игру. Лобби закрыто.",
                });
                return;
            }

            await redis.set(attemptsKey, attempts + 1, 'EX', 300);

            await redis.hset(`lobby:${ws.lobbyUuid}`, {
                status: LobbyStatus.GENERATE_TASK
            });

            this.sendMessageToPlayers(ws.lobbyUuid, {
                status: WsAnswers.GAME_GENERATE_TASK,
            });

            ws.task = await this.lobbyService.createTask(ws.lobbyUuid);

            await redis.hset(`lobby:${ws.lobbyUuid}`, {
                task: JSON.stringify(ws.task),
                status: LobbyStatus.STARTED
            });

            const endAt = Date.now() + 60000;

            this.sendMessageToPlayers(ws.lobbyUuid, {
                status: WsAnswers.GAME_START,
                task: ws.task,
                endAt: endAt,
                message: "Start game!"
            });

            await this.lobbyTimerManager.setLobbyTimer(ws.lobbyUuid, endAt - Date.now());
        } catch (e) {
            const stillExists = await redis.exists(`lobby:${ws.lobbyUuid}`);

            if (!stillExists) {
                return;
            }

            await redis.hset(`lobby:${ws.lobbyUuid}`, {
                status: LobbyStatus.ERROR_START_GAME
            });
            setTimeout(() => {
                this.startGame(ws);
            }, 10000);
        } finally {
            await redis.del(lockKey);
        }
    }

    private async endGame(lobbyUuid: string) {
        try {
            const lobby = await this.lobbyService.getLobby(lobbyUuid);

            if (!lobby || !lobby.player1 || !lobby.player2) return false;

            const lobbyId = Number(lobby.id);
            const players: [number, number] = [Number(lobby.player1), Number(lobby.player2)];

            const answer1 = lobby.answer1;
            const answer2 = lobby.answer2;

            if (!answer1 && !answer2) {
                return false;
            }

            this.sendMessageToPlayers(lobbyUuid, {
                status: WsAnswers.GAME_GENERATE_RESULT,
            });

            const answers: Answer[] = [];

            if (answer1) answers.push(answer1);
            if (answer2) answers.push(answer2);

            const data = await this.lobbyService.endLobby(lobbyUuid, lobbyId, players, answers);

            await redis.zrem('lobbyTimers', lobbyUuid);

            this.sendMessageToPlayers(lobbyUuid, {
                status: WsAnswers.GAME_END,
                lobbyUuid,
                answers,
                ...data
            });

            return true;
        } catch (e) {
            console.error(`Failed to end game for lobby ${lobbyUuid}:`, e);
            throw e;
        }
    }

    private async restoreLobbyState(ws: ExtWebSocket, status = WsAnswers.GAME_JOINED) {
        try {
            const data = await this.lobbyService.getLobbyState(ws.lobbyUuid);

            if (data) {
                if (data['lobbyId']) {
                    ws.lobbyId = data['lobbyId'];
                }

                ws.users = data['users'];

                ws.task = data['task'];

                ws.answers = (data['answers'] as Answer[]).map((a) => {
                    return {
                        ...a,
                        hidden: a.userId !== ws.userId,
                        answer: a.userId === ws.userId ? a.answer : ''
                    };
                });

                ws.endAt = data['endAt'];

                ws.send(JSON.stringify({
                    status: status,
                    lobbyUuid: ws.lobbyUuid,
                    users: ws.users,
                    task: ws.task,
                    answers: ws.answers,
                    endAt: ws.endAt,
                    nowAt: Date.now(),
                }));
            }
        } catch (e) {
            throw e;
        }
    }

    private sendError(ws: WebSocket, message: string, code: number, refresh = false) {
        ws.send(JSON.stringify({status: WsAnswers.GAME_ERROR, message, code, refresh: refresh}));
        ws.close();
    }

    private sendMessageToPlayers(lobbyUuid: string, messageData: object) {
        const messageWithTimestamp = {
            ...messageData,
            nowAt: Date.now(),
        };

        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;

            if (wsClient.readyState === WebSocket.OPEN && wsClient.lobbyUuid === lobbyUuid) {
                wsClient.send(JSON.stringify(messageWithTimestamp));
            }
        });
    }

    private getTokenFromRequest(req: any): string | null {
        const urlParams = new URLSearchParams(req.url?.split("?")[1]);

        return urlParams.get("token") ?? null;
    }

    private setupPingPong() {
        setInterval(async () => {
            for (const ws of this.temporaryClients) {
                if (!ws.isAlive) {
                    console.warn(`💀 Пользователь ${ws.userId} не ответил на ping. Отключаем.`);

                    await this.lobbyService.handlePlayerDisconnect(ws.lobbyUuid, ws.userId);
                    ws.terminate();
                    this.temporaryClients.delete(ws);

                    continue;
                }

                ws.isAlive = false;

                try {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.ping();
                    }
                } catch (err) {
                    console.error("❌ Ошибка при ping:", err);
                }
            }
        }, 30000);
    }

    private sendToOtherPlayers(
        ws: ExtWebSocket,
        message: any,
        callback?: (client: ExtWebSocket) => void
    ) {
        this.wss.clients.forEach((client) => {
            const otherClient = client as ExtWebSocket;
            if (
                otherClient.readyState === WebSocket.OPEN &&
                otherClient.lobbyUuid === ws.lobbyUuid &&
                otherClient.userId !== ws.userId
            ) {
                callback?.(otherClient);

                otherClient.send(JSON.stringify(message));
            }
        });
    }
}

export default GameWebSocket;