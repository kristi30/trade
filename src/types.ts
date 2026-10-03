export type ArchetypeId = "idealist" | "adventurer" | "homebody" | "witty" | "thinker";

export interface ArchetypeDetails {
  id: ArchetypeId;
  name: string;
  tagline: string;
  description: string;
  gradient: string;
  textColor: string;
  sparkColor: string;
  traits: string[];
}

export interface Profile {
  id: string;
  name: string;
  age: number;
  gender: string;
  lookingFor: string;
  location: string;
  archetype: ArchetypeId;
  quizAnswers: Record<string, string>;
  bio: string;
  sparkPrompts: Record<string, string>;
  isAI?: boolean;
  latitude?: number;
  longitude?: number;
}

export interface Match {
  id: string;
  users: string[];
  createdAt: any;
  score: number;
  unlocked?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  imageUrl?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: {
    text: string;
    archetype: ArchetypeId;
  }[];
}