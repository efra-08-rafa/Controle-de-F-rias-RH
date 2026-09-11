'use client';

import { useEffect, useMemo, useState } from 'react';

type Historico = { inicio: string; fim: string; dias: number; estado: string };
type Funcionario = { processo: string; nome: string; contacto: string; departamento: string; tipoContrato: string; admissao: string; fimContrato: string; diasUtilizados: number; inicioFerias: string; fimFerias: string; historico: Historico[] };
const STORAGE = 'controle-ferias-rh-funcionarios';
const departamentos = ['Administração','Serração','Vendas','Carpintaria','Manutenção','Mecânica','Seguranças'];
function formatar(s: string) { if (!s) return '—'; const [a,m,d] = s.split('-'); return `${d}/${m}/${a}`; }
function data(s: string) { return s ? new Date(`${s}T00:00:00`) : null; }
function direito(f: Funcionario) { if (!f.admissao) return 0; const a=data(f.admissao); if(!a)return 0; if(f.tipoContrato==='Permanente') return Math.max(0,new Date().getFullYear()-Math.max(2000,a.getFullYear())+1)*30; if(!f.fimContrato)return 0; const b=data(f.fimContrato); if(!b||b<a)return 0; return Math.max(0,(b.getFullYear()-a.getFullYear())*12+b.getMonth()-a.getMonth()+(b.getDate()>=a.getDate()?0:-1)+1); }
export default function RelatoriosPage() {
  const [funcionarios,setFuncionarios]=useState<Funcionario[]>([]); const [tipo,setTipo]=useState('funcionario'); const [filtro,setFiltro]=useState(''); const [de,setDe]=useState(''); const [ate,setAte]=useState('');
  useEffect(()=>{try{const v=localStorage.getItem(STORAGE);if(v)setFuncionarios(JSON.parse(v));}catch{}},[]);
  const lista=useMemo(()=>funcionarios.filter(f=>{const texto=!filtro||f.nome.toLowerCase().includes(filtro.toLowerCase())||f.processo.includes(filtro)||f.departamento===filtro; const hist=(f.historico||[]).filter(h=>(!de||h.inicio>=de)&&(!ate||h.fim<=ate)); return texto&&((!de&&!ate)||hist.length>0);}),[funcionarios,filtro,de,ate]);
  return <main><div className="container"><section className="hero"><h1>Relatórios</h1><p>Consulte férias por funcionário, departamento e período.</p></section>
    <section className="section card"><div className="form-grid"><label>Tipo de relatório<select value={tipo} onChange={e=>{setTipo(e.target.value);setFiltro('')}}><option value="funcionario">Por funcionário</option><option value="departamento">Por departamento</option><option value="periodo">Por período</option></select></label>{tipo==='funcionario'&&<label>Funcionário<select value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="">Todos</option>{funcionarios.map(f=><option key={f.processo} value={f.processo}>{f.processo} — {f.nome}</option>)}</select></label>}{tipo==='departamento'&&<label>Departamento<select value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="">Todos</option>{departamentos.map(d=><option key={d}>{d}</option>)}</select></label>}{tipo==='periodo'&&<><label>Data inicial<input type="date" value={de} onChange={e=>setDe(e.target.value)}/></label><label>Data final<input type="date" value={ate} onChange={e=>setAte(e.target.value)}/></label></>}</div></section>
    <section className="section"><h2>Resultado</h2>{lista.length===0?<p className="empty-state">Nenhum resultado para os filtros selecionados.</p>:<div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Funcionário</th><th>Departamento</th><th>Direito</th><th>Utilizados</th><th>Saldo</th><th>Histórico</th></tr></thead><tbody>{lista.map(f=><tr key={f.processo}><td>{f.processo}</td><td>{f.nome}</td><td>{f.departamento}</td><td>{direito(f)} dias</td><td>{f.diasUtilizados||0} dias</td><td>{Math.max(0,direito(f)-(f.diasUtilizados||0))} dias</td><td>{(f.historico||[]).length} registo(s)</td></tr>)}</tbody></table></div>}</section>
  </div></main>;
}
