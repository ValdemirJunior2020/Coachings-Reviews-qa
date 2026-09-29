import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import AdminSettings from '@/components/AdminSettings';

export default async function AdminSettingsPage(){
  const s=await getSession();
  if(!s) redirect('/');
  if(s.role!=='admin') redirect(`/center/${s.center?.toLowerCase()}`);
  return <AdminSettings userName={s.name}/>;
}
