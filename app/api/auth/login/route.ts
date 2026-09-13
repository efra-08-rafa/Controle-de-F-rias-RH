import { NextResponse } from 'next/server';
import { autenticar, criarSessao, SESSION_COOKIE } from '../../../../lib/server-auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const id = typeof body?.id === 'string' ? body.id : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const conta = autenticar(id, password);

    if (!conta) return NextResponse.json({ ok: false, erro: 'ID ou palavra-passe incorreta.' }, { status: 401 });

    const response = NextResponse.json({ ok: true });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: criarSessao(conta.id, conta.nome, conta.papel),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 8 * 60 * 60,
    });
    return response;
  } catch {
    return NextResponse.json({ ok: false, erro: 'Pedido inválido.' }, { status: 400 });
  }
}
