import { GoogleGenAI } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient() {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  client = new GoogleGenAI({ apiKey });
  return client;
}

function parseDataUrl(imageDataUrl: string) {
  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export async function moderateImageDataUrl(imageDataUrl: string) {
  const image = parseDataUrl(imageDataUrl);
  if (!image) return { allowed: false, reason: "Invalid image data." };

  const ai = getClient();
  if (!ai) {
    return { allowed: false, reason: "Image moderation is not configured." };
  }

  const prompt = `
Review this user-uploaded dating-app image for safety.
Return JSON only with this shape:
{"allowed": boolean, "reason": string}

Reject if the image contains:
- explicit sexual/nude content;
- sexual content involving or appearing to involve minors;
- graphic violence or gore;
- hateful extremist imagery;
- clearly illegal drug sales or weapon threats;
- personally identifying documents, passwords, payment cards, QR codes for payments, or other high-risk private credentials.

Normal selfies, clothing, beaches, fitness photos, food, travel, pets, art, and ordinary social photos should be allowed.
If uncertain about nudity or age-sensitive sexual content, reject.
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: image.mimeType, data: image.data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text?.trim() || "";
    const parsed = JSON.parse(text);
    return {
      allowed: Boolean(parsed.allowed),
      reason: String(parsed.reason || (parsed.allowed ? "Allowed" : "Rejected")),
    };
  } catch (error) {
    console.warn("Image moderation failed:", error);
    return { allowed: false, reason: "Could not verify this image safely." };
  }
}
