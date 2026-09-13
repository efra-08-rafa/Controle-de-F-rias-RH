'use client';

import { useEffect, useMemo, useState } from 'react';
import { contratoProximo, diasUtilizadosReal, diasVencidos, direitoAcumulado, estadoFerias, saldoRestante, STORAGE_FERIAS, type FuncionarioFerias } from '../lib/ferias';

type Funcionario = FuncionarioFerias & { contacto: string; departamento: string };
const departamentos = ['Administração','Serração','Vendas','Carpintaria','Manutenção','Mecânica','Seguranças'];
function formatar(s:string){if(!s)return'—';const[a,m,d]=s.split('-');return`${d}/${m}/${a}`;}

export default function Home(){
 const[funcionarios,setFuncionarios]=useState<Funcionario[]>([]);
 useEffect(()=>{try{const v=localStorage.getItem(STORAGE_FERIAS);if(v)setFuncionarios(JSON.parse(v));}catch{}},[]);
 const resumo=useMemo(()=>({
  total:funcionarios.length,
  emFerias:funcionarios.filter(f=>estadoFerias(f.inicioFerias,f.fimFerias)==='Em férias').length,
  proximas:funcionarios.filter(f=>estadoFerias(f.inicioFerias,f.fimFerias)==='Férias próximas').length,
  vencidas:funcionarios.filter(f=>diasVencidos(f)>0).length,
  saldo:funcionarios.reduce((s,f)=>s+saldoRestante(f),0),
  contratos:funcionarios.filter(contratoProximo).length,
 }),[funcionarios]);
 const alertasVencidas=funcionarios.filter(f=>diasVencidos(f)>0);
 const alertasProximas=funcionarios.filter(f=>estadoFerias(f.inicioFerias,f.fimFerias)==='Férias próximas');
 const alertasContrato=funcionarios.filter(contratoProximo);
 return <main><div className="container">
  <section className="hero"><h1>Painel de férias dos Recursos Humanos</h1><p>Visão geral automática dos funcionários, férias, saldos e alertas.</p></section>
  <section className="grid"><div className="card"><span className="card-label">Total de funcionários</span><span className="card-value">{resumo.total}</span></div><div className="card"><span className="card-label">Férias em curso</span><span className="card-value">{resumo.emFerias}</span></div><div className="card"><span className="card-label">Férias próximas</span><span className="card-value">{resumo.proximas}</span></div><div className="card"><span className="card-label">Férias vencidas</span><span className="card-value">{resumo.vencidas}</span></div><div className="card"><span className="card-label">Saldo total de férias</span><span className="card-value">{resumo.saldo} <small>dias</small></span></div><div className="card"><span className="card-label">Contratos a terminar (30 dias)</span><span className="card-value">{resumo.contratos}</span></div></section>
  <section className="section"><h2>Departamentos</h2><div className="department-list">{departamentos.map(dep=>{const lista=funcionarios.filter(f=>f.departamento===dep);return <a className="department" href={`/departamentos?nome=${encodeURIComponent(dep)}`} key={dep}><strong>{dep}</strong><span>{lista.length} funcionário(s)</span></a>;})}</div></section>
  <section className="section"><h2>Alertas automáticos</h2>{!funcionarios.length&&<p className="empty-state">Cadastre funcionários para começar a receber alertas automáticos.</p>}
   {alertasVencidas.map(f=><div className="alert-card danger" key={`v-${f.processo}`}><strong>Férias vencidas:</strong> {f.nome} — {diasVencidos(f)} dia(s) de saldo de anos anteriores ainda não utilizados.</div>)}
   {alertasProximas.map(f=><div className="alert-card" key={`p-${f.processo}`}><strong>Férias próximas:</strong> {f.nome} — início em {formatar(f.inicioFerias)}.</div>)}
   {alertasContrato.map(f=><div className="alert-card warning" key={`c-${f.processo}`}><strong>Contrato a terminar:</strong> {f.nome} — {formatar(f.fimContrato)}.</div>)}
   {!!funcionarios.length&&!alertasVencidas.length&&!alertasProximas.length&&!alertasContrato.length&&<p className="empty-state">Nenhum alerta pendente neste momento.</p>}
  </section>
  <section className="section"><h2>Saldo dos funcionários</h2>{funcionarios.length===0?<p className="empty-state">Nenhum funcionário cadastrado.</p>:<div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Direito</th><th>Utilizados</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{funcionarios.map(f=><tr key={f.processo}><td>{f.processo}</td><td><strong>{f.nome}</strong></td><td>{direitoAcumulado(f)} dias</td><td>{diasUtilizadosReal(f)} dias</td><td><strong>{saldoRestante(f)} dias</strong></td><td>{estadoFerias(f.inicioFerias,f.fimFerias)}</td></tr>)}</tbody></table></div>}</section>
  <section className="section"><h2>Ações rápidas</h2><div className="quick-links"><a href="/funcionarios">+ Funcionário</a><a href="/ferias">Registar férias</a><a href="/departamentos">Ver departamentos</a><a href="/relatorios">Abrir relatórios</a></div></section>
 </div></main>;
}
