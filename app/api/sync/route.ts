import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbQuery, withTransaction, type DbClient } from '@/lib/server-db';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type Entidade = 'funcionario' | 'ferias' | 'utilizador';
type Operacao = 'CREATE' | 'UPDATE' | 'DELETE';
type Envelope = { operacaoId?: string; dispositivoId?: string; entidade?: Entidade; entidadeId?: string; operacao?: Operacao; versaoLocal?: number; criadoEm?: string; payload?: unknown };
type EventoValido = { operacaoId: string; dispositivoId: string; entidade: Entidade; entidadeId: string; operacao: Operacao; versaoLocal: number; payload?: unknown };
type Payload = Record<string, unknown>;
const local = () => (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local';
const auditJson = (n: number) => local() ? `$${n}` : `$${n}::jsonb`;
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const data = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

function payloadObject(value: unknown): Payload | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Payload : null;
}

function erroValidacao(entidade: Entidade, op: Operacao, p: Payload | null) {
  if (!p) return 'Payload inválido.';
  if (entidade === 'funcionario') {
    if (op !== 'DELETE' && (!text(p.processo) || !text(p.nome) || !['Permanente', 'Contratado'].includes(text(p.tipoContrato)) || !data(p.admissao))) return 'Dados do funcionário inválidos.';
    if (op !== 'DELETE' && text(p.tipoContrato) === 'Contratado' && !data(p.fimContrato)) return 'Fim do contrato é obrigatório.';
  }
  if (entidade === 'ferias' && op !== 'DELETE') {
    if (!text(p.funcionarioId) || !data(p.inicio) || !data(p.fim) || Number(p.dias) <= 0) return 'Dados das férias inválidos.';
    if (data(p.fim) < data(p.inicio)) return 'Data de fim das férias inválida.';
  }
  if (entidade === 'utilizador' && op !== 'DELETE') {
    if (!text(p.login) || !text(p.nome) || !['Administrador', 'RH', 'Outro'].includes(text(p.papel))) return 'Dados do utilizador inválidos.';
  }
  return null;
}

async function aplicarEvento(client: DbClient, item: EventoValido, sessao: Awaited<ReturnType<typeof exigirSessao>>) {
  const p = payloadObject(item.payload);
  const erro = erroValidacao(item.entidade, item.operacao, p);
  if (erro) throw new Error(erro);
  const tabela = item.entidade === 'funcionario' ? 'funcionarios' : item.entidade === 'ferias' ? 'ferias' : 'utilizadores';
  const atualResult = await client.query(`select * from ${tabela} where id=$1`, [item.entidadeId]);
  const atual = atualResult.rows[0];
  const versaoServidor = Number(atual?.versao || 0);

  if (item.operacao !== 'CREATE' && atual && item.versaoLocal !== versaoServidor) {
    await client.query(`insert into sincronizacao_conflitos(id,operacao_id,entidade,entidade_id,payload_local,payload_servidor,criado_em) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)`, [randomUUID(), item.operacaoId, item.entidade, item.entidadeId, JSON.stringify(p), JSON.stringify(atual)]);
    await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status,mensagem_erro) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'CONFLITO',$7)`, [item.dispositivoId, item.operacaoId, item.entidade, item.entidadeId, item.operacao, item.versaoLocal, 'Conflito de versão.']);
    return { status: 'CONFLITO' as const, versaoServidor };
  }

  if (item.operacao === 'CREATE') {
    if (atual) return { status: 'PROCESSADO' as const, versaoServidor };
    if (item.entidade === 'funcionario') {
      const dept = text(p?.departamentoId) || null;
      await client.query(`insert into funcionarios(id,processo,nome,nuit,bi,contacto,departamento_id,cargo,tipo_contrato,data_admissao,fim_contrato,ativo,versao,criado_por,atualizado_por,atualizado_em) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1,1,$12,$12,CURRENT_TIMESTAMP)`, [item.entidadeId,text(p?.processo),text(p?.nome),text(p?.nuit)||null,text(p?.bi)||null,text(p?.contacto)||null,dept,text(p?.cargo)||null,text(p?.tipoContrato),data(p?.admissao),data(p?.fimContrato)||null,sessao.utilizadorId]);
    } else if (item.entidade === 'ferias') {
      await client.query(`insert into ferias(id,funcionario_id,inicio,fim,dias,estado,versao,criado_por,atualizado_por,atualizado_em) values($1,$2,$3,$4,$5,$6,1,$7,$7,CURRENT_TIMESTAMP)`, [item.entidadeId,text(p?.funcionarioId),data(p?.inicio),data(p?.fim),Number(p?.dias),text(p?.estado)||'Disponível',sessao.utilizadorId]);
    } else {
      if (sessao.papel !== 'Administrador') throw new Error('Sem permissão para sincronizar utilizadores.');
      const passwordHash = text(p?.passwordHash);
      if (!passwordHash) throw new Error('Utilizador sincronizado precisa de passwordHash.');
      await client.query(`insert into utilizadores(id,login,nome,papel,password_hash,ativo,versao,atualizado_em) values($1,$2,$3,$4,$5,1,1,CURRENT_TIMESTAMP)`, [item.entidadeId,text(p?.login),text(p?.nome),text(p?.papel),passwordHash]);
    }
  } else if (item.operacao === 'UPDATE') {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    if (item.entidade === 'funcionario') {
      await client.query(`update funcionarios set processo=$1,nome=$2,nuit=$3,bi=$4,contacto=$5,departamento_id=$6,cargo=$7,tipo_contrato=$8,data_admissao=$9,fim_contrato=$10,atualizado_por=$11,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$12`, [text(p?.processo),text(p?.nome),text(p?.nuit)||null,text(p?.bi)||null,text(p?.contacto)||null,text(p?.departamentoId)||null,text(p?.cargo)||null,text(p?.tipoContrato),data(p?.admissao),data(p?.fimContrato)||null,sessao.utilizadorId,item.entidadeId]);
    } else if (item.entidade === 'ferias') {
      await client.query(`update ferias set funcionario_id=$1,inicio=$2,fim=$3,dias=$4,estado=$5,atualizado_por=$6,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$7`, [text(p?.funcionarioId),data(p?.inicio),data(p?.fim),Number(p?.dias),text(p?.estado)||'Disponível',sessao.utilizadorId,item.entidadeId]);
    } else {
      if (sessao.papel !== 'Administrador') throw new Error('Sem permissão para sincronizar utilizadores.');
      await client.query(`update utilizadores set login=$1,nome=$2,papel=$3,ativo=coalesce($4,ativo),versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$5`, [text(p?.login),text(p?.nome),text(p?.papel),typeof p?.ativo === 'boolean' ? p.ativo : null,item.entidadeId]);
    }
  } else {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    if (item.entidade === 'funcionario') await client.query(`update funcionarios set ativo=false,atualizado_por=$1,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$2`, [sessao.utilizadorId,item.entidadeId]);
    else if (item.entidade === 'utilizador') {
      if (sessao.papel !== 'Administrador') throw new Error('Sem permissão para sincronizar utilizadores.');
      if (item.entidadeId === sessao.utilizadorId) throw new Error('Não pode bloquear a própria conta.');
      await client.query(`update utilizadores set ativo=false,versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId]);
    } else await client.query(`delete from ferias where id=$1`, [item.entidadeId]);
  }

  const novo = (await client.query(`select * from ${tabela} where id=$1`, [item.entidadeId])).rows[0];
  await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO')`, [item.dispositivoId,item.operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal]);
  await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values($1,$2,'SYNC',$3,$4,'sync',${auditJson(6)},${auditJson(7)})`, [item.entidade,item.entidadeId,sessao.utilizadorId,item.dispositivoId,atual ? JSON.stringify(atual) : null,novo ? JSON.stringify(novo) : null]);
  return { status: 'PROCESSADO' as const, versaoServidor: Number(novo?.versao || 0) };
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao();
    if (!temPermissao(sessao.papel,'funcionarios') && !temPermissao(sessao.papel,'ferias')) throw new Error('FORBIDDEN');
    const body = await request.json() as { eventos?: Envelope[] };
    const eventos = Array.isArray(body.eventos) ? body.eventos : [];
    if (eventos.length > 100) return NextResponse.json({ok:false,erro:'Lote demasiado grande.'},{status:400});
    const resultados=[];
    for (const item of eventos) {
      const operacaoId=text(item.operacaoId),dispositivoId=text(item.dispositivoId);
      if(!operacaoId||!dispositivoId||!item.entidade||!item.entidadeId||!item.operacao||!Number.isInteger(item.versaoLocal)){resultados.push({operacaoId:operacaoId||null,status:'ERRO',mensagem:'Evento de sincronização inválido.'});continue;}
      const evento: EventoValido = { operacaoId, dispositivoId, entidade: item.entidade, entidadeId: item.entidadeId, operacao: item.operacao, versaoLocal: item.versaoLocal, payload: item.payload };
      if(item.entidade==='utilizador'&&sessao.papel!=='Administrador'){resultados.push({operacaoId,status:'ERRO',mensagem:'Sem permissão para sincronizar utilizadores.'});continue;}
      try {
        const existente=await dbQuery<{status:string}>('select status from sincronizacao_eventos where operacao_id=$1 limit 1',[operacaoId]);
        if(existente.rows[0]){resultados.push({operacaoId,status:existente.rows[0].status==='CONFLITO'?'CONFLITO':'PROCESSADO'});continue;}
        const result=await withTransaction(client=>aplicarEvento(client,evento,sessao));
        resultados.push({operacaoId,...result});
      } catch(error) { resultados.push({operacaoId,status:'ERRO',mensagem:error instanceof Error?error.message:'Erro de sincronização.'}); }
    }
    return NextResponse.json({ok:true,resultados});
  } catch(error) { if(error instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(error.message))return respostaAutorizacao(error); console.error('POST /api/sync',error);return NextResponse.json({ok:false,erro:'Não foi possível processar a sincronização.'},{status:500}); }
}
