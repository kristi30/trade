import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateChatReply } from "./src/serverChat";
import { moderateImageDataUrl } from "./src/serverModeration";
import { checkRateLimit } from "./src/serverRateLimit";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "8mb" }));

app.post("/api/moderate-image", async (req, res) => {
  try {
    const rate = checkRateLimit(`moderation:${req.ip}`, 12, 60_000);
    if (!rate.allowed) return res.status(429).json({ allowed: false, reason: "Too many requests" });
    const imageDataUrl = req.body?.imageDataUrl;
    if (!imageDataUrl || typeof imageDataUrl !== "string") {
      return res.status(400).json({ allowed: false, reason: "imageDataUrl is required" });
    }
    if (imageDataUrl.length > 8_000_000) {
      return res.status(413).json({ allowed: false, reason: "Image is too large" });
    }
    const result = await moderateImageDataUrl(imageDataUrl);
    return res.status(result.allowed ? 200 : 422).json(result);
  } catch (error) {
    console.error("Error in /api/moderate-image:", error);
    return res.status(500).json({ allowed: false, reason: "Moderation failed" });
  }
});

app.post("/api/chat-reply", async (req, res) => {
  try {
    const rate = checkRateLimit(`chat:${req.ip}`, 20, 60_000);
    if (!rate.allowed) return res.status(429).json({ error: "Too many requests" });
    const { matchedUser, currentUser, messages } = req.body || {};
    if (!matchedUser || !currentUser || !Array.isArray(messages)) {
      return res.status(400).json({ error: "matchedUser, currentUser and messages are required" });
    }
    const result = await generateChatReply({ matchedUser, currentUser, messages });
    return res.json(result);
  } catch (error: any) {
    console.error("Error in /api/chat-reply:", error);
    return res.status(500).json({ error: "Failed to generate simulated response." });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
