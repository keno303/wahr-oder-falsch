<p align="center">
  <img src="ct3003-logo.webp" width="120" alt="c't 3003">
</p>

<h1 align="center">Wahr oder falsch?</h1>

<p align="center">
  <b>Wie schnell und wie korrekt urteilen LLMs? Einfach einen Satz eintippen.</b><br>
  Eine Demo von <a href="https://www.heise.de/thema/ct-3003">c't 3003</a>
</p>

<p align="center">
  👉 <a href="https://keno303.github.io/wahr-oder-falsch/"><b>keno303.github.io/wahr-oder-falsch</b></a>
</p>

---

Man tippt einen Satz ein („Pinguine können fliegen.“) und lässt ihn beurteilen, entweder von **Jev** oder von einem von **acht großen LLMs**. Die Seite zeigt:

- **Wahr, Falsch oder Weiß nicht**, mit Wahrscheinlichkeit
- **Antwortzeit** in Millisekunden
- **Kosten** der einzelnen Anfrage
- bei den LLMs: **wie viel länger und teurer** sie im Vergleich zu Jev waren
- auf Wunsch (Schalter „Prompts & JSON“): Systemprompt, die exakte Anfrage und die unveränderte Antwort des Anbieters

## Die Modelle

| Modell | Anbieter / ID |
|---|---|
| **Jev** | [TypeSafe](https://docs.typesafe.ai), `jev-latest` |
| Claude Opus 5.5 | `anthropic/claude-opus-5.5` |
| GPT-6 Astra | `openai/gpt-6-astra` |
| Claude Sonnet 5.5 | `anthropic/claude-sonnet-5.5` |
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` |
| Space Bunny Alpha | `stealth/space-bunny-alpha` |
| GLM 5.3 Flash | `z-ai/glm-5.3-flash` |
| MiMo-V2.6-Flash | `xiaomi/mimo-v2.6-flash` |
| Nemotron 3 Ultra | `nvidia/nemotron-3-ultra-550b-a55b` |

Die LLMs laufen über [OpenRouter](https://openrouter.ai), jeweils mit den Standard-Einstellungen des Anbieters. Space Bunny Alpha ist ein „Stealth“-Modell eines ungenannten Anbieters.

## So ist das Ergebnis zu lesen

**Die Einteilung:** ab 65 % *Wahr*, unter 35 % *Falsch*, dazwischen *Weiß nicht*.

**Die Wahrscheinlichkeiten sind nicht gleichwertig:**

- **Jev** ist ein System-One-Modell: Es gibt keinen Text aus, sondern eine *typisierte Antwort*. Die Frage „Ist die `aussage` wahr?“ ist eine [Noul](https://docs.typesafe.ai/primitives/noul)-Frage, und der Wert ist die Wahrscheinlichkeit für „Ja“, direkt aus dem Modell.
- **Die LLMs** werden gebeten, *selbst eine Zahl* von 0 bis 100 zu nennen. Das ist eine Selbsteinschätzung. Antwortet ein LLM nicht eindeutig mit einer Zahl, zeigt die Seite einen Fehler statt einer geratenen Wahrscheinlichkeit.

**Zeit** ist die Dauer der Anfrage vom Server zum Anbieter und zurück, also inklusive Netzwerk. Gemessen wird für alle Modelle gleich. Bei den LLMs schwankt sie stark, je nach Tageszeit und Auslastung beim Anbieter.

**Kosten** in US-Cent:
- LLMs: der Betrag, den OpenRouter für genau diese Anfrage abgerechnet hat, inklusive Reasoning-Tokens.
- Jev: Eingabe-Tokens × Listenpreis (0,042 $ pro Million Tokens laut [TypeSafe-Doku](https://docs.typesafe.ai/models); Ausgabe-Tokens sind kostenlos).

**Jev ist kein Lexikon.** Allgemeinwissen sitzt, bei Detailfakten (Jahreszahlen etc.) wird Jev eher unsicher. Das ist so gewollt: Das Modell ist für schnelle, kalibrierte Urteile gebaut, nicht als Wissensdatenbank.

## Aufbau

```
Browser ──► GitHub Pages            index.html, Logo (statisch)
   │
   └──► Cloudflare Worker           hält die API-Keys, prüft Herkunft, drosselt
            ├──► TypeSafe API       Jev
            ├──► OpenRouter         die 8 LLMs
            └──► Cloudflare D1      Log der Eingaben (ohne IP)
```

GitHub Pages kann nur statische Dateien ausliefern. Die API-Keys dürfen aber nie im Browser landen, deshalb läuft jede Anfrage über einen kleinen Cloudflare Worker. Der Worker

- nimmt nur Anfragen von `keno303.github.io` (und lokal `localhost:3004`) an,
- drosselt auf **20 Anfragen pro Minute je Besucher** und **300 pro Minute insgesamt**,
- bricht jede Modell-Anfrage nach 90 Sekunden ab.

Jev-Frage, LLM-Prompt und Zahlen-Parser liegen in **`core.js`** und werden vom Worker und vom lokalen Server gleichermaßen genutzt.

| Datei | Zweck |
|---|---|
| `index.html` | Die komplette Seite (HTML, CSS, JS) |
| `core.js` | Modelle, Anfragen an TypeSafe/OpenRouter, Parser, Kosten |
| `server.js` | Lokaler Server für Entwicklung und Dreh (Port 3004) |
| `worker/worker.js` | Cloudflare Worker für die öffentliche Seite |
| `worker/wrangler.toml` | Worker-Konfiguration: Drosselung, Datenbank, täglicher Cron |
| `worker/schema.sql` | Tabelle für das Eingabe-Log |
| `scripts/log.mjs` | Liest das Eingabe-Log aus |

## Lokal starten

Voraussetzung: Node.js 20 oder neuer. Keine Abhängigkeiten, kein `npm install` nötig.

```bash
# Keys in .env (in diesem Ordner oder im Ordner darüber)
TYPESAFE_API_KEY=...
OPENROUTER_API_KEY=...

npm start          # → http://localhost:3004
```

Lokal wird nichts geloggt.

## Deployen

**Seite:** Jeder Push auf `main` geht per GitHub Pages automatisch live.

**Worker** (mit [Wrangler](https://developers.cloudflare.com/workers/wrangler/), dem Kommandozeilen-Werkzeug von Cloudflare):

```bash
cd worker
npx wrangler deploy                          # Code hochladen
npx wrangler secret put OPENROUTER_API_KEY   # Keys ändern, wirkt sofort
npx wrangler secret put TYPESAFE_API_KEY
```

Worker lokal testen: `npx wrangler dev` (Keys in `worker/.dev.vars`), dann die Seite mit `http://localhost:3004/?api=http://localhost:8787` öffnen.

> **Tipp:** Für die öffentliche Seite einen eigenen OpenRouter-Key mit Ausgabenlimit verwenden. Die Drosselung bremst Missbrauch, deckelt aber keine Kosten.

## Eingabe-Log und Datenschutz

Die öffentliche Seite speichert jede Anfrage in der Cloudflare-D1-Datenbank `wahr-oder-falsch-log` (Standort EU): Satz, Modell, Ergebnis, Zeit, Kosten und Zeitpunkt.

- **Keine IP-Adressen, keine Browserdaten, keine Cookies**
- **Automatische Löschung nach 90 Tagen** (täglicher Cron im Worker)
- Hinweis dazu direkt unter dem Eingabefeld

Auslesen (braucht eine Cloudflare-Anmeldung: `cd worker && npx wrangler login`):

```bash
npm run log          # letzte 50 Einträge
npm run log -- 200   # letzte 200
npm run log:csv      # alle nach eingaben.csv (Semikolon, für Excel/Numbers)
```

## Anpassen

| Was | Wo |
|---|---|
| Modelle | `MODELLE` in `core.js` (IDs aus [openrouter.ai/models](https://openrouter.ai/models)), danach Worker neu deployen |
| Grenzen für Wahr / Weiß nicht / Falsch | `UNSICHER` in `index.html` (und in `scripts/log.mjs`) |
| Systemprompt der LLMs | `SYSTEMPROMPT` in `core.js` |
| Jev-Preis (neue Version) | `JEV_PREIS_PRO_MTOK` in `core.js`; unbekannte Versionen zeigen „Kosten unbekannt“ |
| Drosselung | `worker/wrangler.toml` |
| Erlaubte Herkunft | `ERLAUBT` in `worker/worker.js` |

---

<p align="center">
  Gebaut für den YouTube-Kanal <b>c't 3003</b> · Jev von <a href="https://docs.typesafe.ai">TypeSafe</a>
</p>
