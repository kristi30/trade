import { ArchetypeId } from "./types";

export function calculateCompatibility(userArch: ArchetypeId, matchArch: ArchetypeId): { score: number; reasons: string[] } {
  if (userArch === matchArch) {
    return {
      score: 98,
      reasons: [
        "Mirror Resonance: You both share the exact same Personality Archetype.",
        "Identical communication frequencies and emotional needs.",
        "Aligned social battery thresholds and weekend pacing."
      ]
    };
  }

  const pairs: Record<ArchetypeId, Partial<Record<ArchetypeId, { score: number; reasons: string[] }>>> = {
    idealist: {
      thinker: {
        score: 92,
        reasons: [
          "Perfect symmetry of deep emotion and complex intellect.",
          "Idealists invite creative inspiration, while Thinkers offer logical grounding.",
          "Conversations are deeply introspective, covering art, meaning, and detail."
        ]
      },
      homebody: {
        score: 88,
        reasons: [
          "High-compatibility sanctuary dynamics.",
          "Shared love for soft, quiet evenings, long conversations under dim lighting, and mutual vulnerability.",
          "Both prioritize stability, emotional safety, and peaceful spaces."
        ]
      },
      witty: {
        score: 82,
        reasons: [
          "Banter meets soul.",
          "Witty profiles inject bright humor and laughter, lightening the Idealist's heavy philosophical weights.",
          "Shared appreciation for wordplay and creative expression."
        ]
      },
      adventurer: {
        score: 74,
        reasons: [
          "Dreamer & Wanderer synergy.",
          "You align on broad visual perspectives, sharing exciting future dreams and creative pursuits."
        ]
      }
    },
    adventurer: {
      witty: {
        score: 94,
        reasons: [
          "Electric chemistry filled with constant banter, movement, and play.",
          "Spontaneous itineraries are perfectly complemented by quick humor and shared laughs.",
          "Both of you operate with high social energy and love trying new experiences."
        ]
      },
      thinker: {
        score: 78,
        reasons: [
          "Curiosity convergence.",
          "Adventurers push Thinkers out of their heads, while Thinkers provide curious, analytical depth to adventures."
        ]
      },
      homebody: {
        score: 68,
        reasons: [
          "Action & Rest balance.",
          "The Adventurer expands horizons while the Homebody provides a warm, comforting harbor to return to."
        ]
      }
    },
    homebody: {
      thinker: {
        score: 89,
        reasons: [
          "Intellectual tranquility.",
          "Both appreciate quiet observation, vintage record listening, slow mornings, and low-stimulation environments.",
          "Extremely cozy and stable connection potential."
        ]
      },
      witty: {
        score: 79,
        reasons: [
          "Playful security.",
          "Warm home environments become the perfect stage for inside jokes, movie nights, and friendly roasts."
        ]
      }
    },
    witty: {},
    thinker: {}
  };

  // Check reciprocal mappings
  const direct = pairs[userArch]?.[matchArch];
  if (direct) return direct;

  const reversed = pairs[matchArch]?.[userArch];
  if (reversed) return reversed;

  // Default fallback match
  return {
    score: 75,
    reasons: [
      "Complementary personality angles that offer fresh, exciting perspectives.",
      "Varying social energies that encourage balanced relationship development."
    ]
  };
}
