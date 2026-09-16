import { NextResponse } from 'next/server';
import { dbQuery, withTransaction, type DbClient } from '@/lib/server-db';
import { getLocalDb } from '@/lib/local-db';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';
import { randomUUID } from 'node:crypto';

export const runtime = 'nodejs';

type Entidade = 'departamento' | 'funcionario' | 'ferias';
type Operacao = 'CREATE' | 'UPDATE' | 'DELETE';
type Envelope = { operacaoId?: unknown; dispositivoId?: unknown; entidade?: Entidade; entidadeId?: unknown; operacao?: Operacao; versaoLocal?: unknown; payload?: unknown };
type EventoValido = { operacaoId: string; dispositivoId: string; entidade: Entidade; entidadeId: string; operacao: Operacao; versaoLocal: number; payload?: unknown };
type SessaoSync = { utilizadorId: string | null; papel: 'Administrador' | 'RH' | 'Outro' };

const CAMPOS: Record<Entidade, Set<string>> = {
  departamento: new Set(['nome','ativo','criado_em','atualizado_em','versao']),
  funcionario: new Set(['processo','nome','nuit','bi','contacto','departamento_id','cargo','tipo_contrato','data_admissao','fim_contrato','ativo','criado_por','atualizado_por','criado_em','atualizado_em','versao']),
  ferias: new Set(['funcionario_id','inicio','fim','dias','estado','criado_por','atualizado_por','criado_em','atualizado_em','versao']),
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const localMode = () => (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local';
const centralUrl = () => text(process.env.CENTRAL_API_URL).replace(/\/$/, '');
const syncToken = () => text(process.env.SYNC_TOKEN);

function tabela(entidade: Entidade) { return entidade === 'departamento' ? 'departamentos' : entidade === 'funcionario' ? 'funcionarios' : 'ferias'; }
function payloadSeguro(entidade: Entidade, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload obrigatório.');
  const origem = payload as Record<string, unknown>;
  const campos = Object.keys(origem).filter((key) => CAMPOS[entidade].has(key) && key !== 'versao');
  return { campos, valores: campos.map((key) => origem[key]) };
}

async function aplicarEventoCentral(client: DbClient, item: EventoValido, sessao: SessaoSync) {
  const nomeTabela = tabela(item.entidade);
  const atualResult = await client.query<Record<string, unknown>>(`select * from ${nomeTabela} where id=$1`, [item.entidadeId]);
  const atual = atualResult.rows[0];
  const versaoServidor = Number(atual?.versao || 1);
  if (item.operacao !== 'CREATE' && (!atual || versaoServidor !== item.versaoLocal)) {
    await client.query(`insert into sincronizacao_conflitos(operacao_id,entidade,entidade_id,payload_local,payload_servidor,criado_em) values($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) on conflict(operacao_id) do nothing`, [item.operacaoId,item.entidade,item.entidadeId,JSON.stringify(item.payload ?? null),atual ? JSON.stringify(atual) : null]);
    return { status: 'CONFLITO' as const, versaoServidor };
  }
  if (item.operacao === 'CREATE') {
    if (atual) return { status: 'CONFLITO' as const, versaoServidor };
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (!campos.length) throw new Error('Payload sem campos válidos.');
    const placeholders = campos.map((_, index) => `$${index + 2}`);
    await client.query(`insert into ${nomeTabela}(id,${campos.join(',')},versao) values($1,${placeholders.join(',')},1)`, [item.entidadeId, ...valores]);
  } else if (item.operacao === 'UPDATE') {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (campos.length) {
      const sets = campos.map((key, index) => `${key}=$${index + 2}`);
      await client.query(`update ${nomeTabela} set ${sets.join(',')},versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId, ...valores]);
    }
  } else {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    if (item.entidade === 'funcionario' || item.entidade === 'departamento') await client.query(`update ${nomeTabela} set ativo=false,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$1`, [item.entidadeId]);
    else await client.query(`delete from ${nomeTabela} where id=$1`, [item.entidadeId]);
  }
  const novo = (await client.query(`select * from ${nomeTabela} where id=$1`, [item.entidadeId])).rows[0];
  await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO') on conflict(operacao_id) do nothing`, [item.dispositivoId,item.operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal]);
  await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values($1,$2,'SYNC',$3,$4,'sync',$5,$6)`, [item.entidade,item.entidadeId,sessao.utilizadorId,item.dispositivoId,atual ? JSON.stringify(atual) : null,novo ? JSON.stringify(novo) : null]);
  return { status: 'PROCESSADO' as const, versaoServidor: Number(novo?.versao || 1) };
}

async function centralPost(eventos: EventoValido[]) {
  if (!centralUrl() || !syncToken()) throw new Error('Sincronização central não configurada. Defina CENTRAL_API_URL e SYNC_TOKEN.');
  const response = await fetch(`${centralUrl()}/api/sync`, { method:'POST', headers:{'Content-Type':'application/json','x-sync-token':syncToken(),'x-sync-device-id':eventos[0]?.dispositivoId || ''}, body:JSON.stringify({eventos}) });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) throw new Error(body?.erro || `Servidor central recusou a sincronização (${response.status}).`);
  return body as { ok:true; resultados:Array<{operacaoId:string;status:string;versaoServidor?:number;mensagem?:string}> };
}

function ensureState() {
  const db = getLocalDb();
  db.exec('CREATE TABLE IF NOT EXISTS sincronizacao_estado (chave TEXT PRIMARY KEY, valor TEXT NOT NULL)');
  return db;
}
function localState(key: string) { return ensureState().prepare('select valor from sincronizacao_estado where chave=?').get(key) as { valor?: string } | undefined; }
function setLocalState(key: string, value: string) { ensureState().prepare('insert into sincronizacao_estado(chave,valor) values(?,?) on conflict(chave) do update set valor=excluded.valor').run(key,value); }
function deviceId() { const configured = text(process.env.SYNC_DEVICE_ID); if (configured) return configured; const current = localState('device_id')?.valor; if (current) return current; const id = `windows-${randomUUID()}`; setLocalState('device_id', id); return id; }

function parseJson(value: unknown) { if (!value) return null; if (typeof value === 'string') return JSON.parse(value); return value; }
function payloadDoAudit(row: Record<string, unknown>) { const raw = row.operacao === 'DELETE' ? row.antes : row.depois; const payload = parseJson(raw); if (!payload) throw new Error('Auditoria sem payload para sincronização.'); return payload; }
function versaoAnterior(row: Record<string, unknown>) { const antes = parseJson(row.antes) as Record<string,unknown> | null; return Number(antes?.versao || 1); }

async function enviarAlteracoesLocais() {
  const db = getLocalDb(); const id=deviceId(); const cursor=localState('push_cursor')?.valor || '1970-01-01T00:00:00.000Z';
  const rows=db.prepare(`select id,entidade,entidade_id,operacao,antes,depois,criado_em,dispositivo_id from auditoria where criado_em>? and origem<>'sync' and operacao in ('CREATE','UPDATE','DELETE') and entidade in ('departamento','funcionario','ferias') order by criado_em asc,id asc limit 100`).all(cursor) as Array<Record<string,unknown>>;
  if(!rows.length) return { enviados:0, conflitos:0, erros:0, pushCursor:cursor };
  const eventos:EventoValido[]=rows.map(row=>({operacaoId:String(row.id),dispositivoId:String(row.dispositivo_id||id),entidade:row.entidade as Entidade,entidadeId:String(row.entidade_id),operacao:row.operacao as Operacao,versaoLocal:versaoAnterior(row),payload:payloadDoAudit(row)}));
  const resposta=await centralPost(eventos); let conflitos=0,erros=0,enviados=0;
  for(const r of resposta.resultados){if(r.status==='PROCESSADO')enviados++;else if(r.status==='CONFLITO')conflitos++;else erros++;}
  if(conflitos===0&&erros===0)setLocalState('push_cursor',String(rows[rows.length-1].criado_em));
  return { enviados, conflitos, erros, pushCursor:localState('push_cursor')?.valor||cursor };
}

function aplicarPullLocal(evento: Record<string,unknown>) {
  const db=getLocalDb(); const entidade=String(evento.entidade) as Entidade; const id=String(evento.entidade_id); const operacao=String(evento.operacao) as Operacao; const tabelaNome=tabela(entidade); const payload=parseJson(evento.depois) as Record<string,unknown>|null;
  if(operacao==='DELETE') { if(entidade==='ferias')db.prepare(`delete from ${tabelaNome} where id=?`).run(id); else db.prepare(`update ${tabelaNome} set ativo=0,versao=versao+1,atualizado_em=? where id=?`).run(new Date().toISOString(),id); }
  else if(payload){ const campos=Object.keys(payload).filter(k=>CAMPOS[entidade].has(k)); if(!campos.length)return; const existe=db.prepare(`select id from ${tabelaNome} where id=?`).get(id); const values=campos.map(k=>payload[k]); if(!existe){const cols=['id',...campos];db.prepare(`insert into ${tabelaNome}(${cols.join(',')}) values(${cols.map(()=>'?').join(',')})`).run(id,...values);} else db.prepare(`update ${tabelaNome} set ${campos.map(k=>`${k}=?`).join(',')} where id=?`).run(...values,id); }
  db.prepare(`insert or ignore into auditoria_local(id,entidade,entidade_id,operacao,dispositivo_id,origem,antes_json,depois_json,criado_em) values(?,?,?,?,?,'sync',NULL,?,?)`).run(randomUUID(),entidade,id,operacao,deviceId(),payload?JSON.stringify(payload):null,new Date().toISOString());
}

async function receberAlteracoesCentrais() {
  if(!centralUrl()||!syncToken())throw new Error('Sincronização central não configurada. Defina CENTRAL_API_URL e SYNC_TOKEN.');
  const since=localState('pull_cursor')?.valor||'1970-01-01T00:00:00.000Z';
  const response=await fetch(`${centralUrl()}/api/sync?since=${encodeURIComponent(since)}&limit=100`,{headers:{'x-sync-token':syncToken(),'x-sync-device-id':deviceId()}}); const body=await response.json().catch(()=>null);
  if(!response.ok||!body?.ok)throw new Error(body?.erro||`Servidor central recusou a receção (${response.status}).`);
  const eventos=Array.isArray(body.eventos)?body.eventos as Array<Record<string,unknown>>:[]; for(const evento of eventos)aplicarPullLocal(evento); if(body.cursor)setLocalState('pull_cursor',String(body.cursor));
  return { recebidos:eventos.length, pullCursor:localState('pull_cursor')?.valor||since };
}
async function sincronizarLocal(){const enviados=await enviarAlteracoesLocais();const recebidos=await receberAlteracoesCentrais();return{ok:true,...enviados,...recebidos};}

async function sessaoOuToken(request:Request){const token=text(request.headers.get('x-sync-token'));if(token&&syncToken()&&token===syncToken())return{utilizadorId:null,papel:'Administrador' as const,token:true};const sessao=await exigirSessao();return{...sessao,token:false};}

export async function GET(request:Request){try{const url=new URL(request.url);const token=text(request.headers.get('x-sync-token'));
  if(token&&syncToken()&&token===syncToken()){if(localMode())return NextResponse.json({ok:false,erro:'Endpoint central configurado em modo local.'},{status:503});const since=url.searchParams.get('since')||'1970-01-01T00:00:00.000Z';const limit=Math.min(Math.max(Number(url.searchParams.get('limit')||100),1),100);const device=text(request.headers.get('x-sync-device-id'));const result=await dbQuery(`select id,entidade,entidade_id,operacao,antes,depois,criado_em as "criadoEm",dispositivo_id as "dispositivoId" from auditoria where criado_em>$1 and origem<>'sync' and operacao in ('CREATE','UPDATE','DELETE') and entidade in ('departamento','funcionario','ferias') order by criado_em asc,id asc limit ${limit}`,[since]);const eventos=result.rows.filter((row:any)=>row.dispositivoId!==device);const cursor=eventos.length?String((eventos[eventos.length-1] as any).criadoEm):since;return NextResponse.json({ok:true,eventos,cursor});}
  if(!localMode())return NextResponse.json({ok:true,eventos:[],cursor:new Date().toISOString()});const sessao=await exigirSessao();if(!temPermissao(sessao.papel,'funcionarios')&&!temPermissao(sessao.papel,'ferias'))throw new Error('FORBIDDEN');return NextResponse.json(await sincronizarLocal());
}catch(error){if(error instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(error.message))return respostaAutorizacao(error);return NextResponse.json({ok:false,erro:error instanceof Error?error.message:'Não foi possível sincronizar.'},{status:500});}}

export async function POST(request:Request){try{const token=text(request.headers.get('x-sync-token'));const body=await request.json() as {eventos?:Envelope[]};
  if(token&&syncToken()&&token===syncToken()){if(localMode())return NextResponse.json({ok:false,erro:'Endpoint central configurado em modo local.'},{status:503});const eventos=Array.isArray(body.eventos)?body.eventos:[];if(eventos.length>100)return NextResponse.json({ok:false,erro:'Lote demasiado grande.'},{status:400});const resultados=[] as Array<{operacaoId:string|null;status:string;mensagem?:string;versaoServidor?:number}>;for(const item of eventos){const operacaoId=text(item.operacaoId),dispositivoId=text(item.dispositivoId),versaoLocal=Number(item.versaoLocal);if(!operacaoId||!dispositivoId||!item.entidade||!item.entidadeId||!item.operacao||!Number.isInteger(versaoLocal)||versaoLocal<1){resultados.push({operacaoId:operacaoId||null,status:'ERRO',mensagem:'Evento inválido.'});continue;}try{const existente=await dbQuery<{status:string}>('select status from sincronizacao_eventos where operacao_id=$1 limit 1',[operacaoId]);if(existente.rows[0]){resultados.push({operacaoId,status:existente.rows[0].status==='CONFLITO'?'CONFLITO':'PROCESSADO'});continue;}const result=await withTransaction(client=>aplicarEventoCentral(client,{operacaoId,dispositivoId,entidade:item.entidade,entidadeId:String(item.entidadeId),operacao:item.operacao,versaoLocal,payload:item.payload},{utilizadorId:null,papel:'Administrador'}));resultados.push({operacaoId,...result});}catch(error){resultados.push({operacaoId,status:'ERRO',mensagem:error instanceof Error?error.message:'Erro de sincronização.'});}}return NextResponse.json({ok:true,resultados});}
  const sessao=await sessaoOuToken(request);if(!temPermissao(sessao.papel,'funcionarios')&&!temPermissao(sessao.papel,'ferias'))throw new Error('FORBIDDEN');if(localMode()&&(!Array.isArray(body.eventos)||body.eventos.length===0))return NextResponse.json(await sincronizarLocal());if(localMode())return NextResponse.json({ok:false,erro:'Em modo local, a sincronização deve ser iniciada sem eventos.'},{status:400});return NextResponse.json({ok:true,resultados:[]});
}catch(error){if(error instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(error.message))return respostaAutorizacao(error);return NextResponse.json({ok:false,erro:error instanceof Error?error.message:'Não foi possível processar a sincronização.'},{status:500});}}
