"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';

export default function Sidebar() {
  const pathname = usePathname();
  const { t } = useApp();

  return (
    <aside style={{ width: '250px', borderRight: '1px solid var(--border-subtle)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ width: '24px', height: '24px', borderRadius: '4px', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}></div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600 }} className="text-gradient">AI Trace</h2>
      </div>
      
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <Link 
          href="/" 
          style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s ease', color: pathname === '/' ? 'var(--text-primary)' : 'inherit' }} 
          className={pathname === '/' ? "glass-panel" : "nav-link"}
        >
          {t('dashboard')}
        </Link>
        <Link 
          href="/traces" 
          style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s ease', color: pathname.startsWith('/traces') ? 'var(--text-primary)' : 'inherit' }} 
          className={pathname.startsWith('/traces') ? "glass-panel" : "nav-link"}
        >
          {t('traces')}
        </Link>
        <Link 
          href="#" 
          style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s ease', color: 'inherit' }} 
          className="nav-link"
        >
          {t('playground')}
        </Link>
        <Link 
          href="#" 
          style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', transition: 'background 0.2s ease', color: 'inherit' }} 
          className="nav-link"
        >
          {t('settings')}
        </Link>
      </nav>
    </aside>
  );
}
