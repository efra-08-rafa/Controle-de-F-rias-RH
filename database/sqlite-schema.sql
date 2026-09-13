-- Banco local SQLite para o modo offline.
-- A estrutura espelha o banco central, mas não guarda palavras-passe em texto simples.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS departamentos (id TEXT PRIMARY KEY,nome TEXT NOT NULL UNIQUE,ativo INTEGER NOT NULL DEFAULT 1,criado_em TEXT NOT NULL DEFAULT (datetime('now')),atualizado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS utilizadores (id TEXT PRIMARY KEY,login TEXT NOT NULL UNIQUE,nome TEXT NOT NULL,papel TEXT NOT NULL CHECK (papel IN ('Administrador','RH','Outro')),password_hash TEXT NOT NULL,ativo INTEGER NOT NULL DEFAULT 1,versao INTEGER NOT NULL DEFAULT 1,criado_em TEXT NOT NULL DEFAULT (datetime('now')),atualizado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS funcionarios (id TEXT PRIMARY KEY,processo TEXT NOT NULL UNIQUE,nome TEXT NOT NULL,nuit TEXT,bi TEXT,contacto TEXT,departamento_id TEXT,cargo TEXT,tipo_contrato TEXT NOT NULL CHECK (tipo_contrato IN ('Permanente','Contratado')),data_admissao TEXT NOT NULL,fim_contrato TEXT,ativo INTEGER NOT NULL DEFAULT 1,versao INTEGER NOT NULL DEFAULT 1,criado_por TEXT,atualizado_por TEXT,criado_em TEXT NOT NULL DEFAULT (datetime('now')),atualizado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ferias (id TEXT PRIMARY KEY,funcionario_id TEXT NOT NULL,inicio TEXT NOT NULL,fim TEXT NOT NULL,dias INTEGER NOT NULL CHECK (dias > 0),estado TEXT NOT NULL,versao INTEGER NOT NULL DEFAULT 1,criado_por TEXT,atualizado_por TEXT,criado_em TEXT NOT NULL DEFAULT (datetime('now')),atualizado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS fila_sincronizacao (id TEXT PRIMARY KEY,operacao_id TEXT UNIQUE,entidade TEXT NOT NULL,entidade_id TEXT NOT NULL,operacao TEXT NOT NULL CHECK (operacao IN ('CREATE','UPDATE','DELETE')),payload_json TEXT NOT NULL,criado_em TEXT NOT NULL,tentativas INTEGER NOT NULL DEFAULT 0,ultimo_erro TEXT);
CREATE TABLE IF NOT EXISTS sincronizacao_eventos (id TEXT PRIMARY KEY,dispositivo_id TEXT NOT NULL,operacao_id TEXT NOT NULL UNIQUE,entidade TEXT NOT NULL,entidade_id TEXT,operacao TEXT NOT NULL,versao_local INTEGER,recebido_em TEXT NOT NULL,processado_em TEXT,status TEXT NOT NULL,mensagem_erro TEXT);
CREATE TABLE IF NOT EXISTS auditoria_local (id TEXT PRIMARY KEY,entidade TEXT NOT NULL,entidade_id TEXT,operacao TEXT NOT NULL,utilizador_id TEXT,dispositivo_id TEXT NOT NULL,origem TEXT NOT NULL DEFAULT 'offline',antes_json TEXT,depois_json TEXT,criado_em TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sincronizacao_conflitos (id TEXT PRIMARY KEY,operacao_id TEXT NOT NULL UNIQUE,entidade TEXT NOT NULL,entidade_id TEXT NOT NULL,payload_local TEXT NOT NULL,payload_servidor TEXT,criado_em TEXT NOT NULL,resolvido_em TEXT,resolucao TEXT);

INSERT OR IGNORE INTO departamentos (id,nome,ativo,atualizado_em) VALUES ('dep-administracao','Administração',1,datetime('now')),('dep-serracao','Serração',1,datetime('now')),('dep-vendas','Vendas',1,datetime('now')),('dep-carpintaria','Carpintaria',1,datetime('now')),('dep-manutencao','Manutenção',1,datetime('now')),('dep-mecanica','Mecânica',1,datetime('now')),('dep-segurancas','Seguranças',1,datetime('now'));
CREATE INDEX IF NOT EXISTS idx_funcionarios_departamento ON funcionarios(departamento_id);
CREATE INDEX IF NOT EXISTS idx_ferias_funcionario ON ferias(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_fila_sync ON fila_sincronizacao(criado_em);
CREATE INDEX IF NOT EXISTS idx_auditoria_local ON auditoria_local(entidade,entidade_id);
CREATE INDEX IF NOT EXISTS idx_sync_eventos_status ON sincronizacao_eventos(status);
