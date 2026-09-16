'use client';

import { useEffect, useMemo, useState } from 'react';
import { contratoProximo, diasUtilizadosReal, diasVencidos, direitoAcumulado, estadoFerias, saldoRestante, type FuncionarioFerias } from '../lib/ferias';

type Departamento = { id: string; nome: string; totalFuncionarios?: number };
type Funcionario = FuncionarioFerias & { id: string; contacto: string; departamento: string; historico: NonNullable<FuncionarioFerias['historico']> };

function mapear(f: any, hist: Record<string, any[]>): Funcionario {
  return { processo: f.processo || '', nome: f.nome || '', tipoContrato: f.tipoContrato, admissao: f.admissao || '', fimContrato: f.fimContrato || '', diasUtilizados: 0, inicioFerias: '', fimFerias: '', historico: (hist[f.id] || []).map(x => ({ inicio: x.inicio, fim: x.fim, dias: Number(x.dias) || 0, estado: x.estado || '' })), id: f.id, contacto: f.contacto || '', departamento: f.departamento || '—' };
}
function formatar(s: string) { if (!s) return '—'; const [a, m, d] = s.split('-'); return `${d}/${m}/${a}`; }

export default function Home() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [erro, setErro] = useState('');

  async function carregar() {
    setErro('');
    try {
      const stamp = Date.now().toString();
      const [rF, rD, rH] = await Promise.all([
        fetch(`/api/funcionarios?_painel=${stamp}`, { cache: 'no-store' }),
        fetch(`/api/departamentos?_painel=${stamp}`, { cache: 'no-store' }),
        fetch(`/api/ferias?_painel=${stamp}`, { cache: 'no-store' }),
      ]);
      const df = await rF.json(); const dd = await rD.json(); const dh = await rH.json();
      if (!rF.ok) throw new Error(df.erro || 'Não foi possível carregar funcionários.');
      if (!rD.ok) throw new Error(dd.erro || 'Não foi possível carregar departamentos.');
      if (!rH.ok) throw new Error(dh.erro || 'Não foi possível carregar férias.');
      const hist: Record<string, any[]> = {};
      for (const x of dh.ferias || []) (hist[x.funcionarioId] ??= []).push(x);
      setFuncionarios((df.funcionarios || []).map((f: any) => mapear(f, hist)));
      setDepartamentos(dd.departamentos || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível carregar os dados.');
    } finally { setCarregado(true); }
  }

  useEffect(() => { carregar(); const intervalo = window.setInterval(carregar, 30000); const voltar = () => { if (document.visibilityState === 'visible') carregar(); }; document.addEventListener('visibilitychange', voltar); window.addEventListener('focus', carregar); return () => { window.clearInterval(intervalo); document.removeEventListener('visibilitychange', voltar); window.removeEventListener('focus', carregar); }; }, []);

  const resumo = useMemo(() => ({
    total: funcionarios.length,
    emFerias: funcionarios.filter(f => (f.historico || []).some(h => estadoFerias(h.inicio, h.fim) === 'Em férias')).length,
    proximas: funcionarios.filter(f => (f.historico || []).some(h => estadoFerias(h.inicio, h.fim) === 'Férias próximas')).length,
    vencidas: funcionarios.filter(f => diasVencidos(f) > 0).length,
    saldo: funcionarios.reduce((s, f) => s + saldoRestante(f), 0),
    contratos: funcionarios.filter(contratoProximo).length
  }), [funcionarios]);
  const alertasVencidas = funcionarios.filter(f => diasVencidos(f) > 0);
  const alertasProximas = funcionarios.filter(f => (f.historico || []).some(h => estadoFerias(h.inicio, h.fim) === 'Férias próximas'));
  const alertasContrato = funcionarios.filter(contratoProximo);

  return <main><div className="container">
    <section className="hero"><h1>Painel de férias dos Recursos Humanos</h1><p>Dados atualizados automaticamente através das APIs e do banco de dados.</p>{erro && <p className="form-message" style={{ color: '#dc2626' }}>{erro}</p>}</section>
    <section className="grid">
      <div className="card"><span className="card-label">Total de funcionários</span><span className="card-value">{carregado ? resumo.total : '…'}</span></div>
      <div className="card"><span className="card-label">Férias em curso</span><span className="card-value">{resumo.emFerias}</span></div>
      <div className="card"><span className="card-label">Férias próximas</span><span className="card-value">{resumo.proximas}</span></div>
      <div className="card"><span className="card-label">Férias vencidas</span><span className="card-value">{resumo.vencidas}</span></div>
      <div className="card"><span className="card-label">Saldo total de férias</span><span className="card-value">{resumo.saldo} <small>dias</small></span></div>
      <div className="card"><span className="card-label">Contratos a terminar (30 dias)</span><span className="card-value">{resumo.contratos}</span></div>
    </section>
    <section className="section"><h2>Departamentos</h2><div className="department-list">{departamentos.map(dep => <a className="department" href={`/departamentos?nome=${encodeURIComponent(dep.nome)}`} key={dep.id}><strong>{dep.nome}</strong><span>{funcionarios.filter(f => f.departamento === dep.nome).length} funcionário(s)</span></a>)}</div>{carregado && !departamentos.length && <p className="empty-state">Nenhum departamento cadastrado.</p>}</section>
    <section className="section"><h2>Alertas automáticos</h2>{!carregado ? <p className="empty-state">A carregar dados...</p> : !funcionarios.length ? <p className="empty-state">Cadastre funcionários para começar a receber alertas automáticos.</p> : <>{alertasVencidas.map(f => <div className="alert-card danger" key={`v-${f.id}`}><strong>Férias vencidas:</strong> {f.nome} — {diasVencidos(f)} dia(s) de saldo de anos anteriores.</div>)}{alertasProximas.map(f => <div className="alert-card" key={`p-${f.id}`}><strong>Férias próximas:</strong> {f.nome} — existe um período com início próximo.</div>)}{alertasContrato.map(f => <div className="alert-card warning" key={`c-${f.id}`}><strong>Contrato a terminar:</strong> {f.nome} — {formatar(f.fimContrato)}.</div>)}{!alertasVencidas.length && !alertasProximas.length && !alertasContrato.length && <p className="empty-state">Nenhum alerta pendente neste momento.</p>}</>}</section>
    <section className="section"><h2>Saldo dos funcionários</h2>{!funcionarios.length ? <p className="empty-state">Nenhum funcionário cadastrado.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Departamento</th><th>Direito</th><th>Utilizados</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>{funcionarios.map(f => { const h = f.historico || []; const ultimo = h[h.length - 1]; return <tr key={f.id}><td>{f.processo}</td><td><strong>{f.nome}</strong></td><td><strong>{f.departamento}</strong></td><td>{direitoAcumulado(f)} dias</td><td>{diasUtilizadosReal(f)} dias</td><td><strong>{saldoRestante(f)} dias</strong></td><td>{ultimo ? estadoFerias(ultimo.inicio, ultimo.fim) : 'Disponível'}</td></tr>; })}</tbody></table></div>}</section>
    <section className="section"><h2>Ações rápidas</h2><div className="quick-links"><a href="/funcionarios">+ Funcionário</a><a href="/ferias">Registar férias</a><a href="/departamentos">Ver departamentos</a><a href="/relatorios">Abrir relatórios</a></div></section>
  </div></main>;
}
