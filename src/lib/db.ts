import sql from 'mssql';

const config: sql.config = {
  server: process.env.DB_OWN_HOST || '192.168.10.13',
  port: parseInt(process.env.DB_OWN_PORT || '1433'),
  database: process.env.DB_OWN_DATABASE || 'dovale',
  user: process.env.DB_OWN_USER || 'sa',
  password: process.env.DB_OWN_PASSWORD,
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (!pool || !pool.connected) {
    pool = await sql.connect(config);
  }
  return pool;
}

export { sql };
