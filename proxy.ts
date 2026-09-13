import { NextRequest, NextResponse } from 'next/server';
import { lerSessao, temPermissao, SESSION_COOKIE, type Permissao } from './lib/server-auth';

const rotasPublicas = ['/login','/configuracao-inicial'];

function permissaoDaRota(pathname: string): Permissao | null {
  if (pathname === '/') return 'painel';
  if (pathname.startsWith('/configuracoes/utilizadores') || pathname.startsWith('/api/utilizadores')) return 'utilizadores';
  if (pathname.startsWith('/configuracoes')) return 'configuracoes';
  if (pathname.startsWith('/funcionarios') || pathname.startsWith('/api/funcionarios')) return 'funcionarios';
  if (pathname.startsWith('/ferias') || pathname.startsWith('/api/ferias')) return 'ferias';
  if (pathname.startsWith('/relatorios') || pathname.startsWith('/api/relatorios')) return 'relatorios';
  if (pathname.startsWith('/departamentos') || pathname.startsWith('/api/departamentos')) return 'departamentos';
  return null;
}
function respostaApi(status:number,erro:string){return NextResponse.json({ok:false,erro},{status});}
export function proxy(request:NextRequest){
 const{pathname}=request.nextUrl;
 if(pathname==='/api/configuracao-inicial'||pathname==='/api/auth/login'||pathname==='/api/auth/logout'||pathname==='/api/auth/session')return NextResponse.next();
 const sessao=lerSessao(request.cookies.get(SESSION_COOKIE)?.value);
 if(pathname.startsWith('/api/')){
  if(!sessao)return respostaApi(401,'Sessão inválida ou expirada.');
  const permissao=permissaoDaRota(pathname);if(permissao&&!temPermissao(sessao.papel,permissao))return respostaApi(403,'Sem permissão para esta operação.');
  return NextResponse.next();
 }
 if(rotasPublicas.includes(pathname)){if(sessao)return NextResponse.redirect(new URL('/',request.url));return NextResponse.next();}
 if(!sessao)return NextResponse.redirect(new URL('/login',request.url));
 const permissao=permissaoDaRota(pathname);if(permissao&&!temPermissao(sessao.papel,permissao))return NextResponse.redirect(new URL('/',request.url));
 return NextResponse.next();
}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
