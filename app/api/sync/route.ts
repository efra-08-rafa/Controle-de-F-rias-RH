import { NextResponse } from 'next/server';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';
import { dbQuery, withTransaction, type DbClient } from '@/lib/server-db';

type Entidade = 'funcionario' | 'ferias' | 'utilizador';
type Operacao = 'CREATE' | 'UPDATE' | 'DELETE';
type Envelope = { operacaoId?: unknown; dispositivoId?: unknown; entidade?: Entidade; entidadeId?: unknown; operacao?: Operacao; versaoLocal?: unknown; payload?: unknown };
type EventoValido = { operacaoId: string; dispositivoId: string; entidade: Entidade; entidadeId: string; operacao: Operacao; versaoLocal: number; payload?: unknown };
type Resultado = { status: 'PROCESSADO' | 'CONFLITO'; versaoServidor?: number };

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

const CAMPOS: Record<Entidade, Set<string>> = {
  funcionario: new Set(['processo','nome','nuit','bi','contacto','departamento_id','cargo','tipo_contrato','data_admissao','fim_contrato','ativo','criado_por','atualizado_por','criado_em','atualizado_em']),
  ferias: new Set(['funcionario_id','inicio','fim','dias','estado','criado_por','atualizado_por','criado_em','atualizado_em']),
  utilizador: new Set(['login','nome','papel','ativo','criado_em','atualizado_em']),
};

function tabela(entidade: Entidade) { return entidade === 'funcionario' ? 'funcionarios' : entidade === 'ferias' ? 'ferias' : 'utilizadores'; }

function payloadSeguro(entidade: Entidade, payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Payload obrigatório.');
  const origem = payload as Record<string, unknown>;
  const campos = Object.keys(origem).filter((key) => CAMPOS[entidade].has(key));
  return { campos, valores: campos.map((key) => origem[key]) };
}

async function aplicarEvento(client: DbClient, item: EventoValido, sessao: Awaited<ReturnType<typeof exigirSessao>>): Promise<Resultado> {
  const nomeTabela = tabela(item.entidade);
  const atualResult = await client.query<Record<string, unknown>>(`select * from ${nomeTabela} where id=$1`, [item.entidadeId]);
  const atual = atualResult.rows[0];
  const versaoServidor = Number(atual?.versao || 0);

  if (item.operacao !== 'CREATE' && (!atual || versaoServidor !== item.versaoLocal)) {
    await client.query(`insert into sincronizacao_conflitos(operacao_id,entidade,entidade_id,payload_local,payload_servidor,criado_em) values($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)`, [item.operacaoId,item.entidade,item.entidadeId,JSON.stringify(item.payload ?? null),atual ? JSON.stringify(atual) : null]);
    return { status: 'CONFLITO', versaoServidor };
  }

  if (item.operacao === 'CREATE') {
    if (atual) return { status: 'CONFLITO', versaoServidor };
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (!campos.length) throw new Error('Payload sem campos válidos.');
    const placeholders = campos.map((_, index) => `$${index + 2}`);
    await client.query(`insert into ${nomeTabela}(id,${campos.join(',')}) values($1,${placeholders.join(',')})`, [item.entidadeId, ...valores]);
  } else if (item.operacao === 'UPDATE') {
    if (!atual) throw new Error('Registo não encontrado no servidor.');
    const { campos, valores } = payloadSeguro(item.entidade, item.payload);
    if (campos.length) {
      const sets = campos.map((key, index) => `${key}=$${index + 2}`);
      await client.query(`update ${nomeTabela} set ${sets.join(',')},versao=versao+1,atualizado_em=CURRENT_TIMESTAMP where id=$1`, [item.entidadeId, ...valores]);
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

  const novo = (await client.query(`select * from ${nomeTabela} where id=$1`, [item.entidadeId])).rows[0];
  await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO')`, [item.dispositivoId,item.operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal]);
  await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values($1,$2,'SYNC',$3,$4,'sync',$5,$6)`, [item.entidade,item.entidadeId,sessao.utilizadorId,item.dispositivoId,atual ? JSON.stringify(atual) : null,novo ? JSON.stringify(novo) : null]);
  return { status: 'PROCESSADO', versaoServidor: Number(novo?.versao || 0) };
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao();
    if (!temPermissao(sessao.papel,'funcionarios') && !temPermissao(sessao.papel,'ferias')) throw new Error('FORBIDDEN');
    const body = await request.json() as { eventos?: Envelope[] };
    const eventos = Array.isArray(body.eventos) ? body.eventos : [];
    if (eventos.length > 100) return NextResponse.json({ok:false,erro:'Lote demasiado grande.'},{status:400});
    const resultados: Array<{operacaoId:string|null;status:string;mensagem?:string;versaoServidor?:number}> = [];

    for (const item of eventos) {
      const operacaoId=text(item.operacaoId), dispositivoId=text(item.dispositivoId), versaoLocal=Number(item.versaoLocal);
      if (!operacaoId || !dispositivoId || !item.entidade || !item.entidadeId || !item.operacao || !Number.isInteger(versaoLocal) || versaoLocal < 1) {
        resultados.push({operacaoId:operacaoId||null,status:'ERRO',mensagem:'Evento de sincronização inválido.'});
        continue;
      }
      const evento: EventoValido = {operacaoId,dispositivoId,entidade:item.entidade,entidadeId:String(item.entidadeId),operacao:item.operacao,versaoLocal,payload:item.payload};
      if (item.entidade === 'utilizador' && sessao.papel !== 'Administrador') { resultados.push({operacaoId,status:'ERRO',mensagem:'Sem permissão para sincronizar utilizadores.'}); continue; }
      try {
        const existente=await dbQuery<{status:string}>('select status from sincronizacao_eventos where operacao_id=$1 limit 1',[operacaoId]);
        if (existente.rows[0]) { resultados.push({operacaoId,status:existente.rows[0].status==='CONFLITO'?'CONFLITO':'PROCESSADO'}); continue; }
        const result=await withTransaction(client=>aplicarEvento(client,evento,sessao));
        resultados.push({operacaoId,...result});
      } catch(error) { resultados.push({operacaoId,status:'ERRO',mensagem:error instanceof Error?error.message:'Erro de sincronização.'}); }
    }
    return NextResponse.json({ok:true,resultados});
  } catch(error) {
    if (error instanceof Error && ['UNAUTHORIZED','FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    console.error('POST /api/sync',error);
    return NextResponse.json({ok:false,erro:'Não foi possível processar a sincronização.'},{status:500});
  }
}
