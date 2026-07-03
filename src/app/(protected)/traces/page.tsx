"use client";

import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { mockTraces } from '@/lib/mockData';

export default function TracesList() {
  const { t } = useApp();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('traces')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('recent_traces')}</p>
        </div>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input 
            type="text" 
            placeholder={t('search_placeholder')} 
            style={{ 
              padding: '0.5rem 1rem', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid var(--border-subtle)', 
              background: 'var(--bg-surface)',
              color: 'var(--text-primary)',
              outline: 'none',
              width: '250px'
            }} 
          />
          <button className="btn btn-outline">{t('filter')}</button>
        </div>
      </div>

      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>{t('status')}</th>
              <th>{t('trace_id')}</th>
              <th>{t('timestamp')}</th>
              <th>{t('model')}</th>
              <th>{t('tokens')}</th>
              <th>{t('latency')}</th>
              <th>{t('cost')}</th>
              <th>{t('user_id')}</th>
            </tr>
          </thead>
          <tbody>
            {mockTraces.map((trace) => (
              <tr key={trace.id}>
                <td>
                  <span className={`badge ${trace.status === 'success' ? 'badge-success' : 'badge-error'}`}>
                    {trace.status === 'success' ? t('success') : t('error')}
                  </span>
                </td>
                <td>
                  <Link href={`/traces/${trace.id}`} className="accent-gradient" style={{ fontWeight: 500 }}>
                    {trace.id}
                  </Link>
                </td>
                <td style={{ color: 'var(--text-secondary)' }}>{new Date(trace.timestamp).toLocaleString()}</td>
                <td>
                  <span className="badge badge-neutral">{trace.model}</span>
                </td>
                <td>{trace.totalTokens}</td>
                <td>{(trace.latencyMs / 1000).toFixed(2)}s</td>
                <td>${trace.cost.toFixed(4)}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{trace.userId}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
