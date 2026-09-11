'use client';

export type Papel = 'Administrador' | 'RH' | 'Outro';
export type Permissoes = { painel:boolean; funcionarios:boolean; ferias:boolean; departamentos:boolean; relatorios:boolean; configuracoes:boolean; utilizadores:boolean };
export type Utilizador = { id:string; nome:string; email:string; papel:Papel; ativo:boolean; passwordHash:string; permissoes:Permissoes };
export type Sessao = { utilizadorId:string; nome:string; email:string; papel:Papel; permissoes:Permissoes; inicio:string };

const USERS_KEY='controle-ferias-rh-utilizadores';
const SESSION_KEY='controle-ferias-rh-sessao';
export const permissoesAdmin:Permissoes={painel:true,funcionarios:true,ferias:true,departamentos:true,relatorios:true,configuracoes:true,utilizadores:true};
export const permissoesRH:Permissoes={painel:true,funcionarios:true,ferias:true,departamentos:true,relatorios:true,configuracoes:false,utilizadores:false};
export const permissoesOutro:Permissoes={painel:true,funcionarios:false,ferias:false,departamentos:true,relatorios:false,configuracoes:false,utilizadores:false};
const utilizadoresIniciais:Utilizador[]=[
{id:'USR-001',nome:'Administrador',email:'admin@rh.local',papel:'Administrador',ativo:true,passwordHash:'12b738a4',permissoes:permissoesAdmin},
{id:'USR-002',nome:'Responsável RH',email:'rh@rh.local',papel:'RH',ativo:true,passwordHash:'2388cedb',permissoes:permissoesRH},
{id:'USR-003',nome:'Utilizador',email:'utilizador@rh.local',papel:'Outro',ativo:true,passwordHash:'64c1956a',permissoes:permissoesOutro},
];
export function hashPassword(password:string){let hash=2166136261;for(let i=0;i<password.length;i++)hash=Math.imul(hash^password.charCodeAt(i),16777619);return(hash>>>0).toString(16).padStart(8,'0');}
export function getUtilizadores():Utilizador[]{if(typeof window==='undefined')return utilizadoresIniciais;try{const raw=localStorage.getItem(USERS_KEY);if(!raw){localStorage.setItem(USERS_KEY,JSON.stringify(utilizadoresIniciais));return utilizadoresIniciais;}return JSON.parse(raw);}catch{return utilizadoresIniciais;}}
export function saveUtilizadores(users:Utilizador[]){localStorage.setItem(USERS_KEY,JSON.stringify(users));}
export function getSessao():Sessao|null{try{const raw=localStorage.getItem(SESSION_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
export function guardarSessao(user:Utilizador){localStorage.setItem(SESSION_KEY,JSON.stringify({utilizadorId:user.id,nome:user.nome,email:user.email,papel:user.papel,permissoes:user.permissoes,inicio:new Date().toISOString()} satisfies Sessao));}
export function terminarSessao(){localStorage.removeItem(SESSION_KEY);}
export function getPermissoesPorPapel(papel:Papel){return papel==='Administrador'?permissoesAdmin:papel==='RH'?permissoesRH:permissoesOutro;}
