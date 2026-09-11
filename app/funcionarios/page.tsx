'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';

const DEPARTAMENTOS = ['Administração', 'Serração', 'Vendas', 'Carpintaria', 'Manutenção', 'Mecânica', 'Seguranças'];
const ANO_INICIAL_FERIAS = 2000;
type TipoContrato = 'Permanente' | 'Contratado';
type EstadoFerias = 'Disponível' | 'Férias próximas' | 'Em férias' | 'Férias terminadas' | 'Férias vencidas';
type HistoricoFerias = { inicio: string; fim: string; dias: number; estado: EstadoFerias };
type Funcionario = { processo: string; nome: string; contacto: string; departamento: string; tipoContrato: TipoContrato; admissao: string; fimContrato: string; diasUtilizados: number; inicioFerias: string; fimFerias: string; historico: HistoricoFerias[] };

const CHAVE_STORAGE = 'controle-ferias-rh-funcionarios';

function calcularDireito(f: Funcionario) {
  if (!f.admissao) return 0;
  const inicio = new Date(`${f.admissao}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 0;
  if (f.tipoContrato === 'Permanente') {
    const anoInicio = Math.max(inicio.getFullYear(), ANO_INICIAL_FERIAS);
    const anoAtual = new Date().getFullYear();
    return Math.max(0, anoAtual - anoInicio + 1) * 30;
  }
  if (!f.fimContrato) return 0;
  const fim = new Date(`${f.fimContrato}T00:00:00`);
  if (Number.isNaN(fim.getTime()) || fim < inicio) return 0;
  const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth()) + (fim.getDate() >= inicio.getDate() ? 0 : -1) + 1;
  return Math.max(0, meses);
}

function calcularAnosDireito(f: Funcionario) {
  if (f.tipoContrato !== 'Permanente' || !f.admissao) return 0;
  const inicio = new Date(`${f.admissao}T00:00:00`);
  if (Number.isNaN(inicio.getTime())) return 0;
  return Math.max(0, new Date().getFullYear() - Math.max(inicio.getFullYear(), ANO_INICIAL_FERIAS) + 1);
}

function adicionarDias(data: string, quantidade: number) {
  if (!data || quantidade <= 0) return '';
  const resultado = new Date(`${data}T00:00:00`);
  resultado.setDate(resultado.getDate() + quantidade - 1);
  return `${resultado.getFullYear()}-${String(resultado.getMonth() + 1).padStart(2, '0')}-${String(resultado.getDate()).padStart(2, '0')}`;
}

function calcularDias(inicio: string, fim: string) {
  if (!inicio || !fim) return 0;
  const a = new Date(`${inicio}T00:00:00`), b = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return 0;
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
}

function calcularEstado(inicio: string, fim: string): EstadoFerias {
  if (!inicio || !fim) return 'Disponível';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const a = new Date(`${inicio}T00:00:00`), b = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 'Disponível';
  const seteDias = new Date(hoje); seteDias.setDate(hoje.getDate() + 7);
  if (hoje > b) return 'Férias terminadas';
  if (hoje >= a && hoje <= b) return 'Em férias';
  if (a <= seteDias) return 'Férias próximas';
  return 'Disponível';
}

function formatarData(data: string) { return data ? new Date(`${data}T00:00:00`).toLocaleDateString('pt-PT') : '—'; }

export default function FuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [form, setForm] = useState<Funcionario>({ processo: '', nome: '', contacto: '', departamento: 'Administração', tipoContrato: 'Permanente', admissao: '', fimContrato: '', diasUtilizados: 0, inicioFerias: '', fimFerias: '', historico: [] });
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    try {
      const dados = localStorage.getItem(CHAVE_STORAGE);
      if (dados) setFuncionarios(JSON.parse(dados));
    } catch { setMensagem('Não foi possível carregar os dados guardados neste navegador.'); }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (carregado) localStorage.setItem(CHAVE_STORAGE, JSON.stringify(funcionarios));
  }, [funcionarios, carregado]);

  const total = funcionarios.length;
  const permanentes = useMemo(() => funcionarios.filter((item) => item.tipoContrato === 'Permanente').length, [funcionarios]);
  const fimFeriasAutomatico = form.inicioFerias && form.diasUtilizados > 0 ? adicionarDias(form.inicioFerias, form.diasUtilizados) : '';

  function atualizarCampo(campo: keyof Funcionario, valor: string | number) {
    setForm((atual) => ({ ...atual, [campo]: campo === 'fimFerias' ? fimFeriasAutomatico : valor }));
  }

  function adicionarFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMensagem('');
    if (!form.processo.trim() || !form.nome.trim() || !form.contacto.trim() || !form.admissao) return setMensagem('Preencha Número de processo, Nome, Contacto e Data de admissão.');
    if (form.tipoContrato === 'Contratado' && !form.fimContrato) return setMensagem('Para contrato Contratado, informe a data de fim do contrato.');
    if (form.diasUtilizados > 0 && !form.inicioFerias) return setMensagem('Informe a data de início das férias quando houver dias utilizados.');
    if (funcionarios.some((item) => item.processo === form.processo.trim())) return setMensagem('Já existe um funcionário com este Número de processo.');

    const fimFerias = form.inicioFerias && form.diasUtilizados > 0 ? adicionarDias(form.inicioFerias, form.diasUtilizados) : '';
    const historico = form.inicioFerias && fimFerias && form.diasUtilizados > 0 ? [{ inicio: form.inicioFerias, fim: fimFerias, dias: form.diasUtilizados, estado: calcularEstado(form.inicioFerias, fimFerias) }] : [];
    setFuncionarios((atuais) => [...atuais, { ...form, processo: form.processo.trim(), nome: form.nome.trim(), fimFerias, historico }]);
    setMensagem('Funcionário adicionado com sucesso e guardado neste navegador.');
    setForm((atual) => ({ ...atual, processo: '', nome: '', contacto: '', admissao: '', fimContrato: '', diasUtilizados: 0, inicioFerias: '', fimFerias: '', historico: [] }));
  }

  function removerFuncionario(processo: string) { setFuncionarios((atuais) => atuais.filter((item) => item.processo !== processo)); }

  return <main><div className="container">
    <div className="hero"><h1>Funcionários</h1><p>Cadastro central dos funcionários e controle automático de férias.</p></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      <div className="card"><span className="card-label">Total de funcionários</span><strong className="card-value">{total}</strong></div>
      <div className="card"><span className="card-label">Permanentes</span><strong className="card-value">{permanentes}</strong></div>
      <div className="card"><span className="card-label">Contratados</span><strong className="card-value">{total - permanentes}</strong></div>
    </div>

    <section className="section"><h2>Novo funcionário</h2><form onSubmit={adicionarFuncionario} className="card employee-form">
      <div className="form-grid">
        <label>Número de processo<input value={form.processo} onChange={(e) => atualizarCampo('processo', e.target.value)} placeholder="Ex.: 0025" /></label>
        <label>Nome<input value={form.nome} onChange={(e) => atualizarCampo('nome', e.target.value)} placeholder="Nome completo" /></label>
        <label>Contacto<input value={form.contacto} onChange={(e) => atualizarCampo('contacto', e.target.value)} placeholder="Telefone" /></label>
        <label>Departamento<select value={form.departamento} onChange={(e) => atualizarCampo('departamento', e.target.value)}>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>Tipo de contrato<select value={form.tipoContrato} onChange={(e) => atualizarCampo('tipoContrato', e.target.value as TipoContrato)}><option>Permanente</option><option>Contratado</option></select></label>
        <label>Data de admissão<input type="date" value={form.admissao} onChange={(e) => atualizarCampo('admissao', e.target.value)} /></label>
        <label>Fim do contrato<input type="date" value={form.fimContrato} onChange={(e) => atualizarCampo('fimContrato', e.target.value)} disabled={form.tipoContrato === 'Permanente'} /></label>
        <label>Dias utilizados<input type="number" min="0" value={form.diasUtilizados} onChange={(e) => atualizarCampo('diasUtilizados', Number(e.target.value))} placeholder="Ex.: 5" /></label>
        <label>Início das férias<input type="date" value={form.inicioFerias} onChange={(e) => atualizarCampo('inicioFerias', e.target.value)} /></label>
        <label>Fim das férias (automático)<input type="date" value={fimFeriasAutomatico} readOnly disabled={!fimFeriasAutomatico} /></label>
      </div>
      <div className="vacation-preview"><strong>Resumo de férias</strong><span>Direito acumulado: {calcularDireito(form)} dias</span><span>Anos contabilizados: {calcularAnosDireito(form) || '—'}</span><span>Restantes: {Math.max(0, calcularDireito(form) - form.diasUtilizados)} dias</span><span>Período: {form.inicioFerias ? `${formatarData(form.inicioFerias)} – ${formatarData(fimFeriasAutomatico)}` : '—'}</span><span>Estado: {calcularEstado(form.inicioFerias, fimFeriasAutomatico)}</span></div>
      <button className="primary-button" type="submit">Adicionar funcionário</button>
      {mensagem && <p className="form-message">{mensagem}</p>}
    </form></section>

    <section className="section"><h2>Registo de funcionários</h2>{funcionarios.length === 0 ? <div className="card empty-state">Ainda não existem funcionários cadastrados.</div> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Contacto</th><th>Departamento</th><th>Contrato</th><th>Direito acumulado</th><th>Utilizados</th><th>Restantes</th><th>Férias</th><th>Estado</th><th>Ações</th></tr></thead><tbody>{funcionarios.map((f) => { const direito = calcularDireito(f), restantes = Math.max(0, direito - f.diasUtilizados), estado = calcularEstado(f.inicioFerias, f.fimFerias); return <tr key={f.processo}><td>{f.processo}</td><td><strong>{f.nome}</strong></td><td>{f.contacto}</td><td>{f.departamento}</td><td>{f.tipoContrato}</td><td>{direito} dias</td><td>{f.diasUtilizados} dias</td><td><strong>{restantes} dias</strong></td><td>{f.inicioFerias ? `${formatarData(f.inicioFerias)} – ${formatarData(f.fimFerias)}` : '—'}</td><td>{estado}</td><td><button className="danger-button" type="button" onClick={() => removerFuncionario(f.processo)}>Remover</button></td></tr>; })}</tbody></table></div>}</section>

    <section className="section"><h2>Histórico de férias</h2>{funcionarios.length === 0 ? <div className="card empty-state">O histórico aparecerá aqui quando houver férias registadas.</div> : <div className="history-list">{funcionarios.map((f) => <div className="card" key={f.processo}><strong>Processo {f.processo} — {f.nome}</strong>{f.historico.length === 0 ? <p>Sem histórico de férias registado.</p> : <div className="table-wrapper"><table><thead><tr><th>Início</th><th>Fim</th><th>Dias</th><th>Estado</th></tr></thead><tbody>{f.historico.map((item, index) => <tr key={`${f.processo}-${index}`}><td>{formatarData(item.inicio)}</td><td>{formatarData(item.fim)}</td><td>{item.dias}</td><td>{item.estado}</td></tr>)}</tbody></table></div>}</div>)}</div>}</section>

    <section className="section"><h2>Regra de férias</h2><div className="department-list"><div className="department"><strong>Permanente</strong><br />30 dias de férias por cada ano contabilizado, acumulando automaticamente o saldo de um ano para o outro.<br />O cálculo começa no ano 2000.</div><div className="department"><strong>Contratado</strong><br />1 dia de férias por cada mês de contrato.</div><div className="department"><strong>Data de fim das férias</strong><br />É calculada automaticamente a partir da data de início e dos dias utilizados. O utilizador não precisa digitar o fim.</div></div></section>
  </div></main>;
}
