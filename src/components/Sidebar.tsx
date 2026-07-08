"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { aggregateMetrics } from '@/lib/mockData';

const navItems = [
  { href: '/',       labelKey: 'dashboard' as const, icon: '▣' },
  { href: '/traces', labelKey: 'traces'    as const, icon: '⋯' },
  { href: '/messages', labelKey: 'messages' as const, icon: '✉' },
  { href: '#',       labelKey: 'playground'as const, icon: '◈' },
  { href: '#',       labelKey: 'settings'  as const, icon: '⚙' },
] as const;

export default function Sidebar() {
  const pathname = usePathname();
  const { t, locale } = useApp();

  return (
    <aside style={{
      width: '240px',
      minWidth: '240px',
      borderRight: '1px solid var(--border-subtle)',
      padding: '1.5rem 1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem',
      background: 'var(--bg-secondary)',
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0 0.5rem' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.75rem', color: '#fff', fontWeight: 700,
        }}>
          AI
        </div>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em' }} className="text-gradient">
          AI Trace
        </h2>
      </div>

      {/* Nav Items */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {navItems.map(item => {
          const isActive = item.href !== '#' && (
            item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
          );
          return (
            <Link
              key={item.href + item.labelKey}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.65rem 0.875rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.9rem',
                fontWeight: isActive ? 600 : 400,
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                background: isActive ? 'var(--accent-glow)' : 'transparent',
                border: isActive ? '1px solid var(--border-focus)' : '1px solid transparent',
                transition: 'all 0.2s ease',
              }}
              onClick={() => {
                trackAnalyticsEvent('sidebar_nav_clicked', {
                  nav_item: item.labelKey,
                  destination: item.href,
                  is_active: isActive,
                  platform: 'web',
                });
              }}
              className={isActive ? '' : 'nav-link'}
            >
              <span style={{ fontSize: '1rem', opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Error Rate Widget */}
      <div className="glass-panel" style={{ padding: '1rem' }}>
        <p style={{ fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 500 }}>
          {t('error_rate')}
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--status-error)' }}>
            {(aggregateMetrics.errorRate * 100).toFixed(1)}%
          </span>
        </div>
        {/* Thin progress bar */}
        <div style={{ marginTop: '0.75rem', height: '4px', borderRadius: '9999px', background: 'var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${aggregateMetrics.errorRate * 100}%`,
            borderRadius: '9999px',
            background: 'var(--status-error)',
          }} />
        </div>
        <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
          {locale === 'zh' ? '过去 7 天' : 'Last 7 days'}
        </p>
      </div>
    </aside>
  );
}
