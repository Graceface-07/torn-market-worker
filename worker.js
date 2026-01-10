// src/worker.js
var worker_default = {
  async fetch(request, env) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const apiKey = env.API_KEY;
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
    if (!id || !apiKey) {
      return new Response(JSON.stringify({ error: "Missing ID or API_KEY" }), { status: 400, headers });
    }
    try {
      const tornUrl = `https://api.torn.com/faction/${id}?selections=basic&key=${apiKey}`;
      const tornRes = await fetch(tornUrl).then((r) => r.json());
      const tsUrl = `https://www.tornstats.com/api/v2/${apiKey}/faction/members`;
      const tsRes = await fetch(tsUrl).then((r) => r.json());
      return new Response(JSON.stringify({
        torn: tornRes,
        ts: tsRes
      }), { headers });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 500, headers });
    }
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
S