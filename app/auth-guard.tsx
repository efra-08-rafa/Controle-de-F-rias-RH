'use client';
import {useEffect,useState} from 'react';
import {getSessao,terminarSessao,Sessao} from '../lib/auth';
export default function AuthGuard({children}:{children:React.ReactNode}){const[sessao,setSessao]=useState<Sessao|null>(null);const[ready,setReady]=useState(false);useEffect(()=>{const s=getSessao();if(!s){window.location.href='/login';return;}setSessao(s);setReady(true);},[]);if(!ready||!sessao)return null;return <>{children}<div className="session-bar"><span><strong>{sessao.nome}</strong> · {sessao.papel}</span><button onClick={()=>{terminarSessao();window.location.href='/login'}}>Sair</button></div></>}
