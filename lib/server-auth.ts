import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type Papel = 'Administrador' | 'RH' | 'Outro';
export type Sessao = { utilizadorId: string; nome: string; papel: Papel; inicio: string; exp: number };

export const SESSION_COOKIE = 'rh_session';
const SESSION_TTL_SECONDS = 8 * 60 * 60;

function secret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) throw new Error('SESSION_SECRET não configurado corretamente.');
  return value;
}

function base64url(value: string) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sign(value: string) {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

function verify(value: string, signature: string) {
  const expected = sign(value);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function criarSessao(utilizadorId: string, nome: string, papel: Papel) {
  const agora = Math.floor(Date.now() / 1000);
  const payload: Sessao = { utilizadorId, nome, papel, inicio: new Date().toISOString(), exp: agora + SESSION_TTL_SECONDS };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

export function lerSessao(token?: string | null): Sessao | null {
  if (!token) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature || !verify(encoded, signature)) return null;
  try {
    const sessao = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Sessao;
    if (!sessao?.utilizadorId || !sessao?.papel || !sessao?.exp || sessao.exp <= Math.floor(Date.now() / 1000)) return null;
    return sessao;
  } catch {
    return null;
  }
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
