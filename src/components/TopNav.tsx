"use client";

import { useApp } from '@/context/AppContext';
import { identifyAnalyticsUser, resetAnalytics, trackAnalyticsEvent } from '@/lib/analytics';
import { identifyAmplitudeUser } from '@/lib/amplitude';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type TopNavUser = {
  id: string;
  name?: string;
  email?: string;
  createdAt?: string;
};

export default function TopNav({ user }: { user: TopNavUser }) {
  const { theme, toggleTheme, locale, toggleLocale, t } = useApp();
  const router = useRouter();
  const [selectedProject, setSelectedProject] = useState('Customer Support Agent');

  useEffect(() => {
    identifyAmplitudeUser(user.id);
    identifyAnalyticsUser(user.id, user);
  }, [user]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      trackAnalyticsEvent('log_out_completed', {
        platform: 'web',
      });
    } finally {
      resetAnalytics();
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <header style={{ height: '70px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2rem' }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{t('project')}:</span>
        <select
          value={selectedProject}
          onChange={(event) => {
            const previousProjectName = selectedProject;
            const nextProjectName = event.target.value;

            setSelectedProject(nextProjectName);
            trackAnalyticsEvent('project_selected', {
              project_name: nextProjectName,
              previous_project_name: previousProjectName,
              platform: 'web',
            });
          }}
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)', padding: '0.5rem', borderRadius: 'var(--radius-sm)', outline: 'none' }}
        >
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

        <button
          className="btn btn-outline"
          onClick={() => {
            trackAnalyticsEvent('docs_clicked', {
              source: 'top_nav',
              platform: 'web',
            });
          }}
          style={{ padding: '0.5rem 1rem' }}
        >
          {t('docs')}
        </button>
        <button className="btn btn-outline" onClick={handleLogout} style={{ padding: '0.5rem 1rem' }}>{t('logout')}</button>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold' }}>U</div>
      </div>
    </header>
  );
}
