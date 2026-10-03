import { Profile } from "../types";
import { ARCHETYPES } from "../data";
import { X, MapPin, User, MessageCircle, Shield, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ProfileDetailsModalProps {
  partner: Profile;
  matchScore?: number;
  onClose: () => void;
  onUnmatch?: () => void;
  onBlock?: () => void;
}

export default function ProfileDetailsModal({
  partner,
  matchScore,
  onClose,
  onUnmatch,
  onBlock,
}: ProfileDetailsModalProps) {
  const arch = ARCHETYPES[partner.archetype] || ARCHETYPES.idealist;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-950/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="w-full max-w-md bg-white border border-stone-200/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Hero Area */}
        <div className={`p-6 bg-gradient-to-tr ${arch.gradient} border-b border-stone-200/50 relative shrink-0`}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-white/80 hover:bg-white border border-stone-200/40 hover:border-stone-300 rounded-xl text-stone-600 hover:text-stone-900 transition-all cursor-pointer shadow-xs"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-1.5 mb-2">
            <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-white border border-stone-200/80 ${arch.textColor.replace('-400', '-600')} shadow-xs`}>
              {arch.name}
            </span>
            {matchScore && (
              <span className="text-[9px] font-black uppercase px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-600 shadow-xs">
                {matchScore}% Vibe Sync
              </span>
            )}
          </div>

          <h2 className="text-2xl font-black font-display tracking-tight text-stone-900 mb-1">
            {partner.name}, <span className="font-semibold text-stone-600">{partner.age}</span>
          </h2>

          <div className="flex items-center gap-1 text-xs text-stone-500 font-medium">
            <MapPin className="w-3.5 h-3.5 text-rose-500" />
            <span>Resides in {partner.location}</span>
          </div>
        </div>

        {/* Scrollable Profile Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-[#FCFAF7] scrollbar-none">
          {/* Tagline */}
          <div className="border-l-2 border-stone-300 pl-4 italic text-stone-600 text-xs font-medium leading-relaxed">
            "{arch.tagline}"
          </div>

          {/* About/Bio section */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-black text-stone-400 mb-2">My Spark Bio</h4>
            <p className="text-xs text-stone-700 leading-relaxed font-medium bg-white border border-stone-200/60 rounded-2xl p-4 shadow-2xs">
              {partner.bio}
            </p>
          </div>

          {/* Traits Section */}
          <div>
            <h4 className="text-[10px] uppercase tracking-widest font-black text-stone-400 mb-2">Personality Signatures</h4>
            <div className="flex flex-wrap gap-1.5">
              {arch.traits.map((trait) => (
                <span
                  key={trait}
                  className="text-xs px-3 py-1 bg-white border border-stone-200/80 rounded-full font-semibold text-stone-700 shadow-2xs"
                >
                  ✨ {trait}
                </span>
              ))}
            </div>
          </div>

          {/* Archetype Description */}
          <div className="bg-stone-50 border border-stone-200/60 rounded-2xl p-4 space-y-2">
            <h5 className="text-[10px] font-black text-stone-800 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>About {arch.name} Archetype</span>
            </h5>
            <p className="text-[11px] text-stone-500 leading-relaxed font-medium">
              {arch.description}
            </p>
          </div>

          {/* Spark Prompts Section */}
          {partner.sparkPrompts && Object.keys(partner.sparkPrompts).length > 0 && (
            <div className="space-y-4">
              <h4 className="text-[10px] uppercase tracking-widest font-black text-stone-400">Spark Prompts</h4>
              {Object.entries(partner.sparkPrompts).map(([question, answer]) => (
                <div key={question} className="bg-white border border-stone-200/60 rounded-2xl p-4 shadow-2xs space-y-1.5">
                  <p className="text-[10px] font-extrabold text-stone-400 uppercase tracking-wider">{question}</p>
                  <p className="text-xs text-stone-850 leading-relaxed font-medium font-serif italic">
                    "{answer}"
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Safety Warning */}
          <div className="p-3 bg-stone-50 border border-stone-200/50 rounded-xl text-center text-[9px] text-stone-400 font-medium">
            🛡️ blindSpark maintains complete anonymity. No pictures or visual uploads can be requested.
          </div>
        </div>

        {/* Action Button Panel at bottom */}
        <div className="p-4 bg-white border-t border-stone-200/60 flex gap-2 shrink-0">
          {onUnmatch && (
            <button
              onClick={onUnmatch}
              className="flex-1 py-2.5 px-4 border border-rose-200/80 hover:border-rose-400 text-rose-600 hover:bg-rose-50/30 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancel Match</span>
            </button>
          )}

          {onBlock && (
            <button
              onClick={onBlock}
              className="flex-1 py-2.5 px-4 bg-stone-50 hover:bg-stone-100 text-stone-500 hover:text-stone-800 border border-stone-200/60 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Block Profile</span>
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
