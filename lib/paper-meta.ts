export type PaperSeasonCode = 'm' | 's' | 'w';

export type ParsedPaperName = {
  code: string | null;
  year: number | null;
  seasonCode: PaperSeasonCode | null;
  season: string | null;
  typeCode: string | null;
  type: string | null;
  paper: string | null;
};

const SEASONS: Record<PaperSeasonCode, string> = {
  m: 'March',
  s: 'June',
  w: 'November',
};

const TYPES: Record<string, string> = {
  qp: 'Question paper',
  ms: 'Mark scheme',
  gt: 'Grade thresholds',
  er: 'Examiner report',
  ci: 'Confidential instructions',
  in: 'Insert',
  sf: 'Specimen paper',
};

/** Parse names such as 9700_w19_ms_22.pdf and 9990_m26_gt.pdf. */
export function parsePaperName(filename: string): ParsedPaperName {
  const base = filename.split('/').pop() || filename;
  const match = base.match(/(\d{4})[_\-\s]?([smw])(\d{2})[_\-\s]?([a-z]{2,3})(?:[_\-\s]?(\d{1,2}))?/i);

  if (!match) {
    return {
      code: null,
      year: null,
      seasonCode: null,
      season: null,
      typeCode: null,
      type: null,
      paper: null,
    };
  }

  const [, code, seasonLetter, yearPart, typePart, paper] = match;
  const seasonCode = seasonLetter.toLowerCase() as PaperSeasonCode;
  const typeCode = typePart.toLowerCase();
  return {
    code,
    year: 2000 + Number(yearPart),
    seasonCode,
    season: SEASONS[seasonCode] ?? null,
    typeCode,
    type: TYPES[typeCode] ?? typePart.toUpperCase(),
    paper: paper ?? null,
  };
}

export function seasonLabel(code: PaperSeasonCode): string {
  return SEASONS[code];
}

export function paperTypeLabel(code: string): string {
  return TYPES[code] ?? code.toUpperCase();
}

export const PAPER_TYPES = Object.entries(TYPES).map(([code, label]) => ({ code, label }));
