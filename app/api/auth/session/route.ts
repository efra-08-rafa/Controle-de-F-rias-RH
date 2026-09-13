import { NextResponse } from 'next/server';
import { obterSessaoServidor, permissoesPorPapel } from '../../../../lib/server-auth';

export async function GET() {
  const sessao = await obterSessaoServidor();
  if (!sessao) return NextResponse.json({ ok: false, autenticado: false }, { status: 401 });

  return NextResponse.json({
    ok: true,
    autenticado: true,
    sessao: {
      utilizadorId: sessao.utilizadorId,
      nome: sessao.nome,
      papel: sessao.papel,
      inicio: sessao.inicio,
      exp: sessao.exp,
    },
    permissoes: permissoesPorPapel[sessao.papel],
  });
}
