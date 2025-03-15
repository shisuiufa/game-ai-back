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

interface task {
    question: string,
    image: string,
}

interface answer {
    player: number | null
    userId: number,
    answer: string | null,
    time: string | null
}

interface ExtWebSocket extends WebSocket {
    userId: number;
    lobbyId?: string | null;
    users?: User[];
    task?: task;
    answers?: answer[];
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

        if (!users || users.length === 0) {
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
                await this.startGame(ws, lobbyId, idx);
            }, 10 * 1000);
        }
    }

    private async handleAnswer(ws: ExtWebSocket, data: any) {
        if (!ws.lobbyId || !ws.users) {
            ws.send(JSON.stringify({status: "error", message: "Вы не находитесь в лобби"}));
            return;
        }

        if (!ws.users.some(user => user.id == ws.userId)) {
            return ws.send(JSON.stringify({ status: "error", message: "Вы не находитесь в лобби" }));
        }

        if (ws.answers?.some(item => item.userId == ws.userId)) {
            return ws.send(JSON.stringify({ status: "game", message: "Вы уже отправили ответ" }));
        }

        const playerNumber = ws.answers?.length == 0 ? 1 : ws.answers?.length == 1 ? 2 : null;

        if (!playerNumber) {
            return ws.send(JSON.stringify({ status: "error", message: "В лобби уже есть два ответа" }));
        }

        const answerKey = `answer${playerNumber}`;
        const playerKey = `${answerKey}_user`;
        const timestamp = Date.now().toString();

        await redis.hset(`lobby:${ws.lobbyId}`, {
            [answerKey]: data.answer,
            [playerKey]: ws.userId,
            [`${answerKey}_timestamp`]: Date.now().toString(),
        });

        if (!ws.answers) {
            ws.answers = [];
        }

        const answer: answer = {
            userId: ws.userId,
            answer: data.answer,
            time: timestamp,
            player: playerNumber
        }

        ws.answers.push(answer);

        const otherPlayer = ws.users.find(item => item.id != ws.userId);

        if(otherPlayer){
            this.sendAndAddAnswer(otherPlayer, {event: 'newAnswer', answer: answer, message: 'new message'})
        }

        await this.lobbyService.updateLiveGameLobby(ws.lobbyId, ws.users[0].id, ws.users[1].id)

        if (ws.answers.length >= 2 && ws.answers.every(a => a.answer !== null)) {
            await this.lobbyService.endGame(ws.lobbyId, ws.answers);
            this.sendMessageToPlayers(ws.lobbyId, {
                status: "game",
                lobbyId: ws.lobbyId,
                message: "Игра завершена, оба игрока ответили",
                answers: ws.answers,
            });
        }
    }

    private async handleClose(ws: ExtWebSocket) {
        console.log(`❌ Игрок ${ws.userId} отключился`);
        if (ws.lobbyId && ws.userId) {
            await this.lobbyService.handlePlayerDisconnect(ws.lobbyId, ws.userId);
        }
    }

    private async startGame(ws: ExtWebSocket, lobbyId: string, idx: number[]) {
        if (!ws.task) {
            ws.task = await this.lobbyService.generateTask();
            await redis.hset(`lobby:${lobbyId}`, "task", JSON.stringify(ws.task));
            await this.lobbyService.updateLiveGameLobby(lobbyId, idx[0], idx[1]);
        }

        this.sendMessageToPlayers(lobbyId, {status: "game", message: "Start game!", task: ws.task});
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

    private async getAnswersForLobby(lobbyId: string, users: User[]): Promise<{
        userId: number;
        answer: string | null;
        time: string | null;
        player: number | null
    }[]> {
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
                const player = isPlayer1 ? 1 : isPlayer2 ? 2 : null;

                return answer !== null && time !== null ? {userId, answer, time, player} : null;
            })
            .filter((item): item is { userId: number; answer: string; time: string; player: number } => item !== null)
            .sort((a, b) => Number(a.time) - Number(b.time));
    }

    private async restoreLobbyState(ws: ExtWebSocket, status = 'joined') {
        const storedLobbyId = await redis.get(`player:${ws.userId}:lobby`);

        if (storedLobbyId) {
            ws.lobbyId = storedLobbyId;

            ws.users = await this.lobbyService.getUsers(ws.lobbyId);

            ws.task = await this.getTaskForLobby(ws.lobbyId);

            ws.answers = await this.getAnswersForLobby(ws.lobbyId, ws.users)

            ws.send(JSON.stringify({
                status: status,
                lobbyId: ws.lobbyId,
                users: ws.users,
                task: ws.task,
                answers: ws.answers
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

    private sendAndAddUser(player: User, messageData: {
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

    private sendAndAddAnswer(player: User, messageData: {
        event: string;
        answer: answer;
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
}

export default GameWebSocket;