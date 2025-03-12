import { Sequelize } from "sequelize";
import { DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME } from "./app";

const sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, {
    host: DB_HOST,
    port: DB_PORT,
    dialect: "postgres",
    logging: false,
    dialectOptions: {
        useUTC: false,
    },
});

export default sequelize;
