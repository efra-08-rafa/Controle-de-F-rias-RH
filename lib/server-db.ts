import 'server-only';

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getLocalDb } from './local-db';

let pool: Pool | undefined;

type LocalResult<T> = { rows: T[]; rowCount: number };
type LocalClient = { query: <T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) => Promise<LocalResult<T>>; release: () => void };

function modoLocal() { return (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local'; }
function getDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL não configurada no ambiente do servidor.');
  return value;
}
function placeholders(sql: string) { return sql.replace(/\$(\d+)/g, '?'); }

function localQuery<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): LocalResult<T> {
  const statement = getLocalDb().prepare(placeholders(sql));
  const normalized = sql.trim().toLowerCase();
  if (normalized.startsWith('select') || normalized.startsWith('with') || normalized.startsWith('pragma')) {
    const rows = statement.all(...values) as T[];
    return { rows, rowCount: rows.length };
  }
  if (normalized.includes('returning')) {
    const rows = statement.all(...values) as T[];
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...values);
  return { rows: [], rowCount: result.changes };
}

export function getDb() {
  if (modoLocal()) return getLocalDb();
  if (!pool) {
    pool = new Pool({ connectionString: getDatabaseUrl(), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  }
  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  if (modoLocal()) return localQuery<T>(text, values) as unknown as QueryResult<T>;
  return (getDb() as Pool).query<T>(text, values);
}

function localClient(): LocalClient {
  return { query: async <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => localQuery<T>(sql, values), release: () => undefined };
}

export async function withTransaction<T>(fn: (client: PoolClient | LocalClient) => Promise<T>) {
  if (modoLocal()) {
    const database = getLocalDb();
    database.exec('BEGIN');
    try {
      const result = await fn(localClient());
      database.exec('COMMIT');
      return result;
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
  const client = await (getDb() as Pool).connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function verificarDb() {
  if (modoLocal()) return String(getLocalDb().prepare("select datetime('now') as agora").get()?.agora ?? '');
  const result = await dbQuery<{ agora: string }>('select now() as agora');
  return result.rows[0]?.agora ?? null;
}
