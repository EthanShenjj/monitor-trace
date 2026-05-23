export interface Span {
  id: string;
  name: string;
  type: 'llm' | 'tool' | 'chain' | 'retriever';
  startTime: string;
  endTime: string;
  latencyMs: number;
  status: 'success' | 'error';
  tokens?: {
    prompt: number;
    completion: number;
    total: number;
  };
  input: any;
  output: any;
  children?: Span[];
}

export interface Trace {
  id: string;
  timestamp: string;
  projectName: string;
  model: string;
  totalTokens: number;
  latencyMs: number;
  status: 'success' | 'error';
  userId: string;
  cost: number;
  spans: Span[];
}

export const mockTraces: Trace[] = [
  {
    id: "tr_10928374a",
    timestamp: "2026-05-23T09:35:00.000Z",
    projectName: "Customer Support Agent",
    model: "gpt-4-turbo",
    totalTokens: 1250,
    latencyMs: 3450,
    status: 'success',
    userId: "usr_9982x",
    cost: 0.0125,
    spans: [
      {
        id: "sp_1",
        name: "Agent Executor",
        type: "chain",
        startTime: "2026-05-23T09:34:56.550Z",
        endTime: "2026-05-23T09:35:00.000Z",
        latencyMs: 3450,
        status: "success",
        input: { question: "How do I reset my password?" },
        output: { answer: "You can reset your password by going to the settings page and clicking 'Forgot Password'." },
        children: [
          {
            id: "sp_2",
            name: "Knowledge Base Retrieval",
            type: "retriever",
            startTime: "2026-05-23T09:34:56.600Z",
            endTime: "2026-05-23T09:34:57.000Z",
            latencyMs: 400,
            status: "success",
            input: { query: "reset password" },
            output: { documents: ["Doc 1: Password Reset Process", "Doc 2: Account Recovery"] }
          },
          {
            id: "sp_3",
            name: "OpenAI Chat",
            type: "llm",
            startTime: "2026-05-23T09:34:57.100Z",
            endTime: "2026-05-23T09:34:59.900Z",
            latencyMs: 2800,
            status: "success",
            tokens: { prompt: 1100, completion: 150, total: 1250 },
            input: { messages: [{ role: "system", content: "You are a helpful assistant." }, { role: "user", content: "How do I reset my password?" }] },
            output: { text: "You can reset your password by going to the settings page and clicking 'Forgot Password'." }
          }
        ]
      }
    ]
  },
  {
    id: "tr_8829310b",
    timestamp: "2026-05-23T08:55:00.000Z",
    projectName: "Code Review Bot",
    model: "claude-3-opus",
    totalTokens: 4500,
    latencyMs: 8200,
    status: 'error',
    userId: "usr_2211y",
    cost: 0.0675,
    spans: [
      {
        id: "sp_4",
        name: "Code Analysis",
        type: "llm",
        startTime: "2026-05-23T08:54:51.800Z",
        endTime: "2026-05-23T08:55:00.000Z",
        latencyMs: 8200,
        status: "error",
        tokens: { prompt: 4500, completion: 0, total: 4500 },
        input: { file: "main.ts", content: "..." },
        output: { error: "Max tokens reached or timeout" }
      }
    ]
  },
  {
    id: "tr_3391827c",
    timestamp: "2026-05-23T07:40:00.000Z",
    projectName: "Data extraction",
    model: "gemini-1.5-pro",
    totalTokens: 820,
    latencyMs: 1200,
    status: 'success',
    userId: "usr_4455z",
    cost: 0.003,
    spans: [
      {
        id: "sp_5",
        name: "Extract Entities",
        type: "llm",
        startTime: "2026-05-23T07:39:58.800Z",
        endTime: "2026-05-23T07:40:00.000Z",
        latencyMs: 1200,
        status: "success",
        tokens: { prompt: 700, completion: 120, total: 820 },
        input: { text: "John Doe works at Google and lives in New York." },
        output: { entities: [{ name: "John Doe", type: "Person" }, { name: "Google", type: "Organization" }] }
      }
    ]
  }
];

export const aggregateMetrics = {
  totalRequests: 14502,
  averageLatencyMs: 2340,
  totalTokens: 12500000,
  totalCostUsd: 145.20,
  errorRate: 0.024
};
