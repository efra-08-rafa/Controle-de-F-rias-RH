import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, SESSION_COOKIE } from './lib/server-auth';

const rotasPublicas = ['/login'];

function rotaPermitida(pathname: string, papel: 'Administrador' | 'RH' | 'Outro') {
  if (pathname === '/') return true;
  if (pathname.startsWith('/configuracoes/utilizadores')) return papel === 'Administrador';
  if (pathname.startsWith('/configuracoes')) return papel !== 'Outro';
  if (pathname.startsWith('/funcionarios') || pathname.startsWith('/ferias')) return papel !== 'Outro';
  if (pathname.startsWith('/relatorios')) return papel !== 'Outro';
  if (pathname.startsWith('/departamentos')) return true;
  return false;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (rotasPublicas.includes(pathname)) {
    const sessao = lerSessao(request.cookies.get(SESSION_COOKIE)?.value);
    if (sessao) return NextResponse.redirect(new URL('/', request.url));
    return NextResponse.next();
  }

  const sessao = lerSessao(request.cookies.get(SESSION_COOKIE)?.value);
  if (!sessao) return NextResponse.redirect(new URL('/login', request.url));
  if (!rotaPermitida(pathname, sessao.papel)) return NextResponse.redirect(new URL('/', request.url));
  return NextResponse.next();
}

export const config = { matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'] };
