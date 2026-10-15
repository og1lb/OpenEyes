# OpenEyes auf IONOS

Läuft auf einem **IONOS VPS oder Cloud Server mit Ubuntu 22.04/24.04**. Das normale
IONOS-Webhosting reicht nicht: dort läuft kein dauerhafter Node-Prozess, und genau
der prüft alle 30 Sekunden die Blockchain auf eingegangene Zahlungen.

Aufbau auf dem Server:

```
Internet ── nginx (TLS, Rate-Limits) ── 127.0.0.1:8000 Node (API + Website)
                                              │
                                   /var/lib/openeyes/openeyes.db (SQLite)
```

Node lauscht nur auf `127.0.0.1`, von außen ist ausschließlich nginx erreichbar.
Die Firewall lässt nur SSH, 80 und 443 durch.

## 1. Domain

Im IONOS-Kundenbereich unter Domains → DNS einen **A-Record** (und bei IPv6 einen
AAAA-Record) für `deine-domain.de` und `www` auf die IP des VPS setzen. Erst
weitermachen, wenn `ping deine-domain.de` die Server-IP zeigt.

## 2. Einmalige Einrichtung

Per SSH als root auf den Server, dann:

```bash
curl -fsSLO https://raw.githubusercontent.com/DEIN-NAME/openeyes/main/deploy/setup-server.sh
bash setup-server.sh deine-domain.de du@example.com https://github.com/DEIN-NAME/openeyes.git
```

Bei einem privaten Repo vorher auf dem Server einen Deploy-Key hinterlegen und die
SSH-URL (`git@github.com:...`) verwenden.

Das Skript installiert Node 22, nginx, certbot, Firewall, Fail2ban und automatische
Sicherheitsupdates. Es legt einen eigenen Systembenutzer `openeyes` an, holt das
TLS-Zertifikat und richtet das tägliche Datenbank-Backup ein. Am Ende gibt es den
**TOTP-Code** für den Admin-Bereich aus. Den ins Authenticator-App übernehmen.

## 3. Konfiguration

```bash
nano /etc/openeyes/openeyes.env
```

Pflicht:

| Variable | Woher |
| --- | --- |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord Developer Portal → deine App → OAuth2 |
| `DISCORD_BOT_TOKEN` | gleiche App → Bot |
| `DISCORD_GUILD_ID` | Rechtsklick auf deinen Server → ID kopieren (Entwicklermodus an) |
| `DISCORD_MONTHLY_ROLE_ID`, `DISCORD_LIFETIME_ROLE_ID` | Rechtsklick auf die Rolle → ID kopieren |
| `ADMIN_DISCORD_IDS` | deine eigene Discord-User-ID |
| `BTC_XPUB`, `LTC_XPUB` | Wallet → Konto → Extended **Public** Key (xpub/zpub). Niemals den privaten Key. |
| `BTC_USD_RATE`, `LTC_USD_RATE` oder `RATE_URL` | Kurs, mit dem Rechnungen berechnet werden |

Im Discord-Portal unter OAuth2 → Redirects `https://deine-domain.de/api/auth/discord/callback`
eintragen. Den Bot mit dem Recht **Rollen verwalten** in den Server einladen und
seine Rolle in der Rollenliste **über** Monthly und Lifetime ziehen, sonst darf
er sie nicht vergeben.

## 4. Starten und aktualisieren

```bash
bash /opt/openeyes/deploy/update.sh
```

Das Skript macht ein Backup, zieht den neuesten Stand, baut die Website, führt die
Tests aus und startet neu. Schlägt ein Test fehl, bleibt die alte Version laufen.
Für jedes spätere Update denselben Befehl ausführen.

Logs: `journalctl -u openeyes -f`

## Admin-Bereich

`https://deine-domain.de/admin`, erreichbar nur mit einem Discord-Konto aus
`ADMIN_DISCORD_IDS`. Allen anderen antwortet die Seite mit 404, sie sehen also
nicht einmal, dass es sie gibt. Dazu kommt der TOTP-Code als zweiter Faktor. Lässt
du `ADMIN_TOTP_SECRET` leer, reicht der Discord-Login allein. Davon rate ich ab:
Wer dann dein Discord-Konto übernimmt, hat auch das Admin-Panel.
`ADMIN_IP_ALLOWLIST` schränkt es zusätzlich auf feste IPs ein.

Dort findest du:

- **Sales**: Umsatz, MRR, Conversion, Tageschart, aufgeteilt nach Plan und Coin
- **Plans**: Preis, Laufzeit, Suchen pro Tag, Discord-Rolle, sichtbar/versteckt, neue Pläne
- **Users**: Pläne manuell vergeben oder entziehen, Rolle abgleichen, sperren
- Rechnungen und das Audit-Log

## Zahlungen und eigene Blockchain

Für jede Rechnung wird aus deinem xpub eine neue Adresse abgeleitet. Das Geld geht
direkt in deine Wallet, der Server kennt nur öffentliche Schlüssel und kann nichts
ausgeben.

Um zu sehen, ob bezahlt wurde, fragt der Server einen Esplora-Index ab. Solange
`BTC_ESPLORA_URL` und `LTC_ESPLORA_URL` leer sind, sind das blockstream.info und
litecoinspace.org. Die sehen die Adressen, die du beobachtest, und sonst nichts.
Wer das nicht will, betreibt eigene Nodes:

- Bitcoin Core + electrs/Esplora: etwa **800 GB** SSD, dazu der Index
- Litecoin Core + Esplora: etwa **200 GB**

Das passt nicht auf einen kleinen VPS. Dafür brauchst du einen größeren Server oder
einen eigenen Rechner. Die URLs der Nodes kommen dann in `BTC_ESPLORA_URL` und
`LTC_ESPLORA_URL`, und die öffentlichen Server springen nur noch ein, wenn dein
Node ausfällt.

## Backups

Jede Nacht um 03:17 legt der Server eine konsistente Kopie der Datenbank unter
`/var/backups/openeyes` ab und hält 14 Tage vor. Die Backups solltest du ab und
zu vom Server herunterholen, zum Beispiel per `scp`.
