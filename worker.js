export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const { searchParams } = url;

    const TORN_KEYS = [
      "gc43XVxOpCcwLnY6","rKP5EwA6DmSufqEm","8YgzsJntLW3yTboP",
      "fiwzsFpv7BuGuTH3","3grddfsZEZsTlWBp","RQmyHvIAIuJ2iCZX",
      "rwLgZTyqgWDxhoCx","CZP2D2ZnbXWsYiDT","5zgirNZtPxRdeFFL",
      "C9cgPgQFpGzA6n32","sUMyDEhMUi3kNgY7","UO429efUvPIQW5Zq"
    ];

    const TS_KEY = env.API_KEY;
    const KV = env.ROTATOR;

    // MUST MATCH WEBHOOK_SECRET in Code.gs
    const WEBHOOK_SECRET = "REPLACE_ME_WITH_SHEET_KEY";

    const WEBHOOK_URL =
      "https://script.google.com/macros/s/AKfycbzGbzT36ppGFG3bkNBeYYkd0lrO73Jk-wySf5hdiNoHlHy0XBY_0SPbpJCfYcSNwYPUDg/exec"
      + "?key=" + encodeURIComponent(WEBHOOK_SECRET);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    async function getIndex() {
      const v = await KV.get("idx");
      const i = v ? parseInt(v, 10) : 0;
      return Number.isNaN(i) ? 0 : i;
    }

    async function setIndex(i) {
      await KV.put("idx", String(i));
    }

    async function tryKey(key, factionId) {
      const r = await fetch(
        `https://api.torn.com/faction/${factionId}?selections=basic&key=${key}`
      );
      const s = r.status;
      const t = await r.text();

      if (s === 429) throw "RATE";
      if (!t || t.includes("<")) throw "BAD";
      let j;
      try { j = JSON.parse(t); } catch { throw "JSON"; }
      if (j.error) throw "ERR";
      return j;
    }

    async function fetchTorn(factionId) {
      const total = TORN_KEYS.length;
      let idx = await getIndex();
      if (idx < 0 || idx >= total) idx = 0;

      let last = null;
      for (let i = 0; i < total; i++) {
        const k = TORN_KEYS[(idx + i) % total];
        try {
          const d = await tryKey(k, factionId);
          await setIndex((idx + i) % total);
          return d;
        } catch (e) {
          last = e;
        }
      }
      throw last || "FAIL";
    }

    async function fetchTS(factionId) {
      if (!TS_KEY) return { members: {} };
      try {
        const r = await fetch(
          `https://yata.yt/api/v1/faction/export/${factionId}/?key=${TS_KEY}`
        );
        const t = await r.text();
        if (!t || t.includes("<") || !t.trim().startsWith("{"))
          return { members: {} };
        return JSON.parse(t);
      } catch {
        return { members: {} };
      }
    }

    async function sendToSheet(payload) {
      const r = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const t = await r.text();
      return { ok: r.ok, status: r.status, response: t };
    }

    function parseEvent(body) {
      return {
        ts: Date.now(),
        type: body.type || "",
        item: body.item || "",
        price: Number(body.price || 0),
        qty: Number(body.qty || 1),
        side: body.side || ""
      };
    }

    if (path === "/event" && request.method === "POST") {
      try {
        const body = await request.json();
        const tx = parseEvent(body);
        const res = await sendToSheet(tx);
        return new Response(JSON.stringify(res), { headers });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "BAD_BODY", details: String(e) }),
          { status: 400, headers }
        );
      }
    }

    if (path === "/torn") {
      const factionId = searchParams.get("id");
      if (!factionId)
        return new Response(JSON.stringify({ error: "NO_ID" }), {
          status: 400, headers
        });

      try {
        const torn = await fetchTorn(factionId);
        const ts = await fetchTS(factionId);
        return new Response(JSON.stringify({ torn, ts }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "FAIL", details: e }), {
          status: 502, headers
        });
      }
    }

    return new Response(JSON.stringify({ status: "OK" }), { headers });
  }
};
