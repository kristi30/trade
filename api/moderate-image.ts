import { moderateImageDataUrl } from "../src/serverModeration";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ allowed: false, reason: "Method not allowed" });
  }

  const imageDataUrl = req.body?.imageDataUrl;
  if (!imageDataUrl || typeof imageDataUrl !== "string") {
    return res.status(400).json({ allowed: false, reason: "imageDataUrl is required" });
  }

  if (imageDataUrl.length > 8_000_000) {
    return res.status(413).json({ allowed: false, reason: "Image is too large" });
  }

  const result = await moderateImageDataUrl(imageDataUrl);
  return res.status(result.allowed ? 200 : 422).json(result);
}
