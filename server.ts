import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { generateChatReply } from "./src/serverChat";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "3mb" }));

app.post("/api/chat-reply", async (req, res) => {
  try {
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
