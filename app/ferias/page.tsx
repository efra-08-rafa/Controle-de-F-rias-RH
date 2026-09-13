'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  adicionarDias,
  direitoAcumulado,
  diasUtilizadosReal,
  estadoFerias,
  resumoAnual,
  saldoRestante,
  STORAGE_FERIAS,
  type FuncionarioFerias,
} from '../../lib/ferias';

type HistoricoFerias = NonNullable<FuncionarioFerias['historico']>[number];
type Funcionario = FuncionarioFerias & { contacto?: string; departamento: string };

function formatarData(data: string) {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function estadoCor(estado: string) {
  if (estado === 'Em férias') return 'status-active';
  if (estado === 'Férias próximas') return 'status-warning';
  if (estado === 'Férias terminadas') return 'status-muted';
  return 'status-ok';
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
      const dados = localStorage.getItem(STORAGE_FERIAS);
      if (dados) setFuncionarios(JSON.parse(dados));
    } catch {
      setErro('Não foi possível carregar os funcionários guardados neste navegador.');
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_FERIAS, JSON.stringify(funcionarios));
  }, [funcionarios]);

  const funcionario = useMemo(() => funcionarios.find((f) => f.processo === processoSelecionado), [funcionarios, processoSelecionado]);
  const direito = funcionario ? direitoAcumulado(funcionario) : 0;
  const utilizados = funcionario ? diasUtilizadosReal(funcionario) : 0;
  const restantes = funcionario ? saldoRestante(funcionario) : 0;
  const dias = Math.max(0, Number.parseInt(quantidadeDias || '0', 10) || 0);
  const fim = inicio && dias > 0 ? adicionarDias(inicio, dias) : '';
  const estadoPreview = fim ? estadoFerias(inicio, fim) : 'Disponível';

  function limparMensagens() {
    setMensagem('');
    setErro('');
  }

  function registarFerias() {
    limparMensagens();
    if (!funcionario) return setErro('Selecione um funcionário.');
    if (!inicio) return setErro('Informe a data de início das férias.');
    if (dias <= 0) return setErro('Informe uma quantidade de dias válida.');
    if (dias > restantes) return setErro(`O funcionário tem apenas ${restantes} dia(s) disponível(is).`);

    const novoHistorico: HistoricoFerias = { inicio, fim, dias, estado: estadoPreview };
    setFuncionarios((lista) => lista.map((item) => item.processo !== funcionario.processo ? item : ({
      ...item,
      diasUtilizados: diasUtilizadosReal(item) + dias,
      inicioFerias: inicio,
      fimFerias: fim,
      historico: [...(item.historico || []), novoHistorico],
    })));
    setInicio('');
    setQuantidadeDias('');
    setMensagem(`Férias registadas para ${funcionario.nome}: ${dias} dia(s), de ${formatarData(inicio)} a ${formatarData(fim)}.`);
  }

  return (
    <main><div className="container">
      <section className="hero">
        <h1>Controle de Férias</h1>
        <p>Novo motor: direito acumulado, utilização, saldo, histórico e controlo anual calculados automaticamente.</p>
      </section>

      <section className="section card">
        <h2>Registar férias</h2>
        <div className="form-grid">
          <label>Funcionário
            <select value={processoSelecionado} onChange={(e) => { setProcessoSelecionado(e.target.value); limparMensagens(); }}>
              <option value="">Selecione o funcionário</option>
              {funcionarios.map((f) => <option key={f.processo} value={f.processo}>{f.processo} — {f.nome}</option>)}
            </select>
          </label>
          <label>Data de início
            <input type="date" value={inicio} onChange={(e) => { setInicio(e.target.value); limparMensagens(); }} />
          </label>
          <label>Quantidade de dias
            <input type="number" min="1" max={restantes || undefined} value={quantidadeDias} onChange={(e) => { setQuantidadeDias(e.target.value); limparMensagens(); }} placeholder="Ex.: 5" />
          </label>
        </div>

        {funcionario && <div className="grid" style={{ marginTop: 20 }}>
          <div className="card"><span className="card-label">Departamento</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.departamento || '—'}</strong></div>
          <div className="card"><span className="card-label">Tipo de contrato</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.tipoContrato}</strong></div>
          <div className="card"><span className="card-label">Direito acumulado</span><strong className="card-value">{direito} <small>dias</small></strong></div>
          <div className="card"><span className="card-label">Saldo disponível</span><strong className="card-value">{restantes} <small>dias</small></strong></div>
        </div>}

        <div className="card" style={{ marginTop: 16 }}>
          <strong>Resumo automático</strong>
          <p style={{ marginBottom: 6 }}>Dias solicitados: <strong>{quantidadeDias || '—'}</strong></p>
          <p style={{ marginBottom: 6 }}>Início: <strong>{inicio ? formatarData(inicio) : '—'}</strong></p>
          <p style={{ marginBottom: 6 }}>Fim calculado: <strong>{fim ? formatarData(fim) : '—'}</strong></p>
          <p style={{ margin: 0 }}>Estado previsto: <strong>{fim ? estadoPreview : 'Disponível'}</strong></p>
        </div>

        {erro && <p className="form-message" style={{ color: '#dc2626' }}>{erro}</p>}
        {mensagem && <p className="form-message">{mensagem}</p>}
        <button className="primary-button" type="button" onClick={registarFerias} disabled={!funcionarios.length}>Registar férias</button>
        {!funcionarios.length && <p className="empty-state">Ainda não existem funcionários cadastrados. Cadastre primeiro em Funcionários.</p>}
      </section>

      <section className="section"><h2>Resumo dos funcionários</h2>
        {funcionarios.length === 0 ? <p className="empty-state">Nenhum funcionário disponível.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Nome</th><th>Departamento</th><th>Direito acumulado</th><th>Utilizados</th><th>Saldo</th><th>Estado</th></tr></thead><tbody>
          {funcionarios.map((item) => { const d = direitoAcumulado(item); const u = diasUtilizadosReal(item); const r = saldoRestante(item); const estado = estadoFerias(item.inicioFerias, item.fimFerias); return <tr key={item.processo}><td>{item.processo}</td><td><strong>{item.nome}</strong></td><td><strong>{item.departamento}</strong></td><td>{d} dias</td><td>{u} dias</td><td><strong>{r} dias</strong></td><td><span className={estadoCor(estado)}>{estado}</span></td></tr>; })}
        </tbody></table></div>}
      </section>

      <section className="section"><h2>Controlo anual de férias</h2><p>O novo motor apresenta, ano por ano, os dias adquiridos, utilizados, saldo do ano e saldo acumulado.</p>
        {funcionarios.length === 0 ? <p className="empty-state">Nenhum funcionário disponível.</p> : <div className="history-list">{funcionarios.map((f) => { const resumo = resumoAnual(f); const totalGanho = resumo.reduce((soma, item) => soma + item.ganhou, 0); const totalUtilizado = resumo.reduce((soma, item) => soma + item.utilizado, 0); const saldoFinal = resumo.length ? resumo[resumo.length - 1].saldoAcumulado : 0; return <div className="card" key={`anual-${f.processo}`}><h3 style={{ marginTop: 0 }}>Processo {f.processo} — {f.nome}</h3><p><strong>{f.tipoContrato}</strong> · {f.departamento} · Direito adquirido: <strong>{totalGanho} dias</strong> · Utilizado: <strong>{totalUtilizado} dias</strong> · Saldo acumulado: <strong>{saldoFinal} dias</strong></p><div className="table-wrapper"><table><thead><tr><th>Ano</th><th>Dias ganhos</th><th>Dias utilizados</th><th>Saldo do ano</th><th>Saldo acumulado</th></tr></thead><tbody>{resumo.map((item) => <tr key={`${f.processo}-${item.ano}`}><td><strong>{item.ano}</strong></td><td>{item.ganhou} dias</td><td>{item.utilizado} dias</td><td>{item.saldoAno} dias</td><td><strong>{item.saldoAcumulado} dias</strong></td></tr>)}</tbody></table></div></div>; })}</div>}
      </section>

      <section className="section"><h2>Histórico de férias</h2>
        {funcionarios.every((f) => !f.historico?.length) ? <p className="empty-state">O histórico aparecerá aqui quando houver férias registadas.</p> : <div className="table-wrapper"><table><thead><tr><th>Processo</th><th>Funcionário</th><th>Departamento</th><th>Período</th><th>Dias</th><th>Estado</th></tr></thead><tbody>{funcionarios.flatMap((f) => (f.historico || []).map((h, i) => <tr key={`${f.processo}-${i}-${h.inicio}`}><td>{f.processo}</td><td><strong>{f.nome}</strong></td><td>{f.departamento}</td><td>{formatarData(h.inicio)} — {formatarData(h.fim)}</td><td>{h.dias}</td><td>{estadoFerias(h.inicio, h.fim)}</td></tr>))}</tbody></table></div>}
      </section>

      <section className="section card"><h2>Regras do novo motor</h2><p><strong>Permanente:</strong> 12 dias no ano de admissão e 30 dias nos anos completos seguintes.</p><p><strong>Contratado:</strong> 1 dia por mês de contrato contabilizado.</p><p><strong>Acumulação:</strong> o saldo não utilizado transita automaticamente para os anos seguintes.</p><p><strong>Fim das férias:</strong> calculado automaticamente pela data de início e quantidade de dias.</p></section>
    </div></main>
  );
}
