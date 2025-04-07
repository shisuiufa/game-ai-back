import User from "./user";
import Lobby from "./lobby";
import LobbyAnswer from "./lobbyAnswer";
import Task from "./task";

const models = {
    User,
    Lobby,
    LobbyAnswer,
    Task,
};

User.associate?.(models);
Lobby.associate?.(models);
LobbyAnswer.associate?.(models);

export default models;
