import { Phone } from "@/components/phone/Phone";
import { DemoPanel } from "@/components/DemoPanel";
import { useFirstBill } from "@/hooks/useFirstBill";

export default function App() {
  const api = useFirstBill();
  return (
    <main className="min-h-full px-[max(16px,env(safe-area-inset-left,0px))] py-6 sm:py-8">
      <div className="mx-auto grid max-w-[1080px] items-start gap-8 lg:grid-cols-[402px_minmax(0,1fr)] lg:gap-12">
        <Phone api={api} />
        <DemoPanel api={api} />
      </div>
    </main>
  );
}
