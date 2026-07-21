import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthProvider } from '@/components/AuthProvider';

export const metadata: Metadata = { title: 'Creator Ads UI', description: 'ATT0P99 Creator Console for Meta ads' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" suppressHydrationWarning>
      <body>
        <div className="app-shell">
          <aside className="side-rail" aria-label="Main menu">
            <Link className="rail-logo" href="/settings" aria-label="Creator Console Home">C</Link>
            <nav className="rail-menu">
              <Link href="/settings" title="Settings" aria-current="page">⌂<span>Settings</span></Link>
              <Link href="/upload" title="Upload">⇧<span>Upload</span></Link>
              <Link href="/board" title="Board">▦<span>Board</span></Link>
            </nav>
            <nav className="rail-menu rail-bottom">
              <Link href="/settings" title="System">⚙<span>System</span></Link>
            </nav>
          </aside>

          <section className="app-main">
            <header className="topbar">
              <div className="project-switcher">
                <span className="project-kicker">Project</span>
                <strong>Creator Ads Console</strong>
                <small>meta-ads-creator</small>
              </div>
              <nav className="tabs">
                <Link href="/settings" aria-current="page">Settings</Link>
                <Link href="/upload">Upload</Link>
                <Link href="/board">Board</Link>
              </nav>
              <div className="right">
                <button className="icon-btn" type="button" aria-label="Search">⌕</button>
                <button className="icon-btn" type="button" aria-label="Notifications">◌</button>
                <div className="avatar">AT</div>
              </div>
            </header>
            <AuthProvider>
              {children}
            </AuthProvider>
          </section>
        </div>
      </body>
    </html>
  );
}
