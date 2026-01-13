export default {
  async getSettings() {
    return {
      WEBHOOK_SECRET: "RICHARD_SECRET_123",
      BASE_URL: "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec",
      TORN_KEYS: ["gc43XVxOpCcwLnY6", "rKP5EwA6DmSufqEm", "8YgzsJntLW3yTboP", "fiwzsFpv7BuGuTH3", "3grddfsZEZsTlWBp", "RQmyHvIAIuJ2iCZX"]
    };
  },

  async fetch(request, env) {
    const report = await this.runAutomatedSnapshot();
    return new Response(JSON.stringify(report, null, 2), { headers: { "Content-Type": "application/json" } });
  },

  async scheduled(event, env, ctx) { ctx.waitUntil(this.runAutomatedSnapshot()); },

  async runAutomatedSnapshot() {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);
    let debugLog = [];
    
    try {
      const universeRes = await fetch(FULL_WEBHOOK + "&action=getUniverse");
      const includedIds = await universeRes.json();
      if (!Array.isArray(includedIds) || includedIds.length === 0) return { error: "No IDs found from Google" };

      // Testing just the first 5 items to keep it fast
      const batch = includedIds.slice(0, 5); 
      const allData = [];

      for (const itemId of batch) {
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.error) {
          debugLog.push({ itemId, key: key.substring(0,4) + "...", error: tornData.error });
        } else if (tornData.itemmarket && tornData.itemmarket.length > 0) {
          allData.push({ itemId, price: tornData.itemmarket[0].cost });
        } else {
          debugLog.push({ itemId, info: "No market listings found" });
        }
      }

      if (allData.length > 0) {
        const gRes = await fetch(FULL_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "market", rows: allData })
        });
        return { status: "Success", itemsSent: allData.length, google: await gRes.text() };
      } 
      return { status: "Failed", torn_debug: debugLog };
    } catch (err) { return { status: "Fatal Error", detail: err.toString() }; }
  }
};