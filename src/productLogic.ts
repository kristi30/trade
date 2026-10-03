import { ARCHETYPES, QUIZ_QUESTIONS } from "./data";
import { Profile } from "./types";
import { calculateCompatibility } from "./utils";

export type ConversationStage = {
  label: string;
  description: string;
  unlocked: boolean;
  threshold: number;
};

export function getConversationStages(textCount: number): ConversationStage[] {
  return [
    { threshold: 0, label: "Personality", description: "Personality type and core profile", unlocked: true },
    { threshold: 15, label: "Extra prompt", description: "One deeper profile answer unlocks", unlocked: textCount >= 15 },
    { threshold: 30, label: "First photo", description: "1 photo each", unlocked: textCount >= 30 },
    { threshold: 50, label: "Second photo", description: "2 photos each total", unlocked: textCount >= 50 },
    { threshold: 80, label: "Photos open", description: "Unlimited photo sharing", unlocked: textCount >= 80 },
    { threshold: 100, label: "Voice", description: "Voice notes unlock", unlocked: textCount >= 100 },
  ];
}

export function getNextConversationStage(textCount: number) {
  return getConversationStages(textCount).find((stage) => !stage.unlocked) || null;
}

export function getSharedQuizAnswers(a: Profile, b: Profile) {
  const shared: { question: string; answer: string }[] = [];
  for (const question of QUIZ_QUESTIONS) {
    const aIndex = a.quizAnswers?.[question.id];
    const bIndex = b.quizAnswers?.[question.id];
    if (aIndex === undefined || bIndex === undefined || aIndex !== bIndex) continue;
    const option = question.options[Number(aIndex)];
    if (option) shared.push({ question: question.question, answer: option.text });
  }
  return shared;
}

export function getCompatibilitySummary(a: Profile, b: Profile) {
  const base = calculateCompatibility(a.archetype, b.archetype);
  const shared = getSharedQuizAnswers(a, b);
  const reasons = [...base.reasons];
  if (shared.length) {
    reasons.unshift(`You both chose “${shared[0].answer}” for ${shared[0].question.toLowerCase()}`);
  }
  const aType = ARCHETYPES[a.archetype];
  const bType = ARCHETYPES[b.archetype];
  return {
    ...base,
    reasons: reasons.slice(0, 4),
    label: `${aType.name} × ${bType.name}`,
    shared,
  };
}

export function getConversationStarter(a: Profile, b: Profile) {
  const shared = getSharedQuizAnswers(a, b);
  if (shared.length) {
    return `You both picked “${shared[0].answer}”. What does that look like in real life for you?`;
  }
  const prompt = Object.entries(b.sparkPrompts || {})[0];
  if (prompt) return `${prompt[0]} — ${b.name} said “${prompt[1]}”. What would your answer be?`;
  const trait = ARCHETYPES[b.archetype]?.traits?.[0] || "curious";
  return `${b.name} comes across as ${trait.toLowerCase()}. What is something you could talk about for hours?`;
}

export function formatHeight(cm?: number) {
  if (!cm) return "";
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return `${cm} cm · ${feet}′${inches}″`;
}
