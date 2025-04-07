import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model
} from "sequelize";
import sequelize from "../config/database";
import User from "./user";
import {LobbyStatus} from "../enums/lobbyStatus";
import LobbyAnswer from "./lobbyAnswer";

class Lobby extends Model<InferAttributes<Lobby>, InferCreationAttributes<Lobby>> {
    declare id: CreationOptional<number>;
    declare uuid: string;
    declare player1Id: number;
    declare player2Id: number;
    declare winnerId: number | null;
    declare status: CreationOptional<LobbyStatus>;

    static associate(models: { LobbyAnswer: typeof LobbyAnswer }) {
        Lobby.hasMany(models.LobbyAnswer, { foreignKey: "lobbyId" });
    }
}

Lobby.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        uuid: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
        },
        player1Id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: User,
                key: "id",
            },
            onDelete: "CASCADE",
        },
        player2Id: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: User,
                key: "id",
            },
            onDelete: "CASCADE",
        },
        winnerId: {
            type: DataTypes.INTEGER,
            allowNull: true,
            references: {
                model: User,
                key: "id",
            },
            onDelete: "SET NULL",
        },
        status: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: LobbyStatus.STARTED,
        },
    },
    {
        sequelize,
        tableName: "lobbies",
        timestamps: true,
    }
);

export default Lobby;
