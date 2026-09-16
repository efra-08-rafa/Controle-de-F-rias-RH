'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  ['Início','/'],
  ['Funcionários','/funcionarios'],
  ['Férias','/ferias'],
  ['Departamentos','/departamentos'],
  ['Relatórios','/relatorios'],
  ['Configurações','/configuracoes'],
] as const;

export default function SiteHeader(){
  const pathname = usePathname();
  if(pathname === '/login' || pathname === '/configuracao-inicial') return null;
  return <header className="header">
    <div className="container header-inner">
      <div className="brand">Controlo de Férias RH</div>
      <nav className="nav" aria-label="Navegação principal">
        {links.map(([label,href])=><Link key={href} href={href} className={pathname===href?'active':''}>{label}</Link>)}
      </nav>
    </div>
  </header>;
}
