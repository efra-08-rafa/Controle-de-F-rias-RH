import 'server-only';

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

let db: Database.Database | undefined;

function getPath() { return process.env.LOCAL_DATABASE_PATH || path.join(process.cwd(), 'data', 'controle-ferias.sqlite'); }
function schemaPath() { return path.join(process.cwd(), 'database', 'sqlite-schema.sql'); }

function garantirColunas(database: Database.Database) {
  const colunas = database.prepare('pragma table_info(departamentos)').all() as Array<{ name: string }>;
  if (!colunas.some((c) => c.name === 'versao')) database.exec('alter table departamentos add column versao integer not null default 1');
  database.exec("update departamentos set versao=1 where versao is null or versao<1");
}

function migrarIdsDepartamentos(database: Database.Database) {
  const mapa: Record<string,string> = {
    'dep-administracao':'00000000-0000-4000-8000-000000000001',
    'dep-serracao':'00000000-0000-4000-8000-000000000002',
    'dep-vendas':'00000000-0000-4000-8000-000000000003',
    'dep-carpintaria':'00000000-0000-4000-8000-000000000004',
    'dep-manutencao':'00000000-0000-4000-8000-000000000005',
    'dep-mecanica':'00000000-0000-4000-8000-000000000006',
    'dep-segurancas':'00000000-0000-4000-8000-000000000007',
  };
  const migrar = database.transaction(() => {
    for (const [antigo,novo] of Object.entries(mapa)) {
      const existeNovo = database.prepare('select id from departamentos where id=?').get(novo);
      if (existeNovo) {
        database.prepare('update funcionarios set departamento_id=? where departamento_id=?').run(novo, antigo);
        database.prepare('delete from departamentos where id=?').run(antigo);
      } else {
        database.prepare('update departamentos set id=? where id=?').run(novo, antigo);
      }
    }
  });
  migrar();
}

export function getLocalDb() {
  if (!db) {
    const filename = getPath();
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    db = new Database(filename);
    db.pragma('foreign_keys = ON');
    db.exec(fs.readFileSync(schemaPath(), 'utf8'));
    garantirColunas(db);
    migrarIdsDepartamentos(db);
  }
  return db;
}

export function localQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) { return getLocalDb().prepare(sql).all(...params) as T[]; }
export function localRun(sql: string, params: unknown[] = []) { return getLocalDb().prepare(sql).run(...params); }
export function localTransaction<T>(fn: (database: Database.Database) => T) { const database = getLocalDb(); database.exec('BEGIN TRANSACTION'); try { const result = fn(database); database.exec('COMMIT'); return result; } catch (error) { try { database.exec('ROLLBACK'); } catch {} throw error; } }
export function verificarDbLocal() { const rows = getLocalDb().prepare("select datetime('now') as agora").all() as Array<{ agora?: string }>; return rows[0]?.agora ?? null; }
