/**
 * TORN MARKET WORKER - BATCHED & ROTATING
 * Accessing the URL in a browser now forces a snapshot test.
 */

export default {
  async getSettings() {
    return {
      WEBHOOK_SECRET: "RICHARD_SECRET_123",
      BASE_URL: "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec",
      TORN_KEYS: ["gc43XVxOpCcwLnY6", "rKP5EwA6DmSufqEm", "8YgzsJntLW3yTboP", "fiwzsFpv7BuGuTH3", "3grddfsZEZsTlWBp", "RQmyHvIAIuJ2iCZX"]
    };
  },

  async fetch(request, env) {
    const settings = await this.getSettings();
    // MANUAL TRIGGER: If you visit the URL in browser, it runs the snapshot
    console.log("Manual browser request detected. Running snapshot...");
    const report = await this.runAutomatedSnapshot();
    return new Response(JSON.stringify({ status: "Manual Run Triggered", report }), {
      headers: { "Content-Type": "application/json" }
    });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runAutomatedSnapshot());
  },

  async runAutomatedSnapshot() {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);
    let logOutput = [];
    
    try {
      const universeRes = await fetch(FULL_WEBHOOK + "&action=getUniverse");
      const includedIds = await universeRes.json();
      if (!Array.isArray(includedIds) || includedIds.length === 0) return "No IDs found";

      const batchSize = 45;
      const totalItems = includedIds.length;
      const intervalIndex = Math.floor(new Date().getMinutes() / 15); 
      const startIndex = (intervalIndex * batchSize) % totalItems;
      const batch = includedIds.slice(startIndex, startIndex + batchSize);

      const allData = [];

      for (const itemId of batch) {
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.error) {
          console.log(`Item ${itemId} Error: ${tornData.error.error}`);
          continue;
        }

        if (tornData.itemmarket && tornData.itemmarket.length > 0) {
          const topItem = tornData.itemmarket[0];
          allData.push({
            type: "market",
            itemId: itemId,
            price: topItem.cost,
            qty: topItem.quantity,
            uid: topItem.ID || "",
            damage: topItem.damage || 0,
            accuracy: topItem.accuracy || 0,
            armor: topItem.armor || 0,
            quality: topItem.quality || 0,
            bonuses: topItem.bonuses || [],
            rarity: topItem.rarity || "None"
          });
        }
        await new Promise(r => setTimeout(r, 50));
      }

      if (allData.length > 0) {
        const gRes = await fetch(FULL_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "market", rows: allData })
        });
        const gText = await gRes.text();
        const successMsg = `Sent ${allData.length} items. Google says: ${gText}`;
        console.log(successMsg);
        return successMsg;
      } 
      return "Processed 0 items. Check API keys.";
    } catch (err) { 
      console.error("Cron Error:", err.toString()); 
      return err.toString();
    }
  }
};