import { generateChatReply } from "../src/serverChat";
import { checkRateLimit } from "../src/serverRateLimit";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const clientKey = String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "chat");
    const rate = checkRateLimit(`chat:${clientKey}`, 20, 60_000);
    if (!rate.allowed) {
      res.setHeader("Retry-After", Math.ceil(rate.retryAfterMs / 1000));
      return res.status(429).json({ error: "Too many requests" });
    }

    const { matchedUser, currentUser, messages } = req.body || {};
    if (!matchedUser || !currentUser || !Array.isArray(messages)) {
      return res.status(400).json({ error: "matchedUser, currentUser and messages are required" });
    }
    const result = await generateChatReply({ matchedUser, currentUser, messages });
    return res.status(200).json(result);
  } catch (error: any) {
    console.error("/api/chat-reply failed", error);
    return res.status(500).json({ error: "Failed to generate reply" });
  }
}
