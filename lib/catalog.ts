/**
 * Local search over the whole archive.
 *
 * The gateway serves every document name as one compressed catalogue (~56 KB for
 * ~4,500 files). It is downloaded once, kept in memory and in localStorage, and
 * every search after that runs in the browser in a few milliseconds — no network
 * round trip per search. A stale copy is shown immediately and refreshed in the
 * background (stale-while-revalidate).
 */
import { parsePaperName } from './paper-meta';
import { getRagflowConfig, usesGateway } from './ragflow';
import type { Paper } from './types';

type CatalogDataset = { id: string; name: string; count: number };
type CatalogWire = { v: number; datasets: CatalogDataset[]; docs: [string, string, number, number][] };

export type CatalogEntry = {
  id: string;
  name: string;
  lower: string;
  size: number;
  dataset: CatalogDataset;
  year: number | null;
  season: 'm' | 's' | 'w' | null;
  type: string | null;
};

export type Catalog = { version: number; fetchedAt: number; datasets: CatalogDataset[]; entries: CatalogEntry[] };

const STORAGE_KEY = 'alevel-hub.catalog.v1';
const FRESH_MS = 2 * 60 * 1000;

let memory: Catalog | null = null;
let inflight: Promise<Catalog | null> | null = null;

function build(wire: CatalogWire, fetchedAt: number): Catalog {
  const entries = wire.docs.map(([id, name, size, ds]) => {
    const meta = parsePaperName(name);
    return {
      id,
      name,
      lower: name.toLowerCase(),
      size,
      dataset: wire.datasets[ds],
      year: meta.year,
      season: (meta.seasonCode as CatalogEntry['season']) ?? null,
      type: meta.typeCode ?? null,
    };
  });
  return { version: wire.v, fetchedAt, datasets: wire.datasets, entries };
}

function readStored(): { wire: CatalogWire; at: number } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { wire: CatalogWire; at: number }) : null;
  } catch {
    return null;
  }
}

async function download(): Promise<Catalog | null> {
  const cfg = getRagflowConfig();
  if (!usesGateway(cfg)) return null;
  const res = await fetch(`${cfg.baseUrl}/api/v1/catalog`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return null;
  const json = (await res.json()) as { code?: number; data?: CatalogWire };
  if (json.code !== 0 || !json.data?.docs?.length) return null;
  const at = Date.now();
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ wire: json.data, at }));
  } catch {
    /* quota exceeded: memory copy is enough */
  }
  memory = build(json.data, at);
  return memory;
}

function refresh(): Promise<Catalog | null> {
  if (!inflight) {
    inflight = download()
      .catch(() => null)
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Returns the catalogue as fast as possible; refreshes it in the background when stale. */
export async function getCatalog(): Promise<Catalog | null> {
  if (typeof window === 'undefined') return null;
  if (!memory) {
    const stored = readStored();
    if (stored?.wire?.docs?.length) memory = build(stored.wire, stored.at);
  }
  if (memory) {
    if (Date.now() - memory.fetchedAt > FRESH_MS) void refresh();
    return memory;
  }
  return refresh();
}

/** Start downloading early (e.g. when the papers page mounts) so the first search is instant. */
export function warmCatalog(): void {
  void getCatalog();
}

export type LocalFilters = {
  query?: string;
  datasetId?: string;
  year?: number | null;
  season?: 'm' | 's' | 'w' | null;
  type?: string | null;
};

function formatBytes(bytes: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Search the catalogue. Query words are matched in any order ("9709 s24 qp" finds
 * 9709_s24_qp_12.pdf); separators like _ - / and spaces are ignored.
 */
export function searchCatalog(catalog: Catalog, filters: LocalFilters, limit = 1000): Paper[] {
  const words = (filters.query ?? '')
    .toLowerCase()
    .split(/[\s_\-/.,]+/)
    .filter(Boolean);
  const out: Paper[] = [];
  for (const e of catalog.entries) {
    if (filters.datasetId && e.dataset.id !== filters.datasetId) continue;
    if (filters.year && e.year !== filters.year) continue;
    if (filters.season && e.season !== filters.season) continue;
    if (filters.type && e.type !== filters.type) continue;
    if (words.length && !words.every((w) => e.lower.includes(w))) continue;
    out.push({
      id: `ragflow-${e.id}`,
      title: e.name,
      subject: e.dataset.name,
      year: e.year,
      type: e.type,
      questions: null,
      size: formatBytes(e.size),
      source: 'ragflow',
      ragflowDocId: e.id,
      ragflowDatasetId: e.dataset.id,
    });
  }
  return out
    .sort((a, b) => a.subject.localeCompare(b.subject) || a.title.localeCompare(b.title, undefined, { numeric: true, sensitivity: 'base' }))
    .slice(0, limit);
}
