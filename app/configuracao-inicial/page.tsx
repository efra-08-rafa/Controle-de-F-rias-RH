'use client';
import { useEffect,useState } from 'react';

type Conta={login:string;nome:string;papel:'Administrador'|'RH'|'Outro';password:string};
const inicial:Conta[]=[
 {login:'',nome:'Administrador',papel:'Administrador',password:''},
 {login:'',nome:'Responsável RH',papel:'RH',password:''},
 {login:'',nome:'Outro utilizador',papel:'Outro',password:''}
];
export default function ConfiguracaoInicial(){
 const[contas,setContas]=useState(inicial); const[carregando,setCarregando]=useState(true); const[erro,setErro]=useState('');
 useEffect(()=>{fetch('/api/configuracao-inicial').then(r=>r.json()).then(d=>{if(d.configurado) window.location.href='/login';}).finally(()=>setCarregando(false));},[]);
 function alterar(i:number,campo:keyof Conta,valor:string){setContas(v=>v.map((c,n)=>n===i?{...c,[campo]:valor}:c));}
 async function guardar(e:React.FormEvent){e.preventDefault();setErro('');if(contas.some(c=>!c.login.trim()||c.password.length<4)){setErro('Preencha todos os IDs e palavras-passe com pelo menos 4 caracteres.');return;}const r=await fetch('/api/configuracao-inicial',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contas})});const d=await r.json();if(!r.ok){setErro(d.erro||'Não foi possível concluir a configuração.');return;}window.location.href='/login';}
 if(carregando)return <main className="login-page"><div className="login-card"><h1>A preparar o sistema...</h1></div></main>;
 return <main className="login-page"><div className="login-card" style={{maxWidth:760}}><div className="login-brand">IFLOMA — Controlo de Férias RH</div><h1>Configuração inicial</h1><p className="login-subtitle">Na primeira instalação, defina os três acessos do sistema. Esta etapa substitui o .env.local.</p><form onSubmit={guardar} className="employee-form">{contas.map((c,i)=><section key={c.papel} style={{border:'1px solid #ddd',borderRadius:12,padding:16,marginBottom:14}}><h2 style={{marginTop:0}}>{c.papel}</h2><label className="login-label">ID<input value={c.login} onChange={e=>alterar(i,'login',e.target.value)} required/></label><label className="login-label">Nome<input value={c.nome} onChange={e=>alterar(i,'nome',e.target.value)} required/></label><label className="login-label">Palavra-passe<input type="password" value={c.password} onChange={e=>alterar(i,'password',e.target.value)} minLength={4} required/></label></section>)}{erro&&<p className="login-error">{erro}</p>}<button className="primary-button login-button">Concluir configuração</button></form></div></main>;
}
