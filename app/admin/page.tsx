import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';

export default async function Admin() {
  const s = await getSession();
  if (!s) redirect('/');
  if (s.role !== 'admin') redirect(`/center/${s.center?.toLowerCase()}`);
  return <Dashboard admin userName={s.name} />;
}
