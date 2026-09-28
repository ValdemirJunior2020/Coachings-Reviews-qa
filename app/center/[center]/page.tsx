import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Dashboard from '@/components/Dashboard';
import { canAccessCenter } from '@/lib/permissions';
import type { Center } from '@/lib/types';

const map: Record<string, Center> = {
  buwelo: 'Buwelo',
  wns: 'WNS',
  concentrix: 'Concentrix',
  telus: 'Telus',
};

export default async function CenterPage({
  params,
}: {
  params: Promise<{ center: string }>;
}) {
  const { center: slug } = await params;
  const center = map[slug.toLowerCase()];
  const s = await getSession();

  if (!s) redirect('/');
  if (!center) redirect('/');
  if (!canAccessCenter(s, center)) {
    redirect(`/center/${s.center?.toLowerCase()}`);
  }

  return <Dashboard admin={s.role === 'admin'} center={center} userName={s.name} />;
}
