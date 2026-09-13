export type StorageMode = 'local' | 'postgres';
export type StorageEntity = 'funcionario' | 'ferias' | 'utilizador';

/**
 * Contrato estável da aplicação.
 * A interface de negócio não deve depender diretamente de PostgreSQL ou SQLite.
 * Hoje DATABASE_MODE=local usa SQLite; no futuro pode apontar para PostgreSQL
 * ou para outro adaptador compatível sem alterar as páginas.
 */
export type StorageConfig = {
  mode: StorageMode;
  databasePath?: string;
  databaseUrl?: string;
};

export function getStorageConfig(): StorageConfig {
  const mode = (process.env.DATABASE_MODE || 'local').toLowerCase() === 'postgres' ? 'postgres' : 'local';
  return {
    mode,
    databasePath: process.env.LOCAL_DATABASE_PATH,
    databaseUrl: mode === 'postgres' ? process.env.DATABASE_URL : undefined,
  };
}
