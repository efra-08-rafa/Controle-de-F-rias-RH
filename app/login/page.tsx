'use client';
import {FormEvent,useState} from 'react';
import {getUtilizadores,guardarSessao,hashPassword} from '../../lib/auth';

export default function Login(){
 const[id,setId]=useState(''); const[password,setPassword]=useState(''); const[erro,setErro]=useState('');
 function entrar(e:FormEvent){e.preventDefault(); const login=id.trim().toLowerCase(); const senha=hashPassword(password);
   const u=getUtilizadores().find(x=>x.id.toLowerCase()===login&&x.passwordHash===senha&&x.ativo);
   if(!u){setErro('ID ou palavra-passe incorreta.');return;} guardarSessao(u); window.location.href='/';
 }
 return <main className="login-page"><div className="login-card"><div className="login-brand">Controlo de Férias RH</div><h1>Iniciar sessão</h1><p className="login-subtitle">Entre com o seu ID e palavra-passe.</p><form onSubmit={entrar} className="employee-form"><label className="login-label">ID do utilizador<input type="text" value={id} onChange={e=>{setId(e.target.value);setErro('')}} placeholder="Digite o seu ID" required autoFocus/></label><label className="login-label">Palavra-passe<input type="password" value={password} onChange={e=>{setPassword(e.target.value);setErro('')}} placeholder="Digite a palavra-passe" required/></label>{erro&&<p className="login-error">{erro}</p>}<button className="primary-button login-button">Entrar</button></form></div></main>
}
