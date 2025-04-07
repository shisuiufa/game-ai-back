require("dotenv").config();
require('ts-node/register')

module.exports = {
    development: {
        username: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "password",
        database: process.env.DB_NAME || "mydb",
        host: process.env.DB_HOST || "localhost",
        dialect: "postgres"
    },
    production: {
        username: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "password",
        database: process.env.DB_NAME || "mydb",
        host: process.env.DB_HOST || "localhost",
        dialect: "postgres"
    }
};
