import type { Paper } from './types';

export type RagflowMode = 'native' | 'openai';

export type RagflowConfig = {
  baseUrl: string;
  apiKey: string;
  chatId: string;
  /** One or more dataset ids, comma separated. Empty disables the RAGFlow archive. */
  datasetId: string;
  /** native = RAGFlow chat completions (returns citations); openai = OpenAI-compatible endpoint. */
  mode: RagflowMode;
  /** Optional model id for OpenAI mode. When empty the assistant's llm id is discovered. */
  model: string;
};

export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMessage = { role: ChatRole; content: string };

export type ChatResult = {
  content: string;
  citations: string[];
  sessionId?: string;
};

export type ChatOptions = {
  onDelta?: (delta: string) => void;
  signal?: AbortSignal;
  sessionId?: string | null;
  onSessionId?: (sessionId: string) => void;
};

const STORAGE_KEY = 'paperwise.ragflow.config';
const MODEL_CACHE = new Map<string, string>();

function envDefaults(): RagflowConfig {
  return {
    baseUrl: (process.env.NEXT_PUBLIC_RAGFLOW_BASE_URL || 'http://localhost:9380').replace(
      /\/+$/,
      '',
    ),
    apiKey: process.env.NEXT_PUBLIC_RAGFLOW_API_KEY || '',
    chatId: process.env.NEXT_PUBLIC_RAGFLOW_CHAT_ID || '',
    datasetId: process.env.NEXT_PUBLIC_RAGFLOW_DATASET_ID || '',
    mode: 'native',
    model: '',
  };
}

export function getRagflowConfig(): RagflowConfig {
  const defaults = envDefaults();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<RagflowConfig>;
    return {
      baseUrl: (parsed.baseUrl || defaults.baseUrl).replace(/\/+$/, ''),
      apiKey: parsed.apiKey ?? defaults.apiKey,
      chatId: parsed.chatId ?? defaults.chatId,
      datasetId: parsed.datasetId ?? defaults.datasetId,
      mode: parsed.mode === 'openai' ? 'openai' : 'native',
      model: parsed.model ?? '',
    };
  } catch {
    return defaults;
  }
}

export function saveRagflowConfig(patch: Partial<RagflowConfig>): RagflowConfig {
  const next = { ...getRagflowConfig(), ...patch };
  next.baseUrl = next.baseUrl.replace(/\/+$/, '');
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage may be unavailable */
  }
  return next;
}

export function ragflowConfigured(cfg: RagflowConfig = getRagflowConfig()): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey);
}

export function datasetIds(cfg: RagflowConfig): string[] {
  return cfg.datasetId
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function authHeaders(cfg: RagflowConfig): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${cfg.apiKey}`,
  };
}

function errorMessage(status: number, statusText: string, body: string): string {
  const trimmed = body.trim();
  return `RAGFlow request failed (${status} ${statusText})${trimmed ? `: ${trimmed.slice(0, 300)}` : ''}`;
}

type ReferenceChunk = {
  document_name?: string;
  doc_name?: string;
  dataset_id?: string;
};

function collectCitations(reference: unknown, out: string[]): void {
  if (!reference || typeof reference !== 'object') return;
  const ref = reference as {
    chunks?: ReferenceChunk[];
    doc_aggs?: { doc_name?: string }[];
  };
  for (const chunk of ref.chunks ?? []) {
    const name = chunk.document_name || chunk.doc_name;
    if (name) out.push(name);
  }
  for (const doc of ref.doc_aggs ?? []) {
    if (doc.doc_name) out.push(doc.doc_name);
  }
}

function unique(items: string[]): string[] {
  return Array.from(new Set(items));
}

const SESSION_LABELS: Record<string, string> = {
  s: 'June',
  w: 'November',
  m: 'March',
};

const TYPE_LABELS: Record<string, string> = {
  qp: 'Question paper',
  ms: 'Mark scheme',
  er: 'Examiner report',
  gt: 'Grade thresholds',
  ci: 'Confidential instructions',
  in: 'Insert',
  sf: 'Specimen paper',
};

/**
 * Turn a RAGFlow document path such as
 * "9700 Biology Past Paper Database/9700_w19_ms_22.pdf" into a readable label.
 */
export function prettyCitation(name: string): string {
  const base = name.split('/').pop() || name;
  const match = base.match(/^(\d{4})_([a-z])(\d{2})_([a-z]+)_(\d+)\.pdf$/i);
  if (!match) return base;

  const [, code, session, yy, type, paper] = match;
  const sessionLabel = SESSION_LABELS[session.toLowerCase()] || session.toUpperCase();
  const typeLabel = TYPE_LABELS[type.toLowerCase()] || type.toUpperCase();
  return `${code} · ${sessionLabel} 20${yy} · ${typeLabel} ${paper}`;
}

async function readSse(
  response: Response,
  onEvent: (payload: string) => void,
): Promise<void> {
  if (!response.body) {
    onEvent(await response.text());
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flush = (frame: string) => {
    const dataLines = frame
      .split('\n')
      .filter((line) => line.trim().startsWith('data:'))
      .map((line) => line.slice(line.indexOf('data:') + 5).trim());
    const payload = dataLines.join('\n');
    if (payload) onEvent(payload);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary !== -1) {
      flush(buffer.slice(0, boundary));
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf('\n\n');
    }
  }
  if (buffer.trim()) flush(buffer);
}

async function nativeChat(
  cfg: RagflowConfig,
  question: string,
  options: ChatOptions,
): Promise<ChatResult> {
  const endpoint = `${cfg.baseUrl}/api/v1/chats/${encodeURIComponent(cfg.chatId)}/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({
      question,
      stream: true,
      ...(options.sessionId ? { session_id: options.sessionId } : {}),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }

  const citations: string[] = [];
  let content = '';
  let sessionId = options.sessionId ?? undefined;

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (typeof json?.code === 'number' && json.code !== 0) {
      throw new Error(json.message || 'RAGFlow returned an error.');
    }
    const data = json?.data ?? {};
    content = typeof data.answer === 'string' ? data.answer : '';
    collectCitations(data.reference, citations);
    if (data.session_id) {
      sessionId = String(data.session_id);
      options.onSessionId?.(sessionId!);
    }
    options.onDelta?.(content);
    return { content, citations: unique(citations), sessionId };
  }

  await readSse(res, (payload) => {
    let json: {
      code?: number;
      message?: string;
      data?: unknown;
    };
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (typeof json.code === 'number' && json.code !== 0) {
      throw new Error(json.message || 'RAGFlow returned an error.');
    }
    if (json.data === true) return;

    const data = (json.data ?? {}) as {
      answer?: string;
      reference?: unknown;
      session_id?: string;
    };

    if (typeof data.answer === 'string' && data.answer) {
      content += data.answer;
      options.onDelta?.(data.answer);
    }
    collectCitations(data.reference, citations);
    if (data.session_id) {
      sessionId = data.session_id;
      options.onSessionId?.(data.session_id);
    }
  });

  return { content, citations: unique(citations), sessionId };
}

async function resolveLlmId(cfg: RagflowConfig): Promise<string> {
  if (cfg.model.trim()) return cfg.model.trim();
  const cacheKey = `${cfg.baseUrl}|${cfg.chatId}|${cfg.apiKey}`;
  const cached = MODEL_CACHE.get(cacheKey);
  if (cached) return cached;

  const res = await fetch(`${cfg.baseUrl}/api/v1/chats`, { headers: authHeaders(cfg) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }
  const json = await res.json();
  const chats = (json?.data?.chats ?? []) as { id?: string; llm_id?: string }[];
  const chat = chats.find((item) => item.id === cfg.chatId);
  if (!chat?.llm_id) {
    throw new Error(
      'Could not resolve the assistant model. Set the model id in connection settings.',
    );
  }
  MODEL_CACHE.set(cacheKey, chat.llm_id);
  return chat.llm_id;
}

async function openAiChat(
  cfg: RagflowConfig,
  messages: ChatMessage[],
  options: ChatOptions,
): Promise<ChatResult> {
  const model = await resolveLlmId(cfg);
  const endpoint = `${cfg.baseUrl}/api/v1/chats_openai/${encodeURIComponent(cfg.chatId)}/chat/completions`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(cfg),
    body: JSON.stringify({ model, messages, stream: true, temperature: 0.2 }),
    signal: options.signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }

  const citations: string[] = [];
  let content = '';

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const json = await res.json();
    if (typeof json?.code === 'number' && json.code !== 0) {
      throw new Error(json.message || 'RAGFlow returned an error.');
    }
    content = json?.choices?.[0]?.message?.content ?? '';
    if (content) options.onDelta?.(content);
    return { content, citations };
  }

  await readSse(res, (payload) => {
    if (payload === '[DONE]') return;
    let json: {
      code?: number;
      message?: string;
      choices?: { delta?: { content?: string }; message?: { content?: string } }[];
      reference?: unknown;
    };
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    if (typeof json.code === 'number' && json.code !== 0) {
      throw new Error(json.message || 'RAGFlow returned an error.');
    }
    const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content ?? '';
    if (delta) {
      content += delta;
      options.onDelta?.(delta);
    }
    collectCitations(json.reference, citations);
  });

  return { content, citations: unique(citations) };
}

/**
 * Ask the tutor. Native mode streams RAGFlow answers with citations and keeps
 * conversation context via a RAGFlow session id. OpenAI mode talks to the
 * OpenAI-compatible endpoint (no citations) and can fall back to native mode.
 */
export async function ragflowChat(
  cfg: RagflowConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!cfg.chatId) {
    throw new Error(
      'No RAGFlow chat assistant configured. Open Connection settings on the tutor page and add your chat id.',
    );
  }

  const question = [...messages].reverse().find((message) => message.role === 'user')?.content?.trim();
  if (!question) throw new Error('Type a question for the tutor.');

  if (cfg.mode === 'openai') {
    let emitted = false;
    const guarded: ChatOptions = {
      ...options,
      onDelta: (delta) => {
        emitted = true;
        options.onDelta?.(delta);
      },
    };
    try {
      return await openAiChat(cfg, messages, guarded);
    } catch (error) {
      if (emitted) throw error;
      return nativeChat(cfg, question, options);
    }
  }

  return nativeChat(cfg, question, options);
}

/* ------------------------------------------------------------------ */
/* Archive                                                             */
/* ------------------------------------------------------------------ */

type RagflowDocument = {
  id: string;
  name: string;
  size?: number;
  meta_fields?: Record<string, unknown>;
};

type RagflowDataset = {
  id: string;
  name: string;
};

async function fetchDatasetNames(cfg: RagflowConfig): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/datasets?page=1&page_size=100`, {
      headers: authHeaders(cfg),
    });
    if (!res.ok) return {};
    const json = await res.json();
    const datasets = (json?.data ?? []) as RagflowDataset[];
    const map: Record<string, string> = {};
    for (const dataset of datasets) {
      if (dataset.id && dataset.name) map[dataset.id] = dataset.name;
    }
    return map;
  } catch {
    return {};
  }
}

function formatBytes(bytes?: number): string | null {
  if (!bytes || bytes <= 0) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function parsePaperMeta(filename: string): {
  year: number | null;
  type: string | null;
  title: string;
} {
  const base = filename.split('/').pop() || filename;
  const match = base.match(/^(\d{4})_([a-z])(\d{2})_([a-z]+)_(\d+)\.pdf$/i);
  if (!match) {
    return {
      year: (() => {
        const found = base.match(/\b(20\d{2})\b/);
        return found ? Number(found[1]) : null;
      })(),
      type: null,
      title: base.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').trim(),
    };
  }

  const [, code, session, yy, type, paper] = match;
  const sessionLabel = SESSION_LABELS[session.toLowerCase()] || session.toUpperCase();
  const typeLabel = TYPE_LABELS[type.toLowerCase()] || type.toUpperCase();
  return {
    year: 2000 + Number(yy),
    type: `${typeLabel} · Paper ${paper}`,
    title: `${code} · ${sessionLabel} ${2000 + Number(yy)} · ${typeLabel} ${paper}`,
  };
}

async function fetchDatasetDocuments(cfg: RagflowConfig, datasetId: string): Promise<RagflowDocument[]> {
  const url = `${cfg.baseUrl}/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?page=1&page_size=100`;
  const res = await fetch(url, { headers: authHeaders(cfg) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }
  const json = (await res.json()) as { data?: { docs?: RagflowDocument[] } };
  return json?.data?.docs ?? [];
}

/**
 * Read the archive out of one or more RAGFlow datasets. Documents are
 * mapped to readable titles, subjects (dataset name), years and paper types.
 */
export async function listRagflowDocuments(cfg: RagflowConfig): Promise<Paper[]> {
  const ids = datasetIds(cfg);
  if (ids.length === 0) throw new Error('No RAGFlow dataset id configured.');

  const [names, ...documents] = await Promise.all([
    fetchDatasetNames(cfg),
    ...ids.map((id) => fetchDatasetDocuments(cfg, id)),
  ]);

  const papers: Paper[] = [];
  ids.forEach((datasetId, index) => {
    const datasetName = names[datasetId] || 'General';
    const subject = datasetName.replace(/\s*\d{3,4}\s*$/, '').trim() || datasetName;
    for (const doc of documents[index] ?? []) {
      const meta = doc.meta_fields ?? {};
      const parsed = parsePaperMeta(doc.name);
      const title = typeof meta.title === 'string' ? meta.title : parsed.title;
      const year = typeof meta.year === 'number' ? meta.year : parsed.year;
      const type = typeof meta.paper_type === 'string' ? meta.paper_type : parsed.type;
      papers.push({
        id: `ragflow-${doc.id}`,
        title,
        subject,
        year,
        type,
        questions: typeof meta.questions === 'number' ? meta.questions : null,
        size: formatBytes(doc.size),
        source: 'ragflow',
        ragflowDocId: doc.id,
        ragflowDatasetId: datasetId,
      });
    }
  });

  return papers;
}

/** Download a RAGFlow dataset document with an authenticated request. */
export async function downloadRagflowDocument(
  cfg: RagflowConfig,
  datasetId: string,
  docId: string,
  filename: string,
): Promise<void> {
  if (!datasetId) throw new Error('This paper has no dataset id.');
  const url = `${cfg.baseUrl}/api/v1/datasets/${encodeURIComponent(datasetId)}/documents/${encodeURIComponent(docId)}`;
  const res = await fetch(url, { headers: authHeaders(cfg) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename || 'paper.pdf';
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 20_000);
}
