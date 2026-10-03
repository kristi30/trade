export type ArchetypeId = "idealist" | "adventurer" | "homebody" | "witty" | "thinker";

export interface ArchetypeDetails {
  id: ArchetypeId;
  name: string;
  tagline: string;
  description: string;
  gradient: string; // Tailwind class string
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
  users: string[]; // Two user IDs
  createdAt: any; // Firestore Timestamp
  score: number; // 0-100 Compatibility Score
  unlocked?: boolean;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any; // Firestore Timestamp
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
