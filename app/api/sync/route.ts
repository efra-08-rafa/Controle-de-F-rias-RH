import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/server-db';
import { getLocalDb } from '@/lib/local-db';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

type Entidade = 'departamento' | 'funcionario' | 'ferias';
type Operacao = 'CREATE' | 'UPDATE' | 'DELETE';
type Envelope = { operacaoId?: unknown; dispositivoId?: unknown; entidade?: unknown; entidadeId?: unknown; operacao?: unknown; versaoLocal?: unknown; payload?: unknown };
type EventoValido = { operacaoId: string; dispositivoId: string; entidade: Entidade; entidadeId: string; operacao: Operacao; versaoLocal: number; payload?: unknown };

const CAMPOS: Record<Entidade, Set<string>> = {
  departamento: new Set(['nome', 'ativo', 'criado_em', 'atualizado_em', 'versao']),
  funcionario: new Set(['processo', 'nome', 'nuit', 'bi', 'contacto', 'departamento_id', 'cargo', 'tipo_contrato', 'data_admissao', 'fim_contrato', 'ativo', 'criado_por', 'atualizado_por', 'criado_em', 'atualizado_em', 'versao']),
  ferias: new Set(['funcionario_id', 'inicio', 'fim', 'dias', 'estado', 'criado_por', 'atualizado_por', 'criado_em', 'atualizado_em', 'versao']),
};

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const isEntidade = (value: unknown): value is Entidade => value === 'departamento' || value === 'funcionario' || value === 'ferias';
const isOperacao = (value: unknown): value is Operacao => value === 'CREATE' || value === 'UPDATE' || value === 'DELETE';
const localMode = () => (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local';
const centralUrl = () => text(process.env.CENTRAL_API_URL).replace(/\/$/, '');
const syncToken = () => text(process.env.SYNC_TOKEN);

function tabela(entidade: Entidade) {
  if (entidade === 'departamento') return 'departamentos';
  if (entidade === 'funcionario') return 'funcionarios';
  return 'ferias';
}

function payloadSeguro(entidade: Entidade, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload obrigatório.');
  const origem = payload as Record<string, unknown>;
  const campos = Object.keys(origem).filter((key) => CAMPOS[entidade].has(key) && key !== 'versao');
  return { campos, valores: campos.map((key) => origem[key]) };
}

function validarEvento(item: Envelope): EventoValido | null {
  const operacaoId = text(item.operacaoId);
  const dispositivoId = text(item.dispositivoId);
  const entidadeId = text(item.entidadeId);
  const versaoLocal = Number(item.versaoLocal);
  if (!operacaoId || !dispositivoId || !entidadeId || !isEntidade(item.entidade) || !isOperacao(item.operacao) || !Number.isInteger(versaoLocal) || versaoLocal < 1) return null;
  return { operacaoId, dispositivoId, entidade: item.entidade, entidadeId, operacao: item.operacao, versaoLocal, payload: item.payload };
}

function ensureState() {
  const db = getLocalDb();
  db.exec('CREATE TABLE IF NOT EXISTS sincronizacao_estado (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  return db;
}
function localState(key: string) {
  return ensureState().prepare('select valor from sincronizacao_estado where chave=?').get(key) as { valor?: string } | undefined;
}
function setLocalState(key: string, value: string) {
  ensureState().prepare('insert into sincronizacao_estado(chave,valor) values(?,?) on conflict(chave) do update set valor=excluded.valor').run(key, value);
}
function deviceId() {
  const configured = text(process.env.SYNC_DEVICE_ID);
  if (configured) return configured;
  const current = localState('device_id')?.valor;
  if (current) return current;
  const id = `windows-${randomUUID()}`;
  setLocalState('device_id', id);
  return id;
}
function parseJson(value: unknown) {
  if (!value) return null;
  if (typeof value === 'string') return JSON.parse(value);
  return value;
}
function payloadDoAudit(row: Record<string, unknown>) {
  const payload = parseJson(row.operacao === 'DELETE' ? row.antes : row.depois);
  if (!payload) throw new Error('Auditoria sem payload para sincronização.');
  return payload;
}
function versaoAnterior(row: Record<string, unknown>) {
  const antes = parseJson(row.antes) as Record<string, unknown> | null;
  return Number(antes?.versao || 1);
}

async function aplicarEventoCentral(item: EventoValido) {
  const nomeTabela = tabela(item.entidade);
  const atualResult = await dbQuery<Record<string, unknown>>(`select * from ${nomeTabela} where id=$1`, [item.entidadeId]);
  const atual = atualResult.rows[0];
  const versaoServidor = Number(atual?.versao || 1);

  if (item.operacao !== 'CREATE' && (!atual || versaoServidor !== item.versaoLocal)) {
    await dbQuery(`insert into sincronizacao_conflitos(operacao_id,entidade,entidade_id,payload_local,payload_servidor,criado_em) values($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) on conflict(operacao_id) do nothing`, [item.operacaoId, item.entidade, item.entidadeId, JSON.stringify(item.payload ?? null), atual ? JSON.stringify(atual) : null]);
    return { status: 'CONFLITO', versaoServidor };
  }

  if (item.operacao === 'CREATE') {
    if (atual) return { status: 'CONFLITO', versaoServidor };
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (!campos.length) throw new Error('Payload sem campos válidos.');
    const placeholders = campos.map((_, index) => `$${index + 2}`);
    await dbQuery(`insert into ${nomeTabela}(id,${campos.join(',')},versao) values($1,${placeholders.join(',')},1)`, [item.entidadeId, ...valores]);
  } else if (item.operacao === 'UPDATE') {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (campos.length) {
      const sets = campos.map((key, index) => `${key}=$${index + 2}`);
      await dbQuery(`update ${nomeTabela} set ${sets.join(',')},versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId, ...valores]);
    }
  } else {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    if (item.entidade === 'ferias') await dbQuery(`delete from ${nomeTabela} where id=$1`, [item.entidadeId]);
    else await dbQuery(`update ${nomeTabela} set ativo=false,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$1`, [item.entidadeId]);
  }

  const novo = (await dbQuery(`select * from ${nomeTabela} where id=$1`, [item.entidadeId])).rows[0];
  await dbQuery(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO') on conflict(operacao_id) do nothing`, [item.dispositivoId, item.operacaoId, item.entidade, item.entidadeId, item.operacao, item.versaoLocal]);
  await dbQuery(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values($1,$2,'SYNC',NULL,$3,'sync',$4,$5)`, [item.entidade, item.entidadeId, item.dispositivoId, atual ? JSON.stringify(atual) : null, novo ? JSON.stringify(novo) : null]);
  return { status: 'PROCESSADO', versaoServidor: Number(novo?.versao || 1) };
}

async function centralPost(eventos: EventoValido[]) {
  if (!centralUrl() || !syncToken()) throw new Error('Sincronização central não configurada. Defina CENTRAL_API_URL e SYNC_TOKEN.');
  const response = await fetch(`${centralUrl()}/api/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-sync-token': syncToken(), 'x-sync-device-id': eventos[0]?.dispositivoId || '' },
    body: JSON.stringify({ eventos }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(body?.erro || `Servidor central recusou a sincronização (${response.status}).`);
  return body as { ok: true; resultados: Array<{ operacaoId: string; status: string; versaoServidor?: number; mensagem?: string }> };
}

async function enviarAlteracoesLocais() {
  const db = getLocalDb();
  const id = deviceId();
  const cursor = localState('push_cursor')?.valor || '1970-01-01T00:00:00.000Z';
  const rows = db.prepare(`select id,entidade,entidade_id,operacao,antes,depois,criado_em,dispositivo_id from auditoria where criado_em>? and origem<>'sync' and operacao in ('CREATE','UPDATE','DELETE') and entidade in ('departamento','funcionario','ferias') order by criado_em asc,id asc limit 100`).all(cursor) as Array<Record<string, unknown>>;
  if (!rows.length) return { enviados: 0, conflitos: 0, erros: 0, pushCursor: cursor };
  const eventos: EventoValido[] = rows.map((row) => ({ operacaoId: String(row.id), dispositivoId: String(row.dispositivo_id || id), entidade: row.entidade as Entidade, entidadeId: String(row.entidade_id), operacao: row.operacao as Operacao, versaoLocal: versaoAnterior(row), payload: payloadDoAudit(row) }));
  const resposta = await centralPost(eventos);
  let conflitos = 0;
  let erros = 0;
  let enviados = 0;
  for (const resultado of resposta.resultados) {
    if (resultado.status === 'PROCESSADO') enviados++;
    else if (resultado.status === 'CONFLITO') conflitos++;
    else erros++;
  }
  if (conflitos === 0 && erros === 0) setLocalState('push_cursor', String(rows[rows.length - 1].criado_em));
  return { enviados, conflitos, erros, pushCursor: localState('push_cursor')?.valor || cursor };
}

function aplicarPullLocal(evento: Record<string, unknown>) {
  const entidadeValue = evento.entidade;
  const operacaoValue = evento.operacao;
  if (!isEntidade(entidadeValue) || !isOperacao(operacaoValue)) return;
  const entidade = entidadeValue;
  const operacao = operacaoValue;
  const db = getLocalDb();
  const id = String(evento.entidade_id);
  const nomeTabela = tabela(entidade);
  const payload = parseJson(evento.depois) as Record<string, unknown> | null;

  if (operacao === 'DELETE') {
    if (entidade === 'ferias') db.prepare(`delete from ${nomeTabela} where id=?`).run(id);
    else db.prepare(`update ${nomeTabela} set ativo=0,versao=versao+1,atualizado_em=? where id=?`).run(new Date().toISOString(), id);
  } else if (payload) {
    const campos = Object.keys(payload).filter((key) => CAMPOS[entidade].has(key));
    if (!campos.length) return;
    const existe = db.prepare(`select id from ${nomeTabela} where id=?`).get(id);
    const values = campos.map((key) => payload[key]);
    if (!existe) {
      const cols = ['id', ...campos];
      db.prepare(`insert into ${nomeTabela}(${cols.join(',')}) values(${cols.map(() => '?').join(',')})`).run(id, ...values);
    } else {
      db.prepare(`update ${nomeTabela} set ${campos.map((key) => `${key}=?`).join(',')} where id=?`).run(...values, id);
    }
  }
  db.prepare(`insert or ignore into auditoria_local(id,entidade,entidade_id,operacao,dispositivo_id,origem,antes_json,depois_json,criado_em) values(?,?,?,?,?,'sync',NULL,?,?)`).run(randomUUID(), entidade, id, operacao, deviceId(), payload ? JSON.stringify(payload) : null, new Date().toISOString());
}

async function receberAlteracoesCentrais() {
  if (!centralUrl() || !syncToken()) throw new Error('Sincronização central não configurada. Defina CENTRAL_API_URL e SYNC_TOKEN.');
  const since = localState('pull_cursor')?.valor || '1970-01-01T00:00:00.000Z';
  const response = await fetch(`${centralUrl()}/api/sync?since=${encodeURIComponent(since)}&limit=100`, { headers: { 'x-sync-token': syncToken(), 'x-sync-device-id': deviceId() } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(body?.erro || `Servidor central recusou a receção (${response.status}).`);
  const eventos = Array.isArray(body.eventos) ? body.eventos as Array<Record<string, unknown>> : [];
  for (const evento of eventos) aplicarPullLocal(evento);
  if (body.cursor) setLocalState('pull_cursor', String(body.cursor));
  return { recebidos: eventos.length, pullCursor: localState('pull_cursor')?.valor || since };
}

async function sincronizarLocal() {
  if (!centralUrl() || !syncToken()) return { ok: true, configurado: false, enviados: 0, recebidos: 0, conflitos: 0, erros: 0 };
  const enviados = await enviarAlteracoesLocais();
  const recebidos = await receberAlteracoesCentrais();
  return { ok: true, configurado: true, ...enviados, ...recebidos };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const token = text(request.headers.get('x-sync-token'));
    if (token && syncToken() && token === syncToken()) {
      if (localMode()) return NextResponse.json({ ok: false, erro: 'Endpoint central configurado em modo local.' }, { status: 503 });
      const since = url.searchParams.get('since') || '1970-01-01T00:00:00.000Z';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit') || 100), 1), 100);
      const device = text(request.headers.get('x-sync-device-id'));
      const result = await dbQuery(`select id,entidade,entidade_id,operacao,antes,depois,criado_em as "criadoEm",dispositivo_id as "dispositivoId" from auditoria where criado_em>$1 and origem<>'sync' and operacao in ('CREATE','UPDATE','DELETE') and entidade in ('departamento','funcionario','ferias') order by criado_em asc,id asc limit ${limit}`, [since]);
      const eventos = result.rows.filter((row: any) => row.dispositivoId !== device);
      const cursor = eventos.length ? String((eventos[eventos.length - 1] as any).criadoEm) : since;
      return NextResponse.json({ ok: true, eventos, cursor });
    }
    if (!localMode()) return NextResponse.json({ ok: true, eventos: [], cursor: new Date().toISOString() });
    const sessao = await exigirSessao();
    if (!temPermissao(sessao.papel, 'funcionarios') && !temPermissao(sessao.papel, 'ferias')) throw new Error('FORBIDDEN');
    return NextResponse.json(await sincronizarLocal());
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    return NextResponse.json({ ok: false, erro: error instanceof Error ? error.message : 'Não foi possível sincronizar.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = text(request.headers.get('x-sync-token'));
    const body = await request.json().catch(() => ({})) as { eventos?: Envelope[] };
    if (token && syncToken() && token === syncToken()) {
      if (localMode()) return NextResponse.json({ ok: false, erro: 'Endpoint central configurado em modo local.' }, { status: 503 });
      const envelopes = Array.isArray(body.eventos) ? body.eventos : [];
      if (envelopes.length > 100) return NextResponse.json({ ok: false, erro: 'Lote demasiado grande.' }, { status: 400 });
      const resultados: Array<{ operacaoId: string | null; status: string; mensagem?: string; versaoServidor?: number }> = [];
      for (const envelope of envelopes) {
        const evento = validarEvento(envelope);
        if (!evento) { resultados.push({ operacaoId: text(envelope.operacaoId) || null, status: 'ERRO', mensagem: 'Evento inválido.' }); continue; }
        try {
          const existente = await dbQuery<{ status: string }>('select status from sincronizacao_eventos where operacao_id=$1 limit 1', [evento.operacaoId]);
          if (existente.rows[0]) { resultados.push({ operacaoId: evento.operacaoId, status: existente.rows[0].status === 'CONFLITO' ? 'CONFLITO' : 'PROCESSADO' }); continue; }
          const resultado = await aplicarEventoCentral(evento);
          resultados.push({ operacaoId: evento.operacaoId, ...resultado });
        } catch (error) {
          resultados.push({ operacaoId: evento.operacaoId, status: 'ERRO', mensagem: error instanceof Error ? error.message : 'Erro de sincronização.' });
        }
      }
      return NextResponse.json({ ok: true, resultados });
    }

    if (!localMode()) return NextResponse.json({ ok: false, erro: 'Sincronização local indisponível no modo central.' }, { status: 503 });
    const sessao = await exigirSessao();
    if (!temPermissao(sessao.papel, 'funcionarios') && !temPermissao(sessao.papel, 'ferias')) throw new Error('FORBIDDEN');
    if (!Array.isArray(body.eventos) || body.eventos.length === 0) return NextResponse.json(await sincronizarLocal());
    return NextResponse.json({ ok: false, erro: 'Em modo local, a sincronização deve ser iniciada sem eventos.' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    return NextResponse.json({ ok: false, erro: error instanceof Error ? error.message : 'Não foi possível processar a sincronização.' }, { status: 500 });
  }
}
