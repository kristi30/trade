import { useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { ArrowLeft, Crosshair, MapPin, Ruler, Sparkles } from "lucide-react";
import { db } from "../lib/firebase";
import { ARCHETYPES, QUIZ_QUESTIONS } from "../data";
import { ArchetypeId, Profile } from "../types";

interface OnboardingProps {
  userId: string;
  onComplete: (profile: Profile) => void;
}

function calculateArchetype(answers: Record<string, string>): ArchetypeId {
  const counts: Record<ArchetypeId, number> = {
    idealist: 0,
    adventurer: 0,
    homebody: 0,
    witty: 0,
    thinker: 0,
  };

  for (const [questionId, selected] of Object.entries(answers)) {
    const question = QUIZ_QUESTIONS.find((q) => q.id === questionId);
    const option = question?.options[Number(selected)];
    if (option) counts[option.archetype] += 1;
  }

  return (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "idealist") as ArchetypeId;
}

const genderOptions = ["female", "male", "non-binary"];
const lookingForOptions = ["female", "male", "everyone"];

export default function Onboarding({ userId, onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [gender, setGender] = useState("");
  const [lookingFor, setLookingFor] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [latitude, setLatitude] = useState<number | undefined>();
  const [longitude, setLongitude] = useState<number | undefined>();
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [isLocating, setIsLocating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const archetype = useMemo(() => calculateArchetype(quizAnswers), [quizAnswers]);
  const archetypeInfo = ARCHETYPES[archetype];

  const locateMe = async () => {
    setIsLocating(true);
    try {
      let lat: number;
      let lon: number;

      if (Capacitor.isNativePlatform()) {
        const permission = await Geolocation.requestPermissions();
        if (permission.location !== "granted" && permission.coarseLocation !== "granted") return;
        const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000 });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } else {
        if (!navigator.geolocation) return;
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: false,
            timeout: 10000,
            maximumAge: 300000,
          });
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      }

      setLatitude(lat);
      setLongitude(lon);

      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await response.json();
        const city = data.address?.city || data.address?.town || data.address?.village || data.address?.suburb || data.address?.county;
        if (city) setLocation(city);
      } catch {
        // Coordinates are still useful even if reverse geocoding is unavailable.
      }
    } catch (error) {
      console.warn("Location unavailable:", error);
    } finally {
      setIsLocating(false);
    }
  };

  const finish = async () => {
    if (Object.keys(quizAnswers).length !== QUIZ_QUESTIONS.length) return;
    setIsSaving(true);

    const profile: Profile = {
      id: userId,
      name: name.trim(),
      age: Number(age),
      heightCm: Number(heightCm) || undefined,
      gender,
      lookingFor,
      location: location.trim(),
      latitude,
      longitude,
      archetype,
      quizAnswers,
      bio: bio.trim(),
      sparkPrompts: {},
      ageVerified: Number(age) >= 18,
    };

    localStorage.setItem(`blindspark_profile_${userId}`, JSON.stringify(profile));

    try {
      if (!userId.startsWith("local_")) {
        await setDoc(doc(db, "profiles", userId), {
          ...profile,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      }
    } catch (error) {
      console.warn("Cloud save failed; local profile is still available.", error);
    } finally {
      setIsSaving(false);
      onComplete(profile);
    }
  };

  const ageNumber = Number(age);
  const heightNumber = Number(heightCm);
  const basicReady =
    name.trim().length > 0 &&
    ageNumber >= 18 &&
    ageNumber <= 100 &&
    heightNumber >= 120 &&
    heightNumber <= 230 &&
    gender.length > 0 &&
    lookingFor.length > 0 &&
    location.trim().length > 0;

  const quizReady = Object.keys(quizAnswers).length === QUIZ_QUESTIONS.length;

  return (
    <div className="min-h-[100dvh] bg-[#fffaf4] text-[#2b1b18] font-sans pb-[calc(150px+env(safe-area-inset-bottom,0px))] overflow-visible">
      {step === 1 ? (
        <div className="max-w-md mx-auto px-5 pt-8">
          <div className="flex items-center gap-4 mb-5">
            <button type="button" onClick={() => window.history.back()} className="w-14 h-14 rounded-full border-2 border-[#2b1b18] flex items-center justify-center bg-white">
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-[34px] leading-none font-black tracking-[-0.04em]">About you</h1>
              <p className="text-[18px] text-[#7d6d67] mt-2">Step 1 of 2</p>
            </div>
          </div>

          <div className="h-2 rounded-full bg-[#f3e9e3] overflow-hidden mb-6">
            <div className="h-full w-[40%] rounded-full bg-gradient-to-r from-[#e94160] to-[#f07b36]" />
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="block text-[22px] font-extrabold mb-3">First name or nickname</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full h-[72px] rounded-[28px] border-2 border-[#2b1b18] bg-white px-5 text-[20px] outline-none focus:ring-4 focus:ring-rose-100" maxLength={24} />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="block text-[20px] font-extrabold mb-3">Age (18+)</span>
                <input value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="23" className="w-full h-[68px] rounded-[26px] border-2 border-[#2b1b18] bg-white px-5 text-[20px] outline-none focus:ring-4 focus:ring-rose-100" />
              </label>

              <label className="block">
                <span className="block text-[20px] font-extrabold mb-3">Height</span>
                <div className="relative">
                  <Ruler className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#e84962]" />
                  <input value={heightCm} onChange={(e) => setHeightCm(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="178 cm" className="w-full h-[68px] rounded-[26px] border-2 border-[#2b1b18] bg-white pl-11 pr-3 text-[20px] outline-none focus:ring-4 focus:ring-rose-100" />
                </div>
              </label>
            </div>

            <div>
              <span className="block text-[20px] font-extrabold mb-3">I am</span>
              <div className="grid grid-cols-3 gap-2">
                {genderOptions.map((option) => (
                  <button key={option} type="button" onClick={() => setGender(option)} className={`min-h-[54px] rounded-[20px] border-2 text-[14px] font-extrabold capitalize px-2 ${
                    gender === option ? "border-transparent bg-gradient-to-r from-[#e73d5e] to-[#ff6f22] text-white" : "border-[#2b1b18] bg-white"
                  }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-[20px] font-extrabold mb-3">Looking for</span>
              <div className="grid grid-cols-3 gap-2">
                {lookingForOptions.map((option) => (
                  <button key={option} type="button" onClick={() => setLookingFor(option)} className={`min-h-[54px] rounded-[20px] border-2 text-[14px] font-extrabold capitalize px-2 ${
                    lookingFor === option ? "border-transparent bg-gradient-to-r from-[#e73d5e] to-[#ff6f22] text-white" : "border-[#2b1b18] bg-white"
                  }`}>
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="block text-[22px] font-extrabold mb-3">City</span>
              <div className="relative">
                <MapPin className="w-6 h-6 text-[#e84962] absolute left-5 top-1/2 -translate-y-1/2" />
                <input value={location} onChange={(e) => setLocation(e.target.value)} className="w-full h-[72px] rounded-[28px] border-2 border-[#2b1b18] bg-white pl-14 pr-5 text-[20px] outline-none focus:ring-4 focus:ring-rose-100" />
              </div>
              <button type="button" onClick={locateMe} className="mt-3 rounded-full bg-[#fde3e8] text-[#e64a63] px-6 py-3 text-[19px] font-bold flex items-center gap-2">
                <Crosshair className="w-5 h-5" />
                {isLocating ? "Finding your location…" : "Use my current location"}
              </button>
            </label>

            <label className="block">
              <span className="block text-[22px] font-extrabold mb-3">One line about you (optional)</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={180} rows={4} className="w-full rounded-[28px] border-2 border-[#2b1b18] bg-white px-5 py-4 text-[19px] resize-none outline-none focus:ring-4 focus:ring-rose-100" />
            </label>

            <div className="rounded-[24px] bg-[#fde3e8] px-5 py-4 text-[14px] leading-relaxed text-[#6d5d57]">
              BlindSpark is for adults 18+. For a production launch, identity/age verification should be connected to a dedicated verification provider.
            </div>
          </div>

          <div className="fixed bottom-0 inset-x-0 border-t-2 border-[#2b1b18] bg-[#fffaf4]/95 backdrop-blur z-40">
            <div className="max-w-md mx-auto px-5 pt-5 pb-[calc(18px+env(safe-area-inset-bottom,0px))]">
              <button type="button" disabled={!basicReady} onClick={() => setStep(2)} className="w-full h-[76px] rounded-[28px] bg-gradient-to-r from-[#dd4a5f] to-[#ef7938] text-white text-[24px] font-black shadow-[0_12px_28px_rgba(232,77,89,.18)] disabled:opacity-40">
                Continue
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-md mx-auto px-5 pt-8">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-[32px] leading-none font-black tracking-[-0.04em]">Your personality</h1>
              <p className="text-[18px] text-[#7d6d67] mt-2">Step 2 of 2</p>
            </div>
            <button onClick={() => setStep(1)} className="text-[#e84962] text-[18px] font-extrabold">Edit basics</button>
          </div>

          <div className="h-2 rounded-full bg-[#f3e9e3] overflow-hidden mb-6">
            <div className="h-full w-[70%] rounded-full bg-gradient-to-r from-[#e94160] to-[#f07b36]" />
          </div>

          <div className="space-y-9">
            {QUIZ_QUESTIONS.map((question) => (
              <section key={question.id}>
                <h2 className="text-[22px] leading-tight font-black mb-4">{question.question}</h2>
                <div className="space-y-3">
                  {question.options.map((option, index) => {
                    const selected = quizAnswers[question.id] === String(index);
                    return (
                      <button type="button" key={option.text} onClick={() => setQuizAnswers((prev) => ({ ...prev, [question.id]: String(index) }))} className={`w-full min-h-[64px] rounded-[25px] border-2 px-5 py-3 text-left text-[18px] font-medium transition-all ${
                        selected ? "border-transparent bg-gradient-to-r from-[#e73d5e] to-[#ff6f22] text-white font-extrabold shadow-[0_8px_20px_rgba(231,61,94,.12)]" : "border-[#2b1b18] bg-white text-[#2b1b18]"
                      }`}>
                        {option.text}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          {quizReady && (
            <div className="mt-9 rounded-[28px] border-2 border-[#2b1b18] bg-white p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ed3f60] to-[#ff7b24] text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-[12px] uppercase tracking-[0.12em] font-extrabold text-[#e84962]">Your profile type</p>
                  <h3 className="text-[24px] font-black mt-1">{archetypeInfo.name}</h3>
                  <p className="text-[15px] text-[#7d6d67] mt-1 leading-relaxed">{archetypeInfo.description}</p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {archetypeInfo.traits.map((trait) => <span key={trait} className="rounded-full bg-[#fde3e8] px-3 py-1 text-[12px] font-extrabold text-[#d9445e]">{trait}</span>)}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="h-24" />

          <div className="fixed bottom-0 inset-x-0 border-t-2 border-[#2b1b18] bg-[#fffaf4]/95 backdrop-blur z-40">
            <div className="max-w-md mx-auto px-5 pt-5 pb-[calc(18px+env(safe-area-inset-bottom,0px))]">
              <button type="button" disabled={!quizReady || isSaving} onClick={finish} className="w-full h-[76px] rounded-[28px] bg-gradient-to-r from-[#f48596] to-[#ffad7a] text-white text-[23px] font-black shadow-[0_12px_28px_rgba(232,77,89,.16)] disabled:opacity-40 flex items-center justify-center gap-3">
                <Sparkles className="w-6 h-6" />
                {isSaving ? "Saving…" : "Meet my matches"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
