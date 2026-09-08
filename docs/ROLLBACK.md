# Aggiornare dev.bsg.it e tornare indietro

## Prima di aggiornare

1. Crea uno snapshot dell'istanza, dalla console Lightsail o da riga di comando:

   ```
   aws lightsail create-instance-snapshot \
     --instance-name NOME \
     --instance-snapshot-name "pre-update-$(date +%Y%m%d-%H%M)" \
     --region REGIONE
   ```

2. Attendi che lo stato dello snapshot sia `available` prima di procedere.
3. Annota cosa stai per aggiornare: ti servirà come nota del workflow.

## Dopo aver aggiornato

Lancia i test, dalla tab Actions su GitHub oppure:

```
gh workflow run post-update.yml -f note="Elementor 4.2.5 e MetForm 4.3.1"
gh run watch
```

Se è verde, hai finito. Cancella lo snapshot quando non ti serve più: si paga a
circa 0,05 $/GB-mese, quindi uno da 40 GB costa nell'ordine dei 2 $/mese.

## Se è rosso

1. Scarica gli artifact del run e apri `playwright-report/index.html`.
2. Per un test fallito, apri la trace: mostra DOM, rete e screenshot per ogni
   passo, nell'istante esatto della rottura.
3. Decidi la portata del danno prima di agire.

### Un singolo plugin è il colpevole

Non ripristinare lo snapshot. Reinstalla la versione precedente di quel plugin e
rilancia i test. È più rapido e non perdi nulla di quanto fatto nel frattempo.

### Il core o il tema hanno rotto tutto

Ripristina lo snapshot. **Attenzione: su Lightsail il ripristino non sovrascrive
l'istanza esistente.** Crea una istanza nuova, e il passaggio va completato a
mano:

1. `aws lightsail create-instances-from-snapshot` — crea la nuova istanza dallo
   snapshot
2. Attendi che sia `running`
3. **Sposta l'IP statico** dalla vecchia alla nuova istanza: Lightsail →
   Networking → l'IP statico → Attach to instance
4. Verifica che `https://dev.bsg.it` risponda dalla nuova istanza
5. **Riapplica il firewall**: la nuova istanza nasce con le regole di default,
   non con la tua allowlist. Lancia il workflow di riconciliazione:
   `gh workflow run firewall-reconcile.yml`
6. Solo dopo aver verificato tutto, dismetti la vecchia istanza

Il passo 5 è quello che si dimentica: senza di esso l'istanza nuova è esposta o
inaccessibile, a seconda dei default.

## Se dopo il ripristino il certificato cambia

Il certificato attuale è self-signed e legato all'IP `3.73.112.45`. Se l'IP
statico viene riassegnato correttamente non cambia nulla. Se invece la nuova
istanza resta su un IP diverso, i test continuano a funzionare — girano con
`ignoreHTTPSErrors` — ma il browser mostrerà un avviso diverso.
