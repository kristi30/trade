import { Message, Profile } from "./types";

export type PhotoAllowance = number;

export function countTextMessages(messages: Message[]): number {
  return messages.filter((m) => (m.text || "").trim().length > 0).length;
}

export function getPhotoAllowance(totalTextMessages: number): PhotoAllowance {
  if (totalTextMessages >= 80) return Infinity;
  if (totalTextMessages >= 50) return 2;
  if (totalTextMessages >= 30) return 1;
  return 0;
}

export function getNextPhotoMilestone(totalTextMessages: number): number | null {
  if (totalTextMessages < 30) return 30;
  if (totalTextMessages < 50) return 50;
  if (totalTextMessages < 80) return 80;
  return null;
}

const BOT_PHOTOS: Record<string, string[]> = {
  idealist: [
    "/demo-photos/stars.svg",
    "/demo-photos/sunset.svg",
    "/demo-photos/journal.svg",
  ],
  thinker: [
    "/demo-photos/cafe.svg",
    "/demo-photos/records.svg",
    "/demo-photos/books.svg",
  ],
  adventurer: [
    "/demo-photos/mountains.svg",
    "/demo-photos/sunset.svg",
    "/demo-photos/cafe.svg",
  ],
  witty: [
    "/demo-photos/arcade.svg",
    "/demo-photos/cafe.svg",
    "/demo-photos/sunset.svg",
  ],
  homebody: [
    "/demo-photos/cozy.svg",
    "/demo-photos/books.svg",
    "/demo-photos/cafe.svg",
  ],
};

export function getBotPhotoForConversation(
  messages: Message[],
  partnerProfile: Profile,
  forceNewlyUnlockedSlot = false,
): string | undefined {
  const totalTextMessages = countTextMessages(messages);
  const allowance = getPhotoAllowance(totalTextMessages);
  const alreadySent = messages.filter((m) => m.senderId === partnerProfile.id && !!m.imageUrl).length;

  if (allowance !== Infinity && alreadySent >= allowance) return undefined;
  if (allowance === 0) return undefined;

  const photos = BOT_PHOTOS[partnerProfile.archetype] || BOT_PHOTOS.idealist;

  // At 30 and 50 messages, give the demo partner a chance to use the newly unlocked slot.
  // For a local fallback we force it once the slot is available so the feature is easy to test.
  const newlyUnlocked =
    (totalTextMessages >= 30 && alreadySent === 0) ||
    (totalTextMessages >= 50 && alreadySent === 1);

  if (newlyUnlocked && forceNewlyUnlockedSlot) {
    return photos[alreadySent % photos.length];
  }

  if (newlyUnlocked && Math.random() < 0.55) {
    return photos[alreadySent % photos.length];
  }

  if (allowance === Infinity && Math.random() < 0.18) {
    return photos[alreadySent % photos.length];
  }

  return undefined;
}

function includesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function detectLanguage(text: string): "en" | "it" | "sq" {
  const t = text.toLowerCase();
  if (/[ëç]/.test(t) || includesAny(t, [" cfare ", " çfarë ", " pse ", " ku ", " kur ", " si je", "jam ", "ti je", "shqip"])) {
    return "sq";
  }
  if (includesAny(` ${t} `, [" come ", " cosa ", " perché ", " perche ", " dove ", " quando ", " quale ", " sei ", " sono ", " piace ", " italiano ", " dimmi "])) {
    return "it";
  }
  return "en";
}

function firstPromptAnswer(profile: Profile): string {
  return Object.values(profile.sparkPrompts || {}).find((v) => !!v?.trim()) || profile.bio || "";
}

function archetypeTone(archetype: Profile["archetype"], lang: "en" | "it" | "sq") {
  const tones = {
    en: {
      idealist: ["I like conversations that actually mean something.", "I get attached to little details people remember."],
      thinker: ["I usually overthink things in a good way 😅", "I can talk for ages when a topic gets interesting."],
      adventurer: ["I’m happiest when there’s something new to do.", "I’m very much a ‘let’s just go’ person."],
      witty: ["I cope with almost everything through jokes, not gonna lie.", "Banter is basically a compatibility test for me."],
      homebody: ["I’m pretty low-key and I love calm, cozy plans.", "I recharge best when things are simple and comfortable."],
    },
    it: {
      idealist: ["Mi piacciono le conversazioni che significano davvero qualcosa.", "Mi affeziono molto ai piccoli dettagli che una persona ricorda."],
      thinker: ["Tendo a pensare tanto alle cose, ma in senso buono 😅", "Se un argomento mi prende posso parlarne per ore."],
      adventurer: ["Sto meglio quando c’è qualcosa di nuovo da fare.", "Sono molto tipo ‘andiamo e vediamo che succede’."],
      witty: ["Onestamente affronto quasi tutto con un po’ di ironia.", "Per me il banter è quasi un test di compatibilità."],
      homebody: ["Sono abbastanza tranquillo/a e adoro i piani semplici e cozy.", "Mi ricarico meglio quando tutto è calmo e senza caos."],
    },
    sq: {
      idealist: ["Më pëlqejnë bisedat që kanë vërtet kuptim.", "Më mbeten shumë në mendje detajet e vogla që dikush kujton."],
      thinker: ["Mendoj shumë për gjërat, por në mënyrën e mirë 😅", "Kur një temë më intereson mund të flas gjatë për të."],
      adventurer: ["Ndihem më mirë kur ka diçka të re për të bërë.", "Jam shumë tip ‘hajde ikim dhe shohim çfarë ndodh’."],
      witty: ["Sinqerisht, humorin e përdor pothuajse për çdo gjë.", "Për mua batutat janë pak si test kompatibiliteti."],
      homebody: ["Jam tip i qetë dhe më pëlqejnë planet e thjeshta e cozy.", "Karikohem më mirë kur gjithçka është e qetë."],
    },
  } as const;
  const choices = tones[lang][archetype] || tones[lang].idealist;
  return choices[Math.floor(Math.random() * choices.length)];
}

export function generateLocalHumanReply(
  latestUserText: string,
  partnerProfile: Profile,
  currentUser: Profile,
  messages: Message[],
): string {
  const raw = (latestUserText || "").trim();
  const text = raw.toLowerCase();
  const lang = detectLanguage(raw);
  const promptAnswer = firstPromptAnswer(partnerProfile);
  const isQuestion = raw.includes("?") || includesAny(text, [
    "what", "why", "how", "where", "when", "who", "do you", "are you", "can you",
    "cosa", "come", "perché", "perche", "dove", "quando", "chi", "ti piace", "sei",
    "çfarë", "cfare", "pse", "ku", "kur", "si je", "a je",
  ]);

  if (includesAny(text, ["how are you", "come stai", "si je"])) {
    return lang === "it"
      ? "Sto bene, giornata abbastanza tranquilla. E ora questa chat è la parte più interessante 😄"
      : lang === "sq"
      ? "Jam mirë, ditë goxha e qetë. Tani kjo bisedë është pjesa më interesante 😄"
      : "I’m good, pretty calm day honestly. This chat is the most interesting part now 😄";
  }

  if (includesAny(text, ["how old", "quanti anni", "sa vjeç", "sa vjec", "age"])) {
    return lang === "it"
      ? `Ho ${partnerProfile.age} anni.`
      : lang === "sq"
      ? `Jam ${partnerProfile.age} vjeç.`
      : `I’m ${partnerProfile.age}.`;
  }

  if (includesAny(text, ["where do you live", "where are you from", "dove vivi", "di dove sei", "ku jeton", "nga je", "location"])) {
    return lang === "it"
      ? `Sono in zona ${partnerProfile.location}. Mi piace perché è abbastanza vivibile senza essere troppo noiosa.`
      : lang === "sq"
      ? `Jam në zonën e ${partnerProfile.location}. Më pëlqen sepse është e qetë por jo e mërzitshme.`
      : `I’m around ${partnerProfile.location}. I like it because it’s calm without feeling boring.`;
  }

  if (includesAny(text, ["what do you like", "what are you into", "hobbies", "cosa ti piace", "hobby", "çfarë të pëlqen", "cfare te pelqen"])) {
    return lang === "it"
      ? `Mi riconosco molto in questo: ${promptAnswer || partnerProfile.bio}. Però dipende dal mood, non sono sempre uguale.`
      : lang === "sq"
      ? `Më përshkruan shumë kjo: ${promptAnswer || partnerProfile.bio}. Po varet edhe nga humori, s’jam gjithmonë njësoj.`
      : `This is pretty me: ${promptAnswer || partnerProfile.bio}. Depends on the mood though, I’m not exactly the same every day.`;
  }

  if (includesAny(text, ["what are you looking for", "relationship", "cosa cerchi", "relazione", "çfarë kërkon", "cfare kerkon"])) {
    return lang === "it"
      ? "Qualcosa di vero, ma senza forzare subito le cose. Prima voglio vedere se parlare viene naturale e se c’è curiosità reciproca."
      : lang === "sq"
      ? "Diçka reale, por pa e detyruar menjëherë. Fillimisht dua të shoh nëse biseda vjen natyrshëm dhe ka interes nga të dyja anët."
      : "Something real, but I don’t want to force it too fast. I’d rather see if talking feels natural and there’s mutual curiosity first.";
  }

  if (includesAny(text, ["what are you doing", "what you doing", "cosa fai", "che fai", "çfarë po bën", "cfare po ben"])) {
    return lang === "it"
      ? "Niente di troppo interessante 😅 mi sto rilassando un po’ e rispondendo qui. Tu?"
      : lang === "sq"
      ? "Asgjë shumë interesante 😅 po qetësohem pak dhe po të përgjigjem këtu. Ti?"
      : "Nothing very dramatic 😅 just winding down a bit and replying here. You?";
  }

  if (includesAny(text, ["music", "song", "musica", "canzone", "muzik", "këngë", "kenge"])) {
    return lang === "it"
      ? "Dipende tantissimo dal momento, ma mi piace la musica che crea atmosfera più che quella che metti solo come rumore di fondo."
      : lang === "sq"
      ? "Varet shumë nga momenti, por më pëlqen muzika që krijon atmosferë, jo thjesht zhurmë në sfond."
      : "It changes a lot with my mood, but I like music that creates a whole atmosphere more than background noise.";
  }

  if (includesAny(text, ["date", "first date", "primo appuntamento", "appuntamento", "takim", "takimi i parë", "takimi i pare"])) {
    return lang === "it"
      ? "Per un primo appuntamento sceglierei qualcosa dove si può davvero parlare. Un caffè carino, una passeggiata e zero pressione."
      : lang === "sq"
      ? "Për takimin e parë do zgjidhja diçka ku mund të flasim vërtet. Kafe e mirë, një shëtitje dhe pa presion."
      : "For a first date I’d pick something where we can actually talk. Good coffee, a walk, and zero pressure.";
  }

  if (isQuestion) {
    const base = archetypeTone(partnerProfile.archetype, lang);
    return lang === "it"
      ? `Bella domanda. ${base} Non voglio inventarmi una risposta perfetta solo per fare colpo.`
      : lang === "sq"
      ? `Pyetje e mirë. ${base} S’dua të shpik një përgjigje perfekte vetëm për të bërë përshtypje.`
      : `Good question. ${base} I don’t want to make up a perfect answer just to sound impressive.`;
  }

  const previousUserText = [...messages]
    .reverse()
    .find((m) => m.senderId === currentUser.id && (m.text || "").trim() && m.text !== latestUserText)?.text;

  const tone = archetypeTone(partnerProfile.archetype, lang);
  if (previousUserText && raw.length < 45) {
    return lang === "it"
      ? `${raw ? "Ahah, capito 😄" : "Sì, ti seguo."} ${tone}`
      : lang === "sq"
      ? `${raw ? "Hahaha, e kuptova 😄" : "Po, të ndjek."} ${tone}`
      : `${raw ? "haha, I get you 😄" : "yeah, I’m with you."} ${tone}`;
  }

  return lang === "it"
    ? `${tone} Mi piace che questa conversazione non sembri la solita chat da app.`
    : lang === "sq"
    ? `${tone} Më pëlqen që kjo bisedë s’po duket si një chat tipik aplikacioni.`
    : `${tone} I like that this doesn’t feel like the usual dating-app small talk.`;
}
