'use client';

import {useEffect,useMemo,useState} from 'react';
import {filterReviews,type ReviewFilters} from '@/lib/filter';
import type {Center,Review,ReviewStatus} from '@/lib/types';

const CENTERS:Center[]=['Buwelo','WNS','Concentrix','Telus'];
const emptyFilters=(center?:Center):ReviewFilters=>({search:'',center:center||'All',agent:'All',status:'All',itinerary:'',callId:'',qaDate:'',callDate:'',coachedDate:'',range:'All',from:'',to:''});

function Stat({label,value}:{label:string;value:string|number}){return <div className="glass rounded-2xl p-4"><div className="text-sm text-slate-500">{label}</div><div className="mt-1 text-2xl font-bold">{value}</div></div>}
function Info({label,value}:{label:string;value:string}){return <div><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</div><div className="mt-1 text-sm leading-6">{value||'—'}</div></div>}

export default function Dashboard({admin,center,userName}:{admin:boolean;center?:Center;userName:string}){
  const [reviews,setReviews]=useState<Review[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [filters,setFilters]=useState<ReviewFilters>(()=>emptyFilters(center));
  const [modal,setModal]=useState<Review|null>(null);
  const [detail,setDetail]=useState<Review|null>(null);
  const [saving,setSaving]=useState(false);
  const [flash,setFlash]=useState('');
  const [menuOpen,setMenuOpen]=useState(false);
  const [viewMode,setViewMode]=useState<'cards'|'sheet'>('cards');

  async function load(){
    setLoading(true);setError('');
    try{const res=await fetch('/api/reviews',{cache:'no-store'});const d=await res.json();if(!res.ok)throw new Error(d.error);setReviews(d.reviews)}
    catch(e){setError(e instanceof Error?e.message:'Unable to load reviews.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const agents=useMemo(()=>['All',...Array.from(new Set(reviews.filter(r=>filters.center==='All'||r.center===filters.center).map(r=>r.agent))).sort()],[reviews,filters.center]);
  const filtered=useMemo(()=>filterReviews(reviews,filters),[reviews,filters]);
  const pending=filtered.filter(r=>r.status==='Pending').length;
  const completed=filtered.filter(r=>r.status==='Completed').length;
  const overdue=filtered.filter(r=>r.status==='Overdue').length;
  const total=filtered.length;
  const pct=total?Math.round(completed/total*100):0;

  function patch<K extends keyof ReviewFilters>(key:K,value:ReviewFilters[K]){setFilters(f=>({...f,[key]:value}))}
  function chooseStatus(value:'All'|ReviewStatus){patch('status',value);setMenuOpen(false)}

  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault(); if(!modal)return; setSaving(true);setFlash('');
    const f=new FormData(e.currentTarget);
    const res=await fetch('/api/coaching',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({center:modal.center,callId:modal.callId,coached:true,coachedBy:f.get('coachedBy'),dateCoached:f.get('dateCoached'),notes:f.get('notes')})});
    const d=await res.json();
    if(res.ok){setReviews(x=>x.map(r=>r.callId===d.review.callId&&r.center===d.review.center?d.review:r));setModal(null);setFlash('✓ Coaching saved successfully.')}
    else setFlash(d.error||'Save failed.');
    setSaving(false);
  }
  async function reopen(r:Review){
    if(!confirm(`Reopen coaching for ${r.agent}? This will move it back to Pending.`))return;
    const res=await fetch('/api/coaching',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({center:r.center,callId:r.callId,coached:false})});
    const d=await res.json();
    if(res.ok){setReviews(x=>x.map(v=>v.callId===d.review.callId&&v.center===d.review.center?d.review:v));setFlash('Coaching reopened.')}
    else setFlash(d.error||'Reopen failed.');
  }
  async function uploadDaily(file:File){
    setFlash('Uploading Daily Findings...');
    const body=new FormData();body.append('file',file);
    const res=await fetch('/api/import',{method:'POST',body});
    const d=await res.json();
    if(!res.ok){setFlash(d.error||'Upload failed.');return}
    setFlash(`✓ Upload complete — ${d.added} new · ${d.updated} updated · ${d.skipped} skipped.`);
    await load();
  }
  function downloadReviews(){
    const selected=admin&&filters.center!=='All'?String(filters.center):'';
    location.href='/api/export'+(selected?`?center=${encodeURIComponent(selected)}`:'');
  }
  async function logout(){await fetch('/api/logout',{method:'POST'});location.href='/'}

  const nav=<nav className="mt-8 grid gap-2 text-sm">
    <button onClick={()=>{setViewMode('cards');chooseStatus('All')}} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">Dashboard / All Reviews</button>
    <button onClick={()=>{setViewMode('sheet');chooseStatus('All')}} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">📊 Daily Findings Sheet</button>
    <button onClick={()=>chooseStatus('Pending')} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">Pending Coaching</button>
    <button onClick={()=>chooseStatus('Overdue')} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">Overdue</button>
    <button onClick={()=>chooseStatus('Completed')} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">Completed Coaching</button>
    <button onClick={logout} className="focusable rounded-lg p-2 text-left text-red-700 hover:bg-red-50">Logout</button>
  </nav>;

  return <div className="min-h-screen md:flex">
    <button onClick={()=>setMenuOpen(true)} className="focusable fixed left-4 top-4 z-40 rounded-xl bg-white/95 px-3 py-2 shadow md:hidden" aria-label="Open navigation">☰ Menu</button>
    {menuOpen&&<button className="fixed inset-0 z-40 bg-slate-900/35 md:hidden" aria-label="Close navigation" onClick={()=>setMenuOpen(false)}/>}
    <aside className={`glass fixed inset-y-0 left-0 z-50 w-64 p-5 transition-transform md:translate-x-0 ${menuOpen?'translate-x-0':'-translate-x-full'} md:block`}>
      <div className="flex items-center gap-3"><img src="/images/qa-control-background.jpg" alt="QA Control" className="h-12 w-12 rounded-xl object-cover"/><div><div className="font-bold">QA Control</div><div className="text-xs text-slate-500">{admin?'Super Admin':center}</div></div></div>
      {nav}
    </aside>
    <main className="w-full p-4 pt-20 md:ml-64 md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-bold">QA Coaching Daily Feedbacks</h1><p className="text-slate-500">Quality Assurance Coaching Follow-Up · {userName}</p></div><div className="flex flex-wrap gap-2">{admin&&<label className="focusable cursor-pointer rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">📤 Upload Daily Findings<input type="file" accept=".xlsx,.xls" className="hidden" onChange={e=>{const file=e.target.files?.[0];if(file)uploadDaily(file);e.currentTarget.value=''}}/></label>}<button onClick={downloadReviews} className="focusable rounded-xl border bg-white px-4 py-2">⬇ Download {admin?(filters.center==='All'?'All Centers':filters.center):center}</button><button onClick={load} className="focusable rounded-xl border bg-white px-4 py-2">Refresh</button></div></div>
        {flash&&<div className="mt-4 rounded-xl bg-sky-50 p-3 text-sky-800">{flash}</div>}
        {error&&<div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-red-700">{error}</div>}
        {!loading&&!error&&<div className={`mt-5 rounded-2xl p-4 font-semibold ${overdue?'bg-red-50 text-red-800':pending?'bg-amber-50 text-amber-800':'bg-green-50 text-green-800'}`}>{overdue?`🔴 Overdue Coaching — ${overdue} review${overdue===1?'':'s'} pending for more than 2 business days.`:pending?`⚠ Coaching Reminder — ${pending} QA review${pending===1?' is':'s are'} still waiting for coaching confirmation.`:'✅ All Coaching Completed — There are no pending coaching reviews in this view.'}</div>}

        <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-5"><Stat label="Reviews" value={total}/><Stat label="Pending" value={pending}/><Stat label="Completed" value={completed}/><Stat label="Overdue" value={overdue}/><Stat label="Completion" value={`${pct}%`}/></div>

        {admin&&<div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{CENTERS.map(c=>{const rows=reviews.filter(r=>r.center===c),done=rows.filter(r=>r.coached).length,late=rows.filter(r=>r.status==='Overdue').length,centerPct=rows.length?Math.round(done/rows.length*100):0;return <button key={c} onClick={()=>patch('center',c)} className="glass focusable rounded-2xl p-4 text-left"><div className="font-bold">{c}</div><div className="mt-2 text-sm text-slate-600">{rows.length} Reviews · {rows.length-done} Pending · {late} Overdue</div><div className="mt-2 text-xl font-bold">{centerPct}% Complete</div></button>})}</div>}

        <div className="glass mt-5 rounded-2xl p-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <input aria-label="Search reviews" value={filters.search} onChange={e=>patch('search',e.target.value)} placeholder="Search all review text..." className="focusable rounded-xl border p-2 xl:col-span-2"/>
            {admin&&<select aria-label="Call Center" value={filters.center} onChange={e=>{patch('center',e.target.value as ReviewFilters['center']);patch('agent','All')}} className="focusable rounded-xl border p-2"><option>All</option>{CENTERS.map(c=><option key={c}>{c}</option>)}</select>}
            <select aria-label="Agent" value={filters.agent} onChange={e=>patch('agent',e.target.value)} className="focusable rounded-xl border p-2">{agents.map(a=><option key={a}>{a}</option>)}</select>
            <input aria-label="Booking itinerary" value={filters.itinerary} onChange={e=>patch('itinerary',e.target.value)} placeholder="Itinerary" className="focusable rounded-xl border p-2"/>
            <input aria-label="Call ID" value={filters.callId} onChange={e=>patch('callId',e.target.value)} placeholder="Call ID" className="focusable rounded-xl border p-2"/>
            <select aria-label="Status" value={filters.status} onChange={e=>patch('status',e.target.value as ReviewFilters['status'])} className="focusable rounded-xl border p-2"><option>All</option><option>Pending</option><option>Overdue</option><option>Completed</option></select>
            <select aria-label="Date range" value={filters.range} onChange={e=>patch('range',e.target.value as ReviewFilters['range'])} className="focusable rounded-xl border p-2"><option>All</option><option>Today</option><option>This Week</option><option>This Month</option><option>Custom</option></select>
            <label className="text-xs font-bold text-slate-500">QA Date<input aria-label="QA Date" type="date" value={filters.qaDate} onChange={e=>patch('qaDate',e.target.value)} className="focusable mt-1 w-full rounded-xl border p-2 font-normal text-slate-800"/></label>
            <label className="text-xs font-bold text-slate-500">Call Date<input aria-label="Call Date" type="date" value={filters.callDate} onChange={e=>patch('callDate',e.target.value)} className="focusable mt-1 w-full rounded-xl border p-2 font-normal text-slate-800"/></label>
            <label className="text-xs font-bold text-slate-500">Date Coached<input aria-label="Date Coached" type="date" value={filters.coachedDate} onChange={e=>patch('coachedDate',e.target.value)} className="focusable mt-1 w-full rounded-xl border p-2 font-normal text-slate-800"/></label>
            {filters.range==='Custom'&&<><label className="text-xs font-bold text-slate-500">From<input aria-label="Custom date from" type="date" value={filters.from} onChange={e=>patch('from',e.target.value)} className="focusable mt-1 w-full rounded-xl border p-2 font-normal text-slate-800"/></label><label className="text-xs font-bold text-slate-500">To<input aria-label="Custom date to" type="date" value={filters.to} onChange={e=>patch('to',e.target.value)} className="focusable mt-1 w-full rounded-xl border p-2 font-normal text-slate-800"/></label></>}
          </div>
          <button onClick={()=>setFilters(emptyFilters(center))} className="focusable mt-3 rounded-xl border bg-white px-4 py-2 text-sm">Clear Filters</button>
        </div>

        {admin&&<div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="glass rounded-2xl p-5"><h2 className="font-bold">Coaching Completion by Center</h2><div className="mt-4 space-y-3">{CENTERS.map(c=>{const rows=reviews.filter(r=>r.center===c),done=rows.filter(r=>r.coached).length,p=rows.length?Math.round(done/rows.length*100):0;return <button key={c} onClick={()=>patch('center',c)} className="block w-full text-left"><div className="flex justify-between text-sm"><span>{c}</span><span>{p}%</span></div><div className="h-3 rounded-full bg-slate-100"><div className="h-3 rounded-full bg-sky-600" style={{width:`${p}%`}}/></div></button>})}</div></div>
          <div className="glass rounded-2xl p-5"><h2 className="font-bold">Pending vs Completed</h2><div className="mt-5 flex items-center gap-6"><div className="h-32 w-32 rounded-full" style={{background:`conic-gradient(#0284c7 0 ${pct}%, #f1c75b ${pct}% 100%)`}} aria-label={`${pct}% completed`}/><div className="space-y-2 text-sm"><div>● Completed: <b>{completed}</b></div><div>○ Pending/Overdue: <b>{pending+overdue}</b></div></div></div></div>
        </div>}

        {viewMode==='sheet'?<div className="glass mt-5 overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white/70 p-4"><div><h2 className="font-bold">Daily Findings Sheet</h2><p className="text-sm text-slate-500">{admin?(filters.center==='All'?'All centers':filters.center):center} · {filtered.length} review{filtered.length===1?'':'s'}</p></div><button onClick={()=>setViewMode('cards')} className="focusable rounded-xl border bg-white px-4 py-2 text-sm">Card View</button></div>
          <div className="overflow-x-auto">
            <table className="min-w-[2800px] border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-100 text-left">
                <tr>{['Date','Booking Itinerary number','Call center',"Agent's name",'Call ID','What guest needed?','What happened?','The Correct Matrix Process','Business impact','Quick Coaching','Call Lenght','Date-of-the-call','Call Month','Coached?','Date Coached','Coached By','Coaching Response / Notes','Confirmation Link'].map(h=><th key={h} className="border-b border-r p-3 font-bold text-slate-700">{h}</th>)}</tr>
              </thead>
              <tbody>{loading?<tr><td colSpan={18} className="p-8 text-center">Loading coaching reviews...</td></tr>:filtered.length===0?<tr><td colSpan={18} className="p-8 text-center">No reviews match these filters.</td></tr>:filtered.map(r=><tr key={`sheet-${r.center}-${r.callId}`} className="align-top hover:bg-sky-50/50">
                <td className="border-b border-r p-3 whitespace-nowrap">{r.qaDate||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.itinerary||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.center}</td>
                <td className="border-b border-r p-3 whitespace-nowrap font-semibold">{r.agent}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.callId}</td>
                <td className="border-b border-r p-3 min-w-[260px] whitespace-normal">{r.guestNeeded||'—'}</td>
                <td className="border-b border-r p-3 min-w-[340px] whitespace-normal">{r.happened||'—'}</td>
                <td className="border-b border-r p-3 min-w-[340px] whitespace-normal">{r.matrixProcess||'—'}</td>
                <td className="border-b border-r p-3 min-w-[280px] whitespace-normal">{r.businessImpact||'—'}</td>
                <td className="border-b border-r p-3 min-w-[300px] whitespace-normal">{r.quickCoaching||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.callLength||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.callDate||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.callMonth||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.coached?'Yes':'No'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.dateCoached||'—'}</td>
                <td className="border-b border-r p-3 whitespace-nowrap">{r.coachedBy||'—'}</td>
                <td className="border-b border-r p-3 min-w-[280px] whitespace-normal">{r.coachingNotes||'—'}</td>
                <td className="border-b p-3 min-w-[220px] break-all">{r.confirmationLink||'—'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>:<div className="mt-5">{loading?<div className="glass rounded-2xl p-8 text-center">Loading coaching reviews...</div>:filtered.length===0?<div className="glass rounded-2xl p-8 text-center">No reviews match these filters.</div>:<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map(r=><article key={`${r.center}-${r.callId}`} className={`glass rounded-2xl p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${r.positive?'positive':'correction'}`}>
          <button onClick={()=>setDetail(r)} className="w-full text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{r.center}</div><h3 className="truncate text-base font-bold">{r.agent}</h3><div className="mt-1 truncate text-xs text-slate-500">{r.itinerary||'No itinerary'}</div></div>
              <span className={`status shrink-0 ${r.status.toLowerCase()}`}>{r.status==='Overdue'?'● ':r.status==='Completed'?'✓ ':'○ '}{r.status}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-white/60 p-3 text-xs">
              <div><div className="font-bold text-slate-500">Date</div><div>{r.qaDate||'—'}</div></div>
              <div><div className="font-bold text-slate-500">Call Date</div><div>{r.callDate||'—'}</div></div>
              <div><div className="font-bold text-slate-500">Call Length</div><div>{r.callLength||'—'}</div></div>
              <div><div className="font-bold text-slate-500">Call ID</div><div className="truncate">{r.callId}</div></div>
            </div>
            <div className="mt-3"><div className="text-xs font-bold uppercase tracking-wide text-slate-500">Quick Coaching</div><p className="mt-1 line-clamp-3 text-sm leading-5 text-slate-700">{r.quickCoaching||'No coaching note.'}</p></div>
            <div className="mt-3 text-xs font-semibold text-sky-700">Open full review →</div>
          </button>
          <div className="mt-4 flex gap-2 border-t pt-3">{r.coached?<><button onClick={()=>setModal(r)} className="focusable flex-1 rounded-xl border bg-white px-3 py-2 text-sm font-semibold">Edit Coaching</button>{admin&&<button onClick={()=>reopen(r)} className="focusable rounded-xl border border-red-200 bg-white px-3 py-2 text-sm text-red-700">Reopen</button>}</>:<button onClick={()=>setModal(r)} className="focusable w-full rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white">Mark as Coached</button>}</div>
        </article>)}</div>}</div>}
      </div>
    </main>

    {detail&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-4"><div className="glass max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl p-6">
      <div className="flex items-start justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-wide text-slate-500">{detail.center}</div><h2 className="text-2xl font-bold">{detail.agent}</h2><div className="text-sm text-slate-500">Itinerary {detail.itinerary||'—'} · {detail.callId}</div></div><button onClick={()=>setDetail(null)} className="focusable rounded-xl border bg-white px-3 py-2">✕</button></div>
      <div className="mt-5 grid gap-4 md:grid-cols-2"><Info label="Date" value={detail.qaDate}/><Info label="Date-of-the-call" value={detail.callDate}/><Info label="What guest needed?" value={detail.guestNeeded}/><Info label="What happened?" value={detail.happened}/><Info label="The Correct Matrix Process" value={detail.matrixProcess}/><Info label="Business impact" value={detail.businessImpact}/><div className="md:col-span-2"><Info label="Quick Coaching" value={detail.quickCoaching}/></div></div>
      <div className="mt-5 rounded-xl bg-white/70 p-3 text-sm text-slate-600">Call Lenght: {detail.callLength||'—'} · Call Month: {detail.callMonth||'—'} · Status: <b>{detail.status}</b></div>
      <div className="mt-5 flex justify-end"><button onClick={()=>{setDetail(null);setModal(detail)}} className="focusable rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">{detail.coached?'Edit Coaching':'Mark as Coached'}</button></div>
    </div></div>}

    {modal&&<div role="dialog" aria-modal="true" className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/35 p-4"><form onSubmit={save} className="glass w-full max-w-lg rounded-3xl p-6"><h2 className="text-xl font-bold">{modal.coached?'Edit Coaching':'Mark as Coached'}</h2><p className="mt-1 text-sm text-slate-500">{modal.agent} · {modal.callId}</p><label className="mt-4 block font-semibold">Coached By<input name="coachedBy" defaultValue={modal.coachedBy} required className="focusable mt-1 w-full rounded-xl border p-3"/></label><label className="mt-4 block font-semibold">Date Coached<input name="dateCoached" type="date" defaultValue={modal.dateCoached||new Date().toISOString().slice(0,10)} required className="focusable mt-1 w-full rounded-xl border p-3"/></label><label className="mt-4 block font-semibold">Coaching Response / Notes<textarea name="notes" defaultValue={modal.coachingNotes} rows={4} className="focusable mt-1 w-full rounded-xl border p-3"/></label><div className="mt-5 flex justify-end gap-2"><button type="button" onClick={()=>setModal(null)} className="focusable rounded-xl border bg-white px-4 py-2">Cancel</button><button disabled={saving} className="focusable rounded-xl bg-sky-700 px-4 py-2 font-bold text-white disabled:opacity-50">{saving?'Saving coaching...':'Confirm & Save'}</button></div></form></div>}
  </div>
}
