import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config();

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

function readPassword(passwordFile?: string, password?: string): string {
  if (passwordFile) {
    return readFileSync(passwordFile, 'utf8').replace(/\r?\n$/, '');
  }

  return password || '';
}

function parsePort(value: string | undefined, variable: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${variable} must be a valid TCP port.`);
  }

  return port;
}

export const config = {
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parsePort(process.env.DB_PORT || '3306', 'DB_PORT'),
    database: process.env.DB_NAME || 'inventory_db',
    user: process.env.DB_USER || 'inventory_user',
    password: readPassword(process.env.DB_PASSWORD_FILE, process.env.DB_PASSWORD),
  } satisfies DatabaseConfig,
  grpc: {
    port: parsePort(process.env.GRPC_PORT || '50051', 'GRPC_PORT'),
  },
  nodeEnv: process.env.NODE_ENV || 'development',
};

export function getInventoryTestDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env
): DatabaseConfig {
  if (env.RUN_INVENTORY_DB_TESTS !== 'true') {
    throw new Error('Set RUN_INVENTORY_DB_TESTS=true to enable destructive MySQL integration tests.');
  }

  const host = env.INVENTORY_TEST_DB_HOST;
  const portValue = env.INVENTORY_TEST_DB_PORT;
  const database = env.INVENTORY_TEST_DB_NAME;
  const user = env.INVENTORY_TEST_DB_USER;
  const password = readPassword(
    env.INVENTORY_TEST_DB_PASSWORD_FILE,
    env.INVENTORY_TEST_DB_PASSWORD
  );

  if (!host || !portValue || database !== 'inventory_test' ||
      user !== 'inventory_test_user' || !password) {
    throw new Error(
      'MySQL integration tests require explicit INVENTORY_TEST_DB_* settings, database inventory_test, and user inventory_test_user.'
    );
  }

  return {
    host,
    port: parsePort(portValue, 'INVENTORY_TEST_DB_PORT'),
    database,
    user,
    password,
  };
}
