import { NextResponse } from 'next/server';
import { dbQuery, withTransaction } from '@/lib/server-db';
import { exigirSessao, temPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type Envelope = { operacaoId?: string; dispositivoId?: string; entidade?: 'funcionario'|'ferias'|'utilizador'; entidadeId?: string; operacao?: 'CREATE'|'UPDATE'|'DELETE'; versaoLocal?: number; criadoEm?: string; payload?: unknown };

export async function POST(request: Request) {
  try {
    const sessao = await exigirSessao();
    if (!temPermissao(sessao.papel,'funcionarios') && !temPermissao(sessao.papel,'ferias')) throw new Error('FORBIDDEN');
    const body = await request.json() as { eventos?: Envelope[] };
    const eventos = Array.isArray(body.eventos) ? body.eventos : [];
    if (eventos.length > 100) return NextResponse.json({ok:false,erro:'Lote demasiado grande.'},{status:400});
    const resultados = [];
    for (const item of eventos) {
      const operacaoId=item.operacaoId?.trim(), dispositivoId=item.dispositivoId?.trim();
      if (!operacaoId || !dispositivoId || !item.entidade || !item.entidadeId || !item.operacao || !Number.isInteger(item.versaoLocal)) { resultados.push({operacaoId:operacaoId||null,status:'ERRO',mensagem:'Evento de sincronização inválido.'}); continue; }
      if (item.entidade==='utilizador' && sessao.papel!=='Administrador') { resultados.push({operacaoId,status:'ERRO',mensagem:'Sem permissão para sincronizar utilizadores.'}); continue; }
      try {
        const result=await withTransaction(async(client)=>{
          const existente=await client.query('select status from sincronizacao_eventos where operacao_id=$1 limit 1',[operacaoId]);
          if(existente.rows[0]) return {status:'PROCESSADO' as const,versaoServidor:undefined};
          const tabela=item.entidade==='funcionario'?'funcionarios':item.entidade==='ferias'?'ferias':'utilizadores';
          const atual=await client.query(`select versao from ${tabela} where id=$1`,[item.entidadeId]);
          const versaoServidor=Number(atual.rows[0]?.versao||0);
          if(item.operacao!=='CREATE' && atual.rows[0] && item.versaoLocal!==versaoServidor){
            await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status,mensagem_erro) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'CONFLITO',$7)`,[dispositivoId,operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal,'Versão local não coincide com a versão atual.']);
            return {status:'CONFLITO' as const,versaoServidor};
          }
          await client.query(`insert into sincronizacao_eventos(dispositivo_id,operacao_id,entidade,entidade_id,operacao,versao_local,recebido_em,processado_em,status) values($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'PROCESSADO')`,[dispositivoId,operacaoId,item.entidade,item.entidadeId,item.operacao,item.versaoLocal]);
          return {status:'PROCESSADO' as const,versaoServidor:versaoServidor||undefined};
        });
        resultados.push({operacaoId,...result});
      }catch(error){ resultados.push({operacaoId,status:'ERRO',mensagem:error instanceof Error?error.message:'Erro de sincronização.'}); }
    }
    return NextResponse.json({ok:true,resultados});
  }catch(error){ if(error instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(error.message))return respostaAutorizacao(error); console.error('POST /api/sync',error); return NextResponse.json({ok:false,erro:'Não foi possível processar a sincronização.'},{status:500}); }
}
