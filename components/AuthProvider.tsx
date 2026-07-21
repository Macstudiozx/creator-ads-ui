'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Role } from '@/lib/types';
import { createClient, hasSupabaseEnv } from '@/lib/supabase-browser';
import { mockUser } from '@/lib/mock-data';

const AuthCtx = createContext({ user: mockUser as any, role: mockUser.role as Role, loading: false, supabaseReady: false, refresh: async () => {} });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(mockUser);
  const [role, setRole] = useState<Role>('admin');
  const [loading, setLoading] = useState(true);
  const supabase = useMemo(() => createClient(), []);

  const refresh = async () => {
    if (!supabase) { setUser(mockUser); setRole(mockUser.role); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase.auth.getUser();
    const u = data.user;
    if (u) {
      setUser(u);
      setRole((u.app_metadata?.role || u.user_metadata?.role || 'viewer') as Role);
    } else {
      setUser(null); setRole('viewer');
    }
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);
  return <AuthCtx.Provider value={{ user, role, loading, supabaseReady: hasSupabaseEnv, refresh }}>{children}</AuthCtx.Provider>;
}
export function useAuth() { return useContext(AuthCtx); }
export function canApprove(role: Role) { return role === 'approver' || role === 'admin'; }
export function canAdmin(role: Role) { return role === 'admin'; }
