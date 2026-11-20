import { Phone } from "@/components/phone/Phone";
import { DemoPanel } from "@/components/DemoPanel";
import { useFirstBill } from "@/hooks/useFirstBill";

/** Phone-only, full screen: on a phone, when opened from the Home Screen, or with #phone in the link. */
function isPhoneOnly() {
  if (typeof window === "undefined") return false;
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || /[#?&]phone\b/.test(window.location.href) || window.innerWidth < 640;
}

export default function App() {
  const api = useFirstBill();
  if (isPhoneOnly()) {
    return (
      <div className="fixed inset-0 bg-ph-bg">
        <Phone api={api} fullscreen />
      </div>
    );
  }
  return (
    <main className="min-h-full px-[max(16px,env(safe-area-inset-left,0px))] py-6 sm:py-8">
      <div className="mx-auto grid max-w-[1080px] items-start gap-8 lg:grid-cols-[402px_minmax(0,1fr)] lg:gap-12">
        <Phone api={api} />
        <DemoPanel api={api} />
      </div>
    </main>
  );
}
