import {Server} from "http";
import {WebSocket, WebSocketServer} from "ws";
import redis from "../config/redis";
import {TokenService} from "../services/v1/token.service";
import {SECRET_ACCESS_TOKEN} from "../config/app";
import LobbyService from "../services/v1/lobby.service";


interface User {
    id: number;
    username: string;
    status: string;
}

interface ExtWebSocket extends WebSocket {
    userId: number;
    lobbyId?: string | null;
    users?: User[];
    tasks?: [];
    answers?: [];
}

interface TokenPayload {
    id: string;
}

class GameWebSocket {
    private wss: WebSocketServer;
    private readonly TTL_SECONDS = 1800;
    private lobbyService: LobbyService;

    constructor(server: Server) {
        this.wss = new WebSocketServer({server});
        this.lobbyService = new LobbyService(this.TTL_SECONDS);
        console.log("🔗 Game WebSocket сервер запущен");
        this.wss.on("connection", this.handleConnection.bind(this));
    }

    private async handleConnection(ws: ExtWebSocket, req: any) {
        const token = this.getTokenFromRequest(req);

        if (!token) {
            this.sendError(ws, "Invalid or expired token", 401);
            return;
        }

        const decoded = this.getValidToken(token);

        if (!decoded) {
            this.sendError(ws, "Invalid or expired token", 401, true);
            return;
        }

        ws.userId = Number(decoded.id);
        ws.lobbyId = await this.lobbyService.getActiveLobbyIdByPlayer(ws.userId)

        ws.on("message", (message: string) => this.handleMessage(ws, message));
        ws.on("close", () => this.handleClose(ws));
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
            console.error("❌ Ошибка обработки WebSocket-сообщения:", error);
        }
    }

    private async handleFindGame(ws: ExtWebSocket) {
        ws.send(JSON.stringify({status: "searching", message: "Поиск игры начался..."}));

        let lobbyId = ws.lobbyId

        if (!lobbyId) {
            lobbyId = await this.lobbyService.findExistingLobby();
            if (!lobbyId) {
                lobbyId = await this.lobbyService.createLobby(ws.userId);
            } else {
                const lobbyData = await this.lobbyService.addPlayerToLobby(lobbyId, ws.userId);

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

        ws.lobbyId = lobbyId;

        const isStarted = await redis.zscore("lobbies:started", lobbyId);

        await this.restoreLobbyState(ws, isStarted ? 'game' : 'joined');

        const users = ws.users;

        if (!users ||users.length === 0) {
            this.sendError(ws, 'No users in the lobby', 500)
            return;
        }

        if (users.length === 2 && !isStarted) {
            const idx = users.map(user => (user.id))

            this.sendMessageToPlayers(lobbyId, {
                status: "full",
                message: "Лобби сформировано, игра начинается!"
            })

            setTimeout(async () => {
                await this.startGame(lobbyId, idx);
            }, 10 * 1000);
        }
    }

    private async handleAnswer(ws: ExtWebSocket, data: any) {
        if (!ws.lobbyId) {
            ws.send(JSON.stringify({status: "error", message: "Вы не находитесь в лобби"}));
            return;
        }

        const [player1IdRaw, player2IdRaw, answer1, answer2] = await redis.hmget(`lobby:${ws.lobbyId}`, "player1", "player2", "answer1", "answer2");

        const player1Id = Number(player1IdRaw);
        const player2Id = Number(player2IdRaw);

        const answerKey = ws.userId == player1Id ? "answer1" : ws.userId == player2Id ? "answer2" : null;

        if (!answerKey) {
            ws.send(JSON.stringify({status: "error", message: "Вы не являетесь игроком этого лобби"}));
            return;
        }

        if ((answerKey === "answer1" && answer1) || (answerKey === "answer2" && answer2)) {
            ws.send(JSON.stringify({ status: "game", message: "Вы уже отправили ответ" }));
            return;
        }

        await redis.hset(`lobby:${ws.lobbyId}`, {
            [answerKey]: data.answer,
            [`${answerKey}_timestamp`]: Date.now().toString(),
        });

        await this.lobbyService.updateLiveGameLobby(ws.lobbyId, player1Id, player2Id)

        if (!ws.users || ws.users.length === 0) {
            this.sendError(ws, 'No users in the lobby', 500)
            return;
        }

        const listAnswers = await this.getAnswersForLobby(ws.lobbyId, ws.users)

        if (listAnswers[0]?.answer && listAnswers[1]?.answer) {
            await this.lobbyService.endGame(ws.lobbyId, listAnswers);
            this.sendMessageToPlayers(ws.lobbyId, {
                status: "game",
                lobbyId: ws.lobbyId,
                message: "Игра завершена, оба игрока ответили",
                answers: listAnswers,
            });
        } else {
            this.sendMessageToPlayers(ws.lobbyId, {
                status: "game",
                lobbyId: ws.lobbyId,
                answers: listAnswers
            })
        }
    }

    private async handleClose(ws: ExtWebSocket) {
        console.log(`❌ Игрок ${ws.userId} отключился`);
        if (ws.lobbyId && ws.userId) {
            await this.lobbyService.handlePlayerDisconnect(ws.lobbyId, ws.userId);
        }
    }

    private async startGame(lobbyId: string, idx: number[]) {
        let taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");

        if (!taskRaw) {
            taskRaw = JSON.stringify(await this.lobbyService.generateTask());
            await redis.hset(`lobby:${lobbyId}`, "task", taskRaw);
            await this.lobbyService.updateLiveGameLobby(lobbyId, idx[0], idx[1]);
        }

        const task = taskRaw ? JSON.parse(taskRaw) : null;

        this.sendMessageToPlayers(lobbyId, {status: "game", message: "Start game!", task});
    }

    private async getTaskForLobby(lobbyId: string) {
        const taskRaw = await redis.hget(`lobby:${lobbyId}`, "task");
        return taskRaw ? JSON.parse(taskRaw) : null;
    }

    private sendError(ws: WebSocket, message: string, code: number, refresh = false) {
        ws.send(JSON.stringify({status: "error", message, code, refresh: refresh}));
        ws.close();
    }

    private getTokenFromRequest(req: any): string | null {
        const urlParams = new URLSearchParams(req.url?.split("?")[1]);
        return urlParams.get("token") ?? null;
    }

    private getValidToken(token: string): null | TokenPayload {
        return TokenService.verifyToken(token, SECRET_ACCESS_TOKEN) ?? null;
    }

    private async getAnswersForLobby(lobbyId: string, users: User[]): Promise<{ userId: number; answer: string | null; time: string | null }[]> {
        const lobbyData = await redis.hmget(
            `lobby:${lobbyId}`,
            "answer1", "answer2",
            "answer1_timestamp", "answer2_timestamp",
            "player1", "player2"
        );

        const [answer1, answer2, timestamp1Raw, timestamp2Raw, player1IdRaw, player2IdRaw] = lobbyData;
        const player1Id = Number(player1IdRaw);
        const player2Id = Number(player2IdRaw);

        return users
            .map((user) => {
                const userId = Number(user.id);
                const isPlayer1 = userId === player1Id;
                const isPlayer2 = userId === player2Id;

                const answer = isPlayer1 ? answer1 : isPlayer2 ? answer2 : null;
                const time = isPlayer1 ? timestamp1Raw : isPlayer2 ? timestamp2Raw : null;

                return answer !== null && time !== null
                    ? { userId, answer, time }
                    : undefined;
            })
            .filter((item): item is { userId: number; answer: string; time: string } => item !== undefined)
            .sort((a, b) => Number(a.time) - Number(b.time));
    }

    private async restoreLobbyState(ws: ExtWebSocket, status = 'joined') {
        const storedLobbyId = await redis.get(`player:${ws.userId}:lobby`);

        if (storedLobbyId) {
            ws.lobbyId = storedLobbyId;

            ws.users = await this.lobbyService.getUsers(ws.lobbyId);

            const task = await this.getTaskForLobby(ws.lobbyId);

            const answers = await this.getAnswersForLobby(ws.lobbyId, ws.users)

            ws.send(JSON.stringify({
                status: status,
                lobbyId: ws.lobbyId,
                users: ws.users,
                task,
                answers: answers
            }));
        }
    }

    private sendMessageToPlayers(lobbyId: string, messageData: object) {
        this.wss.clients.forEach((client) => {
            const wsClient = client as ExtWebSocket;

            if (wsClient.readyState === WebSocket.OPEN && wsClient.lobbyId == lobbyId) {
                wsClient.send(JSON.stringify(messageData));
            }
        });
    }

    private sendAndAddUser (player: User, messageData: { event: string; newPlayer: { id: number, username: string, status: string }; message: string }) {
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
}

export default GameWebSocket;