'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const r = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');

    const f = new FormData(e.currentTarget);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: f.get('email'),
        password: f.get('password'),
      }),
    });
    const d = await res.json();

    if (!res.ok) {
      setError(d.error || 'Invalid login');
      setBusy(false);
      return;
    }

    r.push(d.redirect);
    r.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block font-semibold">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="username"
          className="focusable mt-1 w-full rounded-xl border p-3 font-normal"
        />
      </label>
      <label className="block font-semibold">
        Password
        <input
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="focusable mt-1 w-full rounded-xl border p-3 font-normal"
        />
      </label>

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </div>
      )}

      <button
        disabled={busy}
        className="focusable w-full rounded-xl bg-sky-700 p-3 font-bold text-white disabled:opacity-50"
      >
        {busy ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
