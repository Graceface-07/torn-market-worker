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
      if (!Array.isArray(includedIds) || includedIds.length === 0) return { error: "No IDs found" };

      // Batching for performance
      const batchSize = 45;
      const intervalIndex = Math.floor(new Date().getMinutes() / 15); 
      const startIndex = (intervalIndex * batchSize) % includedIds.length;
      const batch = includedIds.slice(startIndex, startIndex + batchSize);

      const allData = [];

      for (const itemId of batch) {
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        
        // SWITCHED TO API V2 SYNTAX
        const tornRes = await fetch(`https://api.torn.com/v2/market/?selections=itemmarket&id=${itemId}&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.error) {
          debugLog.push({ itemId, error: tornData.error.error });
          continue;
        }

        // v2 structure is slightly different: tornData.itemmarket.listings
        if (tornData.itemmarket && tornData.itemmarket.listings && tornData.itemmarket.listings.length > 0) {
          const topItem = tornData.itemmarket.listings[0];
          allData.push({
            type: "market",
            itemId: itemId,
            price: topItem.price, // v2 uses .price instead of .cost
            qty: topItem.quantity,
            uid: topItem.ID || "",
            damage: topItem.damage || 0,
            accuracy: topItem.accuracy || 0,
            armor: topItem.armor || 0,
            quality: topItem.quality || 0,
            rarity: topItem.rarity || "None"
          });
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