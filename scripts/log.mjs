// Liest das Eingabe-Log aus der Cloudflare-D1-Datenbank.
//   npm run log            -> letzte 50 Einträge als Tabelle
//   npm run log -- 200     -> letzte 200
//   npm run log:csv        -> alle Einträge nach eingaben.csv
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const csv = process.argv.includes("--csv");
const limit = Number(process.argv.find((a) => /^\d+$/.test(a)) || 50);

const sql = `SELECT zeit, modell, p, ms, kosten, fehler, satz FROM eingaben ORDER BY id DESC${csv ? "" : ` LIMIT ${limit}`}`;
const out = execFileSync("npx", ["--yes", "wrangler@latest", "d1", "execute", "wahr-oder-falsch-log", "--remote", "--json", "--command", sql], {
  cwd: join(root, "worker"),
  encoding: "utf8",
  stdio: ["ignore", "pipe", "inherit"],
});
const rows = JSON.parse(out)[0].results;

const berlin = (iso) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "medium" });
const kurz = (id) => id.split("/").pop();

if (csv) {
  const esc = (v) => (v == null ? "" : `"${String(v).replace(/"/g, '""')}"`);
  const lines = [["Zeit (Berlin)", "Modell", "Wahr (%)", "ms", "Kosten (US-Cent)", "Fehler", "Satz"].join(";")];
  for (const r of rows.reverse()) {
    lines.push([berlin(r.zeit), r.modell, r.p == null ? "" : Math.round(r.p * 100), r.ms ?? "", r.kosten == null ? "" : (r.kosten * 100).toLocaleString("de-DE", { maximumSignificantDigits: 3 }), r.fehler, r.satz].map(esc).join(";"));
  }
  const file = join(root, "eingaben.csv");
  writeFileSync(file, "﻿" + lines.join("\n")); // BOM, damit Excel die Umlaute erkennt
  console.log(`${rows.length} Einträge nach ${file} geschrieben.`);
} else {
  if (!rows.length) console.log("Noch keine Einträge.");
  for (const r of rows.reverse()) {
    const pz = String(Math.round(r.p * 100)).padStart(3) + "%";
    const ergebnis = r.fehler ? "Fehler" : r.p >= 0.65 ? `WAHR       ${pz}` : r.p < 0.35 ? `FALSCH     ${pz}` : `WEISS NICHT${pz}`;
    console.log(`${berlin(r.zeit)}  ${kurz(r.modell).padEnd(28)} ${ergebnis.padEnd(15)} ${r.satz}`);
  }
}
