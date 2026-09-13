'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { adicionarDias, direitoAcumulado, diasUtilizadosReal, estadoFerias, saldoRestante, STORAGE_FERIAS, type FuncionarioFerias } from '../../lib/ferias';

const DEPARTAMENTOS = ['Administração', 'Serração', 'Vendas', 'Carpintaria', 'Manutenção', 'Mecânica', 'Seguranças'];
type Funcionario = FuncionarioFerias & { nuit: string; bi: string; contacto: string; departamento: string };
const FORM_INICIAL: Funcionario = { processo: '', nome: '', nuit: '', bi: '', contacto: '', departamento: 'Administração', tipoContrato: 'Permanente', admissao: '', fimContrato: '', diasUtilizados: 0, inicioFerias: '', fimFerias: '', historico: [] };

function formatarData(data: string) { if (!data) return '—'; const [ano, mes, dia] = data.split('-'); return `${dia}/${mes}/${ano}`; }

export default function FuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [form, setForm] = useState<Funcionario>(FORM_INICIAL);
  const [processoEditando, setProcessoEditando] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    try {
      const dados = localStorage.getItem(STORAGE_FERIAS);
      if (dados) {
        const lista = JSON.parse(dados) as Partial<Funcionario>[];
        setFuncionarios(lista.map((item) => ({ ...FORM_INICIAL, ...item, nuit: item.nuit || '', bi: item.bi || '', contacto: item.contacto || '', historico: item.historico || [] })));
      }
    } catch { setMensagem('Não foi possível carregar os dados guardados neste navegador.'); }
    setCarregado(true);
  }, []);

  useEffect(() => { if (carregado) localStorage.setItem(STORAGE_FERIAS, JSON.stringify(funcionarios)); }, [funcionarios, carregado]);

  const total = funcionarios.length;
  const permanentes = useMemo(() => funcionarios.filter((item) => item.tipoContrato === 'Permanente').length, [funcionarios]);
  const fimFeriasAutomatico = form.inicioFerias && form.diasUtilizados > 0 ? adicionarDias(form.inicioFerias, form.diasUtilizados) : '';
  const direitoForm = direitoAcumulado(form);
  const utilizadoForm = diasUtilizadosReal(form);
  const saldoForm = saldoRestante(form);

  function atualizarCampo(campo: keyof Funcionario, valor: string | number) { setForm((atual) => ({ ...atual, [campo]: valor })); setMensagem(''); }
  function iniciarEdicao(f: Funcionario) { setProcessoEditando(f.processo); setForm({ ...FORM_INICIAL, ...f, nuit: f.nuit || '', bi: f.bi || '', contacto: f.contacto || '', historico: [...(f.historico || [])] }); setMensagem(`A editar o funcionário ${f.processo}.`); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function cancelarEdicao() { setProcessoEditando(null); setForm(FORM_INICIAL); setMensagem('Edição cancelada.'); }

  function guardarFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMensagem('');
    const processo = form.processo.trim(); const nome = form.nome.trim(); const nuit = form.nuit.trim(); const bi = form.bi.trim(); const contacto = form.contacto.trim();
    if (!processo || !nome || !contacto || !form.admissao) return setMensagem('Preencha Número de processo, Nome, Contacto e Data de admissão.');
    if (form.tipoContrato === 'Contratado' && !form.fimContrato) return setMensagem('Para contrato Contratado, informe a data de fim do contrato.');
    if (form.fimContrato && form.fimContrato < form.admissao) return setMensagem('A data de fim do contrato não pode ser anterior à data de admissão.');
    if (form.diasUtilizados > 0 && !form.inicioFerias) return setMensagem('Informe a data de início das férias quando houver dias já utilizados.');
    if (!processoEditando && funcionarios.some((item) => item.processo === processo)) return setMensagem('Já existe um funcionário com este Número de processo.');

    const fimFerias = form.inicioFerias && form.diasUtilizados > 0 ? adicionarDias(form.inicioFerias, form.diasUtilizados) : '';
    const base: Funcionario = { ...form, processo, nome, nuit, bi, contacto, fimFerias };
    if (processoEditando) {
      setFuncionarios((atuais) => atuais.map((item) => item.processo === processoEditando ? { ...base, processo: processoEditando, historico: item.historico || [] } : item));
      setMensagem('Funcionário atualizado com sucesso. O histórico anterior foi preservado.');
    } else {
      const historico = form.inicioFerias && fimFerias && form.diasUtilizados > 0 ? [{ inicio: form.inicioFerias, fim: fimFerias, dias: form.diasUtilizados, estado: estadoFerias(form.inicioFerias, fimFerias) }] : [];
      setFuncionarios((atuais) => [...atuais, { ...base, historico }]);
      setMensagem('Funcionário adicionado com sucesso.');
    }
    setProcessoEditando(null); setForm(FORM_INICIAL);
  }

  function removerFuncionario(processo: string) {
    if (!window.confirm(`Tem certeza que deseja remover o funcionário ${processo}? Esta ação também remove o histórico deste navegador.`)) return;
    setFuncionarios((atuais) => atuais.filter((item) => item.processo !== processo));
    if (processoEditando === processo) cancelarEdicao();
    setMensagem(`Funcionário ${processo} removido.`);
  }

  return <main><div className="container">
    <div className="hero"><h1>Funcionários</h1><p>Cadastro central dos funcionários. Os dados guardados aqui alimentam diretamente o novo motor de férias.</p></div>
    <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
      <div className="card"><span className="card-label">Total de funcionários</span><strong className="card-value">{total}</strong></div>
      <div className="card"><span className="card-label">Permanentes</span><strong className="card-value">{permanentes}</strong></div>
      <div className="card"><span className="card-label">Contratados</span><strong className="card-value">{total - permanentes}</strong></div>
    </div>

    <section className="section"><h2>{processoEditando ? `Editar funcionário — Processo ${processoEditando}` : 'Novo funcionário'}</h2><form onSubmit={guardarFuncionario} className="card employee-form">
      <div className="form-grid">
        <label>Número de processo<input value={form.processo} onChange={(e) => atualizarCampo('processo', e.target.value)} placeholder="Ex.: 0025" disabled={Boolean(processoEditando)} /></label>
        <label>Nome completo<input value={form.nome} onChange={(e) => atualizarCampo('nome', e.target.value)} placeholder="Nome completo" /></label>
        <label>NUIT<input value={form.nuit} onChange={(e) => atualizarCampo('nuit', e.target.value)} placeholder="Número do NUIT" /></label>
        <label>Número de BI<input value={form.bi} onChange={(e) => atualizarCampo('bi', e.target.value)} placeholder="Número do BI" /></label>
        <label>Contacto<input value={form.contacto} onChange={(e) => atualizarCampo('contacto', e.target.value)} placeholder="Telefone" /></label>
        <label>Departamento<select value={form.departamento} onChange={(e) => atualizarCampo('departamento', e.target.value)}>{DEPARTAMENTOS.map((d) => <option key={d}>{d}</option>)}</select></label>
        <label>Tipo de contrato<select value={form.tipoContrato} onChange={(e) => atualizarCampo('tipoContrato', e.target.value as FuncionarioFerias['tipoContrato'])}><option value="Permanente">Permanente</option><option value="Contratado">Contratado</option></select></label>
        <label>Data de admissão<input type="date" value={form.admissao} onChange={(e) => atualizarCampo('admissao', e.target.value)} /></label>
        <label>Fim do contrato<input type="date" value={form.fimContrato} onChange={(e) => atualizarCampo('fimContrato', e.target.value)} disabled={form.tipoContrato === 'Permanente'} /></label>
      </div>
      <div className="card" style={{ marginTop: 16 }}><strong>Dados de férias já existentes</strong><p>Use estes campos apenas para registar dias já utilizados. Novas férias devem ser registadas na página <strong>Férias</strong>.</p><div className="form-grid"><label>Dias já utilizados<input type="number" min="0" value={form.diasUtilizados} onChange={(e) => atualizarCampo('diasUtilizados', Number(e.target.value))} /></label><label>Início das férias já registadas<input type="date" value={form.inicioFerias} onChange={(e) => atualizarCampo('inicioFerias', e.target.value)} /></label><label>Fim das férias (automático)<input type="date" value={fimFeriasAutomatico} readOnly disabled={!fimFeriasAutomatico} /></label></div></div>
      <div className="vacation-preview"><strong>Resumo calculado pelo mesmo motor da página Férias</strong><span>Direito acumulado: {direitoForm} dias</span><span>Utilizados: {utilizadoForm} dias</span><span>Saldo disponível: {saldoForm} dias</span><span>Estado: {estadoFerias(form.inicioFerias, fimFeriasAutomatico)}</span></div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button className="primary-button" type="submit">{processoEditando ? 'Guardar alterações' : 'Adicionar funcionário'}</button>{processoEditando && <button className="secondary-button" type="button" onClick={cancelarEdicao}>Cancelar edição</button>}</div>
      {mensagem && <p className="form-message">{mensagem}</p>}
    </form></section>

    <section className="section"><h2>Registo de funcionários</h2>{funcionarios.length === 0 ? <div className="card empty-state">Ainda não existem funcionários cadastrados.</div> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>NUIT</th><th>BI</th><th>Contacto</th><th>Departamento</th><th>Contrato</th><th>Admissão</th><th>Fim contrato</th><th>Direito</th><th>Utilizados</th><th>Saldo</th><th>Ações</th></tr></thead><tbody>{funcionarios.map((f) => { const direito = direitoAcumulado(f); const utilizados = diasUtilizadosReal(f); const saldo = saldoRestante(f); return <tr key={f.processo}><td>{f.processo}</td><td><strong>{f.nome}</strong></td><td>{f.nuit || '—'}</td><td>{f.bi || '—'}</td><td>{f.contacto}</td><td><strong>{f.departamento}</strong></td><td><strong>{f.tipoContrato}</strong></td><td>{formatarData(f.admissao)}</td><td>{formatarData(f.fimContrato)}</td><td>{direito} dias</td><td>{utilizados} dias</td><td><strong>{saldo} dias</strong></td><td><div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="secondary-button" type="button" onClick={() => iniciarEdicao(f)}>Editar</button><button className="danger-button" type="button" onClick={() => removerFuncionario(f.processo)}>Remover</button></div></td></tr>; })}</tbody></table></div>}</section>

    <section className="section"><h2>Histórico de férias</h2>{funcionarios.every((f) => !f.historico?.length) ? <div className="card empty-state">O histórico aparecerá aqui quando houver férias registadas.</div> : <div className="history-list">{funcionarios.map((f) => <div className="card" key={f.processo}><strong>Processo {f.processo} — {f.nome}</strong><p>NUIT: {f.nuit || '—'} &nbsp; | &nbsp; BI: {f.bi || '—'}</p>{!f.historico?.length ? <p>Sem histórico de férias registado.</p> : <div className="table-wrapper"><table><thead><tr><th>Início</th><th>Fim</th><th>Dias</th><th>Estado</th></tr></thead><tbody>{f.historico.map((item, index) => <tr key={`${f.processo}-${index}-${item.inicio}`}><td>{formatarData(item.inicio)}</td><td>{formatarData(item.fim)}</td><td>{item.dias}</td><td>{estadoFerias(item.inicio, item.fim)}</td></tr>)}</tbody></table></div>}</div>)}</div>}</section>
    </div></main>;
}
