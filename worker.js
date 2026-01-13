/**
 * TORN MARKET & TRANSACTION WORKER
 * Handles: 
 * 1. Manual Buy/Sell events (via Fetch)
 * 2. Automated Background Market Snapshots (via Scheduled)
 */

export default {
  // --- 1. THE SETTINGS ---
  async getSettings() {
    return {
      // MUST match the secret in your Google Apps Script
      WEBHOOK_SECRET: "RICHARD_SECRET_123",
      
      // Your Google Web App URL (without the ?key part)
      BASE_URL: "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec",
      
      // Rotating Torn API Keys
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

  // --- 2. MANUAL HANDLER (POST from Console/Scripts) ---
  async fetch(request, env) {
    const settings = await this.getSettings();
    const url = new URL(request.url);
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);

    // Handle CORS pre-flight
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // Status Check
    if (request.method === "GET") {
      return new Response(JSON.stringify({ status: "Worker Active", mode: "Cloud-Bridge" }), { headers: corsHeaders });
    }

    // Process Manual POST Events
    try {
      const body = await request.json();
      console.log("Relaying manual event to Google...");
      
      const res = await fetch(FULL_WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      
      const result = await res.text();
      return new Response(JSON.stringify({ ok: res.ok, google_response: result }), { headers: corsHeaders });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Failed to relay", detail: e.toString() }), { status: 400, headers: corsHeaders });
    }
  },

  // --- 3. BACKGROUND HANDLER (Cron Trigger) ---
  async scheduled(event, env, ctx) {
    ctx.waitUntil(this.runAutomatedSnapshot());
  },

  async runAutomatedSnapshot() {
    const settings = await this.getSettings();
    const FULL_WEBHOOK = settings.BASE_URL + "?key=" + encodeURIComponent(settings.WEBHOOK_SECRET);

    console.log("Snapshot Triggered: Fetching Universe...");

    try {
      // Step A: Get list of item IDs to track
      const universeRes = await fetch(FULL_WEBHOOK + "&action=getUniverse");
      const includedIds = await universeRes.json();

      if (!Array.isArray(includedIds) || includedIds.length === 0) {
        console.log("No items marked TRUE in universe. Skipping.");
        return;
      }

      console.log(`Tracking ${includedIds.length} items. Fetching market data...`);

      // Step B: Loop through items and fetch from Torn
      for (const itemId of includedIds) {
        // Pick a random key from the pool
        const key = settings.TORN_KEYS[Math.floor(Math.random() * settings.TORN_KEYS.length)];
        
        const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.itemmarket && tornData.itemmarket[0]) {
          const topItem = tornData.itemmarket[0];

          // Step C: Push data to Google Snapshot
          const payload = {
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
          };

          await fetch(FULL_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          
          console.log(`Logged Price for Item ID: ${itemId}`);
        }
        
        // Small delay to prevent hitting Google rate limits too hard
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      console.log("Snapshot Loop Complete.");
    } catch (err) {
      console.error("Critical Background Error:", err.toString());
    }
  }
};