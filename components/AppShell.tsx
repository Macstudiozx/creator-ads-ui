'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AuthProvider } from '@/components/AuthProvider';

const navItems = [
  { href: '/settings', icon: '⌂', label: 'Settings' },
  { href: '/upload', icon: '⇧', label: 'Upload' },
  { href: '/board', icon: '▦', label: 'Board' },
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
        <Link className="rail-logo" href="/settings" aria-label="Creator Console Home">C</Link>
        <nav className="rail-menu">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} title={item.label} aria-current={active ? 'page' : undefined}>
                {item.icon}<span>{item.label}</span>
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
            <span className="project-chip active">Meta Ads</span>
            <span className="project-chip">Supabase</span>
            <span className="project-chip">Paused-first</span>
          </div>

          <div className="right">
            <button className="icon-btn" type="button" aria-label="Search">⌕</button>
            <button className="icon-btn" type="button" aria-label="Notifications">◌</button>
            <div className="avatar">AT</div>
          </div>
        </header>
        <AuthProvider>{children}</AuthProvider>
      </section>
    </div>
  );
}
