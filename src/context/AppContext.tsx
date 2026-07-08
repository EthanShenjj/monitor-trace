"use client";

import React, { createContext, useContext, useState, useEffect } from 'react';
import { trackAnalyticsEvent } from '@/lib/analytics';

type Theme = 'light' | 'dark';
type Locale = 'zh' | 'en';

interface AppContextProps {
  theme: Theme;
  toggleTheme: () => void;
  locale: Locale;
  toggleLocale: () => void;
  t: (key: keyof typeof translations['en']) => string;
}

const translations = {
  zh: {
    dashboard: "控制面板",
    traces: "追踪分析",
    events: "事件",
    messages: "消息中心",
    playground: "演练场",
    settings: "设置",
    project: "项目",
    docs: "文档",
    logout: "退出登录",
    overview_desc: "监控您的 AI Agent 性能与消耗成本的全局概览。",
    total_requests: "总请求数",
    avg_latency: "平均延迟",
    total_tokens: "总 Token 消耗",
    estimated_cost: "预估成本",
    error_rate: "错误率",
    download_report: "下载报告",
    activity_chart_placeholder: "[ 活跃度图表占位 ]",
    recent_traces: "查看并检测所有 AI 交互和工作流链路。",
    search_placeholder: "搜索追踪...",
    filter: "筛选",
    status: "状态",
    trace_id: "追踪 ID",
    timestamp: "时间戳",
    model: "模型",
    tokens: "Tokens",
    latency: "延迟",
    cost: "成本",
    user_id: "用户 ID",
    back_to_traces: "返回列表",
    trace_details: "追踪详情",
    execution_spans: "执行链路 Spans",
    input: "输入 (Input)",
    output: "输出 (Output)",
    success: "成功",
    error: "失败"
  },
  en: {
    dashboard: "Dashboard",
    traces: "Traces",
    events: "Events",
    messages: "Messages",
    playground: "Playground",
    settings: "Settings",
    project: "Project",
    docs: "Docs",
    logout: "Log out",
    overview_desc: "Overview of your AI Agent's performance and cost.",
    total_requests: "Total Requests",
    avg_latency: "Avg Latency",
    total_tokens: "Total Tokens",
    estimated_cost: "Estimated Cost",
    error_rate: "Error Rate",
    download_report: "Download Report",
    activity_chart_placeholder: "[ Activity Chart Placeholder ]",
    recent_traces: "View and inspect all AI interactions and workflows.",
    search_placeholder: "Search traces...",
    filter: "Filter",
    status: "Status",
    trace_id: "Trace ID",
    timestamp: "Timestamp",
    model: "Model",
    tokens: "Tokens",
    latency: "Latency",
    cost: "Cost",
    user_id: "User ID",
    back_to_traces: "Back to Traces",
    trace_details: "Trace Details",
    execution_spans: "Execution Spans",
    input: "Input",
    output: "Output",
    success: "Success",
    error: "Error"
  }
};

const AppContext = createContext<AppContextProps | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [locale, setLocale] = useState<Locale>('zh');

  // Synchronize theme with HTML data attribute for CSS styling
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => {
      const nextTheme = prev === 'light' ? 'dark' : 'light';
      trackAnalyticsEvent('theme_changed', {
        previous_theme: prev,
        new_theme: nextTheme,
        platform: 'web',
      });
      return nextTheme;
    });
  };

  const toggleLocale = () => {
    setLocale(prev => {
      const nextLocale = prev === 'zh' ? 'en' : 'zh';
      trackAnalyticsEvent('language_changed', {
        previous_language: prev,
        new_language: nextLocale,
        platform: 'web',
      });
      return nextLocale;
    });
  };

  const t = (key: keyof typeof translations['en']): string => {
    return translations[locale][key] || translations['en'][key] || key;
  };

  return (
    <AppContext.Provider value={{ theme, toggleTheme, locale, toggleLocale, t }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
