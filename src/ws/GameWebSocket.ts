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

interface ExtWebSocket extends WebSocket {
    lobbyUuid: string;
    lobbyId: number,
    userId: number;
    users?: UserWs[];
    task?: Task;
    answers?: Answer[];
    isAlive: boolean;
    pongListenerSet?: boolean;
}

class GameWebSocket {
    private wss: WebSocketServer;
    private lobbyService: LobbyService;
    private temporaryClients = new Set<ExtWebSocket>();

    constructor(server: Server) {
        this.wss = new WebSocketServer({server});
        this.lobbyService = new LobbyService();
        console.log("🔗 Game WebSocket сервер запущен");
        this.wss.on("connection", this.handleConnection.bind(this));
        this.setupPingPong();
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

            ws.on("message", (message: string) => this.handleMessage(ws, message));
            ws.on("close", () => this.handleClose(ws));
        } catch (e) {
            logger.error("❌ Error in handleConnection:", e);
            this.sendError(ws, "Internal server error", 500);
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
            }
        } catch (error) {
            logger.error("❌ Ошибка обработки WebSocket-сообщения:", error);
        }
    }

    private async handleFindGame(ws: ExtWebSocket) {
        ws.send(JSON.stringify({status: "searching", message: "Поиск игры начался..."}));

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

                if (lobbyData) {
                    this.sendAndAddUser(lobbyData.player1, {
                        event: "playerJoined",
                        newPlayer: lobbyData.player2,
                        message: "Второй игрок подключился, игра скоро начнется!"
                    });
                } else {
                    this.sendError(ws, 'No users in the lobby', 500)
                    return;
                }
            }
        }

        ws.lobbyUuid = lobbyUuid;

        await this.lobbyService.setPlayerOnlineStatus(ws.lobbyUuid, ws.userId, true)

        const status = Number(await redis.hget(`lobby:${lobbyUuid}`, 'status'));

        await this.restoreLobbyState(ws, status === LobbyStatus.STARTED ? 'game' : 'joined');

        const users = ws.users;

        if (!users || users.length === 0) {
            this.sendError(ws, 'No users in the lobby', 500)
            return;
        }

        if (users.length === 2 && status === LobbyStatus.WAITING) {
            this.sendMessageToPlayers(ws.lobbyUuid, {
                status: "full",
                message: "Лобби сформировано, игра начинается!"
            })
            await this.startGame(ws);
        }
    }

    private async handleAnswer(ws: ExtWebSocket, data: any) {
        if (!ws.lobbyUuid || !ws.users) {
            ws.send(JSON.stringify({status: "error", message: "Вы не находитесь в лобби"}));
            return;
        }

        if (!ws.users.some(user => user.id == ws.userId)) {
            return ws.send(JSON.stringify({status: "error", message: "Вы не находитесь в лобби"}));
        }

        if (ws.answers?.some(item => item.userId == ws.userId)) {
            return ws.send(JSON.stringify({status: "game", message: "Вы уже отправили ответ"}));
        }

        const playerNumber = ws.answers?.length == 0 ? 1 : ws.answers?.length == 1 ? 2 : null;

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
            this.sendAndAddAnswer(otherPlayer, {event: 'newAnswer', answer: answer, message: 'new message'})
        }

        if (ws.answers.length >= 2 && ws.answers.every(a => a.answer !== null)) {
            await this.endGame(ws.lobbyUuid, ws.lobbyId, ws.users, ws.answers)
        }
    }

    private async handleClose(ws: ExtWebSocket) {
        if (ws.lobbyUuid && ws.userId) {
            await this.lobbyService.handlePlayerDisconnect(ws.lobbyUuid, ws.userId);
            this.temporaryClients.delete(ws);
        }
    }

    private async startGame(ws: ExtWebSocket) {
        try {
            if (!ws.task) {
                ws.task = await this.lobbyService.createTask(ws.lobbyUuid);

                await redis.hset(`lobby:${ws.lobbyUuid}`, {
                    task: JSON.stringify(ws.task),
                    status: LobbyStatus.STARTED
                });

                this.sendMessageToPlayers(ws.lobbyUuid, {status: "game", message: "Start game!", task: ws.task});
            }
        } catch (e) {
            this.sendMessageToPlayers(ws.lobbyUuid, {status: "error", message: "Failed to start game."});
        }
    }

    private async endGame(lobbyUuid: string, lobbyId: number, users: UserWs[], answers: Answer[]) {
        try {
            await this.lobbyService.endGame(lobbyUuid, lobbyId, users, answers);
            this.sendMessageToPlayers(lobbyUuid, {
                status: "game",
                lobbyUuid: lobbyUuid,
                message: "Игра завершена, оба игрока ответили",
                answers: answers,
            });
        } catch (e) {
            this.sendMessageToPlayers(lobbyUuid, {status: "error", message: "Failed to end game."});
        }
    }

    private async restoreLobbyState(ws: ExtWebSocket, status = 'joined') {
        const data = await this.lobbyService.restoreLobbyState(ws.lobbyUuid);

        if (data) {
            if(data['lobbyId']) {
                ws.lobbyId = data['lobbyId'];
            }

            ws.users = data['users'];

            ws.task = data['task'];

            ws.answers = data['answers']

            ws.send(JSON.stringify({
                status: status,
                lobbyUuid: ws.lobbyUuid,
                users: ws.users,
                task: ws.task,
                answers: ws.answers
            }));
        }
    }

    private sendError(ws: WebSocket, message: string, code: number, refresh = false) {
        ws.send(JSON.stringify({status: "error", message, code, refresh: refresh}));
        ws.close();
    }

    private sendMessageToPlayers(lobbyUuid: string, messageData: object) {
        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;

            if (wsClient.readyState === WebSocket.OPEN && wsClient.lobbyUuid == lobbyUuid) {
                wsClient.send(JSON.stringify(messageData));
            }
        });
    }

    private sendAndAddUser(player: UserWs, messageData: {
        event: string;
        newPlayer: { id: number, username: string, status: string };
        message: string
    }) {
        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;
            if (wsClient.readyState === WebSocket.OPEN && wsClient.userId == player.id) {
                wsClient.users = wsClient.users || [];
                if (!wsClient.users.some(user => user.id === messageData.newPlayer.id)) {
                    wsClient.users.push({
                        id: messageData.newPlayer.id,
                        username: messageData.newPlayer.username,
                        status: messageData.newPlayer.status
                    });
                    wsClient.send(JSON.stringify(messageData));
                }
            }
        });
    }

    private sendAndAddAnswer(player: UserWs, messageData: {
        event: string;
        answer: Answer;
        message: string
    }) {
        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;
            if (wsClient.readyState === WebSocket.OPEN && wsClient.userId == player.id) {
                wsClient.answers = wsClient.answers || [];
                if (!wsClient.answers.some(answer => answer.userId === messageData.answer.userId)) {
                    wsClient.answers.push(messageData.answer);
                    wsClient.send(JSON.stringify(messageData));
                }
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
}

export default GameWebSocket;