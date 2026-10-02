'use client';

import {useEffect,useMemo,useState} from 'react';
import type {Center,Review} from '@/lib/types';
import TinyLoader from '@/components/TinyLoader';

type AgentRank={
  name:string;
  center:Center;
  avg:number;
  count:number;
  pass:number;
  fail:number;
  passRate:number;
  rank:number;
};

export default function AgentRankingPage({center,admin,userName}:{center:Center;admin:boolean;userName:string}){
  const [rows,setRows]=useState<AgentRank[]>([]);
  const [kpi,setKpi]=useState(90);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  function buildRanking(reviews:Review[]){
    const buckets=new Map<string,{name:string;sum:number;count:number;pass:number;fail:number}>();
    for(const review of reviews){
      if(review.center!==center||review.finalScore===null||!Number.isFinite(review.finalScore))continue;
      const name=String(review.agent||'').trim();
      if(!name)continue;
      const key=name.toLowerCase();
      const bucket=buckets.get(key)||{name,sum:0,count:0,pass:0,fail:0};
      bucket.sum+=review.finalScore;
      bucket.count++;
      const outcome=String(review.scorePassFail||'').trim().toUpperCase();
      if(outcome==='PASS'||(!outcome&&review.finalScore>=90))bucket.pass++;
      else if(outcome==='FAIL'||(!outcome&&review.finalScore<90))bucket.fail++;
      buckets.set(key,bucket);
    }
    return [...buckets.values()]
      .map(b=>({
        name:b.name,
        center,
        avg:Math.round((b.sum/b.count)*10)/10,
        count:b.count,
        pass:b.pass,
        fail:b.fail,
        passRate:Math.round((b.count?b.pass/b.count*100:0)*10)/10,
        rank:0,
      }))
      .sort((a,b)=>b.avg-a.avg||b.count-a.count||a.name.localeCompare(b.name))
      .map((r,i)=>({...r,rank:i+1}));
  }

  async function load(){
    setLoading(true);setError('');
    try{
      const res=await fetch(`/api/reviews?center=${encodeURIComponent(center.toLowerCase())}`,{cache:'no-store'});
      const d=await res.json();
      if(!res.ok)throw new Error(d.error||'Unable to load agent ranking.');
      setRows(buildRanking(d.reviews||[]));
      setKpi(90);
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load agent ranking.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    let active=true;
    fetch(`/api/reviews?center=${encodeURIComponent(center.toLowerCase())}`,{cache:'no-store'})
      .then(async res=>({res,data:await res.json()}))
      .then(({res,data})=>{
        if(!res.ok)throw new Error(data.error||'Unable to load agent ranking.');
        if(active){
          setRows(buildRanking(data.reviews||[]));
          setKpi(90);
        }
      })
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load agent ranking.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[center]);

  const ranked=useMemo(()=>rows
    .filter(r=>r.center===center)
    .sort((a,b)=>b.avg-a.avg||b.count-a.count||a.name.localeCompare(b.name))
    .map((r,i)=>({...r,rank:i+1})),[rows,center]);

  const summary=useMemo(()=>{
    const qas=ranked.reduce((n,r)=>n+r.count,0);
    const pass=ranked.reduce((n,r)=>n+r.pass,0);
    const fail=ranked.reduce((n,r)=>n+r.fail,0);
    const weighted=ranked.reduce((n,r)=>n+r.avg*r.count,0);
    return {
      qas,
      pass,
      fail,
      avg:qas?weighted/qas:0,
      passRate:qas?pass/qas*100:0,
    };
  },[ranked]);

  return <main className="min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">{admin?'Admin Preview · ':''}{center}</div>
          <h1 className="mt-1 text-3xl font-bold">Agent QA Ranking</h1>
          <p className="mt-1 text-sm text-slate-500">Private to {center} · all scored QAs currently available in Daily-Findings · KPI {kpi}%</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>location.href=`/center/${center.toLowerCase()}`} className="focusable rounded-xl border bg-white px-4 py-2 font-semibold">← Back to {center}</button>
          {admin&&<button onClick={()=>location.href='/admin'} className="purple-sheen focusable rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 font-bold text-violet-800">Return to Admin View</button>}
          <button onClick={load} disabled={loading} className="focusable rounded-xl border bg-white px-4 py-2 disabled:opacity-50">{loading?<TinyLoader label="Refreshing..." />:'Refresh'}</button>
        </div>
      </div>

      {error&&<div className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</div>}
      {loading&&<div className="mt-5 rounded-xl bg-violet-50 p-3 text-violet-800"><TinyLoader label="Loading private ranking..." /></div>}

      {!loading&&!error&&<>
        <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Center Average</div><div className={`mt-1 text-2xl font-bold ${summary.avg>=kpi?'text-green-700':'text-red-700'}`}>{summary.avg.toFixed(1)}%</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Scored QAs</div><div className="mt-1 text-2xl font-bold">{summary.qas}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Pass</div><div className="mt-1 text-2xl font-bold text-green-700">{summary.pass}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Fail</div><div className="mt-1 text-2xl font-bold text-red-700">{summary.fail}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Pass Rate</div><div className="mt-1 text-2xl font-bold">{summary.passRate.toFixed(1)}%</div></div>
        </div>

        <section className="glass mt-6 overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/70 p-5">
            <div><h2 className="font-bold">🏆 {center} Agent Ranking</h2><p className="text-sm text-slate-500">{ranked.length} agent{ranked.length===1?'':'s'} with scored QAs</p></div>
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Private Ranking</span>
          </div>
          {ranked.length===0?<div className="p-8 text-center text-slate-500">No scored QA calls are available for {center} yet.</div>:<div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>{['Rank','Agent','Average QA','Total QAs','Pass','Fail','Pass Rate','KPI Status'].map(h=><th key={h} className="border-b p-3">{h}</th>)}</tr>
              </thead>
              <tbody>{ranked.map(r=><tr key={r.name} className="hover:bg-violet-50/40">
                <td className="border-b p-3 text-lg font-bold">{r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':`#${r.rank}`}</td>
                <td className="border-b p-3 font-bold">{r.name}</td>
                <td className={`border-b p-3 font-bold ${r.avg>=kpi?'text-green-700':'text-red-700'}`}>{r.avg.toFixed(1)}%</td>
                <td className="border-b p-3">{r.count}</td>
                <td className="border-b p-3 text-green-700">{r.pass}</td>
                <td className="border-b p-3 text-red-700">{r.fail}</td>
                <td className="border-b p-3">{r.passRate.toFixed(1)}%</td>
                <td className="border-b p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.avg>=kpi?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{r.avg>=kpi?'✓ Passing':'⚠ Below KPI'}</span></td>
              </tr>)}</tbody>
            </table>
          </div>}
        </section>

        <div className="mt-3 text-xs text-slate-400">Ranking is ordered by average Final Score from the Scores data. Ties are broken by number of scored QAs, then agent name.</div>
      </>}
    </div>
  </main>;
}
