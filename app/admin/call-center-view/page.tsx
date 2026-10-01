import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import type { Center } from '@/lib/types';

const centers:Center[]=['Buwelo','WNS','Concentrix','Telus'];

export default async function CallCenterViewModePage({
  searchParams,
}:{searchParams:Promise<{center?:string}>}){
  const session=await getSession();
  if(!session) redirect('/');
  if(session.role!=='admin') redirect(`/center/${session.center?.toLowerCase()}`);
  const q=await searchParams;
  const selected=centers.includes(q.center as Center)?q.center as Center:'Buwelo';
  return <Dashboard admin={false} center={selected} userName={`${session.name} · View Only`} viewOnly adminPreview/>;
}
