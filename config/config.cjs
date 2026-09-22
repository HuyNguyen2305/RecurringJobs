require('dotenv').config();

const base = {
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'recurring_jobs_dev',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  dialect: 'postgres',
};

module.exports = {
  development: base,
  test: {
    ...base,
    database: process.env.DB_NAME_TEST || `${base.database}_test`,
    logging: false,
  },
  production: base,
};
