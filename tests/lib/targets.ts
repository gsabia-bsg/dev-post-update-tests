/**
 * Legge e valida `targets.json`, il file che elenca le pagine da controllare.
 * Rifiuta un baseUrl in http, i path duplicati, e le eccezioni senza
 * motivazione — così il file non diventa un tappeto sotto cui nascondere le
 * regressioni.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type AcceptedConsoleError = { match: string; reason: string };
export type PageTarget = {
  path: string;
  expect: string[];
  criticalImages: number;
  /** Deroga alla soglia di overflow, per difetti preesistenti. Richiede `notes`. */
  overflowTolerancePx?: number;
  /** Motivazione di una deroga. Obbligatoria se c'è una deroga. */
  notes?: string;
};
export type Targets = {
  baseUrl: string;
  acceptedConsoleErrors: AcceptedConsoleError[];
  pages: PageTarget[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function validateTargets(raw: unknown): Targets {
  if (!isRecord(raw)) throw new Error('targets: la radice deve essere un oggetto');

  const baseUrl = raw.baseUrl;
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://')) {
    throw new Error(
      'targets.baseUrl deve iniziare con https:// — in http i font Elementor vanno in CORS e falsano i test',
    );
  }

  const acceptedRaw = raw.acceptedConsoleErrors ?? [];
  if (!Array.isArray(acceptedRaw)) throw new Error('targets.acceptedConsoleErrors deve essere un array');
  const acceptedConsoleErrors: AcceptedConsoleError[] = acceptedRaw.map((e, i) => {
    if (!isRecord(e)) throw new Error(`acceptedConsoleErrors[${i}] deve essere un oggetto`);
    const match = e.match;
    const reason = e.reason;
    if (typeof match !== 'string' || match.trim() === '') {
      throw new Error(`acceptedConsoleErrors[${i}].match mancante`);
    }
    if (typeof reason !== 'string' || reason.trim() === '') {
      throw new Error(
        `acceptedConsoleErrors[${i}].reason mancante: ogni errore accettato deve dichiarare perché lo è`,
      );
    }
    return { match, reason };
  });

  const pagesRaw = raw.pages;
  if (!Array.isArray(pagesRaw) || pagesRaw.length === 0) {
    throw new Error('targets.pages deve contenere almeno una pagina');
  }
  const pages: PageTarget[] = pagesRaw.map((p, i) => {
    if (!isRecord(p)) throw new Error(`pages[${i}] deve essere un oggetto`);
    const path = p.path;
    if (typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error(`pages[${i}].path deve iniziare con uno slash`);
    }
    const expectRaw = p.expect ?? [];
    if (!Array.isArray(expectRaw) || expectRaw.some((s) => typeof s !== 'string')) {
      throw new Error(`pages[${i}].expect deve essere un array di stringhe`);
    }
    const criticalImages = p.criticalImages ?? 0;
    if (typeof criticalImages !== 'number' || !Number.isInteger(criticalImages) || criticalImages < 0) {
      throw new Error(`pages[${i}].criticalImages deve essere un intero non negativo`);
    }
    const overflowRaw = p.overflowTolerancePx;
    let overflowTolerancePx: number | undefined;
    if (overflowRaw !== undefined) {
      if (typeof overflowRaw !== 'number' || !Number.isInteger(overflowRaw) || overflowRaw <= 0) {
        throw new Error(`pages[${i}].overflowTolerancePx deve essere un intero positivo`);
      }
      overflowTolerancePx = overflowRaw;
    }

    const notesRaw = p.notes;
    if (notesRaw !== undefined && (typeof notesRaw !== 'string' || notesRaw.trim() === '')) {
      throw new Error(`pages[${i}].notes, se presente, deve essere una stringa non vuota`);
    }

    // stessa disciplina degli errori console accettati: ogni deroga dichiara la sua ragione
    if (overflowTolerancePx !== undefined && typeof notesRaw !== 'string') {
      throw new Error(
        `pages[${i}]: overflowTolerancePx richiede notes che ne spieghi la ragione`,
      );
    }

    return {
      path,
      expect: expectRaw as string[],
      criticalImages,
      ...(overflowTolerancePx !== undefined ? { overflowTolerancePx } : {}),
      ...(typeof notesRaw === 'string' ? { notes: notesRaw } : {}),
    };
  });

  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.path)) throw new Error(`pages: path duplicato ${p.path}`);
    seen.add(p.path);
  }

  return { baseUrl, acceptedConsoleErrors, pages };
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadTargets(filePath = resolve(repoRoot, 'targets.json')): Targets {
  return validateTargets(JSON.parse(readFileSync(filePath, 'utf8')));
}
