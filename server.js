// Wahr oder falsch? – Jev und 8 LLMs bewerten einen Satz.
// Start: node server.js  (Keys aus ../.env oder ./.env, Port 3004)
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { MODELLE, eingabe, pruefen } from "./core.js";

const root = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3004);

// Keys bei jedem Aufruf frisch lesen: ./.env hat Vorrang vor ../.env
function env(name) {
  if (process.env[name]) return process.env[name];
  for (const file of [join(root, ".env"), join(root, "..", ".env")]) {
    if (!existsSync(file)) continue;
    const m = readFileSync(file, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m"));
    if (m) return m[1].replace(/^["']|["']$/g, "");
  }
  return null;
}

const keys = () => ({ typesafe: env("TYPESAFE_API_KEY"), openrouter: env("OPENROUTER_API_KEY") });

const server = createServer(async (req, res) => {
  const json = (status, obj) => {
    res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(obj));
  };
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(join(root, "index.html")));
      return;
    }
    if (req.method === "GET" && req.url.split("?")[0] === "/ct3003-logo.webp") {
      res.writeHead(200, { "Content-Type": "image/webp", "Cache-Control": "no-cache" });
      res.end(await readFile(join(root, "ct3003-logo.webp")));
      return;
    }
    if (req.method === "GET" && req.url === "/api/modelle") {
      return json(200, { modelle: MODELLE, keys: { jev: !!env("TYPESAFE_API_KEY"), llm: !!env("OPENROUTER_API_KEY") } });
    }
    if (req.method === "POST" && req.url === "/api/pruefen") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = eingabe(JSON.parse(body));
      const out = await pruefen(input, keys());
      console.log(`${input.modell} ${out.ms} ms · p=${out.p.toFixed(2)} · ${input.satz.slice(0, 60)}`);
      return json(200, out);
    }
    res.writeHead(404).end();
  } catch (err) {
    console.error(err.message);
    json(err.status || 500, { error: err.message, anfrage: err.anfrage, antwort: err.antwort });
  }
});

server.listen(PORT, () => console.log(`Wahr oder falsch? läuft auf http://localhost:${PORT}`));
