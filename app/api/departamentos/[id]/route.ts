import { NextResponse } from 'next/server';
import { dbQuery, withTransaction } from '@/lib/server-db';
import { exigirPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type Input = { nome?: string; ativo?: boolean };
const nomeValido = (v: unknown) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirPermissao('departamentos');
    const { id } = await context.params;
    const input = await request.json() as Input;
    if (!id || !nomeValido(input.nome)) return NextResponse.json({ ok: false, erro: 'Nome de departamento inválido.' }, { status: 400 });
    const nome = input.nome!.trim();
    const departamento = await withTransaction(async client => {
      const atual = await client.query<Record<string, unknown>>('select * from departamentos where id=$1 limit 1', [id]);
      if (!atual.rows[0]) throw new Error('NAO_ENCONTRADO');
      const duplicado = await client.query('select id from departamentos where lower(nome)=lower($1) and id<>$2 limit 1', [nome, id]);
      if (duplicado.rows[0]) throw new Error('DEPARTAMENTO_DUPLICADO');
      const result = await client.query(`update departamentos set nome=$1,atualizado_em=CURRENT_TIMESTAMP where id=$2 returning id,nome,ativo,criado_em as "criadoEm",atualizado_em as "atualizadoEm"`, [nome, id]);
      await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,origem,antes,depois) values('departamento',$1,'UPDATE',$2,'online',$3,$4)`, [id, sessao.utilizadorId, JSON.stringify(atual.rows[0]), JSON.stringify(result.rows[0])]);
      return result.rows[0];
    });
    return NextResponse.json({ ok: true, departamento });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && error.message === 'NAO_ENCONTRADO') return NextResponse.json({ ok: false, erro: 'Departamento não encontrado.' }, { status: 404 });
    if (error instanceof Error && (error.message === 'DEPARTAMENTO_DUPLICADO' || error.message === '23505' || error.message.includes('UNIQUE constraint failed'))) return NextResponse.json({ ok: false, erro: 'Este departamento já existe.' }, { status: 409 });
    return NextResponse.json({ ok: false, erro: 'Não foi possível atualizar o departamento.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const sessao = await exigirPermissao('departamentos');
    const { id } = await context.params;
    await withTransaction(async client => {
      const atual = await client.query<Record<string, unknown>>('select * from departamentos where id=$1 limit 1', [id]);
      if (!atual.rows[0]) throw new Error('NAO_ENCONTRADO');
      const uso = await client.query<{ total: number }>('select count(*) as total from funcionarios where departamento_id=$1 and ativo=true', [id]);
      if (Number(uso.rows[0]?.total || 0) > 0) throw new Error('EM_USO');
      await client.query('update departamentos set ativo=false,atualizado_em=CURRENT_TIMESTAMP where id=$1', [id]);
      await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,origem,antes) values('departamento',$1,'DELETE',$2,'online',$3)`, [id, sessao.utilizadorId, JSON.stringify(atual.rows[0])]);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && error.message === 'NAO_ENCONTRADO') return NextResponse.json({ ok: false, erro: 'Departamento não encontrado.' }, { status: 404 });
    if (error instanceof Error && error.message === 'EM_USO') return NextResponse.json({ ok: false, erro: 'Não é possível eliminar um departamento que possui funcionários ativos.' }, { status: 409 });
    return NextResponse.json({ ok: false, erro: 'Não foi possível desativar o departamento.' }, { status: 500 });
  }
}
