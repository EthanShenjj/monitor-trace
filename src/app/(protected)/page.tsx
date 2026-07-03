"use client";

import { useApp } from '@/context/AppContext';
import { aggregateMetrics, mockTraces } from '@/lib/mockData';
import Link from 'next/link';
import dynamic from 'next/dynamic';

const ActivityChart = dynamic(() => import('@/components/ActivityChart'), { ssr: false });

export default function Dashboard() {
  const { t, locale } = useApp();

  const metricCards = [
    {
      key: 'total_requests',
      value: aggregateMetrics.totalRequests.toLocaleString(),
      change: '+12%',
      changeColor: 'var(--status-success)',
      icon: '📡',
    },
    {
      key: 'avg_latency',
      value: `${(aggregateMetrics.averageLatencyMs / 1000).toFixed(2)}s`,
      change: '-5%',
      changeColor: 'var(--status-success)',
      icon: '⚡',
    },
    {
      key: 'total_tokens',
      value: `${(aggregateMetrics.totalTokens / 1000000).toFixed(1)}M`,
      change: locale === 'zh' ? '跨所有模型' : 'Across all models',
      changeColor: 'var(--text-secondary)',
      icon: '🧩',
    },
    {
      key: 'estimated_cost',
      value: `$${aggregateMetrics.totalCostUsd.toFixed(2)}`,
      change: '+8%',
      changeColor: 'var(--status-error)',
      icon: '💰',
    },
  ] as const;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('dashboard')}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>{t('overview_desc')}</p>
        </div>
        <button className="btn btn-primary">{t('download_report')}</button>
      </div>

      {/* Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem' }}>
        {metricCards.map(card => (
          <div key={card.key} className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>
                {t(card.key)}
              </h3>
              <span style={{ fontSize: '1.25rem' }}>{card.icon}</span>
            </div>
            <p style={{ fontSize: '2.2rem', fontWeight: 700, lineHeight: 1.1 }} className="text-gradient">
              {card.value}
            </p>
            <p style={{ fontSize: '0.75rem', color: card.changeColor, fontWeight: 500 }}>
              {card.change}
            </p>
          </div>
        ))}
      </div>

      {/* Activity Chart */}
      <ActivityChart />

      {/* Recent Traces */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            {locale === 'zh' ? '最近追踪记录' : 'Recent Traces'}
          </h2>
          <Link href="/traces" style={{ fontSize: '0.875rem', color: 'var(--accent-primary)', fontWeight: 500 }}>
            {locale === 'zh' ? '查看全部 →' : 'View all →'}
          </Link>
        </div>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>{t('status')}</th>
                <th>{t('trace_id')}</th>
                <th>{t('model')}</th>
                <th>{t('tokens')}</th>
                <th>{t('latency')}</th>
                <th>{t('cost')}</th>
              </tr>
            </thead>
            <tbody>
              {mockTraces.slice(0, 5).map(trace => (
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
                  <td>
                    <span className="badge badge-neutral">{trace.model}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{trace.totalTokens}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{(trace.latencyMs / 1000).toFixed(2)}s</td>
                  <td style={{ color: 'var(--text-secondary)' }}>${trace.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
