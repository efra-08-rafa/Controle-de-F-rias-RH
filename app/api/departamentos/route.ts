import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { dbQuery, withTransaction } from '@/lib/server-db';
import { exigirPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type Input = { nome?: string; ativo?: boolean };
const nomeValido = (v: unknown) => typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= 120;

export async function GET() {
  try {
    await exigirPermissao('departamentos');
    const result = await dbQuery(`
      select d.id,d.nome,d.ativo,d.criado_em as "criadoEm",d.atualizado_em as "atualizadoEm",
             count(f.id)::int as "totalFuncionarios"
      from departamentos d
      left join funcionarios f on f.departamento_id=d.id and f.ativo=true
      where d.ativo=true
      group by d.id,d.nome,d.ativo,d.criado_em,d.atualizado_em
      order by d.nome asc
    `);
    return NextResponse.json({ ok: true, departamentos: result.rows });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    return NextResponse.json({ ok: false, erro: 'Não foi possível carregar os departamentos.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao('departamentos');
    const input = await request.json() as Input;
    if (!nomeValido(input.nome)) return NextResponse.json({ ok: false, erro: 'O nome do departamento deve ter entre 2 e 120 caracteres.' }, { status: 400 });
    const nome = input.nome!.trim();
    const departamento = await withTransaction(async client => {
      const existente = await client.query<{ id: string }>('select id from departamentos where lower(nome)=lower($1) limit 1', [nome]);
      if (existente.rows[0]) throw new Error('DEPARTAMENTO_DUPLICADO');
      const id = randomUUID();
      const result = await client.query(`
        insert into departamentos(id,nome,ativo,atualizado_em) values($1,$2,true,CURRENT_TIMESTAMP)
        returning id,nome,ativo,criado_em as "criadoEm",atualizado_em as "atualizadoEm"
      `, [id, nome]);
      await client.query(`insert into auditoria(entidade,entidade_id,operacao,utilizador_id,origem,depois) values('departamento',$1,'CREATE',$2,'online',$3)`, [id, sessao.utilizadorId, JSON.stringify(result.rows[0])]);
      return result.rows[0];
    });
    return NextResponse.json({ ok: true, departamento }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && (error.message === 'DEPARTAMENTO_DUPLICADO' || error.message.includes('UNIQUE constraint failed') || error.message === '23505')) return NextResponse.json({ ok: false, erro: 'Este departamento já existe.' }, { status: 409 });
    return NextResponse.json({ ok: false, erro: 'Não foi possível criar o departamento.' }, { status: 500 });
  }
}
