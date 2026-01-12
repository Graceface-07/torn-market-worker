export default {
  // 1. MANUAL ENTRY: Handles POST requests from your console/scripts
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // MUST MATCH Apps Script WEBHOOK_SECRET
    const WEBHOOK_SECRET = "RICHARD_SECRET_123";
    const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec"
      + "?key=" + encodeURIComponent(WEBHOOK_SECRET);

    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers });

    if (path === "/event" && request.method === "POST") {
      try {
        const body = await request.json();
        const res = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        const t = await res.text();
        return new Response(JSON.stringify({ ok: res.ok, response: t }), { headers });
      } catch (e) {
        return new Response(JSON.stringify({ error: "FAIL", details: String(e) }), { status: 400, headers });
      }
    }

    return new Response(JSON.stringify({ status: "Worker Active" }), { headers });
  },

  // 2. BACKGROUND ENTRY: Runs automatically via Cloudflare Cron Trigger
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runAutomatedSnapshot(env));
  },

  async runAutomatedSnapshot(env) {
    const TORN_KEYS = [
      "gc43XVxOpCcwLnY6","rKP5EwA6DmSufqEm","8YgzsJntLW3yTboP",
      "fiwzsFpv7BuGuTH3","3grddfsZEZsTlWBp","RQmyHvIAIuJ2iCZX"
    ];
    const WEBHOOK_SECRET = "RICHARD_SECRET_123";
    const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec"
      + "?key=" + encodeURIComponent(WEBHOOK_SECRET);

    try {
      // Step A: Ask Google for the list of Item IDs marked TRUE in itemuniverse
      const uniRes = await fetch(WEBHOOK_URL + "&action=getUniverse");
      const includedIds = await uniRes.json();

      if (!Array.isArray(includedIds) || includedIds.length === 0) return;

      // Step B: Fetch prices from Torn for each ID
      for (const itemId of includedIds) {
        const key = TORN_KEYS[Math.floor(Math.random() * TORN_KEYS.length)];
        const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.itemmarket && tornData.itemmarket[0]) {
          const topItem = tornData.itemmarket[0];

          // Step C: Send that data to the Snapshot tab
          await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "market",
              itemId: itemId,
              price: topItem.cost,
              qty: topItem.quantity,
              uid: topItem.ID,
              damage: topItem.damage || 0,
              accuracy: topItem.accuracy || 0,
              armor: topItem.armor || 0,
              quality: topItem.quality || 0,
              bonuses: topItem.bonuses || [],
              rarity: topItem.rarity || "None"
            })
          });
        }
      }
    } catch (err) {
      console.error("Snapshot Automation Error:", err);
    }
  }
};