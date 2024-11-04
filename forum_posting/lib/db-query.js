const config = require("./config");
const { Pool } = require("pg");

const isProduction = config.NODE_ENV === "production";

const pool = new Pool({
  user: process.env.DB_USER || config.DB_USER,
  host: process.env.DB_HOST || config.DB_HOST,
  database: process.env.DB_DATABASE || config.DB_DATABASE,
  port: process.env.DB_PORT || config.DB_PORT,
  ssl: isProduction ? { rejectUnauthorized: true } : false,
});

const logQuery = (statement, parameters) => {
  const timeStamp = new Date();
  const formattedTimeStamp = timeStamp.toString().substring(4, 24);
  console.log(formattedTimeStamp, statement, parameters);
};

module.exports = {
  async dbQuery(statement, parameters) {
    try {
      logQuery(statement, parameters);
      const result = await pool.query(statement, parameters);
      if (!result) {
        return { rows: [] };
      }
      return result;
    } catch (error) {
      console.error("Error executing query:", error.stack);
      throw error;
    }
  },
};
