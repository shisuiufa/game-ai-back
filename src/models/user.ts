import {CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model} from "sequelize";
import sequelize from "../config/database";
import bcrypt from "bcrypt";
import { Role } from '../schemas/v1/user.schema';
import jwt from "jsonwebtoken";
import {SECRET_ACCESS_TOKEN} from '../config/app'
import LobbyAnswer from "./lobbyAnswer";

class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
    declare id: CreationOptional<number>;
    declare username: string;
    declare email: string;
    declare password: string;
    declare role: Role;
    declare points: CreationOptional<number>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static associate(models: { LobbyAnswer: typeof LobbyAnswer }) {
        User.hasMany(models.LobbyAnswer, { foreignKey: "userId" });
    }

    generateAccessJWT(): string {
        if (!SECRET_ACCESS_TOKEN) {
            throw new Error("SECRET_ACCESS_TOKEN is not defined");
        }

        const payload = { id: this.id };

        return jwt.sign(payload, SECRET_ACCESS_TOKEN, { expiresIn: "40m" });
    }

    generateRefreshJWT(): string {
        if (!process.env.SECRET_REFRESH_TOKEN) {
            throw new Error("SECRET_REFRESH_TOKEN is not defined");
        }

        return jwt.sign({ id: this.id }, process.env.SECRET_REFRESH_TOKEN, { expiresIn: "30d" });
    }
}

User.init(
    {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        username: {
            type: DataTypes.STRING(50),
            allowNull: false,
            unique: true,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        role: {
            type: DataTypes.STRING,
            allowNull: false,
            defaultValue: Role.USER,
        },
        points: {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
        },
        createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
        updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
        },
    },
    {
        sequelize,
        tableName: "users",
        timestamps: true,
        defaultScope: {
            attributes: { exclude: ["password"] },
        },
        scopes: {
            withPassword: { attributes: { include: ["password"] } },
        },
        hooks: {
            beforeCreate: async (user) => {
                user.password = await bcrypt.hash(user.password, 10);
            },
            beforeUpdate: async (user) => {
                if (user.changed("password")) {
                    user.password = await bcrypt.hash(user.password, 10);
                }
            },
        },
    }
);

export default User;
