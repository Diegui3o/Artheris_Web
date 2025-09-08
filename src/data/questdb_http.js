// src/data/questdb_http.js
import { QUESTDB_HTTP_URL } from "./config.js";

export async function questdbExec(sql) {
  const url = new URL("/exec", QUESTDB_HTTP_URL);
  url.searchParams.set("query", sql);
  const r = await fetch(url, { method: "GET" });
  if (!r.ok) {
    throw new Error(`QuestDB HTTP ${r.status}: ${await r.text()}`);
  }
  return r.json(); // { query, columns, dataset, count }
}
