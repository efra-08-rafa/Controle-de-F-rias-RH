import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Papel = 'Administrador' | 'RH' | 'Outro';
export type Permissao = 'painel' | 'funcionarios' | 'ferias' | 'departamentos' | 'relatorios' | 'configuracoes' | 'utilizadores';
export type Sessao = { utilizadorId: string; nome: string; papel: Papel; inicio: string; exp: number };

export const SESSION_COOKIE = 'rh_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

export const permissoesPorPapel: Record<Papel, Record<Permissao, boolean>> = {
  Administrador: { painel: true, funcionarios: true, ferias: true, departamentos: true, relatorios: true, configuracoes: true, utilizadores: true },
  RH: { painel: true, funcionarios: true, ferias: true, departamentos: true, relatorios: true, configuracoes: false, utilizadores: false },
  Outro: { painel: true, funcionarios: false, ferias: false, departamentos: true, relatorios: false, configuracoes: false, utilizadores: false },
};

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET não configurado corretamente.');
  return value;
}

function base64url(value: string) { return Buffer.from(value, 'utf8').toString('base64url'); }
function sign(value: string) { return createHmac('sha256', secret()).update(value).digest('base64url'); }

function verify(value: string, signature: string) {
  try {
    const expected = sign(value);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

export function criarSessao(utilizadorId: string, nome: string, papel: Papel) {
  const agora = Math.floor(Date.now() / 1000);
  const payload: Sessao = { utilizadorId, nome, papel, inicio: new Date().toISOString(), exp: agora + SESSION_TTL_SECONDS };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function lerSessao(token?: string | null): Sessao | null {
  if (!token) return null;
  const partes = token.split('.');
  if (partes.length !== 2) return null;
  const [encoded, signature] = partes;
  if (!verify(encoded, signature)) return null;
  try {
    const sessao = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Sessao;
    if (!sessao?.utilizadorId || !sessao?.nome || !sessao?.papel || !sessao?.exp) return null;
    if (!Object.prototype.hasOwnProperty.call(permissoesPorPapel, sessao.papel)) return null;
    if (sessao.exp <= Math.floor(Date.now() / 1000)) return null;
    return sessao;
  } catch { return null; }
}

export async function obterSessaoServidor() {
  const store = await cookies();
  return lerSessao(store.get(SESSION_COOKIE)?.value);
}

export function temPermissao(papel: Papel, permissao: Permissao) {
  return permissoesPorPapel[papel]?.[permissao] === true;
}

export async function exigirSessao() {
  const sessao = await obterSessaoServidor();
  if (!sessao) throw new Error('UNAUTHORIZED');
  return sessao;
}

export async function exigirPermissao(permissao: Permissao) {
  const sessao = await exigirSessao();
  if (!temPermissao(sessao.papel, permissao)) throw new Error('FORBIDDEN');
  return sessao;
}

export async function exigirPapel(...papeis: Papel[]) {
  const sessao = await exigirSessao();
  if (!papeis.includes(sessao.papel)) throw new Error('FORBIDDEN');
  return sessao;
}

export function respostaAutorizacao(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return NextResponse.json({ ok: false, erro: 'Sem permissão para esta operação.' }, { status: 403 });
  return NextResponse.json({ ok: false, erro: 'Sessão inválida ou expirada.' }, { status: 401 });
}

export function autenticar(id: string, password: string) {
  const login = id.trim().toLowerCase();
  const contas = [
    { id: process.env.ADMIN_USER_ID || 'ekimane', nome: 'Administrador', papel: 'Administrador' as const, password: process.env.ADMIN_PASSWORD || '' },
    { id: process.env.RH_USER_ID || 'ifloma', nome: 'Responsável RH', papel: 'RH' as const, password: process.env.RH_PASSWORD || '' },
    { id: process.env.OUTRO_USER_ID || 'ifloma', nome: 'Outro utilizador', papel: 'Outro' as const, password: process.env.OUTRO_PASSWORD || '' },
  ];
  return contas.find((conta) => conta.id.toLowerCase() === login && conta.password && conta.password === password) || null;
}
