/**
 * Legge e valida `targets.json`, che non contiene più l'elenco delle pagine —
 * quello arriva dal sitemap — ma le regole: nucleo obbligatorio, soglia minima,
 * aspettative di default, deroghe per pagina e baseline degli errori noti.
 * Rifiuta le eccezioni senza motivazione, così il file non diventa un tappeto
 * sotto cui nascondere le regressioni.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

export type AcceptedConsoleError = { match: string; reason: string };

/** Deroga alle aspettative di default per una singola pagina. */
export type Override = {
  path: string;
  expect?: string[];
  criticalImages?: number;
  overflowTolerancePx?: number;
  notes?: string;
  /** Errori accettati solo su questa pagina: più stretto della lista globale. */
  acceptedConsoleErrors?: AcceptedConsoleError[];
};

export type Targets = {
  baseUrl: string;
  minPages: number;
  sitemaps: string[];
  excludePatterns: string[];
  core: string[];
  defaultExpect: string[];
  defaultCriticalImages: number;
  acceptedConsoleErrors: AcceptedConsoleError[];
  overrides: Override[];
};

/** Ciò che un test riceve per una pagina: i default con l'eventuale deroga applicata. */
export type PageTarget = {
  path: string;
  expect: string[];
  criticalImages: number;
  overflowTolerancePx?: number;
  notes?: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringArray(v: unknown, campo: string): string[] {
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) {
    throw new Error(`targets.${campo} deve essere un array di stringhe`);
  }
  return v as string[];
}

function pathArray(v: unknown, campo: string, minLen: number): string[] {
  const arr = stringArray(v, campo);
  if (arr.length < minLen) {
    throw new Error(`targets.${campo} deve contenere almeno ${minLen} voci`);
  }
  for (const p of arr) {
    if (!p.startsWith('/')) throw new Error(`targets.${campo}: "${p}" deve iniziare con uno slash`);
  }
  return arr;
}

function positiveInt(v: unknown, campo: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
    throw new Error(`targets.${campo} deve essere un intero positivo`);
  }
  return v;
}

function nonNegativeInt(v: unknown, campo: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`targets.${campo} deve essere un intero non negativo`);
  }
  return v;
}

/** Ogni errore accettato deve dichiarare perché lo è, globale o per pagina. */
function acceptedErrors(v: unknown, campo: string): AcceptedConsoleError[] {
  const arr = v ?? [];
  if (!Array.isArray(arr)) throw new Error(`targets.${campo} deve essere un array`);
  return arr.map((e, i) => {
    if (!isRecord(e)) throw new Error(`${campo}[${i}] deve essere un oggetto`);
    if (typeof e.match !== 'string' || e.match.trim() === '') {
      throw new Error(`${campo}[${i}].match mancante`);
    }
    if (typeof e.reason !== 'string' || e.reason.trim() === '') {
      throw new Error(`${campo}[${i}].reason mancante: ogni errore accettato deve dichiarare perché lo è`);
    }
    return { match: e.match, reason: e.reason };
  });
}

export function validateTargets(raw: unknown): Targets {
  if (!isRecord(raw)) throw new Error('targets: la radice deve essere un oggetto');

  const baseUrl = raw.baseUrl;
  if (typeof baseUrl !== 'string' || !baseUrl.startsWith('https://')) {
    throw new Error(
      'targets.baseUrl deve iniziare con https:// — in http i font Elementor vanno in CORS e falsano i test',
    );
  }

  const minPages = positiveInt(raw.minPages, 'minPages');
  const sitemaps = pathArray(raw.sitemaps, 'sitemaps', 1);
  const excludePatterns = stringArray(raw.excludePatterns ?? [], 'excludePatterns');
  const core = pathArray(raw.core, 'core', 1);
  const defaultExpect = stringArray(raw.defaultExpect ?? [], 'defaultExpect');
  const defaultCriticalImages = nonNegativeInt(raw.defaultCriticalImages ?? 0, 'defaultCriticalImages');

  const acceptedConsoleErrors = acceptedErrors(raw.acceptedConsoleErrors, 'acceptedConsoleErrors');

  const overridesRaw = raw.overrides ?? [];
  if (!Array.isArray(overridesRaw)) throw new Error('targets.overrides deve essere un array');
  const overrides: Override[] = overridesRaw.map((o, i) => {
    if (!isRecord(o)) throw new Error(`overrides[${i}] deve essere un oggetto`);
    if (typeof o.path !== 'string' || !o.path.startsWith('/')) {
      throw new Error(`overrides[${i}].path deve iniziare con uno slash`);
    }
    const out: Override = { path: o.path };
    if (o.expect !== undefined) out.expect = stringArray(o.expect, `overrides[${i}].expect`);
    if (o.criticalImages !== undefined) {
      out.criticalImages = nonNegativeInt(o.criticalImages, `overrides[${i}].criticalImages`);
    }
    if (o.overflowTolerancePx !== undefined) {
      out.overflowTolerancePx = positiveInt(o.overflowTolerancePx, `overrides[${i}].overflowTolerancePx`);
    }
    if (o.notes !== undefined) {
      if (typeof o.notes !== 'string' || o.notes.trim() === '') {
        throw new Error(`overrides[${i}].notes, se presente, deve essere una stringa non vuota`);
      }
      out.notes = o.notes;
    }
    if (o.acceptedConsoleErrors !== undefined) {
      out.acceptedConsoleErrors = acceptedErrors(
        o.acceptedConsoleErrors,
        `overrides[${i}].acceptedConsoleErrors`,
      );
    }
    // stessa disciplina degli errori accettati: ogni deroga dichiara la sua ragione
    if (out.overflowTolerancePx !== undefined && out.notes === undefined) {
      throw new Error(`overrides[${i}]: overflowTolerancePx richiede notes che ne spieghi la ragione`);
    }
    return out;
  });

  const visti = new Set<string>();
  for (const o of overrides) {
    if (visti.has(o.path)) throw new Error(`targets.overrides: deroga duplicata per ${o.path}`);
    visti.add(o.path);
  }

  return {
    baseUrl,
    minPages,
    sitemaps,
    excludePatterns,
    core,
    defaultExpect,
    defaultCriticalImages,
    acceptedConsoleErrors,
    overrides,
  };
}

export function targetFor(path: string, t: Targets): PageTarget {
  const o = t.overrides.find((x) => x.path === path);
  const risultato: PageTarget = {
    path,
    expect: o?.expect ?? t.defaultExpect,
    criticalImages: o?.criticalImages ?? t.defaultCriticalImages,
  };
  if (o?.overflowTolerancePx !== undefined) risultato.overflowTolerancePx = o.overflowTolerancePx;
  if (o?.notes !== undefined) risultato.notes = o.notes;
  return risultato;
}

/** Errori accettati per una pagina: quelli globali più quelli dichiarati solo su di lei. */
export function acceptedErrorsFor(path: string, t: Targets): AcceptedConsoleError[] {
  const o = t.overrides.find((x) => x.path === path);
  return [...t.acceptedConsoleErrors, ...(o?.acceptedConsoleErrors ?? [])];
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadTargets(filePath = resolve(repoRoot, 'targets.json')): Targets {
  return validateTargets(JSON.parse(readFileSync(filePath, 'utf8')));
}
