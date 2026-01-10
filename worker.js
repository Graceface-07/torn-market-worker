export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const { searchParams } = url;

    // -----------------------------
    // CONFIG
    // -----------------------------

    // Torn API keys for rotation
    const TORN_KEYS = [
      "gc43XVxOpCcwLnY6",
      "rKP5EwA6DmSufqEm",
      "8YgzsJntLW3yTboP",
      "fiwzsFpv7BuGuTH3",
      "3grddfsZEZsTlWBp",
      "RQmyHvIAIuJ2iCZX",
      "rwLgZTyqgWDxhoCx",
      "CZP2D2ZnbXWsYiDT",
      "5zgirNZtPxRdeFFL",
      "C9cgPgQFpGzA6n32",
      "sUMyDEhMUi3kNgY7",
      "UO429efUvPIQW5Zq"
    ];

    // TS / YATA key from secret
    const TS_KEY = env.API_KEY;

    // KV binding (namespace: key_rotator, binding: ROTATOR)
    const KV = env.ROTATOR;

    // Google Apps Script webhook
    // IMPORTANT: replace YOUR_GOOGLE_KEY with the exact key your script checks.
    const WEBHOOK_URL =
      "https://script.google.com/macros/s/AKfycbzGbzT36ppGFG3bkNBeYYkd0lrO73Jk-wySf5hdiNoHlHy0XBY_0SPbpJCfYcSNwYPUDg/exec?key=YOUR_GOOGLE_KEY";

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // -----------------------------
    // TORN KEY ROTATION + FETCH
    // -----------------------------

    async function getCurrentIndex() {
      try {
        const stored = await KV.get("current_torn_index");
        const idx = stored !== null ? parseInt(stored, 10) : 0;
        if (Number.isNaN(idx) || idx < 0 || idx >= TORN_KEYS.length) return 0;
        return idx;
      } catch {
        return 0;
      }
    }

    async function setCurrentIndex(idx) {
      try {
        await KV.put("current_torn_index", String(idx));
      } catch {
        // best effort
      }
    }

    async function tryTornKey(key, factionId) {
      const res = await fetch(
        `https://api.torn.com/faction/${factionId}?selections=basic&key=${key}`
      );

      const status = res.status;
      const text = await res.text();

      if (status === 429) {
        throw new Error("RATE_LIMIT");
      }
      if (!text || text.includes("<")) {
        throw new Error("HTML_OR_INVALID");
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("BAD_JSON");
      }

      if (data && data.error) {
        throw new Error("TORN_ERROR");
      }

      return data;
    }

    async function fetchTornFactionWithRotation(factionId) {
      const total = TORN_KEYS.length;
      if (total === 0) {
        throw new Error("NO_KEYS");
      }

      let startIndex = await getCurrentIndex();
      if (startIndex < 0 || startIndex >= total) startIndex = 0;

      let lastError = null;

      for (let i = 0; i < total; i++) {
        const idx = (startIndex + i) % total;
        const key = TORN_KEYS[idx];

        try {
          const data = await tryTornKey(key, factionId);
          await setCurrentIndex(idx);
          return { data, keyIndex: idx };
        } catch (e) {
          lastError = e;
          continue;
        }
      }

      throw lastError || new Error("ALL_KEYS_FAILED");
    }

    // -----------------------------
    // TS / YATA FETCH
    // -----------------------------

    async function fetchTsFaction(factionId) {
      if (!TS_KEY) {
        return { members: {} };
      }

      try {
        const res = await fetch(
          `https://yata.yt/api/v1/faction/export/${factionId}/?key=${TS_KEY}`
        );
        const text = await res.text();

        if (!text || text.includes("<") || !text.trim().startsWith("{")) {
          return { members: {} };
        }

        const data = JSON.parse(text);
        return data;
      } catch {
        return { members: {} };
      }
    }

    // -----------------------------
    // EVENT → GOOGLE SHEET MODULE
    // -----------------------------

    async function sendToSheet(payload) {
      const res = await fetch(WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const text = await res.text();

      return {
        ok: res.ok,
        status: res.status,
        response: text
      };
    }

    async function processEvent(rawBody) {
      // Pass-through + server timestamp. Sheet can decide what to do.
      const payload = {
        ts: Date.now(),
        ...rawBody
      };

      return await sendToSheet(payload);
    }

    // -----------------------------
    // ROUTING
    // -----------------------------

    // /event  -> generic event → sheet
    if (path === "/event" && request.method === "POST") {
      try {
        const body = await request.json();

        // Minimal validation: must at least be an object
        if (!body || typeof body !== "object") {
          return new Response(
            JSON.stringify({ error: "Body must be a JSON object" }),
            { status: 400, headers }
          );
        }

        const result = await processEvent(body);
        return new Response(JSON.stringify(result), { status: 200, headers });
      } catch (e) {
        return new Response(
          JSON.stringify({ error: "Invalid JSON body", details: e.message }),
          { status: 400, headers }
        );
      }
    }

    // /torn?id=FACTION_ID  -> Torn + TS merge
    if (path === "/torn") {
      const factionId = searchParams.get("id");

      if (!factionId) {
        return new Response(JSON.stringify({ error: "No faction ID provided" }), {
          status: 400,
          headers
        });
      }

      try {
        const tornResult = await fetchTornFactionWithRotation(factionId);
        const tornData = tornResult.data;
        const tsData = await fetchTsFaction(factionId);

        return new Response(
          JSON.stringify({
            torn: tornData,
            ts: tsData
          }),
          { status: 200, headers }
        );
      } catch (e) {
        return new Response(
          JSON.stringify({
            error: "Torn fetch failed",
            details: e.message || String(e)
          }),
          { status: 502, headers }
        );
      }
    }

    // Default health/status
    return new Response(JSON.stringify({ status: "OK" }), {
      status: 200,
      headers
    });
  }
};
