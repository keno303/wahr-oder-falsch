// Gemeinsame Logik für den lokalen Server (server.js) und den Cloudflare Worker (worker/).
// Keine Node-APIs hier, nur fetch – läuft in beiden Umgebungen.

// Jev plus 8 LLMs über OpenRouter
export const MODELLE = [
  { id: "jev", name: "Jev" },
  { id: "anthropic/claude-opus-5.5", name: "Claude Opus 5.5" },
  { id: "openai/gpt-6-astra", name: "GPT-6 Astra" },
  { id: "anthropic/claude-sonnet-5.5", name: "Claude Sonnet 5.5" },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash" },
  { id: "stealth/space-bunny-alpha", name: "Space Bunny Alpha" },
  { id: "z-ai/glm-5.3-flash", name: "GLM 5.3 Flash" },
  { id: "xiaomi/mimo-v2.6-flash", name: "MiMo-V2.6-Flash" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", name: "Nemotron 3 Ultra" },
];

// Jev-Listenpreis in US-Dollar pro Million Eingabe-Tokens; Ausgabe-Tokens sind kostenlos.
// Quelle: https://docs.typesafe.ai/models (Stand 29.09.2026). Unbekannte Version -> keine Kostenangabe.
const JEV_PREIS_PRO_MTOK = { "jev-1.13.0": 0.042 };

async function withTimeout(fn, ms = 90_000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fn(ctrl.signal);
  } catch (err) {
    throw new Error(err.name === "AbortError" || ctrl.signal.aborted ? `Zeitüberschreitung (${ms / 1000} s)` : err.message);
  } finally {
    clearTimeout(timer);
  }
}

// Jev: eine Noul-Frage, Wert = Wahrscheinlichkeit für "wahr"
async function jev(satz, key) {
  if (!key) throw new Error("TYPESAFE_API_KEY fehlt");
  return withTimeout(async (signal) => {
    const t0 = performance.now();
    const res = await fetch("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "jev-latest",
        state: { aussage: satz },
        questions: { wahr: { type: "noul", instructions: "Ist die `aussage` wahr?" } },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - t0);
    if (signal.aborted) throw Object.assign(new Error("abort"), { name: "AbortError" });
    if (!res.ok) throw new Error(json.detail ? JSON.stringify(json.detail).slice(0, 200) : `HTTP ${res.status}`);
    const preis = JEV_PREIS_PRO_MTOK[json.model];
    const tokens = json.usage?.input_tokens;
    const kosten = preis != null && tokens != null ? (tokens * preis) / 1e6 : null;
    return { p: json.answers.wahr.noul, ms, modell: json.model, kosten, tokens };
  });
}

// LLMs: sollen selbst eine Wahrscheinlichkeit von 0 bis 100 nennen
async function llm(id, satz, key) {
  if (!key) throw new Error("OPENROUTER_API_KEY fehlt");
  return withTimeout(async (signal) => {
    const t0 = performance.now();
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Wahr oder falsch (c't 3003)" },
      body: JSON.stringify({
        model: id,
        messages: [
          {
            role: "system",
            content:
              "Du bewertest, ob eine Aussage wahr ist. Antworte ausschließlich mit einer ganzen Zahl von 0 bis 100: der Wahrscheinlichkeit in Prozent, dass die Aussage wahr ist. Keine weiteren Worte.",
          },
          { role: "user", content: `Aussage: „${satz}“\n\nWie wahrscheinlich ist diese Aussage wahr? Antworte nur mit einer Zahl von 0 bis 100.` },
        ],
        // Tatsächlich abgerechnete Kosten in der Antwort mitliefern
        usage: { include: true },
      }),
    });
    const json = await res.json().catch(() => ({}));
    const ms = Math.round(performance.now() - t0);
    if (signal.aborted) throw Object.assign(new Error("abort"), { name: "AbortError" });
    if (!res.ok || json.error) throw new Error(json.error?.message || `HTTP ${res.status}`);
    const raw = String(json.choices?.[0]?.message?.content || "").trim();
    // Nur eindeutige Antworten: ganze Antwort ist eine Zahl, eine Zahl mit %, oder die Zahl steht am Ende.
    // Sonst würde z. B. die 64 aus "Commodore 64" als Wahrscheinlichkeit gelesen.
    const NUM = "(?<![\\d.,])(\\d{1,3}(?:[.,]\\d+)?)(?![\\d])";
    const zahl =
      raw.match(new RegExp(`^\\**${NUM}\\s*%?\\**$`))?.[1] ??
      [...raw.matchAll(new RegExp(`${NUM}\\s*(?:%|Prozent)`, "g"))].at(-1)?.[1] ??
      raw.match(new RegExp(`${NUM}\\s*%?\\**\\.?\\s*$`))?.[1];
    if (zahl == null || parseFloat(zahl.replace(",", ".")) > 100) throw new Error(`Keine eindeutige Zahl: „${raw.slice(0, 60)}“`);
    return {
      p: Math.max(0, Math.min(100, parseFloat(zahl.replace(",", ".")))) / 100,
      ms,
      raw: raw.slice(0, 80),
      kosten: typeof json.usage?.cost === "number" ? json.usage.cost : null,
      tokens: json.usage?.total_tokens ?? null,
    };
  });
}

// Eingabe prüfen; wirft bei ungültigen Daten
export function eingabe(body) {
  const satz = String(body?.satz || "").trim().slice(0, 500);
  if (!satz) throw Object.assign(new Error("Kein Satz"), { status: 400 });
  if (!MODELLE.some((m) => m.id === body?.modell)) throw Object.assign(new Error("Unbekanntes Modell"), { status: 400 });
  return { satz, modell: body.modell };
}

// Kein Cache: jeder Aufruf fragt das Modell neu
export function pruefen({ satz, modell }, keys) {
  return modell === "jev" ? jev(satz, keys.typesafe) : llm(modell, satz, keys.openrouter);
}
