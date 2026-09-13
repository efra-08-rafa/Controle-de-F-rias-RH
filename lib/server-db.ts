import 'server-only';

import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { getLocalDb } from './local-db';

let pool: Pool | undefined;

type DbResult<T> = { rows: T[]; rowCount: number };
export type DbClient = { query: <T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) => Promise<DbResult<T>> };
type LocalResult<T> = DbResult<T>;

function modoLocal() { return (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local'; }
function getDatabaseUrl() { const value = process.env.DATABASE_URL; if (!value) throw new Error('DATABASE_URL não configurada no ambiente do servidor.'); return value; }

// PostgreSQL usa $1, $2... e permite reutilizar o mesmo parâmetro.
// No SQLite usamos '?' simples e reconstruímos a lista de valores na mesma
// ordem das ocorrências. Assim $7,$7 recebe exatamente dois valores, ambos
// vindos de values[6], sem gerar o erro "Too many parameter values".
function adaptarSqlite(sql: string, values: unknown[]) {
  const boundValues: unknown[] = [];
  const adaptedSql = sql.replace(/\$(\d+)/g, (_match, indexText: string) => {
    const index = Number(indexText);
    if (!Number.isInteger(index) || index < 1 || index > values.length) {
      throw new Error(`Parâmetro SQL inválido: $${indexText}`);
    }
    boundValues.push(values[index - 1]);
    return '?';
  });
  return { sql: adaptedSql, values: boundValues };
}

function localQuery<T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []): LocalResult<T> {
  const adapted = adaptarSqlite(sql, values);
  const statement = getLocalDb().prepare(adapted.sql);
  const normalized = sql.trim().toLowerCase();
  if (normalized.startsWith('select') || normalized.startsWith('with') || normalized.startsWith('pragma')) {
    const rows = statement.all(...adapted.values) as T[];
    return { rows, rowCount: rows.length };
  }
  if (normalized.includes('returning')) {
    const rows = statement.all(...adapted.values) as T[];
    return { rows, rowCount: rows.length };
  }
  const result = statement.run(...adapted.values);
  return { rows: [], rowCount: result.changes };
}

export function getDb() {
  if (modoLocal()) return getLocalDb();
  if (!pool) pool = new Pool({ connectionString: getDatabaseUrl(), max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000, ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false } });
  return pool;
}

export async function dbQuery<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
  if (modoLocal()) return localQuery<T>(text, values) as unknown as QueryResult<T>;
  return (getDb() as Pool).query<T>(text, values);
}

function localClient(): DbClient {
  return { query: async <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => localQuery<T>(sql, values) };
}

function postgresClient(client: PoolClient): DbClient {
  return { query: async <T extends QueryResultRow = QueryResultRow>(sql: string, values: unknown[] = []) => { const result = await client.query<T>(sql, values); return { rows: result.rows, rowCount: result.rowCount ?? 0 }; } };
}

export async function withTransaction<T>(fn: (client: DbClient) => Promise<T>) {
  if (modoLocal()) {
    const database = getLocalDb(); database.exec('BEGIN');
    try { const result = await fn(localClient()); database.exec('COMMIT'); return result; }
    catch (error) { database.exec('ROLLBACK'); throw error; }
  }
  const client = await (getDb() as Pool).connect();
  try { await client.query('BEGIN'); const result = await fn(postgresClient(client)); await client.query('COMMIT'); return result; }
  catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function verificarDb() {
  if (modoLocal()) {
    const row = getLocalDb().prepare("select datetime('now') as agora").get() as { agora?: string } | undefined;
    return row?.agora ?? null;
  }
  const result = await dbQuery<{ agora: string }>('select now() as agora');
  return result.rows[0]?.agora ?? null;
}
