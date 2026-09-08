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
 */
export function planOpen(portStates, runnerIp, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  const esistenti = stato ? [...stato.cidrs] : [];
  const nuovo = normalizeCidr(runnerIp);
  const cidrs = esistenti.includes(nuovo) ? esistenti : [...esistenti, nuovo];
  return { fromPort: port, toPort: port, protocol: PROTOCOLLO_DEFAULT, cidrs };
}

/**
 * Calcola la regola da riscrivere per tornare esattamente allo stato iniziale.
 * Restituisce null se la porta era chiusa: in quel caso il chiamante deve
 * richiuderla con close-instance-public-ports, non riscriverla.
 */
export function planRestore(portStates, port = PORTA_DEFAULT) {
  const stato = findPortState(portStates, port);
  if (!stato) return null;
  return {
    fromPort: port,
    toPort: port,
    protocol: PROTOCOLLO_DEFAULT,
    cidrs: [...stato.cidrs],
  };
}
