export type HistoricoFerias = { inicio: string; fim: string; dias: number; estado: string };
export type FuncionarioFerias = {
  processo: string; nome: string; tipoContrato: 'Permanente' | 'Contratado'; admissao: string; fimContrato: string;
  diasUtilizados?: number; inicioFerias: string; fimFerias: string; historico?: HistoricoFerias[];
};

export const STORAGE_FERIAS = 'controle-ferias-rh-funcionarios';

export function dataLocal(s: string) { return s ? new Date(`${s}T00:00:00`) : null; }

export function diasDoHistorico(f: FuncionarioFerias) {
  return (f.historico || []).reduce((total, item) => total + Math.max(0, Number(item.dias) || 0), 0);
}

export function diasUtilizadosReal(f: FuncionarioFerias) {
  const historico = f.historico || [];
  return historico.length ? diasDoHistorico(f) : Math.max(0, Number(f.diasUtilizados) || 0);
}

export function mesesDeContratoNoAno(f: FuncionarioFerias, ano: number) {
  if (!f.admissao || !f.fimContrato) return 0;
  const inicio = dataLocal(f.admissao); const fim = dataLocal(f.fimContrato);
  if (!inicio || !fim || fim < inicio) return 0;
  const inicioAno = dataLocal(`${ano}-01-01`)!; const fimAno = dataLocal(`${ano}-12-31`)!;
  const a = inicio > inicioAno ? inicio : inicioAno; const b = fim < fimAno ? fim : fimAno;
  if (b < a) return 0;
  let meses = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
  if (a.getDate() > 1) meses -= 1;
  return Math.max(0, meses);
}

export function diasDireitoNoAno(f: FuncionarioFerias, ano: number) {
  const inicio = dataLocal(f.admissao); if (!inicio) return 0;
  if (f.tipoContrato === 'Contratado') return mesesDeContratoNoAno(f, ano);
  const anoAdmissao = inicio.getFullYear();
  if (ano < anoAdmissao) return 0;
  return ano === anoAdmissao ? 12 : 30;
}

export function diasHistoricoNoAno(f: FuncionarioFerias, ano: number) {
  const inicioAno = dataLocal(`${ano}-01-01`)!; const fimAno = dataLocal(`${ano}-12-31`)!;
  return (f.historico || []).reduce((total, item) => {
    const a = dataLocal(item.inicio); const b = dataLocal(item.fim);
    if (!a || !b || b < inicioAno || a > fimAno) return total;
    const inicio = a > inicioAno ? a : inicioAno; const fim = b < fimAno ? b : fimAno;
    return total + (Math.floor((fim.getTime() - inicio.getTime()) / 86400000) + 1);
  }, 0);
}

export function resumoAnual(f: FuncionarioFerias) {
  const inicio = dataLocal(f.admissao); if (!inicio) return [] as {ano:number;ganhou:number;utilizado:number;saldoAcumulado:number;saldoAno:number}[];
  const anoAtual = new Date().getFullYear(); let saldo = 0;
  const resultado: {ano:number;ganhou:number;utilizado:number;saldoAcumulado:number;saldoAno:number}[] = [];
  for (let ano = inicio.getFullYear(); ano <= anoAtual; ano += 1) {
    const ganhou = diasDireitoNoAno(f, ano); const utilizado = diasHistoricoNoAno(f, ano);
    saldo = Math.max(0, saldo + ganhou - utilizado);
    const saldoAno = Math.max(0, ganhou - utilizado);
    resultado.push({ ano, ganhou, utilizado, saldoAcumulado: saldo, saldoAno });
  }
  return resultado;
}

export function direitoAcumulado(f: FuncionarioFerias) {
  return resumoAnual(f).reduce((total, item) => total + item.ganhou, 0);
}

export function saldoRestante(f: FuncionarioFerias) {
  return Math.max(0, direitoAcumulado(f) - diasUtilizadosReal(f));
}

export function diasVencidos(f: FuncionarioFerias) {
  const anoAtual = new Date().getFullYear();
  return resumoAnual(f).filter((item) => item.ano < anoAtual).reduce((total, item) => total + item.saldoAno, 0);
}

export function estadoFerias(inicio: string, fim: string) {
  if (!inicio || !fim) return 'Disponível';
  const a = dataLocal(inicio); const b = dataLocal(fim); const hoje = new Date(); hoje.setHours(0,0,0,0);
  if (!a || !b) return 'Disponível';
  if (b < hoje) return 'Férias terminadas';
  if (hoje >= a && hoje <= b) return 'Em férias';
  const limite = new Date(hoje); limite.setDate(limite.getDate() + 7);
  return a <= limite ? 'Férias próximas' : 'Disponível';
}

export function contratoProximo(f: FuncionarioFerias) {
  if (f.tipoContrato !== 'Contratado' || !f.fimContrato) return false;
  const fim = dataLocal(f.fimContrato); if (!fim) return false;
  const hoje = new Date(); hoje.setHours(0,0,0,0); const limite = new Date(hoje); limite.setDate(limite.getDate() + 30);
  return fim >= hoje && fim <= limite;
}

export function adicionarDias(data: string, quantidade: number) {
  if (!data || quantidade <= 0) return '';
  const resultado = dataLocal(data)!; resultado.setDate(resultado.getDate() + quantidade - 1);
  return `${resultado.getFullYear()}-${String(resultado.getMonth()+1).padStart(2,'0')}-${String(resultado.getDate()).padStart(2,'0')}`;
}
