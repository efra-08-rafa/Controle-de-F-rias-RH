'use client';
import {FormEvent,useEffect,useState} from 'react';

export default function Login(){
 const[id,setId]=useState(''); const[password,setPassword]=useState(''); const[erro,setErro]=useState(''); const[loading,setLoading]=useState(false);
 useEffect(()=>{fetch('/api/configuracao-inicial').then(r=>r.json()).then(d=>{if(!d.configurado) window.location.href='/configuracao-inicial';}).catch(()=>{});},[]);
 async function entrar(e:FormEvent){e.preventDefault();setErro('');setLoading(true);try{const response=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,password})});const data=await response.json();if(!response.ok){setErro(data?.erro||'ID ou palavra-passe incorreta.');return;}window.location.href='/';}catch{setErro('Não foi possível iniciar sessão. Tente novamente.');}finally{setLoading(false);}}
 return <main className="login-page"><div className="login-card"><div className="login-brand">Controlo de Férias RH</div><h1>Iniciar sessão</h1><p className="login-subtitle">Entre com o seu ID e palavra-passe.</p><form onSubmit={entrar} className="employee-form"><label className="login-label">ID do utilizador<input type="text" value={id} onChange={e=>{setId(e.target.value);setErro('')}} placeholder="Digite o seu ID" required autoFocus/></label><label className="login-label">Palavra-passe<input type="password" value={password} onChange={e=>{setPassword(e.target.value);setErro('')}} placeholder="Digite a palavra-passe" required/></label>{erro&&<p className="login-error">{erro}</p>}<button className="primary-button login-button" disabled={loading}>{loading?'A entrar...':'Entrar'}</button></form></div></main>
}
