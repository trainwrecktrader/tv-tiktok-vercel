// api/tradingview-webhook.js

// In-memory list of recent events for simple debugging view.
// NOTE: This is NOT persistent across all Vercel instances; it's best-effort only.
let recentEvents = [];

// Helper: get env with basic warning if missing
function getEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`Missing environment variable: ${name}`);
  }
  return v;
}

// Store an event in the in-memory list
function addRecentEvent(payload, caption) {
  recentEvents.unshift({
    ts: new Date().toISOString(),
    payload,
    caption
  });
  if (recentEvents.length > 50) {
    recentEvents.pop();
  }
}

// Build a caption string from the TradingView payload
function buildCaption(payload) {
  // Expecting payload like:
  // {
  //   "type": "tiktok_alert",
  //   "symbol": "MESZ2024",
  //   "limit_low": "4825.25",
  //   "limit_high_next_open": "4860.75",
  //   "bar_time": "1732902300000"
  // }

  const type = payload.type || "tiktok_alert";
  const symbol = payload.symbol || "Unknown symbol";

  const rawLimitLow = payload.limit_low;
  const rawLimitHigh = payload.limit_high_next_open;

  // Try to convert to numbers; if not numeric, keep raw strings
  const numLimitLow =
    rawLimitLow !== undefined && rawLimitLow !== null && rawLimitLow !== ""
      ? Number(rawLimitLow)
      : null;
  const numLimitHigh =
    rawLimitHigh !== undefined && rawLimitHigh !== null && rawLimitHigh !== ""
      ? Number(rawLimitHigh)
      : null;

  const limitLowStr =
    numLimitLow != null && !Number.isNaN(numLimitLow)
      ? numLimitLow.toString()
      : rawLimitLow != null
        ? String(rawLimitLow)
        : "n/a";

  const limitHighStr =
    numLimitHigh != null && !Number.isNaN(numLimitHigh)
      ? numLimitHigh.toString()
      : rawLimitHigh != null
        ? String(rawLimitHigh)
        : "n/a";

  // bar_time from TradingView's {{time}} is ms since epoch
  const barTimeMs = Number(payload.bar_time);
  const timeStr = !Number.isNaN(barTimeMs)
    ? new Date(barTimeMs).toISOString()
    : new Date().toISOString();

  const lines = [
    `TikTok ${type.replace("_", " ").toUpperCase()} for ${symbol}`,
    `• Limit Low: ${limitLowStr}`,
    `• Limit High (Next Open): ${limitHighStr}`,
    `Bar Time: ${timeStr}`,
    "",
    "#tradingview #futures #liquidity #tiktoktrading"
  ];

  return lines.join("\n");
}

// TikTok Direct Post stub (safe mode)
// Right now this just logs; it does NOT actually hit TikTok's API.
// When you're ready, replace the inside of this function with real fetch() calls.
async function postToTikTok(caption) {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const privacyLevel = process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY";

  if (!accessToken) {
    // Safe mode: do not error, just report that we skipped
    console.log(
      "TIKTOK_ACCESS_TOKEN not set; skipping TikTok post. Caption would have been:\n",
      caption
    );
    return { skipped: true, reason: "no access token" };
  }

  // Safe-mode behavior: just log what we would do.
  // Replace this with real TikTok Direct Post logic when you're ready.
  console.log("Would post to TikTok with caption:\n", caption);
  return { ok: true, mock: true, privacy_level: privacyLevel };
}

// Simple HTML view of recent events (for GET in browser)
function renderHtmlView() {
  const rows =
    recentEvents.length === 0
      ? "<p>No events received yet.</p>"
      : recentEvents
          .map((ev, idx) => {
            const safePayload = JSON.stringify(ev.payload, null, 2)
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            const safeCaption = String(ev.caption || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");

            return `
              <div style="border:1px solid #4b5563;border-radius:8px;padding:12px;margin-bottom:12px;">
                <div style="font-size:0.85rem;color:#9ca3af;">#${idx + 1} — ${ev.ts}</div>
                <pre style="background:#020617;color:#e5e7eb;padding:8px;border-radius:4px;overflow:auto;font-size:0.8rem;">${safePayload}</pre>
                <div style="margin-top:8px;font-size:0.8rem;white-space:pre-wrap;">${safeCaption}</div>
              </div>
            `;
          })
          .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>TradingView → Vercel Events</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0;padding:16px;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0b1120;color:#e5e7eb;">
    <h1 style="font-size:1.25rem;margin-bottom:8px;">TradingView → Vercel Events (Debug View)</h1>
    <p style="font-size:0.9rem;color:#9ca3af;">
      This shows the most recent payloads received by <code>/api/tradingview-webhook</code> on this serverless instance.
      It's meant for debugging only, not as permanent storage.
    </p>
    <div style="margin-top:16px;">
      ${rows}
    </div>
  </body>
</html>`;
}

// Main Vercel handler
export default async function handler(req, res) {
  // Simple shared-secret check via query param ?secret=...
  const expectedSecret = getEnv("TRADINGVIEW_SECRET");
  const incomingSecret = req.query.secret;

  if (expectedSecret) {
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.warn("Invalid or missing secret on request");
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  // If GET: show debug HTML page
  if (req.method === "GET") {
    const html = renderHtmlView();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  }

  // Only allow POST for webhooks
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // TradingView usually sends application/json, but we handle string or object.
  let payload = req.body;

  console.log("Raw req.body type:", typeof req.body, "value:", req.body);

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (err) {
      console.error("Failed to parse payload as JSON. Raw body was:", payload);
      return res
        .status(400)
        .json({ error: "Invalid JSON in body", raw: payload });
    }
  }

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Missing or invalid payload" });
  }

  console.log("Received TradingView payload:", payload);

  const caption = buildCaption(payload);

  // Record event for debug view
  addRecentEvent(payload, caption);

  try {
    const tiktokResult = await postToTikTok(caption);

    // Return quickly to TradingView. They just need a 2xx.
    return res.status(200).json({
      ok: true,
      caption_preview: caption,
      tiktok: tiktokResult
    });
  } catch (err) {
    console.error("Error in postToTikTok:", err);
    return res
      .status(500)
      .json({ error: "Internal error", detail: String(err) });
  }
}
