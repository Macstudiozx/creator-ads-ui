'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import { useAuth } from '@/components/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('operator@attop99.test');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { supabaseReady, role, refresh } = useAuth();

  async function loginWithPassword(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    if (!supabase) {
      setMessage('Mock mode: ยังไม่ได้ใส่ Supabase env — ใช้ role admin จำลองสำหรับตรวจ UI');
      setLoading(false);
      router.push('/upload');
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setMessage(`Login failed: ${error.message}`);
      setLoading(false);
      return;
    }
    await refresh();
    setMessage('Login สำเร็จ — กำลังไปหน้า Upload');
    router.push('/upload');
  }

  async function sendMagicLink() {
    setLoading(true);
    setMessage('');
    const supabase = createClient();
    if (!supabase) {
      setMessage('Mock mode: ยังไม่ได้ใส่ Supabase env — ใช้ role admin จำลองสำหรับตรวจ UI');
      setLoading(false);
      return;
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${location.origin}/upload` },
    });
    setMessage(error ? error.message : 'ส่ง magic link ไปที่อีเมลแล้ว');
    setLoading(false);
  }

  return <main className="auth-shell">
    <form className="auth-card" onSubmit={loginWithPassword}>
      <h1>เข้าสู่ Creator Console</h1>
      <p>Supabase Auth · ใช้ Email/Password สำหรับ dev เพื่อลดปัญหา email rate limit · role อ่านจาก JWT: viewer / approver / admin</p>
      <div className="form-grid">
        <label>Email<input value={email} onChange={e => setEmail(e.target.value)} type="email" required /></label>
        <label>Password<input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="password ที่สร้างใน Supabase" required /></label>
        <button className="btn primary" type="submit" disabled={loading}>{loading ? 'กำลัง login…' : 'เข้าสู่ระบบ'}</button>
        <button className="btn ghost" type="button" disabled={loading} onClick={sendMagicLink}>ส่ง Magic Link แทน</button>
        <div className={supabaseReady ? 'okbox' : 'errbox'}>{supabaseReady ? `Supabase connected · current role ${role}` : `Mock mode · current role ${role} · ใส่ .env.local เพื่อ login จริง`}</div>
        {message && <div className={message.includes('failed') || message.includes('rate') ? 'errbox' : 'okbox'}>{message}</div>}
      </div>
    </form>
  </main>;
}
