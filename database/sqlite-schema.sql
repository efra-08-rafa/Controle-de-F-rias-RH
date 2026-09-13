-- Banco local SQLite para o modo offline.
-- A estrutura espelha o banco central, mas não guarda palavras-passe.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departamentos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  ativo INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS funcionarios (
  id TEXT PRIMARY KEY,
  processo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  nuit TEXT,
  bi TEXT,
  contacto TEXT,
  departamento_id TEXT,
  cargo TEXT,
  tipo_contrato TEXT NOT NULL CHECK (tipo_contrato IN ('Permanente', 'Contratado')),
  data_admissao TEXT NOT NULL,
  fim_contrato TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (departamento_id) REFERENCES departamentos(id)
);

CREATE TABLE IF NOT EXISTS ferias (
  id TEXT PRIMARY KEY,
  funcionario_id TEXT NOT NULL,
  inicio TEXT NOT NULL,
  fim TEXT NOT NULL,
  dias INTEGER NOT NULL CHECK (dias > 0),
  estado TEXT NOT NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  atualizado_em TEXT NOT NULL,
  FOREIGN KEY (funcionario_id) REFERENCES funcionarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fila_sincronizacao (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL,
  entidade_id TEXT NOT NULL,
  operacao TEXT NOT NULL CHECK (operacao IN ('CREATE', 'UPDATE', 'DELETE')),
  payload_json TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  tentativas INTEGER NOT NULL DEFAULT 0,
  ultimo_erro TEXT
);

CREATE TABLE IF NOT EXISTS auditoria_local (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  operacao TEXT NOT NULL,
  utilizador_id TEXT,
  dispositivo_id TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'offline',
  antes_json TEXT,
  depois_json TEXT,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funcionarios_departamento ON funcionarios(departamento_id);
CREATE INDEX IF NOT EXISTS idx_ferias_funcionario ON ferias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fila_sync ON fila_sincronizacao(criado_em);
