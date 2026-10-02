'use client';

import {useEffect,useMemo,useState} from 'react';
import type {Center,Review} from '@/lib/types';
import TinyLoader from '@/components/TinyLoader';

const CENTERS:Center[]=['Buwelo','WNS','Concentrix','Telus'];

type Progress={done:number;total:number};

function parseDate(value:string){
  if(!value)return 0;
  const d=new Date(value.includes('T')?value:`${value}T12:00:00`);
  return Number.isNaN(d.getTime())?0:d.getTime();
}

export default function AgentKudosPage({admin,center,userName}:{admin:boolean;center?:Center;userName:string}){
  const [reviews,setReviews]=useState<Review[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [flash,setFlash]=useState('');
  const [saving,setSaving]=useState(false);
  const [progress,setProgress]=useState<Progress|null>(null);
  const [selectedCenter,setSelectedCenter]=useState<Center|'All'>(center||'All');
  const [search,setSearch]=useState('');

  async function load(){
    setLoading(true);setError('');
    try{
      const res=await fetch('/api/reviews',{cache:'no-store'});
      const text=await res.text();
      let data:{reviews?:Review[];error?:string}={};
      try{data=text?JSON.parse(text):{}}catch{throw new Error('The review feed returned an invalid response. Please refresh and try again.')}
      if(!res.ok)throw new Error(data.error||'Unable to load Agent Kudos.');
      setReviews((data.reviews||[]).filter(r=>r.positive));
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load Agent Kudos.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{load()},[]);

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    return reviews
      .filter(r=>(selectedCenter==='All'||r.center===selectedCenter))
      .filter(r=>!q||[r.agent,r.quickCoaching,r.callId,r.itinerary,r.center].some(v=>String(v||'').toLowerCase().includes(q)))
      .sort((a,b)=>parseDate(b.qaDate||b.callDate)-parseDate(a.qaDate||a.callDate));
  },[reviews,selectedCenter,search]);

  const pending=useMemo(()=>visible.filter(r=>!r.coached),[visible]);
  const completed=visible.length-pending.length;

  const agents=useMemo(()=>{
    const map=new Map<string,{name:string;center:Center;total:number;coached:number;pending:number;latest:string}>();
    for(const r of visible){
      const key=`${r.center}::${r.agent.toLowerCase()}`;
      const row=map.get(key)||{name:r.agent,center:r.center,total:0,coached:0,pending:0,latest:''};
      row.total++;
      if(r.coached)row.coached++;else row.pending++;
      if(parseDate(r.qaDate||r.callDate)>parseDate(row.latest))row.latest=r.qaDate||r.callDate||'';
      map.set(key,row);
    }
    return [...map.values()].sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  },[visible]);

  async function markReviews(targets:Review[]){
    if(saving||targets.length===0)return;
    const label=targets.length===1
      ?`Mark this Kudos for ${targets[0].agent} as coached?`
      :`Mark all ${targets.length} visible pending Kudos as coached?\n\nThis will update the live Daily-Findings coaching status.`;
    if(!confirm(label))return;

    setSaving(true);setError('');setFlash('');
    setProgress({done:0,total:targets.length});
    const dateCoached=new Date().toISOString().slice(0,10);
    const queue=[...targets];
    const failed:string[]=[];
    let done=0;

    const worker=async()=>{
      while(queue.length){
        const review=queue.shift();
        if(!review)return;
        try{
          const res=await fetch('/api/coaching',{
            method:'PATCH',
            headers:{'content-type':'application/json'},
            body:JSON.stringify({
              center:review.center,
              callId:review.callId,
              coached:true,
              coachedBy:userName,
              dateCoached,
              notes:'Agent Kudos acknowledged.',
            }),
          });
          const text=await res.text();
          let data:{review?:Review;error?:string}={};
          try{data=text?JSON.parse(text):{}}catch{}
          if(!res.ok||!data.review)throw new Error(data.error||'Update failed.');
          setReviews(current=>current.map(r=>r.center===review.center&&r.callId===review.callId?data.review!:r));
        }catch{
          failed.push(`${review.agent} · ${review.callId}`);
        }finally{
          done++;
          setProgress({done,total:targets.length});
        }
      }
    };

    const workers=Math.min(4,targets.length);
    await Promise.all(Array.from({length:workers},()=>worker()));
    await load();
    setSaving(false);setProgress(null);
    if(failed.length){
      setFlash(`⚠ ${targets.length-failed.length} Kudos marked as coached · ${failed.length} could not be updated. You can retry the remaining items.`);
    }else{
      setFlash(`✓ ${targets.length} Kudos marked as coached successfully.`);
    }
  }

  const scopeLabel=center?center:selectedCenter==='All'?'All Centers':selectedCenter;

  return <main className="min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">{admin?'QA Admin · ':''}{scopeLabel}</div>
          <h1 className="mt-1 text-3xl font-bold">🌟 Agent Kudos</h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">A dedicated recognition space for positive QA feedback. Celebrate the wins, acknowledge the feedback, and keep positive reviews out of the coaching backlog.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={()=>location.href=center?`/center/${center.toLowerCase()}`:'/admin'} className="focusable rounded-xl border bg-white px-4 py-2 font-semibold">← Back to Dashboard</button>
          <button onClick={load} disabled={loading||saving} className="focusable rounded-xl border bg-white px-4 py-2 disabled:opacity-50">{loading?<TinyLoader label="Refreshing..." />:'Refresh'}</button>
        </div>
      </div>

      <section className="kudos-festive mt-6 rounded-3xl p-5 md:p-6">
        <div className="relative z-[1] flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm font-bold uppercase tracking-wide text-emerald-800">Celebrate Great Work</div>
            <div className="mt-1 text-2xl font-extrabold text-slate-900">{pending.length} Kudos waiting to be acknowledged</div>
            <div className="mt-1 text-sm text-slate-700">{visible.length} positive QA review{visible.length===1?'':'s'} · {agents.length} agent{agents.length===1?'':'s'} recognized in this view</div>
            <div className="mt-2 inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-emerald-800">✓ Kudos already acknowledged by QA Admin</div>
          </div>
          <button onClick={()=>markReviews(pending)} disabled={saving||pending.length===0} className="focusable rounded-2xl bg-emerald-700 px-5 py-3 font-extrabold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-50">
            {saving&&progress?<TinyLoader label={`Marking ${progress.done}/${progress.total}...`} />:`✓ Mark All ${pending.length} as Coached`}
          </button>
        </div>
        {saving&&progress&&<div className="relative z-[1] mt-4">
          <div className="flex justify-between text-xs font-bold text-emerald-900"><span>Updating Daily-Findings...</span><span>{Math.round(progress.done/progress.total*100)}%</span></div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white/65"><div className="h-full rounded-full bg-emerald-600 transition-all" style={{width:`${progress.done/progress.total*100}%`}}/></div>
        </div>}
      </section>

      {error&&<div className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</div>}
      {flash&&<div className="mt-4 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-800">{flash}</div>}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Total Kudos</div><div className="mt-1 text-2xl font-bold">{visible.length}</div></div>
        <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Agents Recognized</div><div className="mt-1 text-2xl font-bold">{agents.length}</div></div>
        <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Waiting Acknowledgment</div><div className="mt-1 text-2xl font-bold text-amber-700">{pending.length}</div></div>
        <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Coached / Acknowledged</div><div className="mt-1 text-2xl font-bold text-green-700">{completed}</div></div>
      </div>

      <div className="glass mt-5 rounded-2xl p-4">
        <div className="flex flex-wrap gap-3">
          {admin&&!center&&<select value={selectedCenter} onChange={e=>setSelectedCenter(e.target.value as Center|'All')} className="focusable rounded-xl border bg-white p-2.5">
            <option>All</option>{CENTERS.map(c=><option key={c}>{c}</option>)}
          </select>}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search agent, Call ID, itinerary or Kudos text..." className="focusable min-w-[260px] flex-1 rounded-xl border bg-white p-2.5"/>
        </div>
      </div>

      {loading?<div className="glass mt-5 rounded-2xl p-8 text-center"><TinyLoader label="Loading positive QA feedback..." /></div>:<>
        <section className="glass mt-5 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3"><div><h2 className="font-bold">🏅 Recognized Agents</h2><p className="text-sm text-slate-500">Agents with positive QA feedback in the current view</p></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{agents.length}</span></div>
          {agents.length===0?<div className="mt-4 text-sm text-slate-500">No positive QA feedback matches this view.</div>:<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {agents.map((a,i)=><div key={`${a.center}-${a.name}`} className="rounded-2xl border border-emerald-100 bg-white/75 p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-xs font-bold text-emerald-700">{i<3?['🥇','🥈','🥉'][i]:'🌟'} {a.center}</div><div className="mt-1 truncate font-bold">{a.name}</div></div><div className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-extrabold text-emerald-800">{a.total} Kudos</div></div>
              <div className="mt-3 text-xs text-slate-500">{a.coached} acknowledged · {a.pending} waiting</div>
              <div className="mt-1 text-xs text-slate-400">Latest: {a.latest||'—'}</div>
            </div>)}
          </div>}
        </section>

        <section className="mt-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-xl font-bold">Positive QA Feedback</h2><p className="text-sm text-slate-500">{visible.length} Kudos in this view</p></div>{pending.length>0&&<button onClick={()=>markReviews(pending)} disabled={saving} className="focusable rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800 disabled:opacity-50">✓ Mark All Visible as Coached</button>}</div>
          {visible.length===0?<div className="glass rounded-2xl p-8 text-center text-slate-500">No positive QA feedback matches these filters.</div>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visible.map(r=><article key={`${r.center}-${r.callId}`} className="glass positive rounded-2xl p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">{r.center} · Kudos</div><h3 className="mt-1 truncate text-base font-bold">🌟 {r.agent}</h3><div className="mt-1 text-xs text-slate-500">{r.qaDate||r.callDate||'—'} · {r.callId}</div></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${r.coached?'bg-green-100 text-green-800':'bg-amber-100 text-amber-800'}`}>{r.coached?'✓ Coached':'Waiting'}</span></div>
              <div className="mt-4 rounded-xl bg-white/70 p-3"><div className="text-xs font-bold uppercase tracking-wide text-emerald-700">Positive Feedback</div><p className="mt-1 text-sm leading-5 text-slate-700">{r.quickCoaching||r.happened||'Positive QA feedback.'}</p></div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500"><div>Itinerary: <b className="text-slate-700">{r.itinerary||'—'}</b></div><div>Score: <b className="text-slate-700">{r.finalScore!==null?`${r.finalScore}%`:'—'}</b></div></div>
              <div className="mt-4 border-t pt-3">{r.coached?<div className="text-xs font-semibold text-green-700">Acknowledged by {r.coachedBy||'team'}{r.dateCoached?` · ${r.dateCoached}`:''}</div>:<button onClick={()=>markReviews([r])} disabled={saving} className="focusable w-full rounded-xl bg-emerald-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-50">✓ Mark as Coached</button>}</div>
            </article>)}
          </div>}
        </section>
      </>}
    </div>
  </main>;
}
