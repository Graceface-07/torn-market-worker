/**
 * TORN MARKET WORKER - FINAL PRODUCTION BUILD
 * Handles:
 * 1. POST: Relays manual Buy/Sell events from your game scripts to Google.
 * 2. CRON: Automated rotating market snapshots every 15 minutes.
 */

export default {
  async getSettings() {
    return {
      WEBHOOK_SECRET: "RICHARD_SECRET_123",
      BASE_URL: "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec",
      TORN_KEYS: [
        "gc43XVxOpCcwLnY6",
        "rKP5EwA6DmSufqEm",
        "8YgzsJntLW3yTboP",
        "fiwzsFpv7BuGuTH3",
        "3grddfsZEZsTlWBp",
        "RQmyHvIAIuJ2iCZX"
      ]
    };
  },

  // 1. MANUAL RELAY HANDLER
  async fetch(request, env) {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // If it's a POST, relay the data to Google
    if (request.method === "POST") {
      try {
        const body = await request.json();
        const res = await fetch(FULL_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        });
        return new Response(await res.text(), { headers: corsHeaders });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.toString() }), { status: 400, headers: corsHeaders });
      }
    }

    // Default status page for GET requests
    return new Response(JSON.stringify({ status: "Worker Online", mode: "Ready" }), { headers: corsHeaders });
  },

  // 2. CRON TRIGGER HANDLER
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runAutomatedSnapshot());
  },

  // 3. AUTOMATED SNAPSHOT LOGIC
  async runAutomatedSnapshot() {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);
    
    try {
      // Fetch the Item Universe from Google
      const universeRes = await fetch(FULL_WEBHOOK + "&action=getUniverse");
      const includedIds = await universeRes.json();
      if (!Array.isArray(includedIds) || includedIds.length === 0) return { error: "No IDs found" };

      // Rotation Logic: Process 45 items per 15-minute interval
      const batchSize = 45;
      const intervalIndex = Math.floor(new Date().getMinutes() / 15); 
      const startIndex = (intervalIndex * batchSize) % includedIds.length;
      const batch = includedIds.slice(startIndex, startIndex + batchSize);

      const allData = [];

      for (const itemId of batch) {
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        const tornRes = await fetch(`https://api.torn.com/v2/market/?selections=itemmarket&id=${itemId}&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.error) continue;

        if (tornData.itemmarket && tornData.itemmarket.listings && tornData.itemmarket.listings.length > 0) {
          const topItem = tornData.itemmarket.listings[0];
          allData.push({
            type: "market",
            itemId: itemId,
            price: topItem.price,
            qty: topItem.quantity,
            uid: topItem.ID || "",
            damage: topItem.damage || 0,
            accuracy: topItem.accuracy || 0,
            armor: topItem.armor || 0,
            quality: topItem.quality || 0,
            rarity: topItem.rarity || "None"
          });
        }
        await new Promise(r => setTimeout(r, 50)); // Prevent rate-limit spikes
      }

      // Send the entire batch to Google in one request
      if (allData.length > 0) {
        const gRes = await fetch(FULL_WEBHOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "market", rows: allData })
        });
        return { status: "Success", itemsSent: allData.length, google: await gRes.text() };
      } 
      return { status: "No Data" };
    } catch (err) { 
      return { status: "Error", detail: err.toString() }; 
    }
  }
};