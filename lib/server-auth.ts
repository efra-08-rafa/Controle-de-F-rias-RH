import 'server-only';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual, randomUUID, scryptSync } from 'node:crypto';
import { dbQuery, withTransaction } from './server-db';

export type Papel='Administrador'|'RH'|'Outro';
export type Permissao='painel'|'funcionarios'|'ferias'|'departamentos'|'relatorios'|'configuracoes'|'utilizadores';
export type Sessao={utilizadorId:string;nome:string;papel:Papel;inicio:string;exp:number};
export const SESSION_COOKIE='rh_session';
const SESSION_TTL_SECONDS=8*60*60;
export const permissoesPorPapel:Record<Papel,Record<Permissao,boolean>>={
 Administrador:{painel:true,funcionarios:true,ferias:true,departamentos:true,relatorios:true,configuracoes:true,utilizadores:true},
 RH:{painel:true,funcionarios:true,ferias:true,departamentos:true,relatorios:true,configuracoes:false,utilizadores:false},
 Outro:{painel:true,funcionarios:false,ferias:false,departamentos:true,relatorios:false,configuracoes:false,utilizadores:false},
};
function secret(){const value=process.env.SESSION_SECRET;if(!value||value.length<32)throw new Error('SESSION_SECRET não configurado corretamente.');return value;}
function base64url(value:string){return Buffer.from(value,'utf8').toString('base64url');}
function sign(value:string){return createHmac('sha256',secret()).update(value).digest('base64url');}
function verify(value:string,signature:string){try{const expected=sign(value),a=Buffer.from(signature),b=Buffer.from(expected);return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}}
export function criarSessao(utilizadorId:string,nome:string,papel:Papel){const agora=Math.floor(Date.now()/1000);const payload:Sessao={utilizadorId,nome,papel,inicio:new Date().toISOString(),exp:agora+SESSION_TTL_SECONDS};const encoded=base64url(JSON.stringify(payload));return `${encoded}.${sign(encoded)}`;}
export function lerSessao(token?:string|null):Sessao|null{if(!token)return null;const partes=token.split('.');if(partes.length!==2)return null;const[encoded,signature]=partes;if(!verify(encoded,signature))return null;try{const sessao=JSON.parse(Buffer.from(encoded,'base64url').toString('utf8')) as Sessao;if(!sessao?.utilizadorId||!sessao?.nome||!sessao?.papel||!sessao?.exp)return null;if(!Object.prototype.hasOwnProperty.call(permissoesPorPapel,sessao.papel))return null;if(sessao.exp<=Math.floor(Date.now()/1000))return null;return sessao;}catch{return null;}}

function hashPassword(password:string){const salt=randomUUID().replaceAll('-','');return `scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;}
function verifyPassword(password:string,stored:string){try{const[,salt,hash]=stored.split(':');if(!salt||!hash)return false;const actual=scryptSync(password,salt,64).toString('hex');const a=Buffer.from(actual,'hex'),b=Buffer.from(hash,'hex');return a.length===b.length&&timingSafeEqual(a,b);}catch{return false;}}

async function garantirUtilizadoresIniciais(){
 const contas=[
  {login:process.env.ADMIN_USER_ID||'ekimane',nome:'Administrador',papel:'Administrador' as const,password:process.env.ADMIN_PASSWORD||''},
  {login:process.env.RH_USER_ID||'ifloma',nome:'Responsável RH',papel:'RH' as const,password:process.env.RH_PASSWORD||''},
  {login:process.env.OUTRO_USER_ID||'ifloma',nome:'Outro utilizador',papel:'Outro' as const,password:process.env.OUTRO_PASSWORD||''},
 ];
 if(contas.some(c=>!c.password)) return;
 await withTransaction(async client=>{for(const conta of contas){const existente=await client.query<{id:string}>('select id from utilizadores where lower(login)=lower($1) and papel=$2 limit 1',[conta.login.trim(),conta.papel]);if(!existente.rows[0])await client.query('insert into utilizadores(id,login,nome,papel,password_hash,ativo,atualizado_em) values($1,$2,$3,$4,$5,1,CURRENT_TIMESTAMP)',[randomUUID(),conta.login.trim(),conta.nome,conta.papel,hashPassword(conta.password)]);}});
}

export async function autenticar(id:string,password:string){await garantirUtilizadoresIniciais();const login=id.trim().toLowerCase();const result=await dbQuery<{id:string;login:string;nome:string;papel:Papel;password_hash:string;ativo:boolean}>('select id,login,nome,papel,password_hash,ativo from utilizadores where lower(login)=lower($1) and ativo=true',[login]);const conta=result.rows.find(c=>verifyPassword(password,c.password_hash));return conta||null;}
export async function obterSessaoServidor(){const store=await cookies();const sessao=lerSessao(store.get(SESSION_COOKIE)?.value);if(!sessao)return null;await garantirUtilizadoresIniciais();const r=await dbQuery<{id:string;nome:string;papel:Papel;ativo:boolean}>('select id,nome,papel,ativo from utilizadores where id=$1',[sessao.utilizadorId]);if(!r.rows[0]?.ativo)return null;return {...sessao,nome:r.rows[0].nome,papel:r.rows[0].papel};}
export function temPermissao(papel:Papel,permissao:Permissao){return permissoesPorPapel[papel]?.[permissao]===true;}
export async function exigirSessao(){const sessao=await obterSessaoServidor();if(!sessao)throw new Error('UNAUTHORIZED');return sessao;}
export async function exigirPermissao(permissao:Permissao){const sessao=await exigirSessao();if(!temPermissao(sessao.papel,permissao))throw new Error('FORBIDDEN');return sessao;}
export async function exigirPapel(...papeis:Papel[]){const sessao=await exigirSessao();if(!papeis.includes(sessao.papel))throw new Error('FORBIDDEN');return sessao;}
export function respostaAutorizacao(error:unknown){if(error instanceof Error&&error.message==='FORBIDDEN')return NextResponse.json({ok:false,erro:'Sem permissão para esta operação.'},{status:403});return NextResponse.json({ok:false,erro:'Sessão inválida ou expirada.'},{status:401});}
