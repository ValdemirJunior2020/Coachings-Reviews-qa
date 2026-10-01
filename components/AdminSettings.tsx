'use client';

import {useEffect,useState} from 'react';
import type {Center} from '@/lib/types';

type LoginUser={
  id:string;
  name:string;
  email:string;
  role:'admin'|'center';
  center:Center|'';
  active:boolean;
};

const CENTERS:Center[]=['Buwelo','WNS','Concentrix','Telus'];

export default function AdminSettings({userName}:{userName:string}){
  const [users,setUsers]=useState<LoginUser[]>([]);
  const [loading,setLoading]=useState(true);
  const [flash,setFlash]=useState('');
  const [editing,setEditing]=useState<LoginUser|null>(null);
  const [adding,setAdding]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const res=await fetch('/api/admin/users',{cache:'no-store'});
      const d=await res.json();
      if(!res.ok) throw new Error(d.error||'Unable to load logins.');
      setUsers(d.users||[]);
    }catch(e){setFlash(e instanceof Error?e.message:'Unable to load logins.')}
    finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  async function save(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const payload={
      id:editing?.id,
      name:String(f.get('name')||''),
      email:String(f.get('email')||''),
      role:String(f.get('role')||'center'),
      center:String(f.get('center')||''),
      password:String(f.get('password')||''),
      active:f.get('active')==='on',
    };
    const method=editing?'PATCH':'POST';
    const res=await fetch('/api/admin/users',{method,headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
    const d=await res.json();
    if(!res.ok){setFlash(d.error||'Unable to save login.');return}
    setFlash(editing?'✓ Login updated.':'✓ Login added.');
    setEditing(null);setAdding(false);
    await load();
  }

  async function toggle(user:LoginUser){
    const res=await fetch('/api/admin/users',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...user,active:!user.active,password:''})});
    const d=await res.json();
    if(!res.ok){setFlash(d.error||'Unable to update login.');return}
    setFlash(user.active?'Login disabled.':'Login enabled.');
    await load();
  }

  async function deleteUser(user:LoginUser){
    if(!confirm(`Permanently delete login for ${user.name} (${user.email})? This cannot be undone.`))return;
    const res=await fetch('/api/admin/users',{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({id:user.id})});
    const d=await res.json();
    if(!res.ok){setFlash(d.error||'Unable to delete login.');return}
    setFlash('✓ Login permanently deleted.');
    await load();
  }

  const formUser=editing;
  return <div className="min-h-screen md:flex">
    <aside className="glass fixed inset-y-0 left-0 z-40 hidden w-64 p-5 md:block">
      <div className="flex items-center gap-3"><img src="/images/qa-control-background.jpg" alt="QA Control" className="h-12 w-12 rounded-xl object-cover"/><div><div className="font-bold">QA Control</div><div className="text-xs text-slate-500">Super Admin</div></div></div>
      <nav className="mt-8 grid gap-2 text-sm">
        <button onClick={()=>location.href='/admin'} className="focusable rounded-lg p-2 text-left hover:bg-sky-50">← Dashboard / All Reviews</button>
        <div className="rounded-lg bg-sky-50 p-2 font-bold text-sky-800">⚙ Admin / Settings</div>
        <button onClick={async()=>{await fetch('/api/logout',{method:'POST'});location.href='/'}} className="focusable rounded-lg p-2 text-left text-red-700 hover:bg-red-50">Logout</button>
      </nav>
    </aside>

    <main className="w-full p-4 md:ml-64 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-3xl font-bold">Admin / Settings</h1><p className="text-slate-500">Manage website logins · {userName}</p></div>
          <div className="flex gap-2"><button onClick={()=>location.href='/admin'} className="focusable rounded-xl border bg-white px-4 py-2 md:hidden">← Dashboard</button><button onClick={()=>{setEditing(null);setAdding(true)}} className="focusable rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">+ Add Login</button></div>
        </div>

        {flash&&<div className="mt-4 rounded-xl bg-sky-50 p-3 text-sky-800">{flash}</div>}

        <div className="glass mt-6 overflow-hidden rounded-2xl">
          <div className="border-b p-4"><h2 className="font-bold">Managed Logins</h2><p className="text-sm text-slate-500">Passwords are never displayed. Use Edit to set a new password.</p></div>
          {loading?<div className="p-8 text-center">Loading logins...</div>:users.length===0?<div className="p-8 text-center text-slate-500">No managed logins yet. Existing environment logins still work until you add managed accounts.</div>:<div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-slate-50 text-left"><tr><th className="p-3">Name</th><th className="p-3">Email / Login</th><th className="p-3">Access</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr></thead><tbody>{users.map(u=><tr key={u.id} className="border-t"><td className="p-3 font-semibold">{u.name}</td><td className="p-3">{u.email}</td><td className="p-3">{u.role==='admin'?'Admin':u.center}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${u.active?'bg-green-100 text-green-800':'bg-slate-200 text-slate-600'}`}>{u.active?'Active':'Disabled'}</span></td><td className="p-3"><div className="flex gap-2"><button onClick={()=>{setEditing(u);setAdding(false)}} className="focusable rounded-lg border bg-white px-3 py-1.5">Edit</button><button onClick={()=>toggle(u)} className="focusable rounded-lg border bg-white px-3 py-1.5">{u.active?'Disable':'Enable'}</button><button onClick={()=>deleteUser(u)} className="focusable rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 font-semibold text-red-700">Delete</button></div></td></tr>)}</tbody></table></div>}
        </div>

        {(adding||editing)&&<div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"><form onSubmit={save} className="glass w-full max-w-lg rounded-3xl p-6">
          <h2 className="text-xl font-bold">{editing?'Edit Login':'Add Login'}</h2>
          <p className="mt-1 text-sm text-slate-500">{editing?'Change the login details. Leave password blank to keep the current password.':'Create a new Admin or Call Center login.'}</p>
          <label className="mt-4 block font-semibold">Name<input name="name" defaultValue={formUser?.name||''} required className="focusable mt-1 w-full rounded-xl border p-3"/></label>
          <label className="mt-4 block font-semibold">Email / Login<input name="email" type="email" defaultValue={formUser?.email||''} required className="focusable mt-1 w-full rounded-xl border p-3"/></label>
          <label className="mt-4 block font-semibold">Access<select name="role" defaultValue={formUser?.role||'center'} className="focusable mt-1 w-full rounded-xl border p-3" onChange={e=>{const sel=e.currentTarget.form?.elements.namedItem('center') as HTMLSelectElement|null;if(sel)sel.disabled=e.target.value==='admin'}}><option value="center">Call Center</option><option value="admin">Admin</option></select></label>
          <label className="mt-4 block font-semibold">Call Center<select name="center" defaultValue={formUser?.center||'Buwelo'} disabled={formUser?.role==='admin'} className="focusable mt-1 w-full rounded-xl border p-3">{CENTERS.map(c=><option key={c}>{c}</option>)}</select></label>
          <label className="mt-4 block font-semibold">{editing?'New Password (optional)':'Password'}<input name="password" type="password" required={!editing} minLength={8} autoComplete="new-password" className="focusable mt-1 w-full rounded-xl border p-3" placeholder={editing?'Leave blank to keep current password':'Minimum 8 characters'}/></label>
          <label className="mt-4 flex items-center gap-2 font-semibold"><input name="active" type="checkbox" defaultChecked={formUser?.active??true}/> Active login</label>
          <div className="mt-6 flex justify-end gap-2"><button type="button" onClick={()=>{setEditing(null);setAdding(false)}} className="focusable rounded-xl border bg-white px-4 py-2">Cancel</button><button className="focusable rounded-xl bg-sky-700 px-4 py-2 font-bold text-white">Save Login</button></div>
        </form></div>}
      </div>
    </main>
  </div>
}
