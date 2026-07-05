"use client";

import { chartData } from '@/lib/mockData';
import { useApp } from '@/context/AppContext';
import { trackMixpanelEvent } from '@/lib/mixpanel';
import { useState } from 'react';

type Metric = 'requests' | 'tokens' | 'cost' | 'errors';

const METRICS: { key: Metric; label: string; labelZh: string; color: string }[] = [
  { key: 'requests', label: 'Requests',  labelZh: '请求数',  color: '#6366F1' },
  { key: 'tokens',   label: 'Tokens',    labelZh: 'Tokens',  color: '#10B981' },
  { key: 'cost',     label: 'Cost ($)',  labelZh: '费用 ($)', color: '#F59E0B' },
  { key: 'errors',   label: 'Errors',    labelZh: '错误数',  color: '#EF4444' },
];

export default function ActivityChart() {
  const { locale } = useApp();
  const [activeMetric, setActiveMetric] = useState<Metric>('requests');

  function handleMetricSelect(nextMetric: Metric) {
    setActiveMetric(nextMetric);
    trackMixpanelEvent('activity_metric_selected', {
      metric: nextMetric,
      previous_metric: activeMetric,
      platform: 'web',
    });
  }

  const metric = METRICS.find(m => m.key === activeMetric)!;
  const values = chartData.map(d => d[activeMetric] as number);
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);

  const W = 760;
  const H = 260;
  const PADDING = { top: 20, right: 20, bottom: 40, left: 55 };
  const chartW = W - PADDING.left - PADDING.right;
  const chartH = H - PADDING.top - PADDING.bottom;

  const xStep = chartW / (chartData.length - 1);
  const yScale = (v: number) => chartH - ((v - minVal) / (maxVal - minVal || 1)) * chartH;

  const points = values.map((v, i) => ({ x: i * xStep, y: yScale(v), v, date: chartData[i].date }));

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartH} L 0 ${chartH} Z`;

  // Y-axis grid lines (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const frac = i / 4;
    const val = minVal + frac * (maxVal - minVal);
    const y = chartH - frac * chartH;
    return { y, label: activeMetric === 'tokens' ? `${(val / 1000).toFixed(0)}K` : activeMetric === 'cost' ? `$${val.toFixed(1)}` : Math.round(val).toString() };
  });

  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      {/* Metric Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600 }}>
          {locale === 'zh' ? '活跃趋势（过去 14 天）' : 'Activity Trend (Last 14 Days)'}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {METRICS.map(m => (
            <button
              key={m.key}
              onClick={() => handleMetricSelect(m.key)}
              style={{
                padding: '0.35rem 0.85rem',
                borderRadius: 'var(--radius-full)',
                border: `1px solid ${activeMetric === m.key ? m.color : 'var(--border-subtle)'}`,
                background: activeMetric === m.key ? `${m.color}18` : 'transparent',
                color: activeMetric === m.key ? m.color : 'var(--text-secondary)',
                fontSize: '0.8rem',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {locale === 'zh' ? m.labelZh : m.label}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      >
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={metric.color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={metric.color} stopOpacity="0.01" />
          </linearGradient>
        </defs>

        <g transform={`translate(${PADDING.left}, ${PADDING.top})`}>
          {/* Grid lines */}
          {yTicks.map(tick => (
            <g key={tick.y}>
              <line x1={0} y1={tick.y} x2={chartW} y2={tick.y} stroke="var(--border-subtle)" strokeDasharray="4,4" />
              <text x={-8} y={tick.y + 4} textAnchor="end" fill="var(--text-muted)" fontSize={10}>{tick.label}</text>
            </g>
          ))}

          {/* Area fill */}
          <path d={areaD} fill="url(#areaGrad)" />

          {/* Line */}
          <path
            d={pathD}
            fill="none"
            stroke={metric.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points & X labels */}
          {points.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r={4} fill={metric.color} stroke="var(--bg-secondary)" strokeWidth={2} />
              {(i === 0 || i === points.length - 1 || i % 2 === 0) && (
                <text x={p.x} y={chartH + 20} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>
                  {p.date}
                </text>
              )}
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}
