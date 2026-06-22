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
  connectionTimeout: 15000,
  requestTimeout: 30000,
  pool: {
    max: 25,
    min: 2,           // mantém 2 conexões sempre abertas — evita reconexão a cada request
    idleTimeoutMillis: 120000, // fecha conexão ociosa só após 2 min
  },
};

let pool: sql.ConnectionPool | null = null;
let poolPromise: Promise<sql.ConnectionPool> | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  // Promise-lock: evita múltiplas conexões simultâneas em requests paralelos
  if (!poolPromise) {
    poolPromise = sql.connect(config)
      .then((p) => { pool = p; poolPromise = null; return p; })
      .catch((err) => { poolPromise = null; throw err; });
  }
  return poolPromise;
}

export { sql };
