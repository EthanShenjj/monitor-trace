"use client";

import { useApp } from '@/context/AppContext';

export default function TopNav() {
  const { theme, toggleTheme, locale, toggleLocale, t } = useApp();

  return (
    <header style={{ height: '70px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('project')}:</span>
        <select style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', outline: 'none' }}>
          <option>Customer Support Agent</option>
          <option>Code Review Bot</option>
          <option>Data extraction</option>
        </select>
      </div>
      
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {/* Language Toggle Button */}
        <button 
          className="btn btn-outline" 
          onClick={toggleLocale}
          style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
        >
          {locale === 'zh' ? 'English' : '中文'}
        </button>

        {/* Theme Toggle Button */}
        <button 
          className="btn btn-outline" 
          onClick={toggleTheme}
          style={{ width: '40px', height: '40px', padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>

        <button className="btn btn-outline" style={{ padding: '0.5rem 1rem' }}>{t('docs')}</button>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>U</div>
      </div>
    </header>
  );
}
