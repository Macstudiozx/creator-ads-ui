'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, GalleryVerticalEnd, Home, LayoutDashboard, Search, ShieldCheck, UploadCloud } from 'lucide-react';
import { AuthProvider } from '@/components/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const navItems = [
  { href: '/settings', icon: Home, label: 'Settings' },
  { href: '/upload', icon: UploadCloud, label: 'Upload' },
  { href: '/board', icon: LayoutDashboard, label: 'Board' },
];

function isActive(pathname: string, href: string) {
  if (href === '/settings') return pathname === '/' || pathname.startsWith('/settings');
  return pathname.startsWith(href);
}

function pageLabel(pathname: string) {
  if (pathname.startsWith('/upload')) return 'Upload workflow';
  if (pathname.startsWith('/board')) return 'Creative board';
  if (pathname.startsWith('/batch')) return 'Batch review';
  return 'Settings console';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/settings';

  return (
    <div className="app-shell">
      <aside className="side-rail" aria-label="Main menu">
        <Link className="rail-logo" href="/settings" aria-label="Creator Console Home">
          <GalleryVerticalEnd size={22} strokeWidth={2.4} />
        </Link>
        <nav className="rail-menu">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href} title={item.label} aria-current={active ? 'page' : undefined}>
                <Icon size={21} strokeWidth={2.3} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <section className="app-main">
        <header className="topbar project-topbar">
          <div className="project-switcher">
            <span className="project-kicker">Project</span>
            <strong>Creator Ads Console</strong>
            <small>meta-ads-creator · {pageLabel(pathname)}</small>
          </div>

          <div className="project-strip" aria-label="Project context">
            <Badge variant="default">Meta Ads</Badge>
            <Badge variant="secondary">Supabase</Badge>
            <Badge variant="success"><ShieldCheck size={14} aria-hidden="true" /> Paused-first</Badge>
          </div>

          <div className="right">
            <Button variant="ghost" size="icon" type="button" aria-label="Search"><Search size={18} /></Button>
            <Button variant="ghost" size="icon" type="button" aria-label="Notifications"><Bell size={18} /></Button>
            <div className="avatar">AT</div>
          </div>
        </header>
        <AuthProvider>{children}</AuthProvider>
      </section>
    </div>
  );
}
