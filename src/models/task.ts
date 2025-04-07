import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model
} from "sequelize";
import sequelize from "../config/database";
import Lobby from "./lobby";


class Task extends Model<InferAttributes<Task>, InferCreationAttributes<Task>> {
    declare id: CreationOptional<number>;
    declare lobbyId: number;
    declare prompt: string;
}

Task.init(
    {
        id: {
            type: DataTypes.BIGINT,
            autoIncrement: true,
            primaryKey: true,
        },
        lobbyId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: Lobby,
                key: "id",
            },
            onDelete: "CASCADE",
        },
        prompt: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
    },
    {
        sequelize,
        tableName: "tasks",
        timestamps: true,
    }
);

Lobby.hasMany(Task, { foreignKey: "lobbyId", as: "tasks", onDelete: "CASCADE" });
Task.belongsTo(Lobby, { foreignKey: "lobbyId", as: "lobby" });

export default Task;