import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model
} from "sequelize";
import sequelize from "../config/database";
import type Lobby from "./lobby";
import type User from "./user";

class LobbyAnswer extends Model<
    InferAttributes<LobbyAnswer>,
    InferCreationAttributes<LobbyAnswer>
> {
  declare id: CreationOptional<number>;
  declare lobbyId: number;
  declare userId: number;
  declare answer: string;
  declare time: string;
  declare score: CreationOptional<number | null>;

  static associate(models: { Lobby: typeof Lobby; User: typeof User }) {
    LobbyAnswer.belongsTo(models.Lobby, { foreignKey: "lobbyId" });
    LobbyAnswer.belongsTo(models.User, { foreignKey: "userId" });
  }
}

LobbyAnswer.init(
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      lobbyId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      answer: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      time: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      score: {
        type: DataTypes.FLOAT,
        allowNull: false,
      },
    },
    {
      sequelize,
      modelName: "LobbyAnswer",
      tableName: "LobbyAnswers",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['lobbyId', 'userId'],
        },
      ],
    }
);

export default LobbyAnswer;
