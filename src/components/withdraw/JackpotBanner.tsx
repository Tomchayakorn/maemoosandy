import Link from "next/link";
import { goldButtonClass } from "@/components/ui/GoldButton";

/** Golden call-out shown while the player holds an unused 5,000 THB jackpot withdrawal right. */
export function JackpotBanner({ count }: { count: number }) {
  return (
    <div
      data-testid="jackpot-banner"
      className="border-gold-frame flex w-full flex-col items-center gap-3 rounded-3xl bg-[linear-gradient(160deg,rgb(60_45_8/0.9),rgb(21_19_31/0.95))] px-5 py-5 text-center shadow-[0_0_32px_-8px_rgb(212_175_55/0.7)]"
    >
      <p className="font-serif text-xl font-bold leading-snug text-gold-light">🎉 ยินดีด้วย! คุณได้รับสิทธิ์ถอนรางวัลแจ็กพอต 5,000 บาท (คงเหลือ {count} สิทธิ์)</p>
      <Link href="/withdraw" className={goldButtonClass({ size: "lg", className: "w-full" })}>
        กดขอถอนเงิน 5,000 บาท ทันที →
      </Link>
    </div>
  );
}
