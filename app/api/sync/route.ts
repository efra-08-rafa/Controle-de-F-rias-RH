import { NextResponse } from 'next/server';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';
import { dbQuery, withTransaction, type DbClient } from '@/lib/server-db';

type Envelope = { operacaoId?: unknown; dispositivoId?: unknown; entidade?: 'funcionario'|'ferias'|'utilizador'; entidadeId?: unknown; operacao?: 'CREATE'|'UPDATE'|'DELETE'; versaoLocal?: unknown; payload?: unknown };
type EventoValido = { operacaoId: string; dispositivoId: string; entidade: 'funcionario'|'ferias'|'utilizador'; entidadeId: string; operacao: 'CREATE'|'UPDATE'|'DELETE'; versaoLocal: number; payload?: unknown };

type Resultado = { status: 'PROCESSADO'|'CONFLITO'; versaoServidor?: number };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

function auditJson(index: number) {
  return `$${index}::jsonb`;
}

async function aplicarEvento(client: DbClient, item: EventoValido, sessao: Awaited<ReturnType<typeof exigirSessao>>): Promise<Resultado> {
  const tabela = item.entidade === 'funcionario' ? 'funcionarios' : item.entidade === 'ferias' ? 'ferias' : 'utilizadores';
  const atualResult = await client.query<Record<string, unknown>>(`select * from ${tabela} where id=$1`, [item.entidadeId]);
  const atual = atualResult.rows[0];
  const versaoServidor = Number(atual?.versao || 0);

  if (item.operacao !== 'CREATE' && (!atual || versaoServidor !== item.versaoLocal)) {
    await client.query(`insert into sincronizacao_conflitos(entidade,entidade_id,operacao_id,versao_local,versao_servidor,payload,estado) values($1,$2,$3,$4,$5,$6::jsonb,'ABERTO')`, [item.entidade,item.entidadeId,item.operacaoId,item.versaoLocal,versaoServidor,JSON.stringify(item.payload ?? null)]);
    return { status: 'CONFLITO', versaoServidor };
  }

  if (item.operacao === 'CREATE') {
    if (atual) return { status: 'CONFLITO', versaoServidor };
    const payload = item.payload as Record<string, unknown> | undefined;
    if (!payload) throw new Error('Payload obrigatório.');
    const campos = Object.keys(payload).filter((key) => !['id','versao','criado_em','atualizado_em'].includes(key));
    const valores = campos.map((key) => payload[key]);
    const placeholders = campos.map((_, index) => `$${index + 3}`);
    await client.query(`insert into ${tabela}(id,versao,${campos.join(',')}) values($1,1,${placeholders.join(',')})`, [item.entidadeId, item.versaoLocal, ...valores]);
  } else if (item.operacao === 'UPDATE') {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    const payload = item.payload as Record<string, unknown> | undefined;
    if (!payload) throw new Error('Payload obrigatório.');
    const campos = Object.keys(payload).filter((key) => !['id','versao','criado_em','atualizado_em'].includes(key));
    if (campos.length) {
      const valores = campos.map((key) => payload[key]);
      const sets = campos.map((key, index) => `${key}=$${index + 2}`);
      await client.query(`update ${tabela} set ${sets.join(',')},versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId, ...valores]);
    }
  } else {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    if (item.entidade === 'funcionario') await client.query(`update funcionarios set ativo=false,atualizado_por=$1,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$2`, [sessao.utilizadorId,item.entidadeId]);
    else if (item.entidade === 'utilizador') { if (sessao.papel !== 'Administrador') throw new Error('Sem permissão para sincronizar utilizadores.'); if (item.entidadeId === sessao.utilizadorId) throw new Error('Não pode bloquear a própria conta.'); await client.query(`update utilizadores set ativo=false,versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId]); }
    else await client.query(`delete from ferias where id=$1`, [item.entidadeId]);
  }
  const novo = (await client.query(`select * from ${tabela} where id=$1`, [item.entidadeId])).rows[0];
  await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO')`, [item.dispositivoId,item.operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal]);
  await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values($1,$2,'SYNC',$3,$4,'sync',${auditJson(6)},${auditJson(7)})`, [item.entidade,item.entidadeId,sessao.utilizadorId,item.dispositivoId,atual ? JSON.stringify(atual) : null,novo ? JSON.stringify(novo) : null]);
  return { status: 'PROCESSADO' as const, versaoServidor: Number(novo?.versao || 0) };
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao(); if (!temPermissao(sessao.papel,'funcionarios') && !temPermissao(sessao.papel,'ferias')) throw new Error('FORBIDDEN');
    const body = await request.json() as { eventos?: Envelope[] }; const eventos = Array.isArray(body.eventos) ? body.eventos : []; if (eventos.length > 100) return NextResponse.json({ok:false,erro:'Lote demasiado grande.'},{status:400}); const resultados: Array<{operacaoId:string|null;status:string;mensagem?:string;versaoServidor?:number}> = [];
    for (const item of eventos) {
      const operacaoId=text(item.operacaoId),dispositivoId=text(item.dispositivoId),versaoLocal=Number(item.versaoLocal);
      if(!operacaoId||!dispositivoId||!item.entidade||!item.entidadeId||!item.operacao||!Number.isInteger(versaoLocal)){resultados.push({operacaoId:operacaoId||null,status:'ERRO',mensagem:'Evento de sincronização inválido.'});continue;}
      const evento: EventoValido = { operacaoId, dispositivoId, entidade: item.entidade, entidadeId: String(item.entidadeId), operacao: item.operacao, versaoLocal, payload: item.payload };
      if(item.entidade==='utilizador'&&sessao.papel!=='Administrador'){resultados.push({operacaoId,status:'ERRO',mensagem:'Sem permissão para sincronizar utilizadores.'});continue;}
      try { const existente=await dbQuery<{status:string}>('select status from sincronizacao_eventos where operacao_id=$1 limit 1',[operacaoId]); if(existente.rows[0]){resultados.push({operacaoId,status:existente.rows[0].status==='CONFLITO'?'CONFLITO':'PROCESSADO'});continue;} const result=await withTransaction(client=>aplicarEvento(client,evento,sessao)); resultados.push({operacaoId,...result}); }
      catch(error) { resultados.push({operacaoId,status:'ERRO',mensagem:error instanceof Error?error.message:'Erro de sincronização.'}); }
    }
    return NextResponse.json({ok:true,resultados});
  } catch(error) { if(error instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(error.message))return respostaAutorizacao(error); console.error('POST /api/sync',error);return NextResponse.json({ok:false,erro:'Não foi possível processar a sincronização.'},{status:500}); }
}
