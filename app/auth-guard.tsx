'use client';
import {useEffect,useState} from 'react';

export default function AuthGuard({children}:{children:React.ReactNode}){
 const[ready,setReady]=useState(false);
 useEffect(()=>{setReady(true);},[]);
 if(!ready)return null;
 return <>{children}</>;
}
