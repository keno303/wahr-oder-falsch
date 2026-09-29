# Wahr oder falsch?

Satz eintippen, dann Jev oder eines von 8 LLMs (OpenRouter: Opus 5.5, GPT-6 Astra, Sonnet 5.5, DeepSeek V4.1 Flash, Space Bunny Alpha, GLM 5.3 Flash, MiMo-V2.6-Flash, Nemotron 3 Ultra) fragen: wahr oder falsch, mit Wahrscheinlichkeit und Antwortzeit.

    npm start    # http://localhost:3004

Keys kommen aus `../.env` (Forums-Forensik) oder einer eigenen `.env` hier: `TYPESAFE_API_KEY`, `OPENROUTER_API_KEY`.

- ↵ fragt Jev, ⇧↵ macht einen Zeilenumbruch.
- Jev: Noul-Frage „Ist die `aussage` wahr?“, Wert = Wahrscheinlichkeit für wahr.
- LLMs: sollen selbst eine Zahl von 0 bis 100 nennen (Standard-Einstellungen der Anbieter).
- Zeit = lokaler Server → Anbieter → Server. Kein Cache.

## Online

- Seite: https://keno303.github.io/wahr-oder-falsch/ (GitHub Pages, statisch)
- API: https://wahr-oder-falsch.ct3003.workers.dev (Cloudflare Worker in `worker/`, hält die Keys)
- Der Worker nimmt nur Anfragen von keno303.github.io an und drosselt: 20/min pro IP, 300/min insgesamt.
- Keys ändern: `cd worker && npx wrangler secret put OPENROUTER_API_KEY` (bzw. `TYPESAFE_API_KEY`)
- Worker neu deployen: `cd worker && npx wrangler deploy`
- Worker lokal testen: `cd worker && npx wrangler dev` (Keys in `worker/.dev.vars`), dann `http://localhost:3004/?api=http://localhost:8787`
