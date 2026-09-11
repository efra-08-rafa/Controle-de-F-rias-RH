'use client';

import { useEffect, useMemo, useState } from 'react';

type Funcionario = { processo: string; nome: string; contacto: string; departamento: string; tipoContrato: string; admissao: string; fimContrato: string; diasUtilizados: number; inicioFerias: string; fimFerias: string };
const STORAGE = 'controle-ferias-rh-funcionarios';
const departamentos = ['Administração','Serração','Vendas','Carpintaria','Manutenção','Mecânica','Seguranças'];

export default function DepartamentosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [filtro, setFiltro] = useState('Todos');
  useEffect(() => { try { const v = localStorage.getItem(STORAGE); if (v) setFuncionarios(JSON.parse(v)); } catch {} }, []);
  const grupos = useMemo(() => departamentos.map(departamento => ({ departamento, lista: funcionarios.filter(f => f.departamento === departamento) })), [funcionarios]);
  const gruposVisiveis = filtro === 'Todos' ? grupos : grupos.filter(g => g.departamento === filtro);
  return <main><div className="container">
    <section className="hero"><h1>Departamentos</h1><p>Os funcionários são agrupados automaticamente pelo departamento cadastrado.</p></section>
    <section className="section card"><label className="filter-label">Filtrar departamento<select value={filtro} onChange={e => setFiltro(e.target.value)}><option>Todos</option>{departamentos.map(d => <option key={d}>{d}</option>)}</select></label></section>
    <section className="section"><div className="department-grid">{gruposVisiveis.map(({ departamento, lista }) => <div className="card department-panel" key={departamento}><div className="department-heading"><div><h2>{departamento}</h2><span>{lista.length} funcionário(s)</span></div></div>{lista.length === 0 ? <p className="empty-state">Nenhum funcionário neste departamento.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Contacto</th><th>Contrato</th><th>Admissão</th></tr></thead><tbody>{lista.map(f => <tr key={f.processo}><td>{f.processo}</td><td>{f.nome}</td><td>{f.contacto || '—'}</td><td>{f.tipoContrato}</td><td>{f.admissao || '—'}</td></tr>)}</tbody></table></div>}</div>)}</div></section>
  </div></main>;
}
