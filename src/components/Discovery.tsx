import { useState, useEffect } from "react";
import { collection, query, getDocs, doc, setDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ARCHETYPES, SEED_PROFILES } from "../data";
import { Profile, Match } from "../types";
import { calculateCompatibility } from "../utils";
import { Heart, X, MapPin, Sparkles, AlertCircle, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Simple module-level cache for profiles to make tab switching and discovery instant
let cachedRawProfiles: Profile[] | null = null;

function getDistanceKm(lat1?: number, lon1?: number, lat2?: number, lon2?: number): number {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return Infinity;
  }
  const R = 6371; // Radius of the earth in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

interface DiscoveryProps {
  currentUser: Profile;
  onMatchCreated: (match: Match, partnerProfile: Profile) => void;
}

export default function Discovery({ currentUser, onMatchCreated }: DiscoveryProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(!cachedRawProfiles);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  const [showReasons, setShowReasons] = useState(false);
  const [showMatchModal, setShowMatchModal] = useState<{ match: Match; partner: Profile } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);

  useEffect(() => {
    async function fetchProfiles() {
      const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_");
      
      // If we already have cached profiles, render them immediately so there is zero delay
      if (cachedRawProfiles && cachedRawProfiles.length > 0) {
        processAndSetProfiles(cachedRawProfiles);
        setLoading(false);
      } else {
        setLoading(true);
      }

      let fetched: Profile[] = [];

      try {
        if (!isLocalMode) {
          // Race the Firestore getDocs call with a 10s timeout for instant loading fallback
          const q = collection(db, "profiles");
          const queryPromise = getDocs(q);
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error("Firestore fetch timeout")), 10000)
          );

          const querySnapshot = await Promise.race([queryPromise, timeoutPromise]);
          if (querySnapshot) {
            querySnapshot.forEach((docSnap) => {
              const data = docSnap.data() as Profile;
              if (data.id !== currentUser.id) {
                fetched.push(data);
              }
            });
            // Update global cache
            cachedRawProfiles = fetched;
          }
        }
      } catch (error) {
        console.warn("Fast fallback triggered for profiles:", error);
      }

      // If we still have no profiles (due to timeout or local mode), use seed profiles
      if (fetched.length < 2) {
        const seedFetched: Profile[] = [];
        SEED_PROFILES.forEach((p) => {
          const docId = `seed_${p.name.toLowerCase()}`;
          if (docId !== currentUser.id) {
            seedFetched.push({
              ...p,
              id: docId,
            } as Profile);
          }
        });
        fetched = seedFetched;
        cachedRawProfiles = fetched;
      }

      processAndSetProfiles(fetched);
      setLoading(false);
    }

    function processAndSetProfiles(rawList: Profile[]) {
      // Apply gender/lookingFor compatibility filters
      const filtered = rawList.map((data) => {
        // If it is a bot (isAI or starting with seed_), set its location to be near the user's city
        const isBot = data.isAI || data.id.startsWith("seed_");
        if (isBot) {
          return {
            ...data,
            location: currentUser.location || data.location,
            latitude: currentUser.latitude,
            longitude: currentUser.longitude,
            isAI: true
          };
        }
        return data;
      }).filter((data) => {
        let matchGender = false;
        if (currentUser.lookingFor === "everyone") {
          matchGender = true;
        } else if (currentUser.lookingFor === data.gender) {
          matchGender = true;
        }

        let matchTheyWant = false;
        if (data.lookingFor === "everyone") {
          matchTheyWant = true;
        } else if (data.lookingFor === currentUser.gender) {
          matchTheyWant = true;
        }

        return matchGender && matchTheyWant;
      });

      // Split into prioritized nearby real profiles, bots, and other profiles
      const realNearby: Profile[] = [];
      const bots: Profile[] = [];
      const others: Profile[] = [];

      filtered.forEach((data) => {
        const isBot = data.isAI || data.id.startsWith("seed_");
        if (isBot) {
          bots.push(data);
        } else {
          // Real profile: check distance if user has coords
          if (currentUser.latitude !== undefined && currentUser.longitude !== undefined && data.latitude !== undefined && data.longitude !== undefined) {
            const distance = getDistanceKm(currentUser.latitude, currentUser.longitude, data.latitude, data.longitude);
            if (distance <= 500) {
              realNearby.push(data);
            } else {
              others.push(data);
            }
          } else {
            others.push(data);
          }
        }
      });

      // Shuffle subsets for natural experience
      const shuffle = (arr: Profile[]) => [...arr].sort(() => Math.random() - 0.5);

      // Combine with prioritization: real nearby users FIRST, then bots, then other real users
      const prioritized = [...shuffle(realNearby), ...shuffle(bots), ...shuffle(others)];
      setProfiles(prioritized);
    }

    fetchProfiles();
  }, [currentUser]);

  const activeProfile = profiles[currentIndex];

  const handleSwipe = async (liked: boolean) => {
    if (!activeProfile || isSwiping) return;
    setIsSwiping(true);

    // Record swipe locally
    setSwipedIds((prev) => {
      const next = new Set(prev);
      next.add(activeProfile.id);
      return next;
    });

    if (liked) {
      const isBot = activeProfile.isAI || activeProfile.id.startsWith("seed_");
      const isLocalMode = !currentUser.id || currentUser.id.startsWith("local_");
      // Demo/bot profiles match only 1 time out of 4. Real profiles keep the existing prototype behavior.
      const shouldMatch = isBot ? Math.random() < 0.25 : true;

      if (shouldMatch) {
        // Create compatibility match
        const compat = calculateCompatibility(currentUser.archetype, activeProfile.archetype);
        const matchId = [currentUser.id, activeProfile.id].sort().join("_");

        const matchData: Match = {
          id: matchId,
          users: [currentUser.id, activeProfile.id],
          createdAt: new Date(),
          score: compat.score,
          unlocked: false,
        };

        // Save match to localStorage
        const localMatchesStr = localStorage.getItem(`blindspark_matches_${currentUser.id}`) || "[]";
        const currentLocalMatches: Match[] = JSON.parse(localMatchesStr);
        if (!currentLocalMatches.some((m) => m.id === matchId)) {
          currentLocalMatches.push(matchData);
          localStorage.setItem(`blindspark_matches_${currentUser.id}`, JSON.stringify(currentLocalMatches));
        }

        // Note: Bots only text if the real person texts first. So we DO NOT write any initial greeting message.
        // This starts the chat history as completely empty.

        if (!isLocalMode) {
          // Run Firestore writes in the background to ensure instant feedback to the user
          setDoc(doc(db, "matches", matchId), {
            ...matchData,
            createdAt: serverTimestamp(),
          }).catch((e) => {
            console.warn("Could not write match to Firestore:", e);
          });
        }

        // Trigger matched modal
        setShowMatchModal({ match: matchData, partner: activeProfile });
      }
    }

    // Move to next card
    setShowReasons(false);
    setDragX(0);
    setCurrentIndex((prev) => prev + 1);
    window.setTimeout(() => setIsSwiping(false), 280);
  };

  const handleResetDiscovery = () => {
    setCurrentIndex(0);
    setSwipedIds(new Set());
    setProfiles((prev) => [...prev].sort(() => Math.random() - 0.5));
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center py-20 bg-[#FCFAF7]">
        <RefreshCw className="w-8 h-8 text-rose-500 animate-spin mb-4" />
        <p className="text-stone-500 text-sm font-bold font-display">Scanning local compatibility sparks...</p>
      </div>
    );
  }

  if (currentIndex >= profiles.length || !activeProfile) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center text-center py-12 px-6 bg-[#FCFAF7]">
        <div className="w-16 h-16 bg-white border border-stone-200/80 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
          <AlertCircle className="w-8 h-8 text-stone-400" />
        </div>
        <h3 className="text-xl font-black font-display tracking-tight mb-2 text-stone-900">No local sparks left</h3>
        <p className="text-stone-500 text-sm max-w-xs mb-8 font-medium leading-relaxed">
          You have swiped on all compatible profiles in your area. Check back soon for new local connections!
        </p>
        <button
          onClick={handleResetDiscovery}
          className="px-6 py-3 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all duration-200 cursor-pointer shadow-md"
        >
          <RefreshCw className="w-4 h-4" />
          Rewind & Recalibrate
        </button>
      </div>
    );
  }

  const archetypeInfo = ARCHETYPES[activeProfile.archetype];
  const compatibility = calculateCompatibility(currentUser.archetype, activeProfile.archetype);

  const isDemoProfile = activeProfile.isAI || activeProfile.id.startsWith("seed_");
  const stableHash = [...activeProfile.id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const demoDistanceKm = (0.6 + (stableHash % 35) / 10).toFixed(1);
  const realDistanceKm = getDistanceKm(
    currentUser.latitude,
    currentUser.longitude,
    activeProfile.latitude,
    activeProfile.longitude,
  );
  const distanceLabel = isDemoProfile
    ? `${demoDistanceKm} km away`
    : Number.isFinite(realDistanceKm)
      ? `${realDistanceKm.toFixed(1)} km away`
      : "Nearby";

  return (
    <div className="flex-1 flex flex-col items-center max-w-md w-full mx-auto relative px-2 bg-[#FCFAF7]">
      <AnimatePresence mode="wait">
        <motion.div
          key={activeProfile.id}
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ duration: 0.3 }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.92}
          dragMomentum={false}
          onDrag={(_event, info) => setDragX(info.offset.x)}
          onDragEnd={(_event, info) => {
            const threshold = 95;
            if (info.offset.x >= threshold) {
              void handleSwipe(true);
            } else if (info.offset.x <= -threshold) {
              void handleSwipe(false);
            } else {
              setDragX(0);
            }
          }}
          style={{ touchAction: "pan-y" }}
          className={`w-full bg-gradient-to-b ${archetypeInfo.gradient} to-white border border-stone-200/85 rounded-3xl overflow-hidden flex flex-col shadow-xl shadow-stone-100/40 relative min-h-[540px] md:min-h-[580px] p-6 text-stone-900 ${isSwiping ? "pointer-events-none" : "cursor-grab active:cursor-grabbing"}`}
        >
          <div
            className="absolute top-24 left-5 z-30 rotate-[-10deg] border-4 border-stone-700 text-stone-800 bg-white/85 px-4 py-2 rounded-xl font-black tracking-[0.18em] text-xl pointer-events-none"
            style={{ opacity: dragX < 0 ? Math.min(Math.abs(dragX) / 110, 1) : 0 }}
          >
            PASS
          </div>
          <div
            className="absolute top-24 right-5 z-30 rotate-[10deg] border-4 border-rose-500 text-rose-600 bg-white/85 px-4 py-2 rounded-xl font-black tracking-[0.18em] text-xl pointer-events-none"
            style={{ opacity: dragX > 0 ? Math.min(Math.abs(dragX) / 110, 1) : 0 }}
          >
            SPARK
          </div>
          {/* Subtle background radar circles */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] border border-stone-300/10 rounded-full pointer-events-none animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] border border-stone-300/10 rounded-full pointer-events-none" />

          {/* Profile Header */}
          <div className="flex justify-between items-start mb-4 z-10">
            <div>
              <div className="flex items-center gap-1.5 mb-1 text-[10px] text-stone-500 font-extrabold uppercase tracking-widest font-display">
                <MapPin className="w-3.5 h-3.5 text-rose-500" />
                <span>{activeProfile.location}</span>
                <span className="text-stone-300">•</span>
                <span>{distanceLabel}</span>
              </div>
              <h2 className="text-2xl font-black font-display tracking-tight text-stone-900">{activeProfile.name}, <span className="text-stone-500 font-medium">{activeProfile.age}</span></h2>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[11px] font-black tracking-wide uppercase px-2.5 py-1 rounded-lg ${archetypeInfo.textColor.replace('-400', '-600')} bg-white/95 border border-stone-200/60 shadow-xs inline-block`}>
                  {archetypeInfo.name}
                </span>
                {isDemoProfile && (
                  <span className="text-[9px] font-black tracking-widest uppercase px-2 py-1 rounded-lg bg-stone-900 text-white/90">
                    Demo
                  </span>
                )}
              </div>
            </div>

            {/* Compatibility Badge */}
            <div className="bg-white/90 border border-stone-200/80 rounded-2xl p-2.5 flex flex-col items-center justify-center min-w-[70px] shadow-sm">
              <span className="text-[10px] text-stone-400 uppercase tracking-wider font-extrabold font-display">Spark</span>
              <span className={`text-lg font-black font-mono ${compatibility.score >= 90 ? "text-rose-600" : "text-amber-700"}`}>
                {compatibility.score}%
              </span>
            </div>
          </div>

          {/* Core Content Box */}
          <div className="flex-1 flex flex-col gap-4 overflow-y-auto max-h-[340px] pr-1 scrollbar-thin z-10">
            {/* Bio section */}
            <div className="bg-[#FAF9F6]/90 border border-stone-200/60 rounded-2xl p-4 shadow-xs">
              <span className="text-[10px] uppercase font-black text-stone-400 mb-1 block tracking-widest font-display">Biography</span>
              <p className="text-xs text-stone-700 leading-relaxed font-medium">
                {activeProfile.bio}
              </p>
            </div>

            {/* Why We Align (Accordian) */}
            <div className="bg-[#FAF9F6]/90 border border-stone-200/60 rounded-2xl overflow-hidden shadow-xs">
              <button
                onClick={() => setShowReasons(!showReasons)}
                className="w-full flex justify-between items-center p-4 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-stone-900 transition-all font-display"
              >
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-rose-500" />
                  Why we align
                </span>
                {showReasons ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
              </button>
              {showReasons && (
                <div className="px-4 pb-4 flex flex-col gap-2.5 border-t border-stone-200/50 pt-3">
                  {compatibility.reasons.map((r, idx) => (
                    <div key={idx} className="flex gap-2 items-start text-xs text-stone-600 leading-relaxed font-medium">
                      <span className="text-rose-500 mt-1 font-bold">•</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Spark Prompts */}
            {Object.entries(activeProfile.sparkPrompts || {}).map(([question, answer], i) => (
              <div key={i} className="bg-[#FAF9F6]/90 border border-stone-200/60 rounded-2xl p-4 flex flex-col gap-1.5 shadow-xs">
                <span className="text-[10px] uppercase font-black text-stone-400 italic font-display">
                  "{question}"
                </span>
                <p className="text-xs text-rose-600 font-semibold italic pl-2 border-l-2 border-rose-400/50">
                  {answer}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[10px] text-stone-400 font-bold text-center mt-4 z-10">Swipe left to Pass • Swipe right to Spark</p>
          {/* Swipe Buttons */}
          <div className="grid grid-cols-2 gap-4 mt-2 z-10">
            <button
              onClick={() => handleSwipe(false)}
              disabled={isSwiping}
              className="py-4 bg-white hover:bg-stone-50 disabled:opacity-50 text-stone-600 hover:text-stone-900 border border-stone-200 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all duration-200 cursor-pointer shadow-sm"
            >
              <X className="w-5 h-5 text-stone-400" />
              Pass
            </button>
            <button
              onClick={() => handleSwipe(true)}
              disabled={isSwiping}
              className="py-4 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:opacity-50 text-white rounded-2xl font-black flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer shadow-md shadow-rose-500/10 hover:shadow-lg"
            >
              <Heart className="w-5 h-5 fill-white" />
              Spark
            </button>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Match Ignited Modal */}
      <AnimatePresence>
        {showMatchModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="w-full max-w-sm bg-white border border-stone-200/80 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            >
              {/* Confetti sparks */}
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-rose-500 to-amber-500" />
              <div className="w-16 h-16 bg-gradient-to-tr from-rose-500 to-amber-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-md shadow-rose-500/15">
                <Sparkles className="w-8 h-8 text-white" />
              </div>

              <h2 className="text-2xl font-black font-display tracking-tight text-stone-900 bg-gradient-to-r from-rose-600 to-amber-600 bg-clip-text text-transparent mb-1">
                Spark Ignited!
              </h2>
              <p className="text-[#615E69] text-xs mb-6 font-medium">
                You and <span className="text-stone-900 font-bold">{showMatchModal.partner.name}</span>, <span className="text-stone-850 font-bold">{showMatchModal.partner.age}</span>, matched on shared personality vibrations!
              </p>

              <div className="bg-stone-50 border border-stone-200/85 rounded-2xl p-4 mb-6">
                <span className="text-[10px] uppercase font-black text-stone-400 tracking-wider block mb-1 font-display">Their Spark Vibe</span>
                <p className={`text-sm font-black ${ARCHETYPES[showMatchModal.partner.archetype].textColor.replace('-400', '-600')}`}>
                  {ARCHETYPES[showMatchModal.partner.archetype].name}
                </p>
                <p className="text-xs text-stone-500 italic mt-1 font-medium">
                  "{ARCHETYPES[showMatchModal.partner.archetype].tagline}"
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    const m = showMatchModal;
                    setShowMatchModal(null);
                    onMatchCreated(m.match, m.partner);
                  }}
                  className="w-full py-3.5 bg-stone-900 hover:bg-stone-850 text-white rounded-xl font-bold text-sm transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Open Private Chat</span>
                </button>
                <button
                  onClick={() => setShowMatchModal(null)}
                  className="w-full py-2 bg-transparent hover:bg-stone-50 text-stone-500 hover:text-stone-800 rounded-xl font-bold text-xs transition-all cursor-pointer"
                >
                  Keep Swiping
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
