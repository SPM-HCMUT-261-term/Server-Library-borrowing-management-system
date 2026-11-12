import pg from 'pg';

export const pool: pg.Pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT as string),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME
});


pool.on('connect', (client: pg.Client) => {
  console.log(`Connected to database ${client.database} in ${client.host}:${client.port}`);
});

pool.on('error', (err: Error) => {
  console.error(`Unexpected error on DB connection: ${err.message}`);
  process.exit(-1);
});


