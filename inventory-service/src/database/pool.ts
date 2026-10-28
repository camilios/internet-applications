import mysql, { Pool, RowDataPacket } from 'mysql2/promise';
import { DatabaseConfig, config } from '../config';

let pool: Pool | undefined;

export function getPool(databaseConfig: DatabaseConfig = config.db): Pool {
  if (!pool) {
    pool = mysql.createPool({
      ...databaseConfig,
      waitForConnections: true,
      connectionLimit: 20,
      queueLimit: 0,
      enableKeepAlive: true,
    });
  }

  return pool;
}

export async function verifyInventoryTestDatabase(databaseConfig: DatabaseConfig): Promise<void> {
  const connection = await mysql.createConnection(databaseConfig);

  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT DATABASE() AS database_name, CURRENT_USER() AS database_user'
    );
    const row = rows[0];

    if (
      row?.database_name !== 'inventory_test' ||
      !String(row.database_user).startsWith('inventory_test_user@')
    ) {
      throw new Error('Connected MySQL schema or account does not match the dedicated inventory test database.');
    }
  } finally {
    await connection.end();
  }
}

export async function closePool(): Promise<void> {
  const activePool = pool;
  pool = undefined;

  if (activePool) {
    await activePool.end();
  }
}
