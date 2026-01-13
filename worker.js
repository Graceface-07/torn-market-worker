/**
 * TORN MARKET & TRANSACTION WORKER
 * Final Build: Handles Manual Events & Automated 15-min Snapshots
 */

export default {
  // --- 1. CONFIGURATION ---
  async getSettings() {
    return {
      // Must match the secret in your Google Apps Script
      WEBHOOK_SECRET: "RICHARD_SECRET_123",
      
      // YOUR UPDATED GOOGLE URL
      BASE_URL: "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec",
      
      // Torn API Key Pool
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

  // --- 2. MANUAL EVENT HANDLER (POST from Console) ---
  async fetch(request, env) {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "Worker Active" }), { headers: corsHeaders });
    }

    try {
      const body = await request.json();
      const res = await fetch(FULL_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const result = await res.text();
      return new Response(JSON.stringify({ ok: res.ok, google_response: result }), { headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Relay Failed", detail: e.toString() }), { status: 400, headers: corsHeaders });
    }
  },

  // --- 3. BACKGROUND SNAPSHOT HANDLER (Cron Trigger) ---
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runAutomatedSnapshot());
  },

  async runAutomatedSnapshot() {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);

    console.log("CRON START: Fetching Universe IDs from Google...");

    try {
      // Step A: Ask Google which Item IDs are marked TRUE
      const universeRes = await fetch(FULL_WEBHOOK + "&action=getUniverse");
      const includedIds = await universeRes.json();

      if (!Array.isArray(includedIds) || includedIds.length === 0) {
        console.log("Universe returned empty or invalid data.");
        return;
      }

      console.log(`Found ${includedIds.length} items to scan.`);

      // Step B: Loop through and get prices from Torn
      for (const itemId of includedIds) {
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        
        try {
          const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
          const tornData = await tornRes.json();

          if (tornData.itemmarket && tornData.itemmarket[0]) {
            const topItem = tornData.itemmarket[0];

            // Step C: Send the price data back to the Snapshot sheet
            await fetch(FULL_WEBHOOK, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
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
              })
            });
            console.log(`Updated Item ${itemId}: $${topItem.cost}`);
          }
        } catch (tornErr) {
          console.error(`Error fetching Item ${itemId}:`, tornErr);
        }

        // 100ms pause to stay within Google/Torn limits
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log("CRON SUCCESS: All items processed.");
    } catch (err) {
      console.error("CRON FATAL ERROR:", err.toString());
    }
  }
};