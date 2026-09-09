# Test post-aggiornamento — dev.bsg.it

Suite Playwright che verifica `dev.bsg.it` dopo ogni aggiornamento manuale di
WordPress, plugin o tema.

**Spec:** `docs/superpowers/specs/2026-09-08-wp-post-update-testing-design.md`
**Piano:** `docs/superpowers/plans/2026-09-08-wp-post-update-testing.md`

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
un altro suo cliente. Dopo un run finito male in
modo anomalo, il controllo sugli ip consentiti nel firewall è manuale:

## Lanciare i test

```
gh workflow run post-update.yml -f note="cosa hai aggiornato"
gh run watch
```

Oppure dalla tab Actions su GitHub, o dall'app mobile.

## Cosa questa suite non verifica

Per scelte esplicite documentate nella spec §11: che la notifica email venga
generata, che l'entry sia persistita a database, che la posta venga consegnata,
le regressioni visive fini, i problemi TLS reali, i form di `/carriere/` e
`/whistleblower/`, e performance, accessibilità e SEO.

Sul TLS in particolare: `dev.bsg.it` resta con il certificato self-signed per
scelta esplicita, quindi `ignoreHTTPSErrors` è **permanente** e `wp-login.php`
resta raggiungibile su canale non cifrato. È anche il motivo per cui nessun test
entra in wp-admin e nessuna credenziale WordPress vive nei secrets: su un canale
non autenticato non ce la manderemmo.

## Cosa verifica
Su ognuna delle pagine controlla che:

- si apra davvero non pagina bianca, non errore
- il CSS sia caricato, cioè non ti ritrovi il sito senza grafica
- testata, menu, contenuto e piè di pagina ci siano
- le immagini si vedano
- non ci siano errori JavaScript nuovi
- non manchi nessun file (CSS, JS o immagini in 404)
- il layout non sfondi di lato
