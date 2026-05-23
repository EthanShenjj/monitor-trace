"use client";

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/context/AppContext';
import { mockTraces, Span } from '@/lib/mockData';

function SpanNode({ span, depth = 0 }: { span: Span; depth?: number }) {
  const { t } = useApp();
  const isError = span.status === 'error';
  
  return (
    <div style={{ marginLeft: `${depth * 20}px`, marginTop: '1rem' }}>
      <div className={`glass-panel ${isError ? 'border-error' : ''}`} style={{ padding: '1rem', borderLeft: `4px solid ${isError ? 'var(--status-error)' : 'var(--accent-primary)'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span className={`badge ${span.type === 'llm' ? 'badge-neutral' : span.type === 'retriever' ? 'badge-success' : 'badge-neutral'}`}>
              {span.type.toUpperCase()}
            </span>
            <span style={{ fontWeight: 600 }}>{span.name}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            <span>{span.latencyMs}ms</span>
            {span.tokens && <span>Tokens: {span.tokens.total}</span>}
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
          <div>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('input')}</h4>
            <pre style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
              {JSON.stringify(span.input, null, 2)}
            </pre>
          </div>
          <div>
            <h4 style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>{t('output')}</h4>
            <pre style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: 'var(--radius-sm)', overflowX: 'auto', fontSize: '0.875rem', color: isError ? 'var(--status-error)' : 'var(--text-muted)' }}>
              {JSON.stringify(span.output, null, 2)}
            </pre>
          </div>
        </div>
      </div>
      
      {span.children && span.children.map(child => (
        <SpanNode key={child.id} span={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface PageProps {
  params: React.Usable<{ id: string }>;
}

export default function TraceDetails({ params }: PageProps) {
  const { id } = React.use(params);
  const { t } = useApp();
  const trace = mockTraces.find(t => t.id === id) || mockTraces[0];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link href="/traces" style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }} className="btn-outline">
          &larr; {t('back_to_traces')}
        </Link>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>{t('trace_details')}</h1>
            <p style={{ color: 'var(--text-secondary)' }}>{t('trace_id')}: <span className="text-gradient" style={{ fontWeight: 600 }}>{trace.id}</span></p>
          </div>
          <span className={`badge ${trace.status === 'success' ? 'badge-success' : 'badge-error'}`} style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
            {trace.status === 'success' ? t('success') : t('error')}
          </span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t('timestamp')}</p>
          <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{new Date(trace.timestamp).toLocaleString()}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t('model')}</p>
          <p style={{ fontWeight: 500, marginTop: '0.25rem' }} className="accent-gradient">{trace.model}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t('tokens')}</p>
          <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{trace.totalTokens}</p>
        </div>
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{t('latency')}</p>
          <p style={{ fontWeight: 500, marginTop: '0.25rem' }}>{(trace.latencyMs / 1000).toFixed(2)}s</p>
        </div>
      </div>

      <div>
        <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.5rem' }}>{t('execution_spans')}</h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {trace.spans.map(span => (
            <SpanNode key={span.id} span={span} />
          ))}
        </div>
      </div>
    </div>
  );
}
