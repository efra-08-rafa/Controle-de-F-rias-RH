import 'server-only';

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let db: Database.Database | undefined;

function getPath() {
  return process.env.LOCAL_DATABASE_PATH || path.join(process.cwd(), 'data', 'controle-ferias.sqlite');
}

function schemaPath() {
  return path.join(process.cwd(), 'database', 'sqlite-schema.sql');
}

export function getLocalDb() {
  if (!db) {
    const filename = getPath();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    db = new Database(filename);
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(schemaPath(), 'utf8'));
  }
  return db;
}

export function localQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  return getLocalDb().prepare(sql).all(...params) as T[];
}

export function localRun(sql: string, params: unknown[] = []) {
  return getLocalDb().prepare(sql).run(...params);
}

export function localTransaction<T>(fn: (database: Database.Database) => T) {
  return getLocalDb().transaction(fn)();
}

export function verificarDbLocal() {
  const rows = getLocalDb().prepare("select datetime('now') as agora").all() as Array<{ agora?: string }>;
  return rows[0]?.agora ?? null;
}
