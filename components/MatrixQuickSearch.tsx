'use client';

import {useEffect,useMemo,useState} from 'react';

type MatrixRule={
  s:'Voice'|'Ticket'|'Note';
  r:number;
  i:string;
  x:string;
  sl?:string;
  rq?:string;
  ct?:string;
  sv?:string;
  vip?:string;
};

const FILES=[
  '/matrix/notes.json',
  '/matrix/voice-1.json','/matrix/voice-2.json','/matrix/voice-3.json','/matrix/voice-4.json',
  '/matrix/ticket-1.json','/matrix/ticket-2.json','/matrix/ticket-3.json','/matrix/ticket-4.json'
];

const FAVORITES_KEY='qa-matrix-favorites-v1';
const ruleKey=(rule:MatrixRule)=>`${rule.s}::${rule.r}::${rule.i}`;

const clean=(value:string)=>value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/[^a-z0-9]+/g,' ')
  .trim();

function Meta({label,value}:{label:string;value?:string}){
  if(!value)return null;
  return <div className="rounded-lg bg-slate-50 px-2 py-1.5">
    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
    <div className="mt-0.5 text-xs text-slate-700">{value}</div>
  </div>;
}

function RuleCard({rule,favorite,onToggle}:{rule:MatrixRule;favorite:boolean;onToggle:(rule:MatrixRule)=>void}){
  return <details className="group rounded-xl border bg-white open:bg-slate-50/50">
    <summary className="cursor-pointer list-none p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold leading-5">{rule.i}</div>
          <div className="mt-1 text-[11px] text-slate-400">{rule.s==='Note'?'Important Note':`${rule.s} Matrix · Row ${rule.r}`}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={e=>{e.preventDefault();e.stopPropagation();onToggle(rule)}}
            className={`focusable rounded-lg px-2 py-1 text-base leading-none ${favorite?'text-amber-500':'text-slate-300 hover:text-amber-500'}`}
            aria-label={favorite?'Remove from favorites':'Add to favorites'}
            title={favorite?'Remove from favorites':'Add to favorites'}
          >{favorite?'★':'☆'}</button>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${rule.s==='Note'?'bg-amber-50 text-amber-800':rule.s==='Voice'?'bg-sky-50 text-sky-800':'bg-violet-50 text-violet-800'}`}>{rule.s}</span>
        </div>
      </div>
    </summary>
    <div className="border-t px-3 pb-3 pt-3">
      <div className="whitespace-pre-line text-sm leading-6 text-slate-700">{rule.x}</div>
      {(rule.sl||rule.rq||rule.ct||rule.sv||rule.vip)&&<div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Meta label="Slack" value={rule.sl}/>
        <Meta label="Refund Queue" value={rule.rq}/>
        <Meta label="Create Ticket" value={rule.ct}/>
        <Meta label="Supervisor" value={rule.sv}/>
        <Meta label="VIPRES" value={rule.vip}/>
      </div>}
    </div>
  </details>;
}

export default function MatrixQuickSearch({onClose}:{onClose:()=>void}){
  const [rules,setRules]=useState<MatrixRule[]>([]);
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [favorites,setFavorites]=useState<string[]>([]);

  useEffect(()=>{
    try{
      const saved=JSON.parse(localStorage.getItem(FAVORITES_KEY)||'[]');
      if(Array.isArray(saved))setFavorites(saved.filter(v=>typeof v==='string'));
    }catch{}
  },[]);

  useEffect(()=>{
    let active=true;
    Promise.all(FILES.map(async path=>{
      const res=await fetch(path,{cache:'force-cache'});
      if(!res.ok)throw new Error('Matrix data could not be loaded.');
      return res.json() as Promise<MatrixRule[]>;
    }))
      .then(groups=>{if(active)setRules(groups.flat().filter(r=>r.x!=='Instructions'))})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Matrix data could not be loaded.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[]);

  function toggleFavorite(rule:MatrixRule){
    const key=ruleKey(rule);
    setFavorites(current=>{
      const next=current.includes(key)?current.filter(v=>v!==key):[key,...current];
      try{localStorage.setItem(FAVORITES_KEY,JSON.stringify(next))}catch{}
      return next;
    });
  }

  const favoriteRules=useMemo(()=>{
    const byKey=new Map(rules.map(rule=>[ruleKey(rule),rule]));
    return favorites.map(key=>byKey.get(key)).filter((rule):rule is MatrixRule=>Boolean(rule));
  },[rules,favorites]);

  const results=useMemo(()=>{
    const q=clean(query);
    if(q.length<2)return [];
    const terms=q.split(' ').filter(Boolean);
    return rules
      .map(rule=>{
        const hay=clean([rule.i,rule.x,rule.sl,rule.rq,rule.ct,rule.sv,rule.vip].filter(Boolean).join(' '));
        const score=terms.reduce((n,t)=>n+(clean(rule.i).includes(t)?5:hay.includes(t)?1:0),0)+(rule.s==='Note'?2:0);
        return {rule,score};
      })
      .filter(x=>x.score>0)
      .sort((a,b)=>b.score-a.score||a.rule.r-b.rule.r)
      .slice(0,10)
      .map(x=>x.rule);
  },[query,rules]);

  const showFavorites=!loading&&!error&&query.trim().length<2&&favoriteRules.length>0;

  return <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/35 p-3 pt-16 sm:pt-24" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section role="dialog" aria-modal="true" aria-label="Matrix Quick Search" className="w-full max-w-2xl rounded-2xl border bg-white p-4 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold">Matrix Quick Search</h2>
          <p className="text-xs text-slate-500">Voice · Ticket · Important Notes</p>
        </div>
        <button onClick={onClose} className="focusable rounded-lg border px-2.5 py-1.5 text-sm" aria-label="Close Matrix search">✕</button>
      </div>

      <input
        autoFocus
        value={query}
        onChange={e=>setQuery(e.target.value)}
        placeholder="Search refund, FOC, voucher, supplier..."
        className="focusable mt-4 w-full rounded-xl border px-3 py-2.5 text-sm"
      />

      <div className="mt-3 max-h-[62vh] space-y-2 overflow-y-auto pr-1">
        {loading&&<div className="py-6 text-center text-sm text-slate-500">Loading Matrix...</div>}
        {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {showFavorites&&<div className="flex items-center justify-between px-1 pb-1">
          <div className="text-xs font-bold uppercase tracking-wide text-slate-500">★ Favorites</div>
          <div className="text-[11px] text-slate-400">{favoriteRules.length} saved</div>
        </div>}
        {showFavorites&&favoriteRules.map(rule=><RuleCard key={ruleKey(rule)} rule={rule} favorite onToggle={toggleFavorite}/>)}
        {!loading&&!error&&query.trim().length<2&&favoriteRules.length===0&&<div className="py-6 text-center text-sm text-slate-400">Type at least 2 letters. Tap ☆ on any rule to save it here.</div>}
        {!loading&&!error&&query.trim().length>=2&&results.length===0&&<div className="py-6 text-center text-sm text-slate-400">No Matrix match found.</div>}
        {query.trim().length>=2&&results.map(rule=><RuleCard key={ruleKey(rule)} rule={rule} favorite={favorites.includes(ruleKey(rule))} onToggle={toggleFavorite}/>)}
      </div>
      {!loading&&results.length===10&&<div className="mt-2 text-center text-[11px] text-slate-400">Showing the 10 closest matches. Add another word to narrow the search.</div>}
    </section>
  </div>;
}
