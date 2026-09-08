import type { AcceptedConsoleError } from './targets';

export type ConsoleRecord = { text: string; url?: string };

export function isFirstParty(url: string | undefined, host: string): boolean {
  if (!url) return true;
  try {
    return new URL(url).host === host;
  } catch {
    // un url non parsabile è trattato come primo dominio: meglio un falso
    // positivo da indagare che una regressione persa
    return true;
  }
}

export function unexpectedConsoleErrors(
  records: ConsoleRecord[],
  accepted: AcceptedConsoleError[],
  firstPartyHost: string,
): ConsoleRecord[] {
  return records.filter((r) => {
    if (!isFirstParty(r.url, firstPartyHost)) return false;
    return !accepted.some((a) => r.text.includes(a.match));
  });
}
