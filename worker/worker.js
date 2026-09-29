// Cloudflare Worker: hält die API-Keys für die öffentliche Seite auf GitHub Pages.
// Secrets: TYPESAFE_API_KEY, OPENROUTER_API_KEY (per `wrangler secret put`).
import { MODELLE, eingabe, pruefen } from "../core.js";

// Nur diese Seiten dürfen den Proxy nutzen
const ERLAUBT = ["https://keno303.github.io", "http://localhost:3004"];

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

// Eintrag ins Log schreiben; Fehler beim Loggen dürfen die Antwort nie stören
function loggen(env, ctx, eintrag) {
  if (!env.LOG) return;
  ctx.waitUntil(
    env.LOG.prepare("INSERT INTO eingaben (satz, modell, p, ms, kosten, fehler) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(eintrag.satz, eintrag.modell, eintrag.p ?? null, eintrag.ms ?? null, eintrag.kosten ?? null, eintrag.fehler ?? null)
      .run()
      .catch((err) => console.error("Log fehlgeschlagen:", err.message)),
  );
}

const AUFBEWAHRUNG_TAGE = 90;

export default {
  // Täglich: Einträge älter als 90 Tage löschen
  async scheduled(event, env, ctx) {
    ctx.waitUntil(
      env.LOG.prepare("DELETE FROM eingaben WHERE zeit < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)")
        .bind(`-${AUFBEWAHRUNG_TAGE} days`)
        .run(),
    );
  },

  async fetch(request, env, ctx) {
    const origin = request.headers.get("Origin") || "";
    if (!ERLAUBT.includes(origin)) return new Response("Nicht erlaubt", { status: 403 });
    const headers = { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store" };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    const { pathname } = new URL(request.url);

    if (request.method === "GET" && pathname === "/api/modelle") {
      return json(200, { modelle: MODELLE, keys: { jev: !!env.TYPESAFE_API_KEY, llm: !!env.OPENROUTER_API_KEY } });
    }

    if (request.method === "POST" && pathname === "/api/pruefen") {
      // Drosselung: pro Besucher und insgesamt, gegen Missbrauch und Kostenexplosion
      const ip = request.headers.get("CF-Connecting-IP") || "unbekannt";
      const [proIp, gesamt] = await Promise.all([
        env.PRO_IP.limit({ key: ip }),
        env.GESAMT.limit({ key: "alle" }),
      ]);
      if (!proIp.success) return json(429, { error: "Zu viele Anfragen, bitte kurz warten." });
      if (!gesamt.success) return json(429, { error: "Gerade ist viel los, bitte gleich nochmal versuchen." });

      let input;
      try {
        input = eingabe(await request.json());
      } catch (err) {
        return json(err.status || 400, { error: err.message });
      }
      try {
        const out = await pruefen(input, { typesafe: env.TYPESAFE_API_KEY, openrouter: env.OPENROUTER_API_KEY });
        loggen(env, ctx, { ...out, ...input });
        return json(200, out);
      } catch (err) {
        loggen(env, ctx, { ...input, fehler: err.message.slice(0, 300) });
        return json(err.status || 500, { error: err.message });
      }
    }

    return json(404, { error: "Nicht gefunden" });
  },
};
