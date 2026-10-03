import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { doc, setDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { QUIZ_QUESTIONS, ARCHETYPES } from "../data";
import { Profile, ArchetypeId } from "../types";
import { Sparkles, ArrowRight, Check, MapPin, User, Eye, Calendar } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface OnboardingProps {
  userId: string;
  onComplete: (profile: Profile) => void;
}

const PROMPT_QUESTIONS = [
  "My ideal Sunday looks like...",
  "What makes me laugh the hardest...",
  "A boundary I value in a partner...",
  "My absolute favorite coffee or tea spot..."
];

export default function Onboarding({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<"basic-info" | "quiz" | "prompts" | "bio" | "archetype-reveal">("basic-info");
  
  // Basic Info State
  const [name, setName] = useState(() => {
    const currentUser = auth.currentUser;
    if (currentUser && !currentUser.isAnonymous && currentUser.displayName) {
      return currentUser.displayName.split(" ")[0];
    }
    return "";
  });
  const [age, setAge] = useState("24");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [location, setLocation] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>(undefined);
  const [longitude, setLongitude] = useState<number | undefined>(undefined);
  
  // Quiz State
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  
  // Spark Prompts State
  const [prompt1, setPrompt1] = useState(PROMPT_QUESTIONS[0]);
  const [answer1, setAnswer1] = useState("");
  const [prompt2, setPrompt2] = useState(PROMPT_QUESTIONS[1]);
  const [answer2, setAnswer2] = useState("");
  
  // Bio State
  const [bio, setBio] = useState("");
  
  // Final calculated Archetype
  const [calculatedArchetype, setCalculatedArchetype] = useState<ArchetypeId | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Ask for location once to prefill the city/area. The field stays editable.
  useEffect(() => {
    let cancelled = false;

    const reverseGeocode = async (lat: number, lon: number) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        if (!res.ok) return;
        const data = await res.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || data.address?.county || data.address?.state;
        if (!cancelled && city) setLocation(city);
      } catch (error) {
        console.warn("Failed to reverse geocode coordinates:", error);
      }
    };

    const detectLocation = async () => {
      try {
        let lat: number;
        let lon: number;

        if (Capacitor.isNativePlatform()) {
          const permission = await Geolocation.requestPermissions();
          if (permission.location !== "granted" && permission.coarseLocation !== "granted") return;
          const position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000,
          });
          lat = position.coords.latitude;
          lon = position.coords.longitude;
        } else {
          if (!navigator.geolocation) return;
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 8000,
              maximumAge: 300000,
            });
          });
          lat = position.coords.latitude;
          lon = position.coords.longitude;
        }

        if (cancelled) return;
        setLatitude(lat);
        setLongitude(lon);
        await reverseGeocode(lat, lon);
      } catch (error) {
        console.warn("Location permission denied or location unavailable:", error);
      }
    };

    detectLocation();
    return () => {
      cancelled = true;
    };
  }, []);

  // Calculate the user's personality archetype based on their quiz answers
  const calculateArchetype = (): ArchetypeId => {
    const counts: Record<ArchetypeId, number> = {
      idealist: 0,
      adventurer: 0,
      homebody: 0,
      witty: 0,
      thinker: 0,
    };

    // Aggregate votes
    Object.entries(quizAnswers).forEach(([questionId, selectedOptionIndex]) => {
      const optionIndexStr = selectedOptionIndex as string;
      const question = QUIZ_QUESTIONS.find((q) => q.id === questionId);
      if (question) {
        const option = question.options[parseInt(optionIndexStr)];
        if (option) {
          counts[option.archetype]++;
        }
      }
    });

    // Find archetype with the highest count
    let maxCount = -1;
    let finalArchetype: ArchetypeId = "idealist"; // Default fallback

    Object.entries(counts).forEach(([archetype, count]) => {
      if (count > maxCount) {
        maxCount = count;
        finalArchetype = archetype as ArchetypeId;
      }
    });

    return finalArchetype;
  };

  const handleNextFromQuiz = (selectedOptionIndex: number) => {
    const currentQuestion = QUIZ_QUESTIONS[currentQuestionIndex];
    const updatedAnswers = {
      ...quizAnswers,
      [currentQuestion.id]: selectedOptionIndex.toString(),
    };
    setQuizAnswers(updatedAnswers);

    if (currentQuestionIndex < QUIZ_QUESTIONS.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    } else {
      // End of quiz, calculate archetype and proceed
      const counts: Record<ArchetypeId, number> = {
        idealist: 0,
        adventurer: 0,
        homebody: 0,
        witty: 0,
        thinker: 0,
      };
      Object.entries(updatedAnswers).forEach(([qId, oIdx]) => {
        const optionIndexStr = oIdx as string;
        const q = QUIZ_QUESTIONS.find((x) => x.id === qId);
        const opt = q?.options[parseInt(optionIndexStr)];
        if (opt) counts[opt.archetype]++;
      });
      let maxCount = -1;
      let finalArch: ArchetypeId = "idealist";
      Object.entries(counts).forEach(([arch, count]) => {
        if (count > maxCount) {
          maxCount = count;
          finalArch = arch as ArchetypeId;
        }
      });

      setCalculatedArchetype(finalArch);
      setStep("archetype-reveal");
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!calculatedArchetype) return;
    setIsSaving(true);

    const profileData: Profile = {
      id: userId,
      name,
      age: parseInt(age, 10) || 24,
      gender,
      lookingFor,
      location,
      latitude,
      longitude,
      archetype: calculatedArchetype,
      quizAnswers,
      bio,
      sparkPrompts: {
        [prompt1]: answer1,
        [prompt2]: answer2,
      },
    };

    // Always save to localStorage first as a reliable backup/fallback
    localStorage.setItem(`blindspark_profile_${userId}`, JSON.stringify(profileData));

    try {
      const isLocalMode = userId.startsWith("local_");
      if (!isLocalMode) {
        await Promise.race([
          setDoc(doc(db, "profiles", userId), profileData),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout saving profile")), 10000)),
        ]);
      }
    } catch (err) {
      console.warn("Could not save profile to cloud Firestore (using local storage fallback instead):", err);
    } finally {
      setIsSaving(false);
      onComplete(profileData);
    }
  };

  return (
    <div className="min-h-screen bg-[#FCFAF7] text-stone-900 flex flex-col justify-center items-center px-4 py-8 select-none">
      <div className="w-full max-w-lg bg-white border border-stone-200/75 rounded-3xl shadow-xl shadow-stone-200/30 p-6 md:p-8 relative overflow-hidden">
        {/* Subtle decorative sunset blurred backgrounds */}
        <div className="absolute -top-12 -left-12 w-48 h-48 bg-rose-200/20 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-amber-200/20 rounded-full blur-3xl" />

        <AnimatePresence mode="wait">
          {step === "basic-info" && (
            <motion.div
              key="basic-info"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="text-xl font-black font-display tracking-tight text-stone-900 mb-1">Tell us the basics</h2>
                <p className="text-stone-500 text-xs">This builds your foundational dating profile.</p>
              </div>

              {/* Name and Age grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-2 col-span-2">
                  <label className="text-xs text-stone-500 font-bold uppercase tracking-wider">Your First Name</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                      <User className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Maya"
                      maxLength={15}
                      className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-all text-stone-900 placeholder-stone-400 font-medium"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-2 col-span-1">
                  <label className="text-xs text-stone-500 font-bold uppercase tracking-wider">Age</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-stone-400">
                      <Calendar className="w-4 h-4" />
                    </span>
                    <input
                      type="number"
                      value={age}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "" || (parseInt(val, 10) >= 0 && parseInt(val, 10) <= 120)) {
                          setAge(val);
                        }
                      }}
                      placeholder="24"
                      min={18}
                      max={100}
                      className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl pl-9 pr-2 py-3 text-sm focus:outline-none transition-all text-stone-900 placeholder-stone-400 font-medium [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                </div>
              </div>

              {/* Gender */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-stone-500 font-bold uppercase tracking-wider">I identify as</label>
                <div className="grid grid-cols-3 gap-2">
                  {["female", "male", "non-binary"].map((g) => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={`py-3 rounded-xl border text-xs capitalize font-bold transition-all duration-200 cursor-pointer ${
                        gender === g
                          ? "bg-rose-500/10 border-rose-300 text-rose-600 shadow-sm"
                          : "bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300"
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              {/* Looking For */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-stone-500 font-bold uppercase tracking-wider">I am looking to meet</label>
                <div className="grid grid-cols-3 gap-2">
                  {["female", "male", "everyone"].map((lf) => (
                    <button
                      key={lf}
                      onClick={() => setLookingFor(lf)}
                      className={`py-3 rounded-xl border text-xs capitalize font-bold transition-all duration-200 cursor-pointer ${
                        lookingFor === lf
                          ? "bg-amber-500/10 border-amber-300 text-amber-700 shadow-sm"
                          : "bg-stone-50 border-stone-200 text-stone-600 hover:border-stone-300"
                      }`}
                    >
                      {lf}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location */}
              <div className="flex flex-col gap-2">
                <label className="text-xs text-stone-500 font-bold uppercase tracking-wider">City / Area</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-stone-400">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Milan"
                    maxLength={50}
                    className="w-full bg-stone-50 border border-stone-200 focus:border-rose-500 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none transition-all text-stone-900 placeholder-stone-400 font-medium"
                  />
                </div>
                <p className="text-[10px] text-stone-400">We can detect your area from location permission, and you can edit it anytime.</p>
              </div>

              <button
                disabled={!name.trim() || !gender || !lookingFor || !location.trim() || !age || parseInt(age, 10) < 18}
                onClick={() => setStep("quiz")}
                className="w-full mt-2 py-4 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-100 text-white disabled:text-stone-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-all duration-300 shadow-sm cursor-pointer"
              >
                Begin Personality Quiz
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === "quiz" && (
            <motion.div
              key="quiz"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col gap-5"
            >
              {/* Quiz Progress */}
              <div className="flex justify-between items-center">
                <span className="text-xs text-rose-600 font-black uppercase tracking-widest font-display">Chemistry Assessment</span>
                <span className="text-xs text-stone-500 font-semibold">
                  Question {currentQuestionIndex + 1} of {QUIZ_QUESTIONS.length}
                </span>
              </div>
              <div className="w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 to-amber-500 transition-all duration-300"
                  style={{ width: `${((currentQuestionIndex + 1) / QUIZ_QUESTIONS.length) * 100}%` }}
                />
              </div>

              {/* Question Text */}
              <h2 className="text-lg md:text-xl font-black font-display tracking-tight text-stone-900 leading-snug">
                {QUIZ_QUESTIONS[currentQuestionIndex].question}
              </h2>

              {/* Options */}
              <div className="flex flex-col gap-2">
                {QUIZ_QUESTIONS[currentQuestionIndex].options.map((opt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleNextFromQuiz(idx)}
                    className="w-full text-left bg-stone-50 hover:bg-rose-50/45 border border-stone-200/80 hover:border-rose-400 p-4 rounded-xl text-xs md:text-sm font-semibold text-stone-800 hover:text-rose-700 transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === "prompts" && (
            <motion.div
              key="prompts"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="text-xl font-black font-display tracking-tight text-stone-900 mb-1">Dating Prompts</h2>
                <p className="text-stone-500 text-xs font-medium">Without photos, your answers are how you show off your spark.</p>
              </div>

              {/* Prompt 1 */}
              <div className="flex flex-col gap-2">
                <select
                  value={prompt1}
                  onChange={(e) => setPrompt1(e.target.value)}
                  className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-extrabold text-rose-600 focus:outline-none cursor-pointer"
                >
                  {PROMPT_QUESTIONS.map((pq) => (
                    <option key={pq} value={pq}>
                      {pq}
                    </option>
                  ))}
                </select>
                <textarea
                  value={answer1}
                  onChange={(e) => setAnswer1(e.target.value)}
                  placeholder="Type a creative, sparky response..."
                  maxLength={100}
                  rows={2}
                  className="w-full bg-stone-50 border border-stone-200 focus:border-rose-400 rounded-xl p-3 text-sm focus:outline-none text-stone-900 resize-none placeholder-stone-400 font-medium"
                />
                <span className="text-[10px] text-stone-400 font-semibold text-right">{answer1.length}/100</span>
              </div>

              {/* Prompt 2 */}
              <div className="flex flex-col gap-2">
                <select
                  value={prompt2}
                  onChange={(e) => setPrompt2(e.target.value)}
                  className="bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 text-xs font-extrabold text-amber-700 focus:outline-none cursor-pointer"
                >
                  {PROMPT_QUESTIONS.filter((x) => x !== prompt1).map((pq) => (
                    <option key={pq} value={pq}>
                      {pq}
                    </option>
                  ))}
                </select>
                <textarea
                  value={answer2}
                  onChange={(e) => setAnswer2(e.target.value)}
                  placeholder="Type a creative, sparky response..."
                  maxLength={100}
                  rows={2}
                  className="w-full bg-stone-50 border border-stone-200 focus:border-rose-400 rounded-xl p-3 text-sm focus:outline-none text-stone-900 resize-none placeholder-stone-400 font-medium"
                />
                <span className="text-[10px] text-stone-400 font-semibold text-right">{answer2.length}/100</span>
              </div>

              <button
                disabled={!answer1.trim() || !answer2.trim()}
                onClick={() => setStep("bio")}
                className="w-full mt-2 py-4 bg-stone-900 hover:bg-stone-800 disabled:bg-stone-100 text-white disabled:text-stone-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                Write Your Bio
                <ArrowRight className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === "bio" && (
            <motion.div
              key="bio"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="text-xl font-black font-display tracking-tight text-stone-900 mb-1">Craft Your Biography</h2>
                <p className="text-stone-500 text-xs font-medium">Summarize your vibe, what you enjoy, and what you represent.</p>
              </div>

              <div className="flex flex-col gap-2">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="I am passionate about indie cinema, brewing organic kombucha, and long night conversations about absolute nothing..."
                  maxLength={250}
                  rows={6}
                  className="w-full bg-stone-50 border border-stone-200 focus:border-rose-400 rounded-2xl p-4 text-sm focus:outline-none text-stone-900 resize-none leading-relaxed placeholder-stone-400 font-medium"
                />
                <span className="text-xs text-stone-400 font-semibold text-right">{bio.length}/250</span>
              </div>

              <button
                disabled={bio.length < 20}
                onClick={handleCompleteOnboarding}
                className="w-full mt-2 py-4 bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-600 hover:to-amber-600 disabled:from-stone-100 disabled:to-stone-100 text-white disabled:text-stone-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer"
              >
                {isSaving ? "Igniting Spark..." : "Enter blindSpark"}
                <Sparkles className="w-5 h-5" />
              </button>
            </motion.div>
          )}

          {step === "archetype-reveal" && calculatedArchetype && (
            <motion.div
              key="archetype-reveal"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center flex flex-col items-center py-4"
            >
              <span className="text-[10px] tracking-[0.2em] uppercase font-black text-stone-400 mb-2 font-display">
                Your Archetype is
              </span>

              {/* Reveal Badge */}
              <div className={`p-6 rounded-2xl bg-gradient-to-tr ${ARCHETYPES[calculatedArchetype].gradient} border border-stone-200/80 w-full mb-6 shadow-sm`}>
                <h2 className={`text-2xl font-black font-display tracking-tight ${ARCHETYPES[calculatedArchetype].textColor} mb-2`}>
                  {ARCHETYPES[calculatedArchetype].name}
                </h2>
                <p className="text-xs italic text-stone-700 max-w-xs mx-auto mb-4 leading-relaxed font-medium">
                  "{ARCHETYPES[calculatedArchetype].tagline}"
                </p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {ARCHETYPES[calculatedArchetype].traits.map((trait, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] uppercase font-extrabold px-2.5 py-1 bg-white rounded-full text-stone-600 border border-stone-200/60 shadow-xs"
                    >
                      {trait}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-xs text-stone-600 mb-8 leading-relaxed max-w-sm font-medium">
                {ARCHETYPES[calculatedArchetype].description}
              </p>

              <div className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 mb-3 text-left">
                <p className="text-[10px] uppercase tracking-widest text-stone-400 font-black mb-1">Quiz result</p>
                <p className="text-xs text-stone-600 font-medium">This personality type is calculated from the answers you just chose. It will appear on your profile and be used for compatibility scores.</p>
              </div>

              <button
                onClick={() => setStep("prompts")}
                className="w-full py-4 bg-stone-950 hover:bg-stone-850 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md"
              >
                Continue with this profile type
                <Check className="w-5 h-5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
