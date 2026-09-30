const { Client } = require('pg');

async function checkDatabase() {
  const client = new Client({
    host: process.env.DATABASE_HOST,
    port: Number(process.env.DATABASE_PORT),
    database: process.env.DATABASE_NAME,
    user: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    connectionTimeoutMillis: 2000,
    query_timeout: 2000,
    statement_timeout: 2000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end();
  }
}

async function checkHealth() {
  const [response] = await Promise.all([
    fetch(`http://127.0.0.1:${process.env.PORT}/health`, {
      signal: AbortSignal.timeout(4000),
    }),
    checkDatabase(),
  ]);
  if (!response.ok) throw new Error('Healthcheck failed');
}

checkHealth().catch(() => process.exit(1));
