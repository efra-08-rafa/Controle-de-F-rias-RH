import { NextResponse } from 'next/server';
import { dbQuery, withTransaction } from '@/lib/server-db';
import { exigirPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type FuncionarioInput = {
  processo?: string; nome?: string; nuit?: string; bi?: string; contacto?: string;
  departamentoId?: string | null; departamento?: string | null; cargo?: string;
  tipoContrato?: 'Permanente' | 'Contratado'; admissao?: string; fimContrato?: string | null;
};
const texto = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const dataValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const local = () => (process.env.DATABASE_MODE || 'local').toLowerCase() === 'local';
const jsonCast = (n: number) => local() ? `$${n}` : `$${n}::jsonb`;

async function departamentoId(input: FuncionarioInput) {
  const id = texto(input.departamentoId);
  if (id) return id;
  const nome = texto(input.departamento);
  if (!nome) return null;
  const result = await dbQuery<{ id: string }>('select id from departamentos where lower(nome)=lower($1) and ativo=true limit 1', [nome]);
  if (!result.rows[0]) throw new Error('DEPARTAMENTO_INVALIDO');
  return result.rows[0].id;
}
function validar(input: FuncionarioInput) {
  const processo = texto(input.processo), nome = texto(input.nome), tipoContrato = input.tipoContrato;
  const admissao = texto(input.admissao), fimContrato = input.fimContrato ? texto(input.fimContrato) : null;
  if (!processo || !nome || !tipoContrato || !admissao) throw new Error('DADOS_OBRIGATORIOS');
  if (!['Permanente', 'Contratado'].includes(tipoContrato)) throw new Error('TIPO_CONTRATO_INVALIDO');
  if (!dataValida(admissao)) throw new Error('DATA_ADMISSAO_INVALIDA');
  if (fimContrato && !dataValida(fimContrato)) throw new Error('FIM_CONTRATO_INVALIDO');
  if (tipoContrato === 'Contratado' && !fimContrato) throw new Error('FIM_CONTRATO_OBRIGATORIO');
  if (fimContrato && fimContrato < admissao) throw new Error('DATAS_INVALIDAS');
  return { processo, nome, tipoContrato, admissao, fimContrato };
}
function erroTexto(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const map: Record<string, string> = {
    DADOS_OBRIGATORIOS: 'Processo, nome, tipo de contrato e data de admissão são obrigatórios.',
    TIPO_CONTRATO_INVALIDO: 'Tipo de contrato inválido.', DATA_ADMISSAO_INVALIDA: 'Data de admissão inválida.',
    FIM_CONTRATO_INVALIDO: 'Fim de contrato inválido.', FIM_CONTRATO_OBRIGATORIO: 'O contrato Contratado precisa de data de fim.',
    DATAS_INVALIDAS: 'O fim do contrato não pode ser anterior à admissão.', DEPARTAMENTO_INVALIDO: 'Departamento não encontrado ou inativo.',
  };
  return map[code] || 'Não foi possível concluir a operação.';
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await exigirPermissao('funcionarios');
    const { id } = await params;
    const result = await dbQuery(`select f.id,f.processo,f.nome,f.nuit,f.bi,f.contacto,f.departamento_id as "departamentoId",d.nome as departamento,f.cargo,f.tipo_contrato as "tipoContrato",f.data_admissao as admissao,f.fim_contrato as "fimContrato",f.ativo,f.versao,f.criado_em as "criadoEm",f.atualizado_em as "atualizadoEm" from funcionarios f left join departamentos d on d.id=f.departamento_id where f.id=$1`, [id]);
    if (!result.rows[0]) return NextResponse.json({ ok:false, erro:'Funcionário não encontrado.' }, { status:404 });
    return NextResponse.json({ ok:true, funcionario:result.rows[0] });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED','FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    console.error('GET /api/funcionarios/[id]', error); return NextResponse.json({ ok:false, erro:'Não foi possível carregar o funcionário.' }, { status:500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirPermissao('funcionarios');
    const { id } = await params;
    const input = await request.json() as FuncionarioInput;
    const dados = validar(input); const dept = await departamentoId(input);
    const funcionario = await withTransaction(async (client) => {
      const atual = await client.query('select * from funcionarios where id=$1' + (local() ? '' : ' for update'), [id]);
      if (!atual.rows[0]) throw new Error('NAO_ENCONTRADO');
      const antigo = atual.rows[0];
      const result = await client.query(`update funcionarios set processo=$1,nome=$2,nuit=$3,bi=$4,contacto=$5,departamento_id=$6,cargo=$7,tipo_contrato=$8,data_admissao=$9,fim_contrato=$10,atualizado_por=$11,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$12 returning id,processo,nome,nuit,bi,contacto,departamento_id as "departamentoId",cargo,tipo_contrato as "tipoContrato",data_admissao as admissao,fim_contrato as "fimContrato",ativo,versao,atualizado_em as "atualizadoEm"`,
        [dados.processo,dados.nome,texto(input.nuit)||null,texto(input.bi)||null,texto(input.contacto)||null,dept,texto(input.cargo)||null,dados.tipoContrato,dados.admissao,dados.fimContrato,sessao.utilizadorId,id]);
      const novo = result.rows[0];
      const sql = `insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes,depois) values('funcionario',$1,'UPDATE',$2,$3,'online',${jsonCast(4)},${jsonCast(5)})`;
      await client.query(sql, [id,sessao.utilizadorId,request.headers.get('x-device-id')||null,JSON.stringify(antigo),JSON.stringify(novo)]);
      return novo;
    });
    return NextResponse.json({ ok:true, funcionario });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED','FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && error.message === 'NAO_ENCONTRADO') return NextResponse.json({ok:false,erro:'Funcionário não encontrado.'},{status:404});
    if (error instanceof Error && (error.message === '23505' || error.message.includes('UNIQUE constraint failed'))) return NextResponse.json({ok:false,erro:'Já existe um funcionário com esse número de processo.'},{status:409});
    if (error instanceof Error && ['DADOS_OBRIGATORIOS','TIPO_CONTRATO_INVALIDO','DATA_ADMISSAO_INVALIDA','FIM_CONTRATO_INVALIDO','FIM_CONTRATO_OBRIGATORIO','DATAS_INVALIDAS','DEPARTAMENTO_INVALIDO'].includes(error.message)) return NextResponse.json({ok:false,erro:erroTexto(error)},{status:400});
    console.error('PUT /api/funcionarios/[id]', error); return NextResponse.json({ok:false,erro:'Não foi possível atualizar o funcionário.'},{status:500});
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirPermissao('funcionarios'); const { id } = await params;
    await withTransaction(async (client) => {
      const atual = await client.query('select * from funcionarios where id=$1' + (local() ? '' : ' for update'), [id]);
      if (!atual.rows[0]) throw new Error('NAO_ENCONTRADO');
      await client.query('update funcionarios set ativo=false,atualizado_por=$1,atualizado_em=CURRENT_TIMESTAMP,versao=versao+1 where id=$2',[sessao.utilizadorId,id]);
      const sql = `insert into auditoria(entidade,entidade_id,operacao,utilizador_id,dispositivo_id,origem,antes) values('funcionario',$1,'DELETE',$2,$3,'online',${jsonCast(4)})`;
      await client.query(sql,[id,sessao.utilizadorId,request.headers.get('x-device-id')||null,JSON.stringify(atual.rows[0])]);
    });
    return NextResponse.json({ok:true});
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED','FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && error.message === 'NAO_ENCONTRADO') return NextResponse.json({ok:false,erro:'Funcionário não encontrado.'},{status:404});
    console.error('DELETE /api/funcionarios/[id]',error); return NextResponse.json({ok:false,erro:'Não foi possível desativar o funcionário.'},{status:500});
  }
}
