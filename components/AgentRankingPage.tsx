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
  pending:number;
  overdue:number;
  topOpportunity:string;
  recentScores:Array<{score:number;date:string;callId:string;status:string;coaching:string}>;
  trend:'Improving'|'Stable'|'Declining';
  trendDelta:number;
};

type Opportunity={name:string;count:number};

const KPI=90;

function parseDate(value:string){
  if(!value)return null;
  const d=new Date(value.includes('T')?value:`${value}T12:00:00`);
  return Number.isNaN(d.getTime())?null:d;
}

function mondayStart(date=new Date()){
  const d=new Date(date);
  d.setHours(0,0,0,0);
  const day=d.getDay();
  const offset=day===0?-6:1-day;
  d.setDate(d.getDate()+offset);
  return d;
}

function opportunityLabel(review:Review){
  const text=`${review.scoreMarkdowns||''} ${review.quickCoaching||''} ${review.matrixProcess||''}`.toLowerCase();
  if(!text.trim())return '';
  if(/document|notes?|notation|record|log|ticket/.test(text))return 'Documentation';
  if(/hold|efficien|dead air|silence|time management/.test(text))return 'Hold Time / Efficiency';
  if(/refund|cancel|non.?refundable|waiver|foc/.test(text))return 'Refund / Cancellation';
  if(/supplier|hotel|property|confirmation number/.test(text))return 'Supplier / Hotel Process';
  if(/voucher|payment|card|charge|billing/.test(text))return 'Voucher / Payment';
  if(/matrix|procedure|process|policy/.test(text))return 'Matrix / Process';
  if(/tone|rude|professional|communication|empathy|profan|language/.test(text))return 'Communication / Professionalism';
  if(/callback|disconnect|call back|ownership|follow.?up/.test(text))return 'Ownership / Follow-Up';
  return 'Other QA Opportunity';
}

function buildTrend(sorted:Array<{score:number;date:string}>){
  if(sorted.length<4)return {trend:'Stable' as const,delta:0};
  const latest=sorted.slice(0,3);
  const prior=sorted.slice(3,6);
  if(prior.length<2)return {trend:'Stable' as const,delta:0};
  const latestAvg=latest.reduce((n,r)=>n+r.score,0)/latest.length;
  const priorAvg=prior.reduce((n,r)=>n+r.score,0)/prior.length;
  const delta=Math.round((latestAvg-priorAvg)*10)/10;
  if(delta>=2)return {trend:'Improving' as const,delta};
  if(delta<=-2)return {trend:'Declining' as const,delta};
  return {trend:'Stable' as const,delta};
}

export default function AgentRankingPage({center,admin,userName}:{center:Center;admin:boolean;userName:string}){
  const [reviews,setReviews]=useState<Review[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedAgent,setSelectedAgent]=useState<AgentRank|null>(null);

  async function load(){
    setLoading(true);setError('');
    try{
      const res=await fetch('/api/reviews',{cache:'no-store'});
      const text=await res.text();
      let d:{reviews?:Review[];error?:string}={};
      try{d=text?JSON.parse(text):{}}catch{throw new Error('The review feed returned an invalid response. Please refresh and try again.')}
      if(!res.ok)throw new Error(d.error||'Unable to load agent ranking.');
      setReviews((d.reviews||[]).filter(r=>r.center===center));
    }catch(e){
      setError(e instanceof Error?e.message:'Unable to load agent ranking.');
    }finally{
      setLoading(false);
    }
  }

  useEffect(()=>{
    let active=true;
    fetch('/api/reviews',{cache:'no-store'})
      .then(async res=>{
        const text=await res.text();
        let data:{reviews?:Review[];error?:string}={};
        try{data=text?JSON.parse(text):{}}catch{throw new Error('The review feed returned an invalid response. Please refresh and try again.')}
        return {res,data};
      })
      .then(({res,data})=>{
        if(!res.ok)throw new Error(data.error||'Unable to load agent ranking.');
        if(active)setReviews((data.reviews||[]).filter(r=>r.center===center));
      })
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load agent ranking.')})
      .finally(()=>{if(active)setLoading(false)});
    return()=>{active=false};
  },[center]);

  const ranked=useMemo(()=>{
    const buckets=new Map<string,{
      name:string;sum:number;count:number;pass:number;fail:number;pending:number;overdue:number;
      opportunities:Map<string,number>;
      scored:Array<{score:number;date:string;callId:string;status:string;coaching:string}>;
    }>();

    for(const review of reviews){
      const name=String(review.agent||'').trim();
      if(!name)continue;
      const key=name.toLowerCase();
      const bucket=buckets.get(key)||{
        name,sum:0,count:0,pass:0,fail:0,pending:0,overdue:0,
        opportunities:new Map<string,number>(),scored:[]
      };

      if(review.status==='Pending')bucket.pending++;
      if(review.status==='Overdue')bucket.overdue++;

      const opportunity=opportunityLabel(review);
      if(opportunity && !review.positive)bucket.opportunities.set(opportunity,(bucket.opportunities.get(opportunity)||0)+1);

      if(review.finalScore!==null&&Number.isFinite(review.finalScore)){
        bucket.sum+=review.finalScore;
        bucket.count++;
        const outcome=String(review.scorePassFail||'').trim().toUpperCase();
        if(outcome==='PASS'||(!outcome&&review.finalScore>=KPI))bucket.pass++;
        else if(outcome==='FAIL'||(!outcome&&review.finalScore<KPI))bucket.fail++;
        bucket.scored.push({
          score:review.finalScore,
          date:review.qaDate||review.callDate||'',
          callId:review.callId,
          status:review.status,
          coaching:review.quickCoaching||'',
        });
      }
      buckets.set(key,bucket);
    }

    return [...buckets.values()]
      .filter(b=>b.count>0)
      .map(b=>{
        const sorted=[...b.scored].sort((a,b)=>{
          const ad=parseDate(a.date)?.getTime()||0;
          const bd=parseDate(b.date)?.getTime()||0;
          return bd-ad;
        });
        const topOpportunity=[...b.opportunities.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))[0]?.[0]||'No recurring markdown';
        const trend=buildTrend(sorted);
        return {
          name:b.name,
          center,
          avg:Math.round((b.sum/b.count)*10)/10,
          count:b.count,
          pass:b.pass,
          fail:b.fail,
          passRate:Math.round((b.count?b.pass/b.count*100:0)*10)/10,
          rank:0,
          pending:b.pending,
          overdue:b.overdue,
          topOpportunity,
          recentScores:sorted.slice(0,5),
          trend:trend.trend,
          trendDelta:trend.delta,
        } satisfies AgentRank;
      })
      .sort((a,b)=>b.avg-a.avg||b.count-a.count||a.name.localeCompare(b.name))
      .map((r,i)=>({...r,rank:i+1}));
  },[reviews,center]);

  const summary=useMemo(()=>{
    const qas=ranked.reduce((n,r)=>n+r.count,0);
    const pass=ranked.reduce((n,r)=>n+r.pass,0);
    const fail=ranked.reduce((n,r)=>n+r.fail,0);
    const weighted=ranked.reduce((n,r)=>n+r.avg*r.count,0);
    return {qas,pass,fail,avg:qas?weighted/qas:0,passRate:qas?pass/qas*100:0};
  },[ranked]);

  const week=useMemo(()=>{
    const start=mondayStart();
    const rows=reviews.filter(r=>{
      const d=parseDate(r.qaDate||r.callDate);
      return d&&d>=start;
    });
    const scored=rows.filter(r=>r.finalScore!==null&&Number.isFinite(r.finalScore));
    const pass=scored.filter(r=>{
      const outcome=String(r.scorePassFail||'').trim().toUpperCase();
      return outcome==='PASS'||(!outcome&&(r.finalScore??0)>=KPI);
    }).length;
    const fail=scored.length-pass;
    const avg=scored.length?scored.reduce((n,r)=>n+(r.finalScore||0),0)/scored.length:0;
    return {
      total:scored.length,
      avg,
      pass,
      fail,
      pending:rows.filter(r=>r.status==='Pending').length,
      overdue:rows.filter(r=>r.status==='Overdue').length,
    };
  },[reviews]);

  const opportunities=useMemo(()=>{
    const map=new Map<string,number>();
    reviews.forEach(r=>{
      if(r.positive)return;
      const label=opportunityLabel(r);
      if(label)map.set(label,(map.get(label)||0)+1);
    });
    return [...map.entries()]
      .map(([name,count])=>({name,count}))
      .sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name))
      .slice(0,5);
  },[reviews]);

  const needsAttention=useMemo(()=>ranked
    .filter(r=>r.avg<KPI||r.overdue>0||r.fail>0)
    .sort((a,b)=>b.overdue-a.overdue||(KPI-a.avg)-(KPI-b.avg)||b.fail-a.fail||a.name.localeCompare(b.name))
    .slice(0,8),[ranked]);

  const priorityQueue=useMemo(()=>ranked
    .map(r=>{
      const gap=Math.max(0,KPI-r.avg);
      const priority=r.overdue*5+r.fail*3+r.pending+gap/5;
      const reasons:string[]=[];
      if(r.overdue)reasons.push(`${r.overdue} overdue`);
      if(r.fail)reasons.push(`${r.fail} failed QA${r.fail===1?'':'s'}`);
      if(r.avg<KPI)reasons.push(`${r.avg.toFixed(1)}% average`);
      if(!reasons.length&&r.pending)reasons.push(`${r.pending} pending`);
      return {...r,priority,reasons:reasons.slice(0,2)};
    })
    .filter(r=>r.priority>0)
    .sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name))
    .slice(0,6),[ranked]);

  const trendIcon=(trend:AgentRank['trend'])=>trend==='Improving'?'↑':trend==='Declining'?'↓':'→';
  const trendClass=(trend:AgentRank['trend'])=>trend==='Improving'?'text-green-700':trend==='Declining'?'text-red-700':'text-slate-600';

  return <main className="min-h-screen p-4 md:p-8">
    <div className="mx-auto max-w-7xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[.18em] text-violet-600">{admin?'Admin Preview · ':''}{center}</div>
          <h1 className="mt-1 text-3xl font-bold">Agent QA Ranking</h1>
          <p className="mt-1 text-sm text-slate-500">Private to {center} · all scored QAs currently available in Daily-Findings · KPI {KPI}%</p>
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
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Center Average</div><div className={`mt-1 text-2xl font-bold ${summary.avg>=KPI?'text-green-700':'text-red-700'}`}>{summary.avg.toFixed(1)}%</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Scored QAs</div><div className="mt-1 text-2xl font-bold">{summary.qas}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Pass</div><div className="mt-1 text-2xl font-bold text-green-700">{summary.pass}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Fail</div><div className="mt-1 text-2xl font-bold text-red-700">{summary.fail}</div></div>
          <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">Pass Rate</div><div className="mt-1 text-2xl font-bold">{summary.passRate.toFixed(1)}%</div></div>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          <section className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">📅 This Week</h2><p className="text-sm text-slate-500">Monday through today</p></div><span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-800">{week.total} QA{week.total===1?'':'s'}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/70 p-3"><div className="text-xs text-slate-500">Average</div><div className={`mt-1 text-xl font-bold ${week.avg>=KPI?'text-green-700':'text-red-700'}`}>{week.total?week.avg.toFixed(1):'—'}{week.total?'%':''}</div></div>
              <div className="rounded-xl bg-white/70 p-3"><div className="text-xs text-slate-500">Pass / Fail</div><div className="mt-1 text-xl font-bold"><span className="text-green-700">{week.pass}</span> / <span className="text-red-700">{week.fail}</span></div></div>
              <div className="rounded-xl bg-white/70 p-3"><div className="text-xs text-slate-500">Pending Coaching</div><div className="mt-1 text-xl font-bold">{week.pending}</div></div>
              <div className="rounded-xl bg-white/70 p-3"><div className="text-xs text-slate-500">Overdue Coaching</div><div className={`mt-1 text-xl font-bold ${week.overdue?'text-red-700':''}`}>{week.overdue}</div></div>
            </div>
          </section>

          <section className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">🎯 Needs Attention</h2><p className="text-sm text-slate-500">Below KPI, failed QA, or overdue coaching</p></div><span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">{needsAttention.length}</span></div>
            <div className="mt-4 space-y-2">
              {needsAttention.length===0?<div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">No scored agents currently need attention.</div>:needsAttention.slice(0,5).map(a=><button key={a.name} onClick={()=>setSelectedAgent(a)} className="focusable block w-full rounded-xl border bg-white/70 p-3 text-left hover:bg-amber-50">
                <div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate font-bold">{a.name}</div><div className="mt-0.5 text-xs text-slate-500">{a.fail} fail · {a.overdue} overdue · {a.count} scored</div></div><div className={`shrink-0 font-bold ${a.avg>=KPI?'text-green-700':'text-red-700'}`}>{a.avg.toFixed(1)}%</div></div>
              </button>)}
            </div>
          </section>

          <section className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">📉 Top Coaching Opportunities</h2><p className="text-sm text-slate-500">Most common correction themes</p></div><span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">Center</span></div>
            <div className="mt-4 space-y-3">
              {opportunities.length===0?<div className="text-sm text-slate-500">No recurring coaching opportunities found.</div>:opportunities.map((o,i)=><div key={o.name}>
                <div className="flex justify-between gap-3 text-sm"><span><b>#{i+1}</b> {o.name}</span><span className="font-bold">{o.count}</span></div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-2 rounded-full bg-orange-300" style={{width:`${Math.max(8,o.count/opportunities[0].count*100)}%`}}/></div>
              </div>)}
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
          <section className="glass overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/70 p-5">
              <div><h2 className="font-bold">🏆 {center} Agent Ranking</h2><p className="text-sm text-slate-500">{ranked.length} agent{ranked.length===1?'':'s'} with scored QAs · click an agent for details</p></div>
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">Private Ranking</span>
            </div>
            {ranked.length===0?<div className="p-8 text-center text-slate-500">No scored QA calls are available for {center} yet.</div>:<div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>{['Rank','Agent','Average QA','Total QAs','Pass','Fail','Pass Rate','Trend','KPI Status'].map(h=><th key={h} className="border-b p-3">{h}</th>)}</tr>
                </thead>
                <tbody>{ranked.map(r=><tr key={r.name} onClick={()=>setSelectedAgent(r)} className="cursor-pointer hover:bg-violet-50/50">
                  <td className="border-b p-3 text-lg font-bold">{r.rank===1?'🥇':r.rank===2?'🥈':r.rank===3?'🥉':`#${r.rank}`}</td>
                  <td className="border-b p-3"><div className="font-bold">{r.name}</div><div className="text-xs text-slate-400">{r.topOpportunity}</div></td>
                  <td className={`border-b p-3 font-bold ${r.avg>=KPI?'text-green-700':'text-red-700'}`}>{r.avg.toFixed(1)}%</td>
                  <td className="border-b p-3">{r.count}</td>
                  <td className="border-b p-3 text-green-700">{r.pass}</td>
                  <td className="border-b p-3 text-red-700">{r.fail}</td>
                  <td className="border-b p-3">{r.passRate.toFixed(1)}%</td>
                  <td className={`border-b p-3 font-bold ${trendClass(r.trend)}`}>{trendIcon(r.trend)} {r.trend}</td>
                  <td className="border-b p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${r.avg>=KPI?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{r.avg>=KPI?'✓ Passing':'⚠ Below KPI'}</span></td>
                </tr>)}</tbody>
              </table>
            </div>}
          </section>

          <section className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between gap-2"><div><h2 className="font-bold">🔥 Priority Coaching Queue</h2><p className="text-sm text-slate-500">Who TLs should address first</p></div><span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-800">Action</span></div>
            <div className="mt-4 space-y-3">
              {priorityQueue.length===0?<div className="rounded-xl bg-green-50 p-3 text-sm text-green-800">No priority coaching items right now.</div>:priorityQueue.map((a,i)=><button key={a.name} onClick={()=>setSelectedAgent(a)} className="focusable block w-full rounded-xl border bg-white/75 p-3 text-left hover:bg-red-50/60">
                <div className="flex items-start gap-3"><div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-red-50 text-xs font-bold text-red-700">{i+1}</div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><div className="truncate font-bold">{a.name}</div><div className={`font-bold ${a.avg<KPI?'text-red-700':'text-slate-700'}`}>{a.avg.toFixed(1)}%</div></div><div className="mt-1 text-xs text-slate-500">{a.reasons.join(' · ')}</div></div></div>
              </button>)}
            </div>
          </section>
        </div>

        <div className="mt-3 text-xs text-slate-400">Ranking is ordered by average Final Score. Coaching opportunities are grouped from existing QA markdown, coaching, and Matrix text. Trend compares recent scored QAs with the preceding scored QAs.</div>
      </>}

      {selectedAgent&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedAgent(null)}}>
        <div className="glass max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6">
          <div className="flex items-start justify-between gap-4">
            <div><div className="text-xs font-bold uppercase tracking-wide text-violet-600">{center} · Agent Detail</div><h2 className="mt-1 text-2xl font-bold">{selectedAgent.name}</h2><div className="mt-1 text-sm text-slate-500">Rank #{selectedAgent.rank} · {selectedAgent.count} scored QAs</div></div>
            <button onClick={()=>setSelectedAgent(null)} className="focusable rounded-xl border bg-white px-3 py-2">✕</button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-xl bg-white/75 p-3"><div className="text-xs text-slate-500">Average QA</div><div className={`mt-1 text-xl font-bold ${selectedAgent.avg>=KPI?'text-green-700':'text-red-700'}`}>{selectedAgent.avg.toFixed(1)}%</div></div>
            <div className="rounded-xl bg-white/75 p-3"><div className="text-xs text-slate-500">Pass / Fail</div><div className="mt-1 text-xl font-bold"><span className="text-green-700">{selectedAgent.pass}</span> / <span className="text-red-700">{selectedAgent.fail}</span></div></div>
            <div className="rounded-xl bg-white/75 p-3"><div className="text-xs text-slate-500">Pending / Overdue</div><div className="mt-1 text-xl font-bold">{selectedAgent.pending} / <span className={selectedAgent.overdue?'text-red-700':''}>{selectedAgent.overdue}</span></div></div>
            <div className="rounded-xl bg-white/75 p-3"><div className="text-xs text-slate-500">Trend</div><div className={`mt-1 text-xl font-bold ${trendClass(selectedAgent.trend)}`}>{trendIcon(selectedAgent.trend)} {selectedAgent.trend}</div>{selectedAgent.trendDelta!==0&&<div className="text-xs text-slate-500">{selectedAgent.trendDelta>0?'+':''}{selectedAgent.trendDelta.toFixed(1)} pts</div>}</div>
          </div>

          <div className="mt-4 rounded-xl border bg-violet-50/50 p-4"><div className="text-xs font-bold uppercase tracking-wide text-violet-700">Most Common Coaching Opportunity</div><div className="mt-1 font-bold">{selectedAgent.topOpportunity}</div></div>

          <div className="mt-5"><h3 className="font-bold">Last 5 Scored QAs</h3><div className="mt-3 space-y-2">
            {selectedAgent.recentScores.length===0?<div className="text-sm text-slate-500">No scored QA history available.</div>:selectedAgent.recentScores.map((r,i)=><div key={`${r.callId}-${i}`} className="rounded-xl border bg-white/75 p-3">
              <div className="flex items-center justify-between gap-3"><div><div className="font-semibold">{r.date||'Date unavailable'} · {r.callId||'No Call ID'}</div><div className="text-xs text-slate-500">{r.status}</div></div><div className={`text-lg font-bold ${r.score>=KPI?'text-green-700':'text-red-700'}`}>{r.score.toFixed(1)}%</div></div>
              {r.coaching&&<div className="mt-2 line-clamp-2 text-sm text-slate-600">{r.coaching}</div>}
            </div>)}
          </div></div>
        </div>
      </div>}
    </div>
  </main>;
}
