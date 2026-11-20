import { CircleEllipsis, Copy, Languages, Reply, Speech, Sticker, TextSelect } from "lucide-react";
import { cn } from "@/lib/utils";

export type Held = { id: string; me: boolean; text: string; html: string; top: number; left: number; width: number; height: number };

const TAPBACKS = ["❤️", "👍", "👎", "😂", "‼️", "❓"];
const MENU_H = 292;

/** iMessage press-and-hold: the thread dims and blurs, tapbacks float above the bubble, actions sit below. */
export function HoldMenu({ held, areaHeight, onClose, onTapback, onReply }: { held: Held; areaHeight: number; onClose: () => void; onTapback: (e: string) => void; onReply: () => void }) {
  // Lift the bubble if the menu would run off the bottom, like iOS does.
  const top = Math.max(70, Math.min(held.top, areaHeight - MENU_H - held.height - 24));
  const side = held.me ? { right: 12 } : { left: 12 };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(held.text);
    } catch {
      /* ignore */
    }
    onClose();
  };
  const speak = () => {
    try {
      window.speechSynthesis?.speak(new SpeechSynthesisUtterance(held.text));
    } catch {
      /* ignore */
    }
    onClose();
  };
  const item = "flex w-full items-center gap-3 px-4 py-[9px] text-left text-[16px] text-ph-ink active:bg-black/5";
  return (
    <div className="absolute inset-0 z-[60]" role="dialog" aria-label="Message actions" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-md" />
      <div className="absolute flex gap-1 rounded-full bg-ph-bar px-2 py-1.5 shadow-lg animate-in fade-in zoom-in-95 duration-150" style={{ top: top - 54, ...side }} onClick={(e) => e.stopPropagation()}>
        {TAPBACKS.map((t) => (
          <button key={t} type="button" onClick={() => onTapback(t)} className="grid h-9 w-9 place-items-center rounded-full text-[22px] active:scale-110" aria-label={`React ${t}`}>
            {t}
          </button>
        ))}
      </div>
      <div className="pointer-events-none absolute" style={{ top, left: held.left, width: held.width }} dangerouslySetInnerHTML={{ __html: held.html }} />
      <div
        className={cn("absolute w-[230px] overflow-hidden rounded-[14px] bg-ph-bar shadow-xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150", held.me ? "origin-top-right" : "origin-top-left")}
        style={{ top: top + held.height + 10, ...side }}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className={item} onClick={onReply}>
          <Reply className="h-[18px] w-[18px]" /> Reply
        </button>
        <button type="button" className={item} onClick={onClose}>
          <Sticker className="h-[18px] w-[18px]" /> Attach Sticker
        </button>
        <div className="h-[6px] bg-black/5" />
        <button type="button" className={item} onClick={copy}>
          <Copy className="h-[18px] w-[18px]" /> Copy
        </button>
        <button type="button" className={item} onClick={onClose}>
          <Languages className="h-[18px] w-[18px]" /> Translate
        </button>
        <button type="button" className={item} onClick={onClose}>
          <TextSelect className="h-[18px] w-[18px]" /> Select
        </button>
        <button type="button" className={item} onClick={speak}>
          <Speech className="h-[18px] w-[18px]" /> Speak
        </button>
        <button type="button" className={item} onClick={onClose}>
          <CircleEllipsis className="h-[18px] w-[18px]" /> More…
        </button>
      </div>
    </div>
  );
}
