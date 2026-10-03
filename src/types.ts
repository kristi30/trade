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
  heightCm?: number;
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
  createdAt?: any;
  updatedAt?: any;
  ageVerified?: boolean;
  verificationStatus?: "self_confirmed" | "pending" | "verified" | "rejected";
  isPaused?: boolean;
}

export interface Match {
  id: string;
  users: string[];
  createdAt: any;
  score: number;
  unlocked?: boolean;
  isDemo?: boolean;
  readBy?: Record<string, any>;
  typing?: Record<string, boolean>;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: any;
  imageUrl?: string;
  audioUrl?: string;
  replyToId?: string;
  replyToText?: string;
  reaction?: string;
}

export interface QuizQuestion {
  id: string;
  question: string;
  options: {
    text: string;
    archetype: ArchetypeId;
  }[];
}

export interface LikeRecord {
  fromUserId: string;
  toUserId: string;
  createdAt: any;
}

export interface ReportRecord {
  reporterId: string;
  reportedUserId: string;
  matchId?: string;
  reason: string;
  details?: string;
  createdAt: any;
}
