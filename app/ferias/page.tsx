'use client';

import { useEffect, useMemo, useState } from 'react';

type HistoricoFerias = { inicio: string; fim: string; dias: number; estado: string };
type Funcionario = {
  processo: string; nome: string; contacto: string; departamento: string;
  tipoContrato: 'Permanente' | 'Contratado'; admissao: string; fimContrato: string;
  diasUtilizados: number; inicioFerias: string; fimFerias: string; historico: HistoricoFerias[];
};

const CHAVE_STORAGE = 'controle-ferias-rh-funcionarios';
const ANO_INICIAL_FERIAS = 2000;

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
  const fimContrato = new Date(`${f.fimContrato}T00:00:00`);
  if (Number.isNaN(fimContrato.getTime()) || fimContrato < inicio) return 0;
  return Math.max(0, (fimContrato.getFullYear() - inicio.getFullYear()) * 12 + fimContrato.getMonth() - inicio.getMonth() + (fimContrato.getDate() >= inicio.getDate() ? 0 : -1) + 1);
}

function adicionarDias(data: string, quantidade: number) {
  if (!data || quantidade <= 0) return '';
  const resultado = new Date(`${data}T00:00:00`);
  resultado.setDate(resultado.getDate() + quantidade - 1);
  return `${resultado.getFullYear()}-${String(resultado.getMonth() + 1).padStart(2, '0')}-${String(resultado.getDate()).padStart(2, '0')}`;
}

function calcularEstado(inicio: string, fim: string) {
  if (!inicio || !fim) return 'Disponível';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const a = new Date(`${inicio}T00:00:00`), b = new Date(`${fim}T00:00:00`);
  if (b < hoje) return 'Férias terminadas';
  if (hoje >= a && hoje <= b) return 'Em férias';
  const limite = new Date(hoje); limite.setDate(limite.getDate() + 7);
  if (a > hoje && a <= limite) return 'Férias próximas';
  return 'Disponível';
}

function formatarData(data: string) {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

export default function FeriasPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState('');
  const [inicio, setInicio] = useState('');
  const [quantidadeDias, setQuantidadeDias] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    try {
      const dados = localStorage.getItem(CHAVE_STORAGE);
      if (dados) setFuncionarios(JSON.parse(dados));
    } catch { setErro('Não foi possível carregar os funcionários guardados neste navegador.'); }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') localStorage.setItem(CHAVE_STORAGE, JSON.stringify(funcionarios));
  }, [funcionarios]);

  const funcionario = useMemo(() => funcionarios.find((f) => f.processo === processoSelecionado), [funcionarios, processoSelecionado]);
  const direito = funcionario ? calcularDireito(funcionario) : 0;
  const utilizados = funcionario?.diasUtilizados ?? 0;
  const restantes = Math.max(0, direito - utilizados);
  const dias = Math.max(0, Number.parseInt(quantidadeDias || '0', 10) || 0);
  const fim = inicio && dias > 0 ? adicionarDias(inicio, dias) : '';
  const estadoPreview = calcularEstado(inicio, fim);

  function registarFerias() {
    setMensagem(''); setErro('');
    if (!funcionario) return setErro('Selecione um funcionário.');
    if (!inicio) return setErro('Informe a data de início das férias.');
    if (dias <= 0) return setErro('Informe uma quantidade de dias válida.');
    if (dias > restantes) return setErro(`O funcionário tem apenas ${restantes} dia(s) restante(s).`);

    const novoHistorico = { inicio, fim, dias, estado: estadoPreview };
    setFuncionarios((lista) => lista.map((item) => item.processo !== funcionario.processo ? item : ({
      ...item, diasUtilizados: item.diasUtilizados + dias, inicioFerias: inicio, fimFerias: fim,
      historico: [...(item.historico || []), novoHistorico],
    })));
    setInicio(''); setQuantidadeDias('');
    setMensagem(`Férias registadas para ${funcionario.nome}: ${dias} dia(s), de ${formatarData(inicio)} a ${formatarData(fim)}.`);
  }

  return (
    <main><div className="container">
      <section className="hero"><h1>Controle de Férias</h1><p>Registe a quantidade de dias e o sistema calcula automaticamente a data de fim.</p></section>

      <section className="section card"><h2>Requisitar férias</h2>
        <div className="form-grid">
          <label>Funcionário
            <select value={processoSelecionado} onChange={(e) => { setProcessoSelecionado(e.target.value); setMensagem(''); setErro(''); }}>
              <option value="">Selecione o funcionário</option>
              {funcionarios.map((f) => <option key={f.processo} value={f.processo}>{f.processo} — {f.nome}</option>)}
            </select>
          </label>
          <label>Data de início<input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></label>
          <label>Quantidade de dias<input type="number" min="1" max={restantes || undefined} value={quantidadeDias} onChange={(e) => setQuantidadeDias(e.target.value)} placeholder="Ex.: 5" /></label>
        </div>

        {funcionario && <div className="grid" style={{ marginTop: 20 }}>
          <div className="card"><span className="card-label">Departamento</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.departamento}</strong></div>
          <div className="card"><span className="card-label">Tipo de contrato</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.tipoContrato}</strong></div>
          <div className="card"><span className="card-label">Direito acumulado</span><strong className="card-value">{direito} <small>dias</small></strong></div>
          <div className="card"><span className="card-label">Dias restantes</span><strong className="card-value">{restantes} <small>dias</small></strong></div>
        </div>}

        <div className="card" style={{ marginTop: 16, background: '#f8fafc' }}>
          <strong>Resumo automático</strong>
          <p style={{ marginBottom: 6 }}>Dias solicitados: <strong>{dias || '—'}</strong></p>
          <p style={{ marginBottom: 6 }}>Início: <strong>{formatarData(inicio)}</strong></p>
          <p style={{ marginBottom: 6 }}>Fim calculado: <strong>{formatarData(fim)}</strong></p>
          <p style={{ margin: 0 }}>Estado previsto: <strong>{estadoPreview}</strong></p>
        </div>

        {erro && <p className="form-message" style={{ color: '#dc2626' }}>{erro}</p>}
        {mensagem && <p className="form-message">{mensagem}</p>}
        <button className="primary-button" type="button" onClick={registarFerias} disabled={!funcionarios.length}>Registar férias</button>
        {!funcionarios.length && <p className="empty-state">Ainda não existem funcionários cadastrados. Cadastre primeiro em Funcionários.</p>}
      </section>

      <section className="section"><h2>Resumo dos funcionários</h2>
        {funcionarios.length === 0 ? <p className="empty-state">Nenhum funcionário disponível.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Departamento</th><th>Direito acumulado</th><th>Utilizados</th><th>Restantes</th><th>Estado</th></tr></thead><tbody>
          {funcionarios.map((item) => { const d = calcularDireito(item); const r = Math.max(0, d - item.diasUtilizados); return <tr key={item.processo}><td>{item.processo}</td><td>{item.nome}</td><td>{item.departamento}</td><td>{d} dias</td><td>{item.diasUtilizados} dias</td><td>{r} dias</td><td>{calcularEstado(item.inicioFerias, item.fimFerias)}</td></tr>; })}
        </tbody></table></div>}
      </section>

      <section className="section"><h2>Histórico de férias</h2>
        {funcionarios.every((f) => !f.historico?.length) ? <p className="empty-state">O histórico aparecerá aqui quando houver férias registadas.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Funcionário</th><th>Período</th><th>Dias</th><th>Estado</th></tr></thead><tbody>
          {funcionarios.flatMap((f) => (f.historico || []).map((h, i) => <tr key={`${f.processo}-${i}-${h.inicio}`}><td>{f.processo}</td><td>{f.nome}</td><td>{formatarData(h.inicio)} — {formatarData(h.fim)}</td><td>{h.dias}</td><td>{calcularEstado(h.inicio, h.fim)}</td></tr>))}
        </tbody></table></div>}
      </section>

      <section className="section card"><h2>Regras de férias</h2><p><strong>Permanente:</strong> 30 dias de férias por cada ano contabilizado.</p><p><strong>Acumulação:</strong> o saldo não utilizado passa automaticamente para os anos seguintes.</p><p><strong>Início do cálculo:</strong> ano 2000.</p><p><strong>Contratado:</strong> 1 dia de férias por cada mês de contrato.</p><p style={{ marginBottom: 0 }}>A data de fim é calculada automaticamente: o primeiro dia conta como dia 1.</p></section>
    </div></main>
  );
}
