import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  AlertCircle,
  Info,
  MapPin,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { db } from "../lib/firebase";
import { ARCHETYPES, SEED_PROFILES } from "../data";
import { Match, Profile } from "../types";
import {
  formatHeight,
  getCompatibilitySummary,
  getConversationStarter,
} from "../productLogic";
import BlindArt from "./BlindArt";

let cachedRawProfiles: Profile[] | null = null;

function getDistanceKm(lat1?: number, lon1?: number, lat2?: number, lon2?: number): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) return Infinity;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface DiscoveryProps {
  currentUser: Profile;
  onMatchCreated: (match: Match, partnerProfile: Profile) => void;
}

export default function Discovery({ currentUser, onMatchCreated }: DiscoveryProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(!cachedRawProfiles);
  const [showMatchModal, setShowMatchModal] = useState<{ match: Match; partner: Profile } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_");
  const minAge = Number(localStorage.getItem(`blindspark_min_age_${currentUser.id}`) || "18");
  const maxAge = Number(localStorage.getItem(`blindspark_max_age_${currentUser.id}`) || "60");
  const maxDistance = Number(localStorage.getItem(`blindspark_max_distance_${currentUser.id}`) || "60");
  const blockedIds: string[] = JSON.parse(localStorage.getItem(`blindspark_blocked_${currentUser.id}`) || "[]");
  const skippedIds: string[] = JSON.parse(localStorage.getItem(`blindspark_skipped_${currentUser.id}`) || "[]");

  useEffect(() => {
    async function fetchProfiles() {
      setLoading(true);
      let fetched: Profile[] = [];

      if (isLocalMode) {
        fetched = SEED_PROFILES.map((profile, index) => ({
          ...profile,
          id: `seed_${profile.name.toLowerCase()}`,
          isAI: true,
          heightCm: profile.heightCm || 162 + ((index * 7) % 27),
        } as Profile));
      } else {
        try {
          const snapshot = await getDocs(collection(db, "profiles"));
          snapshot.forEach((item) => {
            const profile = item.data() as Profile;
            if (profile.id !== currentUser.id && !profile.isAI) fetched.push(profile);
          });
        } catch (error) {
          console.warn("Could not load real profiles:", error);
        }
      }

      cachedRawProfiles = fetched;
      processProfiles(fetched);
      setLoading(false);
    }

    function processProfiles(raw: Profile[]) {
      const normalized = raw.map((profile) => {
        if (!isLocalMode) return profile;
        return {
          ...profile,
          location: currentUser.location || profile.location,
          latitude: currentUser.latitude,
          longitude: currentUser.longitude,
        };
      });

      const filtered = normalized.filter((profile) => {
        if (blockedIds.includes(profile.id) || skippedIds.includes(profile.id)) return false;
        if (profile.age < minAge || profile.age > maxAge) return false;

        const userFlexible = !currentUser.gender || currentUser.gender === "unspecified";
        const wantsFlexible = !currentUser.lookingFor || currentUser.lookingFor === "everyone";
        const genderFits = wantsFlexible || currentUser.lookingFor === profile.gender;
        const theyWantUs =
          userFlexible ||
          profile.lookingFor === "everyone" ||
          profile.lookingFor === currentUser.gender;

        if (!genderFits || !theyWantUs) return false;

        if (!isLocalMode) {
          const distance = getDistanceKm(
            currentUser.latitude,
            currentUser.longitude,
            profile.latitude,
            profile.longitude,
          );
          if (Number.isFinite(distance) && distance > maxDistance) return false;
        }

        return true;
      });

      setCurrentIndex(0);
      setProfiles([...filtered].sort(() => Math.random() - 0.5));
    }

    void fetchProfiles();
  }, [
    currentUser.id,
    currentUser.gender,
    currentUser.lookingFor,
    currentUser.location,
    currentUser.latitude,
    currentUser.longitude,
    isLocalMode,
  ]);

  const activeProfile = profiles[currentIndex];
  const compatibility = useMemo(
    () => activeProfile ? getCompatibilitySummary(currentUser, activeProfile) : null,
    [currentUser, activeProfile],
  );

  const rememberAction = (liked: boolean, profileId: string) => {
    if (liked) {
      const key = `blindspark_sparks_sent_${currentUser.id}`;
      localStorage.setItem(key, String(Number(localStorage.getItem(key) || "0") + 1));
    } else {
      const key = `blindspark_skipped_${currentUser.id}`;
      const skipped: string[] = JSON.parse(localStorage.getItem(key) || "[]");
      if (!skipped.includes(profileId)) skipped.push(profileId);
      localStorage.setItem(key, JSON.stringify(skipped));
    }
  };

  const createMatch = async (partner: Profile, isDemo: boolean) => {
    const compat = getCompatibilitySummary(currentUser, partner);
    const matchId = [currentUser.id, partner.id].sort().join("_");
    const matchData: Match = {
      id: matchId,
      users: [currentUser.id, partner.id],
      createdAt: new Date(),
      score: compat.score,
      unlocked: false,
      isDemo,
    };

    const localKey = `blindspark_matches_${currentUser.id}`;
    const current: Match[] = JSON.parse(localStorage.getItem(localKey) || "[]");
    if (!current.some((match) => match.id === matchId)) {
      current.push(matchData);
      localStorage.setItem(localKey, JSON.stringify(current));
    }

    if (!isLocalMode && !isDemo) {
      await setDoc(doc(db, "matches", matchId), {
        ...matchData,
        createdAt: serverTimestamp(),
        readBy: {
          [currentUser.id]: serverTimestamp(),
        },
      }, { merge: true });
    }

    setShowMatchModal({ match: matchData, partner });
  };

  const handleRealSpark = async (partner: Profile) => {
    const myLikeId = `${currentUser.id}_${partner.id}`;
    const reciprocalId = `${partner.id}_${currentUser.id}`;

    await setDoc(doc(db, "likes", myLikeId), {
      fromUserId: currentUser.id,
      toUserId: partner.id,
      createdAt: serverTimestamp(),
    });

    const reciprocal = await getDoc(doc(db, "likes", reciprocalId));
    if (reciprocal.exists()) {
      await createMatch(partner, false);
    }
  };

  const handleSwipe = async (liked: boolean) => {
    if (!activeProfile || isSwiping) return;
    setIsSwiping(true);
    rememberAction(liked, activeProfile.id);

    try {
      if (liked) {
        if (isLocalMode) {
          if (Math.random() < 0.25) await createMatch(activeProfile, true);
        } else {
          await handleRealSpark(activeProfile);
        }
      }
    } catch (error) {
      console.warn("Spark action failed:", error);
    }

    setDragX(0);
    setCurrentIndex((index) => index + 1);
    window.setTimeout(() => setIsSwiping(false), 260);
  };

  const handleResetDiscovery = () => {
    if (isLocalMode) {
      localStorage.removeItem(`blindspark_skipped_${currentUser.id}`);
    }
    setCurrentIndex(0);
    setProfiles((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  if (loading) {
    return (
      <div className="min-h-[65vh] flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-[#e84962] animate-spin" />
      </div>
    );
  }

  if (!activeProfile) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-8">
        <div className="w-24 h-24 rounded-[30px] bg-[#fde3e8] flex items-center justify-center mb-7">
          <AlertCircle className="w-12 h-12 text-[#df4860]" />
        </div>
        <h2 className="text-[28px] font-black">
          {isLocalMode ? "You reached the end" : "No profiles fit right now"}
        </h2>
        <p className="text-[#796a64] text-[17px] mt-3 leading-relaxed">
          {isLocalMode
            ? "You have seen the current demo pool."
            : "Real accounts never mix with demo bots. Try widening your discovery preferences or check back when more people join."}
        </p>
        {isLocalMode && (
          <button onClick={handleResetDiscovery} className="mt-7 px-7 py-4 rounded-[22px] bg-gradient-to-r from-[#df4a60] to-[#ef7938] text-white font-black">
            Start again
          </button>
        )}
      </div>
    );
  }

  const archetype = ARCHETYPES[activeProfile.archetype];
  const isDemoProfile = Boolean(activeProfile.isAI || activeProfile.id.startsWith("seed_"));
  const stableHash = [...activeProfile.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const demoDistanceKm = 5 + (stableHash % 18);
  const actualDistance = getDistanceKm(
    currentUser.latitude,
    currentUser.longitude,
    activeProfile.latitude,
    activeProfile.longitude,
  );
  const distance = isDemoProfile
    ? `${demoDistanceKm} km (simulated)`
    : Number.isFinite(actualDistance)
      ? `${actualDistance.toFixed(0)} km`
      : "Nearby";

  return (
    <div className="px-5 pt-5 pb-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[32px] leading-none font-black tracking-[-0.045em]">Discover</h1>
          <p className="text-[17px] text-[#7c6c66] mt-2">
            {isLocalMode ? `${profiles.length} demo profiles for you` : "Real people · mutual Sparks only"}
          </p>
        </div>
        <button type="button" className="w-14 h-14 rounded-full border-2 border-[#2b1b18] bg-white flex items-center justify-center">
          <SlidersHorizontal className="w-6 h-6" />
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeProfile.id}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.9}
          dragMomentum={false}
          onDrag={(_, info) => setDragX(info.offset.x)}
          onDragEnd={(_, info) => {
            if (info.offset.x > 95) void handleSwipe(true);
            else if (info.offset.x < -95) void handleSwipe(false);
            else setDragX(0);
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0, rotate: dragX / 32 }}
          exit={{ opacity: 0, scale: 0.96 }}
          style={{ touchAction: "pan-y" }}
          className={`relative rounded-[34px] border-2 border-[#2b1b18] overflow-hidden bg-white shadow-[0_20px_35px_rgba(238,72,91,.10)] ${isSwiping ? "pointer-events-none" : ""}`}
        >
          <div className="relative h-[435px] overflow-hidden">
            <BlindArt className="absolute inset-0 w-full h-full" />
            <div className="absolute inset-x-0 bottom-0 h-[50%] bg-gradient-to-b from-transparent via-[#fff3e7]/72 to-[#fffaf4]" />

            {isDemoProfile && (
              <span className="absolute top-5 left-5 rounded-full bg-[#fffaf4] px-4 py-2 text-[14px] font-extrabold shadow-sm">
                Demo profile – fictional
              </span>
            )}
            {compatibility && (
              <span className="absolute top-5 right-5 rounded-full bg-gradient-to-r from-[#e83f5e] to-[#ff6e21] text-white px-4 py-2 text-[17px] font-black">
                {compatibility.score}% match
              </span>
            )}

            <div className="absolute left-6 right-6 bottom-5">
              <h2 className="text-[38px] leading-none font-black tracking-[-0.045em]">
                {activeProfile.name}, {activeProfile.age}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[17px] text-[#766761] mt-3">
                <span>{activeProfile.location}</span>
                <MapPin className="w-5 h-5" />
                <span>{distance}</span>
                {activeProfile.heightCm && <span>· {formatHeight(activeProfile.heightCm)}</span>}
              </div>
            </div>
          </div>

          <div className="px-6 pt-3 pb-5 bg-[#fffaf4]">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="rounded-full bg-[#fde3e8] text-[#d9445e] px-3 py-1 text-[12px] font-black">{archetype.name}</span>
              {archetype.traits.slice(0, 2).map((trait) => (
                <span key={trait} className="rounded-full bg-white border border-[#eaded8] px-3 py-1 text-[12px] font-bold text-[#766761]">{trait}</span>
              ))}
            </div>
            <p className="text-[18px] leading-[1.45] min-h-[52px] line-clamp-2">{activeProfile.bio}</p>
            <button type="button" className="mt-4 text-[#e84962] text-[17px] font-extrabold flex items-center gap-2">
              <Info className="w-5 h-5" /> Personality & compatibility
            </button>
          </div>

          <div className="absolute top-24 left-5 rotate-[-10deg] border-[4px] border-[#2b1b18] bg-white/90 px-4 py-2 rounded-xl font-black text-xl" style={{ opacity: dragX < 0 ? Math.min(Math.abs(dragX) / 100, 1) : 0 }}>PASS</div>
          <div className="absolute top-24 right-5 rotate-[10deg] border-[4px] border-[#e84962] text-[#e84962] bg-white/90 px-4 py-2 rounded-xl font-black text-xl" style={{ opacity: dragX > 0 ? Math.min(Math.abs(dragX) / 100, 1) : 0 }}>SPARK</div>
        </motion.div>
      </AnimatePresence>

      <div className="flex items-center justify-center gap-10 mt-6">
        <button type="button" disabled={isSwiping} onClick={() => void handleSwipe(false)} className="w-[74px] h-[74px] rounded-full border-2 border-[#2b1b18] bg-white flex items-center justify-center shadow-[0_8px_16px_rgba(47,29,24,.08)]">
          <X className="w-9 h-9 text-[#75655f]" />
        </button>
        <button type="button" disabled={isSwiping} onClick={() => void handleSwipe(true)} className="w-[86px] h-[86px] rounded-full bg-gradient-to-br from-[#ed3e5f] to-[#ff6e20] text-white flex items-center justify-center shadow-[0_14px_30px_rgba(235,64,91,.25)]">
          <Sparkles className="w-11 h-11" />
        </button>
      </div>

      <AnimatePresence>
        {showMatchModal && (() => {
          const summary = getCompatibilitySummary(currentUser, showMatchModal.partner);
          const starter = getConversationStarter(currentUser, showMatchModal.partner);
          return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-[#2b1b18]/35 backdrop-blur-sm p-5 flex items-center justify-center">
              <motion.div initial={{ scale: 0.92, y: 16 }} animate={{ scale: 1, y: 0 }} className="w-full max-w-sm rounded-[34px] bg-[#fffaf4] border-2 border-[#2b1b18] p-7 shadow-2xl">
                <div className="w-20 h-20 mx-auto rounded-[28px] bg-gradient-to-br from-[#ed3e5f] to-[#ff6e20] flex items-center justify-center text-white mb-5">
                  <Sparkles className="w-10 h-10" />
                </div>
                <h2 className="text-[31px] font-black text-center">
                  {showMatchModal.match.isDemo ? "It’s a Spark!" : "You both Sparked ✨"}
                </h2>
                <p className="mt-2 text-[17px] text-[#75655f] text-center">
                  <strong>{summary.score}% compatibility</strong> · {summary.label}
                </p>

                <div className="mt-5 space-y-2">
                  {summary.reasons.slice(0, 3).map((reason) => (
                    <div key={reason} className="rounded-[18px] bg-white border border-[#eaded8] px-4 py-3 text-[13px] leading-relaxed">✓ {reason}</div>
                  ))}
                </div>

                <div className="mt-4 rounded-[20px] bg-[#fde3e8] px-4 py-4">
                  <p className="text-[11px] uppercase tracking-wider font-black text-[#d9445e]">Try this opener</p>
                  <p className="text-[14px] mt-1 leading-relaxed">{starter}</p>
                </div>

                <button type="button" onClick={() => { const data = showMatchModal; setShowMatchModal(null); onMatchCreated(data.match, data.partner); }} className="w-full h-16 rounded-[24px] mt-6 bg-gradient-to-r from-[#e84962] to-[#f07a38] text-white text-[20px] font-black">
                  Start talking
                </button>
                <button type="button" onClick={() => setShowMatchModal(null)} className="w-full mt-4 text-[#75655f] font-bold">Keep discovering</button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
