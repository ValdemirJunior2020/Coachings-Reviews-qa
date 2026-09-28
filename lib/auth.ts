import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { timingSafeEqual } from 'crypto';
import type { Center, SessionUser } from './types';

const COOKIE = 'qa_session';
const MAX_AGE = 60 * 60 * 8;

const centerMap: Array<[Center, string, string]> = [
  ['Buwelo', 'BUWELO_EMAIL', 'BUWELO_PASSWORD'],
  ['WNS', 'WNS_EMAIL', 'WNS_PASSWORD'],
  ['Concentrix', 'CONCENTRIX_EMAIL', 'CONCENTRIX_PASSWORD'],
  ['Telus', 'TELUS_EMAIL', 'TELUS_PASSWORD'],
];

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is not configured');
  return new TextEncoder().encode(value);
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export function authenticate(email: string, password: string): SessionUser | null {
  const normalized = email.trim().toLowerCase();
  const admins = [
    {
      name: 'Valdemir Gonçalves',
      email: process.env.ADMIN_VALDEMIR_EMAIL,
      password: process.env.ADMIN_VALDEMIR_PASSWORD,
    },
    {
      name: 'Barbara Kalchik',
      email: process.env.ADMIN_BARBARA_EMAIL,
      password: process.env.ADMIN_BARBARA_PASSWORD,
    },
  ];

  for (const a of admins) {
    if (a.email && a.password &&
        normalized === a.email.toLowerCase() &&
        safeEqual(password, a.password)) {
      return { email: a.email, name: a.name, role: 'admin' };
    }
  }

  for (const [center, emailKey, passKey] of centerMap) {
    const e = process.env[emailKey];
    const p = process.env[passKey];
    if (e && p && normalized === e.toLowerCase() && safeEqual(password, p)) {
      return { email: e, name: center, role: 'center', center };
    }
  }
  return null;
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT(user as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());

  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).set(COOKIE, '', {
    httpOnly: true,
    path: '/',
    maxAge: 0,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

export async function getSession(): Promise<SessionUser | null> {
  try {
    const token = (await cookies()).get(COOKIE)?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}
