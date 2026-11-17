export type Paper = {
  id: string;
  title: string;
  subject: string;
  year?: number | null;
  type?: string | null;
  questions?: number | null;
  size?: string | null;
  url?: string | null;
  description?: string | null;
  source?: 'demo' | 'supabase' | 'ragflow';
  ragflowDocId?: string;
  ragflowDatasetId?: string;
};

export type ArchiveResult = {
  papers: Paper[];
  source: 'demo' | 'supabase' | 'ragflow';
  note?: string;
};
