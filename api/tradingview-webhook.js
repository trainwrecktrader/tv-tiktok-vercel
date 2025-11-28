// api/tradingview-webhook.js

export const config = {
  runtime: "nodejs"
};

// Helper: get env with basic error if missing
function getEnv(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`Missing environment variable: ${name}`);
  }
  return v;
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
  const numLimitLow = rawLimitLow !== undefined && rawLimitLow !== null && rawLimitLow !== ""
    ? Number(rawLimitLow)
    : null;
  const numLimitHigh = rawLimitHigh !== undefined && rawLimitHigh !== null && rawLimitHigh !== ""
    ? Number(rawLimitHigh)
    : null;

  const limitLowStr = numLimitLow != null && !Number.isNaN(numLimitLow)
    ? numLimitLow.toString()
    : rawLimitLow != null
      ? String(rawLimitLow)
      : "n/a";

  const limitHighStr = numLimitHigh != null && !Number.isNaN(numLimitHigh)
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
async function postToTikTok(caption) {
  const accessToken = getEnv("TIKTOK_ACCESS_TOKEN");
  const privacyLevel = process.env.TIKTOK_PRIVACY_LEVEL || "SELF_ONLY";

  if (!accessToken) {
    console.warn("TIKTOK_ACCESS_TOKEN not set; skipping TikTok post.");
    return { skipped: true, reason: "no access token" };
  }

  console.log("Would post to TikTok with caption:\n", caption);

  // Real implementation would go here with fetch() to TikTok APIs.

  return { ok: true, mock: true, privacy_level: privacyLevel };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const expectedSecret = getEnv("TRADINGVIEW_SECRET");
  if (expectedSecret) {
    const incomingSecret = req.query.secret;
    if (!incomingSecret || incomingSecret !== expectedSecret) {
      console.warn("Invalid or missing secret on webhook request");
      return res.status(403).json({ error: "Forbidden" });
    }
  }

  let payload = req.body;

  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (err) {
      console.error("Failed to parse payload as JSON:", err);
      return res.status(400).json({ error: "Invalid JSON in body" });
    }
  }

  if (!payload || typeof payload !== "object") {
    return res.status(400).json({ error: "Missing or invalid payload" });
  }

  console.log("Received TradingView payload:", payload);

  const caption = buildCaption(payload);

  try {
    const tiktokResult = await postToTikTok(caption);

    return res.status(200).json({
      ok: true,
      caption_preview: caption,
      tiktok: tiktokResult
    });
  } catch (err) {
    console.error("Error posting to TikTok:", err);
    return res.status(500).json({ error: "Internal error", detail: String(err) });
  }
}
