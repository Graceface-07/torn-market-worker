export default {
  async fetch(request, env) {
    // This handles your manual POST requests from the console
    return await this.handleRequest(request, env);
  },

  async scheduled(event, env, ctx) {
    // This runs in the background on a timer
    ctx.waitUntil(this.runAutomatedSnapshot(env));
  },

  async runAutomatedSnapshot(env) {
    const TORN_KEYS = ["gc43XVxOpCcwLnY6", "rKP5EwA6DmSufqEm", "8YgzsJntLW3yTboP"]; // etc...
    const WEBHOOK_SECRET = "RICHARD_SECRET_123";
    const WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbzq66GAz2wKeySUopH44eVcEtQwfi2fhYKRXsppxKQLeh8vIv7FfSvZSbRCwlT1_WcE/exec" + "?key=" + encodeURIComponent(WEBHOOK_SECRET);

    console.log("Starting Background Snapshot...");

    try {
      // 1. Fetch the list of items to track (those marked TRUE) from Google
      // Note: We use a GET request to a custom function in your script
      const response = await fetch(WEBHOOK_URL + "&action=getUniverse");
      const universe = await response.json();

      if (!universe || universe.length === 0) return;

      // 2. For each item, fetch market data from Torn
      for (const itemId of universe) {
        const key = TORN_KEYS[Math.floor(Math.random() * TORN_KEYS.length)];
        const tornRes = await fetch(`https://api.torn.com/market/${itemId}?selections=itemmarket&key=${key}`);
        const tornData = await tornRes.json();

        if (tornData.itemmarket && tornData.itemmarket.length > 0) {
          const cheapest = tornData.itemmarket[0];

          // 3. Send the cheapest listing to the Snapshot tab
          await fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: "market",
              itemId: itemId,
              price: cheapest.cost,
              qty: cheapest.quantity,
              uid: cheapest.ID,
              // These might not be in basic market calls, but we fill what we have
              damage: cheapest.damage || 0,
              accuracy: cheapest.accuracy || 0,
              rarity: cheapest.rarity || "None"
            })
          });
        }
      }
    } catch (e) {
      console.error("Automation Error:", e);
    }
  },

  async handleRequest(request, env) {
    // ... [Paste your existing handleRequest logic here for manual events] ...
    // This ensures your buy/sell console commands still work!
  }
};