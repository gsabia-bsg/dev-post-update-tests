/**
 * Calcola le regole di firewall per aprire la 443 al runner e poi ripristinarla
 * esattamente com'era. È la parte pericolosa: sbagliarla cancella l'IP del tuo
 * ufficio dall'allowlist e ti chiude fuori dal sito.
 *
 * Per questo qui ci sono solo funzioni pure — ricevono lo stato come dato e non
 * parlano con AWS — così sono testabili senza conseguenze. Le chiamate ad AWS
 * stanno in `scripts/firewall.mjs`.
 *
 * `.mjs` perché deve girare con `node` nel workflow, senza compilazione.
 */
const PORTA_DEFAULT = 443;
const PROTOCOLLO_DEFAULT = 'tcp';

export function normalizeCidr(ipOrCidr) {
  return String(ipOrCidr).includes('/') ? String(ipOrCidr) : `${ipOrCidr}/32`;
}

export function findPortState(portStates, port, protocol = PROTOCOLLO_DEFAULT) {
  const trovato = (portStates ?? []).find(
    (s) => s.fromPort === port && s.toPort === port && s.protocol === protocol,
  );
  return trovato ?? null;
}

/**
 * Calcola la regola da scrivere per aprire la porta al runner, preservando i
 * CIDR gia consentiti. Non muta lo stato ricevuto.
 *
 * Lightsail tiene IPv4 e IPv6 in due campi separati, `cidrs` e `ipv6Cidrs`.
 * Vanno riportati ENTRAMBI: riscrivere la porta indicando solo `cidrs` azzera
 * la lista IPv6 di quella porta. E' il bug che il primo run in CI ha causato il
 * 09/09/2026, cancellando la regola IPv6 dalla 443 e non potendola ripristinare
 * perche' non era mai stata letta.
 */
export function planOpen(portStates, runnerIp, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  const esistenti = stato ? [...stato.cidrs] : [];
  const nuovo = normalizeCidr(runnerIp);
  const cidrs = esistenti.includes(nuovo) ? esistenti : [...esistenti, nuovo];
  return {
    fromPort: port,
    toPort: port,
    protocol: PROTOCOLLO_DEFAULT,
    cidrs,
    ipv6Cidrs: stato ? [...(stato.ipv6Cidrs ?? [])] : [],
  };
}

/**
 * Calcola la regola da riscrivere per tornare esattamente allo stato iniziale,
 * IPv6 compreso. Restituisce null se la porta era chiusa: in quel caso il
 * chiamante deve richiuderla con close-instance-public-ports, non riscriverla.
 */
export function planRestore(portStates, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  if (!stato) return null;
  return {
    fromPort: port,
    toPort: port,
    protocol: PROTOCOLLO_DEFAULT,
    cidrs: [...stato.cidrs],
    ipv6Cidrs: [...(stato.ipv6Cidrs ?? [])],
  };
}
