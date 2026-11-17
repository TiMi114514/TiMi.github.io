import type { Paper } from './types';
import { parsePaperName } from './paper-meta';

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
 * Ask the tutor. OpenAI-compatible mode is used for the public tutor because it
 * strips the model's reasoning and returns only the final answer. Citations are
 * fetched separately from the retrieval API.
 */
export async function ragflowChat(
  cfg: RagflowConfig,
  messages: ChatMessage[],
  options: ChatOptions = {},
): Promise<ChatResult> {
  if (!cfg.chatId) {
    throw new Error('The tutor is unavailable right now. Please try again later.');
  }

  const question = [...messages].reverse().find((message) => message.role === 'user')?.content?.trim();
  if (!question) throw new Error('Type a question for the tutor.');

  if (cfg.mode === 'openai') {
    return openAiChat(cfg, messages, options);
  }

  return nativeChat(cfg, question, options);
}

export type RagflowAssistant = {
  id: string;
  name: string;
  label: string;
  datasetIds: string[];
  kbNames: string[];
};

const ASSISTANT_CACHE_KEY = 'differential-quant.assistants.v1';
const ASSISTANT_CACHE_TTL = 10 * 60 * 1000;

type RawAssistant = {
  id?: string;
  name?: string;
  dataset_ids?: string[];
  kb_names?: string[];
};

/**
 * List the assistants that belong to this site. Assistants are created in
 * RAGFlow with the "DQ · " prefix, one per knowledge base.
 */
export async function listRagflowAssistants(cfg: RagflowConfig): Promise<RagflowAssistant[]> {
  if (!cfg.baseUrl || !cfg.apiKey) return [];

  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(ASSISTANT_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; items: RagflowAssistant[] };
        if (Date.now() - cached.ts < ASSISTANT_CACHE_TTL && Array.isArray(cached.items)) {
          return cached.items;
        }
      }
    } catch {
      /* ignore cache */
    }
  }

  const res = await fetch(`${cfg.baseUrl}/api/v1/chats`, { headers: authHeaders(cfg) });
  if (!res.ok) throw new Error(errorMessage(res.status, res.statusText, await res.text()));

  const json = await res.json();
  const chats = (json?.data?.chats ?? []) as RawAssistant[];
  const items = chats
    .filter((chat) => typeof chat.name === 'string' && chat.name.startsWith('DQ · ') && chat.id)
    .map((chat) => ({
      id: String(chat.id),
      name: String(chat.name),
      label: String(chat.name).replace(/^DQ · /, ''),
      datasetIds: chat.dataset_ids ?? [],
      kbNames: chat.kb_names ?? [],
    }));

  if (typeof window !== 'undefined' && items.length > 0) {
    try {
      window.sessionStorage.setItem(
        ASSISTANT_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), items }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }

  return items;
}

/**
 * Retrieve the source documents for a question. Used to show citation chips
 * under an OpenAI-compatible answer (that endpoint does not return references).
 */
export async function retrieveCitations(
  cfg: RagflowConfig,
  question: string,
  datasetIds: string[],
): Promise<string[]> {
  if (!cfg.baseUrl || !cfg.apiKey || datasetIds.length === 0) return [];

  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/retrieval`, {
      method: 'POST',
      headers: authHeaders(cfg),
      body: JSON.stringify({
        question,
        dataset_ids: datasetIds,
        page_size: 6,
        similarity_threshold: 0.2,
        vector_similarity_weight: 0.3,
        keyword: false,
      }),
    });
    if (!res.ok) return [];
    const json = await res.json();
    const chunks = (json?.data?.chunks ?? []) as {
      document_keyword?: string;
      document_name?: string;
    }[];
    const names = chunks
      .map((chunk) => chunk.document_keyword || chunk.document_name)
      .filter((name): name is string => Boolean(name));
    return unique(names);
  } catch {
    return [];
  }
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
  document_count?: number;
  chunk_count?: number;
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

async function listRagflowDatasets(cfg: RagflowConfig): Promise<RagflowDataset[]> {
  const res = await fetch(`${cfg.baseUrl}/api/v1/datasets?page=1&page_size=100`, {
    headers: authHeaders(cfg),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }
  const json = await res.json();
  const datasets = (json?.data ?? []) as RagflowDataset[];
  return datasets.filter((dataset) => dataset.id && dataset.name);
}

async function fetchDocumentPage(
  cfg: RagflowConfig,
  datasetId: string,
  page: number,
): Promise<{ docs: RagflowDocument[]; total: number }> {
  const url = `${cfg.baseUrl}/api/v1/datasets/${encodeURIComponent(datasetId)}/documents?page=${page}&page_size=100`;
  const res = await fetch(url, { headers: authHeaders(cfg) });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(errorMessage(res.status, res.statusText, text));
  }
  const json = (await res.json()) as {
    data?: { docs?: RagflowDocument[]; total?: number };
  };
  return {
    docs: json?.data?.docs ?? [],
    total: Number(json?.data?.total ?? 0),
  };
}

/** Fetch every document in a dataset, following RAGFlow's 100-row pages. */
async function fetchDatasetDocuments(
  cfg: RagflowConfig,
  datasetId: string,
): Promise<RagflowDocument[]> {
  const first = await fetchDocumentPage(cfg, datasetId, 1);
  if (first.docs.length === 0) return [];

  const total = first.total > 0 ? first.total : first.docs.length;
  const pageCount = Math.min(200, Math.ceil(total / 100));
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) =>
      fetchDocumentPage(cfg, datasetId, index + 2).catch(() => ({ docs: [], total: 0 })),
    ),
  );

  const seen = new Set<string>();
  const docs: RagflowDocument[] = [];
  for (const doc of [first.docs, ...rest.map((page) => page.docs)].flat()) {
    if (!doc?.id || seen.has(doc.id)) continue;
    seen.add(doc.id);
    docs.push(doc);
  }
  return docs;
}

export type ArchivePreviewData = {
  papers: Paper[];
  datasets: { id: string; name: string; count: number }[];
  totalDocuments: number;
};

const PREVIEW_CACHE_KEY = 'differential-quant.archive.preview.v1';
const PREVIEW_CACHE_TTL = 30 * 60 * 1000;

function mapDocument(doc: RagflowDocument, dataset: { id: string; name: string }): Paper {
  return {
    id: `ragflow-${doc.id}`,
    title: doc.name.split('/').pop() || doc.name,
    subject: dataset.name,
    year: null,
    type: null,
    questions: null,
    size: formatBytes(doc.size),
    source: 'ragflow',
    ragflowDocId: doc.id,
    ragflowDatasetId: dataset.id,
  };
}

/**
 * Lightweight archive preview: the first documents of a few datasets, enough
 * for large cards without reading the whole knowledge base.
 */
export async function fetchArchivePreview(force = false): Promise<ArchivePreviewData> {
  const cfg = getRagflowConfig();
  if (!cfg.baseUrl || !cfg.apiKey) {
    return { papers: [], datasets: [], totalDocuments: 0 };
  }

  if (!force && typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(PREVIEW_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; data: ArchivePreviewData };
        if (Date.now() - cached.ts < PREVIEW_CACHE_TTL && Array.isArray(cached.data?.papers)) {
          return cached.data;
        }
      }
    } catch {
      /* ignore cache */
    }
  }

  let datasets = await listRagflowDatasets(cfg).catch(() => []);
  if (datasets.length === 0) {
    datasets = datasetIds(cfg).map((id) => ({ id, name: id }));
  }

  const withDocuments = datasets.filter((dataset) => (dataset.document_count ?? 0) > 0);
  const targets = (withDocuments.length > 0 ? withDocuments : datasets).slice(0, 4);

  const pages = await Promise.all(
    targets.map((dataset) =>
      fetchDocumentPage(cfg, dataset.id, 1).catch(() => ({ docs: [], total: 0 })),
    ),
  );

  const papers: Paper[] = [];
  targets.forEach((dataset, index) => {
    for (const doc of pages[index]?.docs.slice(0, 2) ?? []) {
      papers.push(mapDocument(doc, dataset));
    }
  });

  const data: ArchivePreviewData = {
    papers: papers.slice(0, 6),
    datasets: datasets.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      count: dataset.document_count ?? 0,
    })),
    totalDocuments: datasets.reduce(
      (total, dataset) => total + (dataset.document_count ?? 0),
      0,
    ),
  };

  if (typeof window !== 'undefined' && data.papers.length > 0) {
    try {
      window.sessionStorage.setItem(
        PREVIEW_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), data }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }

  return data;
}

export type ArchiveSearchFilters = {
  query?: string;
  datasetId?: string;
  year?: number | null;
  season?: 'm' | 's' | 'w' | null;
  type?: string | null;
};

/**
 * Targeted filename search with year / season / paper-type filters. RAGFlow
 * supports a `keywords` filter on the documents endpoint, so no full dataset
 * traversal is required for normal searches.
 */
export async function searchRagflowDocuments(
  filters: ArchiveSearchFilters,
): Promise<Paper[]> {
  const cfg = getRagflowConfig();
  const text = (filters.query ?? '').trim();
  if (!cfg.baseUrl || !cfg.apiKey) return [];

  let datasets = await listRagflowDatasets(cfg).catch(() => []);
  if (datasets.length === 0) {
    datasets = datasetIds(cfg).map((id) => ({ id, name: id }));
  }
  if (filters.datasetId) {
    datasets = datasets.filter((dataset) => dataset.id === filters.datasetId);
    if (datasets.length === 0) {
      datasets = [{ id: filters.datasetId, name: filters.datasetId }];
    }
  }
  datasets = datasets.filter((dataset) => (dataset.document_count ?? 1) > 0);

  const terms: string[] = [];
  if (filters.year) {
    const yearPart = String(filters.year).slice(-2);
    if (filters.season) {
      terms.push(`${filters.season}${yearPart}`);
    } else {
      terms.push(`s${yearPart}`, `w${yearPart}`, `m${yearPart}`);
    }
  } else if (text.length >= 2) {
    terms.push(text);
  } else if (filters.type) {
    terms.push(filters.type);
  }

  const noSearchCriteria =
    text.length < 2 &&
    !filters.year &&
    !filters.type &&
    !filters.season &&
    !filters.datasetId;
  if (noSearchCriteria) return [];

  const results = await Promise.all(
    datasets.map(async (dataset) => {
      const found: RagflowDocument[] = [];
      const seen = new Set<string>();

      if (terms.length === 0) {
        // Browsing a single selected dataset with no other criteria.
        for (let page = 1; page <= 20; page += 1) {
          const result = await fetchDocumentPage(cfg, dataset.id, page).catch(() => ({
            docs: [],
            total: 0,
          }));
          for (const doc of result.docs) {
            if (seen.has(doc.id)) continue;
            seen.add(doc.id);
            found.push(doc);
          }
          if (result.docs.length < 100) break;
        }
      } else {
        const maxPages = filters.year ? 3 : 5;
        for (const term of terms) {
          for (let page = 1; page <= maxPages; page += 1) {
            const url = `${cfg.baseUrl}/api/v1/datasets/${encodeURIComponent(dataset.id)}/documents?page=${page}&page_size=100&keywords=${encodeURIComponent(term)}`;
            const response = await fetch(url, { headers: authHeaders(cfg) });
            if (!response.ok) break;
            const json = (await response.json()) as { data?: { docs?: RagflowDocument[] } };
            const docs = json?.data?.docs ?? [];
            for (const doc of docs) {
              if (seen.has(doc.id)) continue;
              seen.add(doc.id);
              found.push(doc);
            }
            if (docs.length < 100) break;
          }
        }
      }

      return found
        .filter((doc) => {
          const name = (doc.name.split('/').pop() || doc.name).toLowerCase();
          const meta = parsePaperName(name);
          if (filters.year && meta.year !== filters.year) return false;
          if (filters.season && meta.seasonCode !== filters.season) return false;
          if (filters.type && meta.typeCode !== filters.type) return false;
          if (text.length >= 2 && !name.includes(text.toLowerCase())) return false;
          return true;
        })
        .map((doc) => mapDocument(doc, dataset));
    }),
  );

  return results
    .flat()
    .sort((a, b) => {
      const subjectDiff = a.subject.localeCompare(b.subject);
      return subjectDiff !== 0
        ? subjectDiff
        : a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
    })
    .slice(0, 1000);
}

/**
 * Read every document from every RAGFlow dataset. Titles are the raw document
 * names (basename) and no year/type parsing is performed, so the archive mirrors
 * the knowledge base exactly.
 */
export async function listRagflowDocuments(cfg: RagflowConfig): Promise<Paper[]> {
  let datasets = await listRagflowDatasets(cfg).catch(() => []);
  if (datasets.length === 0) {
    datasets = datasetIds(cfg).map((id) => ({ id, name: id }));
  }
  if (datasets.length === 0) throw new Error('No RAGFlow datasets found.');

  const results = await Promise.allSettled(
    datasets.map((dataset) => fetchDatasetDocuments(cfg, dataset.id)),
  );

  const papers: Paper[] = [];
  datasets.forEach((dataset, index) => {
    const result = results[index];
    if (result.status !== 'fulfilled') return;
    for (const doc of result.value) {
      const filename = doc.name.split('/').pop() || doc.name;
      papers.push({
        id: `ragflow-${doc.id}`,
        title: filename,
        subject: dataset.name,
        year: null,
        type: null,
        questions: null,
        size: formatBytes(doc.size),
        source: 'ragflow',
        ragflowDocId: doc.id,
        ragflowDatasetId: dataset.id,
      });
    }
  });

  return papers.sort((a, b) => {
    const subjectDiff = a.subject.localeCompare(b.subject);
    return subjectDiff !== 0
      ? subjectDiff
      : a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' });
  });
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
