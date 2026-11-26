const knex = require("knex")({
    client: "pg",
    connection: {
        host: process.env.DB_HOST || "localhost",
        user: process.env.DB_USER || "postgres",
        password: process.env.DB_PASSWORD || "8178336",
        database: process.env.DB_NAME || "country_catalog",
        port: process.env.DB_PORT || 5433,
        ssl: process.env.DB_SSL ? { rejectUnauthorized: false } : false
    }
});

module.exports = knex;
