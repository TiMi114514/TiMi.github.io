import { supabase } from './supabase';
import { getRagflowConfig, listRagflowDocuments } from './ragflow';
import type { ArchiveResult, Paper } from './types';

export const samplePapers: Paper[] = [
  {
    id: 'sample-calculus',
    title: 'Calculus & vectors',
    subject: 'Mathematics',
    year: 2024,
    type: 'Paper 1 · Structured questions',
    questions: 12,
    size: '2.4 MB',
    source: 'demo',
  },
  {
    id: 'sample-physics',
    title: 'Electricity & magnetism',
    subject: 'Physics',
    year: 2024,
    type: 'Paper 2 · Long-form',
    questions: 9,
    size: '1.8 MB',
    source: 'demo',
  },
  {
    id: 'sample-chemistry',
    title: 'Organic reaction mechanisms',
    subject: 'Chemistry',
    year: 2025,
    type: 'Paper 3 · Practical',
    questions: 6,
    size: '3.1 MB',
    source: 'demo',
  },
  {
    id: 'sample-economics',
    title: 'Macroeconomics essay questions',
    subject: 'Economics',
    year: 2024,
    type: 'Paper 2 · Essays',
    questions: 8,
    size: '1.5 MB',
    source: 'demo',
  },
  {
    id: 'sample-law',
    title: 'Contract law problem questions',
    subject: 'Law',
    year: 2023,
    type: 'Paper 1 · Problem questions',
    questions: 10,
    size: '2.1 MB',
    source: 'demo',
  },
  {
    id: 'sample-stats',
    title: 'Probability & statistics',
    subject: 'Mathematics',
    year: 2023,
    type: 'Paper 2 · Statistics',
    questions: 14,
    size: '2.7 MB',
    source: 'demo',
  },
];

function mapRow(row: Record<string, unknown>): Paper {
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled paper'),
    subject: String(row.subject ?? 'General'),
    year: row.year == null ? null : Number(row.year),
    type: row.paper_type ? String(row.paper_type) : null,
    questions: row.questions_count == null ? null : Number(row.questions_count),
    size: row.file_size ? String(row.file_size) : null,
    url: row.file_url ? String(row.file_url) : null,
    description: row.description ? String(row.description) : null,
    source: 'supabase',
  };
}

const ARCHIVE_CACHE_KEY = 'differential-quant.archive.cache.v1';
const ARCHIVE_CACHE_TTL = 5 * 60 * 1000;

/**
 * Load the archive. Priority:
 *   1. RAGFlow dataset (if configured)  — the source of truth once your papers are ingested
 *   2. Supabase `papers` table
 *   3. Built-in sample data              — so the site always renders
 */
export async function fetchArchive(): Promise<ArchiveResult> {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.sessionStorage.getItem(ARCHIVE_CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { ts: number; result: ArchiveResult };
        if (Date.now() - cached.ts < ARCHIVE_CACHE_TTL && Array.isArray(cached.result?.papers)) {
          return cached.result;
        }
      }
    } catch {
      /* ignore malformed cache */
    }
  }

  const result = await loadArchive();

  if (typeof window !== 'undefined') {
    try {
      window.sessionStorage.setItem(
        ARCHIVE_CACHE_KEY,
        JSON.stringify({ ts: Date.now(), result }),
      );
    } catch {
      /* storage may be unavailable */
    }
  }

  return result;
}

async function loadArchive(): Promise<ArchiveResult> {
  const cfg = getRagflowConfig();

  if (cfg.datasetId && cfg.apiKey) {
    try {
      const papers = await listRagflowDocuments(cfg);
      if (papers.length > 0) {
        papers.sort((a, b) => {
          const yearDiff = (b.year ?? 0) - (a.year ?? 0);
          return yearDiff !== 0 ? yearDiff : a.title.localeCompare(b.title);
        });
        return {
          papers,
          source: 'ragflow',
          note: 'Live from your RAGFlow knowledge base.',
        };
      }
    } catch {
      /* fall through to Supabase */
    }
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('papers')
        .select('*')
        .eq('published', true)
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && data && data.length > 0) {
        return {
          papers: data.map(mapRow),
          source: 'supabase',
          note: 'Loaded from your Supabase papers table.',
        };
      }
    } catch {
      /* fall through to demo data */
    }
  }

  return {
    papers: samplePapers,
    source: 'demo',
    note: 'Sample layout — connect RAGFlow or Supabase to show real papers.',
  };
}

export const subjects = Array.from(new Set(samplePapers.map((paper) => paper.subject))).sort();
