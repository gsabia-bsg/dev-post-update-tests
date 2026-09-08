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

## Contratto sul firewall

`firewall-allowlist.json` è la **fonte di verità** dei CIDR legittimi sulle porte
80 e 443. Il workflow di riconciliazione riporta il firewall a quella lista e
**fallisce** se ha trovato differenze. Se aggiungi legittimamente un IP dalla
console Lightsail, committa la modifica anche qui.
