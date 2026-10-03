export default function BlindArt({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden bg-[#f7a1af] ${className}`}>
      <div className="absolute -left-[18%] -top-[16%] w-[78%] h-[82%] rounded-[48%] bg-[#ffbd76]/85" />
      <div className="absolute left-[6%] -top-[4%] w-[57%] h-[73%] rounded-[44%] rotate-[-10deg] bg-[#ea244e]/88" />
      <div className="absolute -left-[20%] bottom-[2%] w-[82%] h-[64%] rounded-[48%] bg-[#f98382]/72" />
      <div className="absolute right-[-12%] bottom-[-5%] w-[73%] h-[72%] rounded-[48%] rotate-[14deg] bg-[#ed3158]/80" />
      <div className="absolute left-[46%] top-[41%] w-[22%] h-[24%] rounded-full bg-[#e63258]/65" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[12%] aspect-square rounded-full bg-[#fff3e7]" />
    </div>
  );
}
