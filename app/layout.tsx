import type { Metadata } from 'next';
import './globals.css';
import AuthGuard from './auth-guard';

export const metadata: Metadata = { title:'Controlo de Férias RH', description:'Sistema de gestão de funcionários e controlo de férias.' };
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="pt"><body><AuthGuard>{children}</AuthGuard></body></html>}
