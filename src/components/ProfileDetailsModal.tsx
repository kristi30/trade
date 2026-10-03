import { useState } from "react";
import { X, MapPin, Shield, Sparkles, Ruler, Flag, Lock, Camera, Mic } from "lucide-react";
import { motion } from "motion/react";
import { ARCHETYPES } from "../data";
import { Profile } from "../types";
import { formatHeight, getCompatibilitySummary } from "../productLogic";

interface ProfileDetailsModalProps {
  currentUser: Profile;
  partner: Profile;
  matchScore?: number;
  onClose: () => void;
  onUnmatch?: () => void;
  onBlock?: () => void;
  onReport?: (reason: string) => void;
}

const reportReasons = ["Fake profile", "Harassment", "Inappropriate content", "Spam", "Safety concern", "Other"];

export default function ProfileDetailsModal({
  currentUser,
  partner,
  matchScore,
  onClose,
  onUnmatch,
  onBlock,
  onReport,
}: ProfileDetailsModalProps) {
  const [showReport, setShowReport] = useState(false);
  const arch = ARCHETYPES[partner.archetype] || ARCHETYPES.idealist;
  const compatibility = getCompatibilitySummary(currentUser, partner);

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-[#2b1b18]/45 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-md bg-[#fffaf4] border-2 border-[#2b1b18] rounded-[34px] shadow-2xl overflow-hidden flex flex-col max-h-[92dvh]"
      >
        <div className={`p-6 bg-gradient-to-tr ${arch.gradient} border-b border-[#eaded8] relative shrink-0`}>
          <button onClick={onClose} className="absolute top-4 right-4 w-11 h-11 bg-white/85 rounded-full flex items-center justify-center border border-[#eaded8]">
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-wrap items-center gap-2 mb-3 pr-12">
            <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full bg-white border border-[#eaded8] text-[#d9445e]">
              {arch.name}
            </span>
            <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full bg-[#e84962] text-white">
              {matchScore || compatibility.score}% match
            </span>
            {(partner.isAI || partner.id.startsWith("seed_")) && (
              <span className="text-[11px] font-black uppercase px-3 py-1.5 rounded-full bg-white border border-[#eaded8]">Demo</span>
            )}
          </div>

          <h2 className="text-[30px] font-black tracking-[-0.04em]">{partner.name}, {partner.age}</h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[15px] text-[#75655f] font-semibold">
            <span className="inline-flex items-center gap-1"><MapPin className="w-4 h-4 text-[#e84962]" /> {partner.location}</span>
            {partner.heightCm && <span className="inline-flex items-center gap-1"><Ruler className="w-4 h-4 text-[#e84962]" /> {formatHeight(partner.heightCm)}</span>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 scrollbar-none">
          <div className="rounded-[24px] border-2 border-[#2b1b18] bg-white p-4">
            <p className="text-[12px] uppercase tracking-widest font-black text-[#e84962]">Profile type</p>
            <h3 className="text-[22px] font-black mt-1">{arch.name}</h3>
            <p className="text-[14px] text-[#75655f] mt-2 leading-relaxed">{arch.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {arch.traits.map((trait) => <span key={trait} className="rounded-full bg-[#fde3e8] px-3 py-1 text-[12px] font-extrabold text-[#d9445e]">{trait}</span>)}
            </div>
          </div>

          <div>
            <h4 className="text-[12px] uppercase tracking-widest font-black text-[#8b7d76] mb-2">About</h4>
            <p className="text-[16px] leading-relaxed rounded-[24px] border-2 border-[#2b1b18] bg-white p-4">
              {partner.bio || "Still keeping a little mystery."}
            </p>
          </div>

          <div>
            <h4 className="text-[12px] uppercase tracking-widest font-black text-[#8b7d76] mb-2">Why you fit</h4>
            <div className="space-y-2">
              {compatibility.reasons.slice(0, 4).map((reason) => (
                <div key={reason} className="rounded-[20px] bg-white border border-[#eaded8] px-4 py-3 text-[14px] leading-relaxed">
                  <Sparkles className="w-4 h-4 text-[#e84962] inline mr-2" />{reason}
                </div>
              ))}
            </div>
          </div>

          {partner.sparkPrompts && Object.keys(partner.sparkPrompts).length > 0 && (
            <div className="space-y-3">
              <h4 className="text-[12px] uppercase tracking-widest font-black text-[#8b7d76]">Prompts</h4>
              {Object.entries(partner.sparkPrompts).map(([question, answer]) => (
                <div key={question} className="bg-white border-2 border-[#2b1b18] rounded-[22px] p-4">
                  <p className="text-[12px] font-black text-[#e84962]">{question}</p>
                  <p className="text-[15px] mt-1 leading-relaxed">“{answer}”</p>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-[24px] bg-[#fde3e8] p-4">
            <h4 className="font-black text-[16px] mb-3">Conversation unlocks</h4>
            <div className="space-y-2 text-[13px]">
              <div className="flex gap-2"><Lock className="w-4 h-4 text-[#d9445e] shrink-0" /> Start with personality only.</div>
              <div className="flex gap-2"><Sparkles className="w-4 h-4 text-[#d9445e] shrink-0" /> 15 texts: deeper profile prompt.</div>
              <div className="flex gap-2"><Camera className="w-4 h-4 text-[#d9445e] shrink-0" /> 30 / 50 / 80 texts: 1 photo / 2 photos / unlimited.</div>
              <div className="flex gap-2"><Mic className="w-4 h-4 text-[#d9445e] shrink-0" /> 100 texts: voice notes.</div>
            </div>
          </div>

          {showReport && (
            <div className="rounded-[24px] border-2 border-[#2b1b18] bg-white p-4">
              <h4 className="font-black text-[16px] mb-3">Why are you reporting this profile?</h4>
              <div className="grid grid-cols-2 gap-2">
                {reportReasons.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    onClick={() => { onReport?.(reason); setShowReport(false); }}
                    className="rounded-[16px] border border-[#eaded8] bg-[#fffaf4] px-3 py-3 text-[12px] font-bold text-left"
                  >
                    {reason}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-[20px] bg-white border border-[#eaded8] p-3 text-[11px] text-[#806f68] leading-relaxed">
            Safety first: never share passwords, financial details, or private codes. Meet in public and use Block/Report whenever something feels wrong.
          </div>
        </div>

        <div className="p-4 bg-white border-t border-[#eaded8] grid grid-cols-3 gap-2 shrink-0">
          {onUnmatch && (
            <button onClick={onUnmatch} className="py-3 px-2 border-2 border-[#2b1b18] rounded-[18px] font-bold text-[12px] flex items-center justify-center gap-1">
              <X className="w-4 h-4" /> Unmatch
            </button>
          )}
          {onBlock && (
            <button onClick={onBlock} className="py-3 px-2 border-2 border-[#2b1b18] rounded-[18px] font-bold text-[12px] flex items-center justify-center gap-1">
              <Shield className="w-4 h-4" /> Block
            </button>
          )}
          <button onClick={() => setShowReport((value) => !value)} className="py-3 px-2 border-2 border-[#e84962] text-[#d9445e] rounded-[18px] font-bold text-[12px] flex items-center justify-center gap-1">
            <Flag className="w-4 h-4" /> Report
          </button>
        </div>
      </motion.div>
    </div>
  );
}
