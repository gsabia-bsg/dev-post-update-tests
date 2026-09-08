# Test post-aggiornamento — dev.bsg.it

Suite Playwright che verifica `dev.bsg.it` dopo ogni aggiornamento manuale di
WordPress, plugin o tema.

**Spec:** `docs/superpowers/specs/2026-09-08-wp-post-update-testing-design.md`
**Piano:** `docs/superpowers/plans/2026-09-08-wp-post-update-testing.md`

## Uso in locale

Richiede che il proprio IP sia nell'allowlist del firewall Lightsail.

```bash
npm ci
npx playwright install chromium
npm test
```

- `npm run test:unit` — logica pura, nessuna rete
- `npm run test:site` — contro dev.bsg.it

Su Linux (e in CI) il browser si installa con `npx playwright install --with-deps chromium`.

## Variabili d'ambiente

| Variabile | Dove | Effetto |
|---|---|---|
| `RUN_ID` | test del form | Identificativo scritto nel messaggio inviato, per riconoscere le submission di test |
| `RECAPTCHA_TEST_KEYS` | test del form | `true` solo se su dev sono configurate le chiavi reCAPTCHA di test; altrimenti il test di invio resta skippato |

## Come il workflow attraversa il firewall

`dev.bsg.it` ha una restrizione per IP nel firewall Lightsail, quindi un runner
GitHub non lo raggiunge. Il workflow, a ogni esecuzione:

1. legge i CIDR attualmente consentiti sulla 443
2. li riscrive aggiungendo l'IP del runner
3. esegue i test
4. riscrive **esattamente** l'insieme che aveva letto, in uno step `if: always()`

Non esiste nessuna lista di riferimento committata: il ripristino si basa solo su
ciò che è stato letto all'inizio del run.

**Rischio accettato.** Se il runner viene ucciso di colpo, `if: always()` può non
eseguire e la 443 resta aperta all'IP di quel runner, che GitHub poi riassegna a
un altro suo cliente. Era previsto un controllo notturno di riconciliazione per
coprirlo: si è deciso di non realizzarlo (spec §8). Dopo un run finito male in
modo anomalo, il controllo è manuale:

```
aws lightsail get-instance-port-states --instance-name NOME --region REGIONE
```

## Lanciare i test

```
gh workflow run post-update.yml -f note="cosa hai aggiornato"
gh run watch
```

Oppure dalla tab Actions su GitHub, o dall'app mobile.

## Rollback

Vedi `docs/ROLLBACK.md`. Lo snapshot va creato **prima** di aggiornare: con
trigger manuale la CI entra in scena quando il danno è già fatto.

## Cosa questa suite non verifica

Per scelte esplicite documentate nella spec §11: che la notifica email venga
generata, che l'entry sia persistita a database, che la posta venga consegnata,
le regressioni visive fini, i problemi TLS reali, i form di `/carriere/` e
`/whistleblower/`, e performance, accessibilità e SEO.

## Stato dell'implementazione

Fatto e verificato in locale: scaffold e config, `targets.json` con loader
validato, filtro degli errori console con baseline, invarianti strutturali,
fixture di soppressione overlay, smoke su 16 pagine, test del form, logica pura
dei CIDR, procedura di rollback.

**Non ancora fatto**, perché in attesa delle risposte alle questioni aperte
§12.1-12.3 della spec (nome e regione dell'istanza Lightsail, ruolo IAM, repo
GitHub): lo script `scripts/firewall.mjs` e il workflow `post-update.yml`. Fino
ad allora la suite si lancia a mano in locale.

**Non si farà**: il workflow notturno di riconciliazione del firewall, deciso di
non realizzare l'08/09/2026 — vedi il rischio accettato sopra.

## Difetti del sito emersi durante la costruzione

- `/cyber-security/` ha circa **155px di overflow orizzontale** (scrollWidth
  1435 su viewport 1280). Preesistente, non una regressione. È dichiarato come
  deroga motivata in `targets.json`: va rimossa quando il layout sarà corretto.
- Su ogni pagina con un form, MetForm emette in console
  `reCAPTCHA has already been rendered in this element` — chiama
  `renderReCaptcha` due volte. Il widget funziona comunque. In baseline.
- MetForm annulla di suo la fetch di `metform/v1/forms/views/<id>`
  (`net::ERR_ABORTED`). Innocuo, escluso dal controllo delle richieste fallite.
