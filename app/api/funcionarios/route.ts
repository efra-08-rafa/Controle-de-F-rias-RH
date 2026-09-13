import { NextResponse } from 'next/server';
import { dbQuery, withTransaction } from '@/lib/server-db';
import { exigirPermissao, respostaAutorizacao } from '@/lib/server-auth';

export const runtime = 'nodejs';

type FuncionarioInput = {
  processo?: string;
  nome?: string;
  nuit?: string;
  bi?: string;
  contacto?: string;
  departamentoId?: string | null;
  departamento?: string | null;
  cargo?: string;
  tipoContrato?: 'Permanente' | 'Contratado';
  admissao?: string;
  fimContrato?: string | null;
};

function texto(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function dataValida(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function normalizarDepartamento(input: FuncionarioInput) {
  const id = texto(input.departamentoId);
  if (id) return id;

  const nome = texto(input.departamento);
  if (!nome) return null;

  const result = await dbQuery<{ id: string }>(
    'select id from departamentos where lower(nome) = lower($1) and ativo = true limit 1',
    [nome],
  );
  if (!result.rows[0]) throw new Error('DEPARTAMENTO_INVALIDO');
  return result.rows[0].id;
}

function validar(input: FuncionarioInput) {
  const processo = texto(input.processo);
  const nome = texto(input.nome);
  const tipoContrato = input.tipoContrato;
  const admissao = texto(input.admissao);
  const fimContrato = input.fimContrato ? texto(input.fimContrato) : null;

  if (!processo || !nome || !tipoContrato || !admissao) throw new Error('DADOS_OBRIGATORIOS');
  if (!['Permanente', 'Contratado'].includes(tipoContrato)) throw new Error('TIPO_CONTRATO_INVALIDO');
  if (!dataValida(admissao)) throw new Error('DATA_ADMISSAO_INVALIDA');
  if (fimContrato && !dataValida(fimContrato)) throw new Error('FIM_CONTRATO_INVALIDO');
  if (tipoContrato === 'Contratado' && !fimContrato) throw new Error('FIM_CONTRATO_OBRIGATORIO');
  if (fimContrato && fimContrato < admissao) throw new Error('DATAS_INVALIDAS');

  return { processo, nome, tipoContrato, admissao, fimContrato };
}

function mensagemErro(error: unknown) {
  if (!(error instanceof Error)) return 'Não foi possível concluir a operação.';
  const mensagens: Record<string, string> = {
    DADOS_OBRIGATORIOS: 'Processo, nome, tipo de contrato e data de admissão são obrigatórios.',
    TIPO_CONTRATO_INVALIDO: 'Tipo de contrato inválido.',
    DATA_ADMISSAO_INVALIDA: 'Data de admissão inválida.',
    FIM_CONTRATO_INVALIDO: 'Fim de contrato inválido.',
    FIM_CONTRATO_OBRIGATORIO: 'O contrato Contratado precisa de data de fim.',
    DATAS_INVALIDAS: 'O fim do contrato não pode ser anterior à admissão.',
    DEPARTAMENTO_INVALIDO: 'Departamento não encontrado ou inativo.',
  };
  return mensagens[error.message] || 'Não foi possível concluir a operação.';
}

export async function GET() {
  try {
    await exigirPermissao('funcionarios');
    const result = await dbQuery(`
      select
        f.id,
        f.processo,
        f.nome,
        f.nuit,
        f.bi,
        f.contacto,
        f.departamento_id as "departamentoId",
        d.nome as departamento,
        f.cargo,
        f.tipo_contrato as "tipoContrato",
        f.data_admissao as admissao,
        f.fim_contrato as "fimContrato",
        f.ativo,
        f.versao,
        f.criado_em as "criadoEm",
        f.atualizado_em as "atualizadoEm"
      from funcionarios f
      left join departamentos d on d.id = f.departamento_id
      order by f.nome asc
    `);
    return NextResponse.json({ ok: true, funcionarios: result.rows });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    console.error('GET /api/funcionarios', error);
    return NextResponse.json({ ok: false, erro: 'Não foi possível carregar os funcionários.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const sessao = await exigirPermissao('funcionarios');
    const input = (await request.json()) as FuncionarioInput;
    const dados = validar(input);
    const departamentoId = await normalizarDepartamento(input);

    const funcionario = await withTransaction(async (client) => {
      const result = await client.query(
        `insert into funcionarios
          (processo, nome, nuit, bi, contacto, departamento_id, cargo, tipo_contrato, data_admissao, fim_contrato)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         returning id, processo, nome, nuit, bi, contacto, departamento_id as "departamentoId", cargo,
                   tipo_contrato as "tipoContrato", data_admissao as admissao, fim_contrato as "fimContrato", ativo, versao`,
        [dados.processo, dados.nome, texto(input.nuit) || null, texto(input.bi) || null, texto(input.contacto) || null,
          departamentoId, texto(input.cargo) || null, dados.tipoContrato, dados.admissao, dados.fimContrato],
      );
      const novo = result.rows[0];
      await client.query(
        `insert into auditoria (entidade, entidade_id, operacao, dispositivo_id, origem, depois)
         values ('funcionario', $1, 'CREATE', $2, 'online', $3::jsonb)`,
        [novo.id, request.headers.get('x-device-id') || null, JSON.stringify({ ...novo, criadoPor: sessao.utilizadorId })],
      );
      return novo;
    });

    return NextResponse.json({ ok: true, funcionario }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && ['UNAUTHORIZED', 'FORBIDDEN'].includes(error.message)) return respostaAutorizacao(error);
    if (error instanceof Error && error.message === '23505') return NextResponse.json({ ok: false, erro: 'Já existe um funcionário com esse número de processo.' }, { status: 409 });
    if (error instanceof Error && error.message.startsWith('FIM_CONTRATO') || error instanceof Error && ['DADOS_OBRIGATORIOS','TIPO_CONTRATO_INVALIDO','DATA_ADMISSAO_INVALIDA','FIM_CONTRATO_INVALIDO','DATAS_INVALIDAS','DEPARTAMENTO_INVALIDO'].includes(error.message)) {
      return NextResponse.json({ ok: false, erro: mensagemErro(error) }, { status: 400 });
    }
    console.error('POST /api/funcionarios', error);
    return NextResponse.json({ ok: false, erro: mensagemErro(error) }, { status: 500 });
  }
}
