"use client";

import { useApp } from '@/context/AppContext';
import { aggregateMetrics } from '@/lib/mockData';

export default function Dashboard() {
  const { t } = useApp();

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('dashboard')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('overview_desc')}</p>
        </div>
        <button className="btn btn-primary">{t('download_report')}</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('total_requests')}</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700 }} className="text-gradient">{aggregateMetrics.totalRequests.toLocaleString()}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--status-success)', marginTop: '0.5rem' }}>+12%</p>
        </div>
        
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('avg_latency')}</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700 }} className="text-gradient">{(aggregateMetrics.averageLatencyMs / 1000).toFixed(2)}s</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--status-success)', marginTop: '0.5rem' }}>-5%</p>
        </div>
        
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('total_tokens')}</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700 }} className="text-gradient">{(aggregateMetrics.totalTokens / 1000000).toFixed(1)}M</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>Across all models</p>
        </div>
        
        <div className="glass-panel" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('estimated_cost')}</h3>
          <p style={{ fontSize: '2.5rem', fontWeight: 700 }} className="text-gradient">${aggregateMetrics.totalCostUsd.toFixed(2)}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--status-error)', marginTop: '0.5rem' }}>+8%</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '2rem', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>{t('activity_chart_placeholder')}</p>
      </div>
    </div>
  );
}
