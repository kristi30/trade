import { GoogleGenAI } from "@google/genai";
import { Message, Profile } from "./types";
import {
  countTextMessages,
  generateLocalHumanReply,
  getBotPhotoForConversation,
} from "./chatLogic";

let aiClient: GoogleGenAI | null = null;

function getAiClient() {
  if (aiClient) return aiClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  aiClient = new GoogleGenAI({ apiKey });
  return aiClient;
}

export async function generateChatReply({
  matchedUser,
  currentUser,
  messages,
}: {
  matchedUser: Profile;
  currentUser: Profile;
  messages: Message[];
}) {
  const latestUserMessage = [...messages]
    .reverse()
    .find((m) => m.senderId === currentUser.id && (m.text || "").trim());

  const fallbackReply = generateLocalHumanReply(
    latestUserMessage?.text || "",
    matchedUser,
    currentUser,
    messages,
  );

  const imageUrl = getBotPhotoForConversation(messages, matchedUser, false);
  const ai = getAiClient();
  if (!ai) {
    return { reply: fallbackReply, ...(imageUrl ? { imageUrl } : {}) };
  }

  const textCount = countTextMessages(messages);
  const history = messages.slice(-24).map((msg) => {
    const speaker = msg.senderId === currentUser.id ? currentUser.name : matchedUser.name;
    const photo = msg.imageUrl ? " [sent a photo]" : "";
    return `${speaker}: ${(msg.text || "").trim()}${photo}`;
  }).join("\n");

  const promptPairs = Object.entries(matchedUser.sparkPrompts || {})
    .map(([q, a]) => `- ${q}: ${a}`)
    .join("\n");

  const prompt = `
You are ${matchedUser.name}, a real-feeling person chatting on a personality-first dating app called blindSpark.
Stay fully in character. Never mention being an AI, bot, simulation, prompt, model, or system.

YOUR PROFILE
Name: ${matchedUser.name}
Age: ${matchedUser.age}
Personality type: ${matchedUser.archetype}
Location: ${matchedUser.location}
Bio: ${matchedUser.bio}
Profile answers:
${promptPairs || "- none"}

THE PERSON YOU ARE CHATTING WITH
Name: ${currentUser.name}
Age: ${currentUser.age}
Personality type: ${currentUser.archetype}
Location: ${currentUser.location}
Bio: ${currentUser.bio}

RECENT CONVERSATION
${history || "No messages yet."}

There are ${textCount} text messages in the conversation so far.

Write ONLY your next chat message.

Rules:
- Reply in the same language as the user's latest message. Mirror their level of formality, slang, and message length.
- If they ask a direct question, answer it directly first. If they ask multiple questions, answer all of them briefly.
- Use details from the conversation and profiles when relevant so it feels like you remember them.
- Do not invent major personal facts that conflict with the profile. If something is unknown, answer naturally instead of pretending.
- Do not end every reply with a question. Sometimes just react, tease, share an opinion, or continue the topic.
- Avoid repetitive dating-app clichés, therapy-speak, overly poetic language, and generic compliments.
- Sound human: contractions, occasional lowercase, short reactions, mild imperfections, and varied sentence length are good.
- Usually write 1-4 short sentences. Longer only when the user genuinely asks for an explanation.
- Use emojis sparingly and only when they fit the other person's tone.
- If their latest message included a photo, react naturally to receiving a photo without claiming to identify private/sensitive traits.
${imageUrl ? `- You are also sending a newly unlocked photo (${imageUrl}). Mention it casually only if that feels natural.` : "- Do not claim you are sending a photo in this message."}
`.trim();

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });
    const reply = response.text?.trim() || fallbackReply;
    return { reply, ...(imageUrl ? { imageUrl } : {}) };
  } catch (error) {
    console.warn("AI reply generation failed; using local conversational fallback.", error);
    return { reply: fallbackReply, ...(imageUrl ? { imageUrl } : {}) };
  }
}
