import { Suspense } from "react";
import { VoucherTrigger } from "@/components/voucher/VoucherTrigger";
import { CatSurpriseHost } from "@/components/cat-game/CatSurpriseHost";
import { Hero } from "@/components/home/Hero";
import { ServiceCard } from "@/components/home/ServiceCard";
import { GoldButton } from "@/components/ui/GoldButton";
import { MysticCard } from "@/components/ui/MysticCard";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CoinIcon, StarChartIcon, TarotIcon, WheelIcon } from "@/components/ui/icons";
import { FORTUNE_PRICES, formatCoins } from "@/lib/pricing";

// Static page; the header's user area and the cat-game surprise pop-up stream in separately (they read the session).
export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col pb-[max(8rem,calc(env(safe-area-inset-bottom)+7rem))] sm:max-w-2xl">
      <Hero />
      <Suspense fallback={null}>
        <CatSurpriseHost />
      </Suspense>

      {/* กิจกรรมพิเศษ: compact so the main game cards stay high on the phone screen */}
      <section className="mb-3 px-4" aria-label="โค้ดลับจากแม่มู">
        <VoucherTrigger variant="card" />
      </section>

      <section className="flex flex-col gap-4 px-4" aria-labelledby="services-title">
        <div id="services-title">
          <SectionTitle sub="เลือกศาสตร์ที่ใจเรียกหา">บริการเปิดดวงชะตา</SectionTitle>
        </div>

        <ServiceCard
          index={0}
          href="/tarot"
          highlight
          title="เปิดไพ่ยิปซีสื่อจิต 3 ใบ"
          description="ตั้งจิตอธิษฐาน ถามเรื่องที่ค้างคาใจ แม่มูเปิดไพ่ อดีต · ปัจจุบัน · อนาคต"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> {formatCoins(FORTUNE_PRICES.tarot)} เหรียญ
            </span>
          }
          icon={<TarotIcon className="size-10" />}
        />
        <ServiceCard
          index={1}
          href="/birthdate"
          title="ตรวจดวงชะตาจากชื่อและวันเดือนปีเกิด"
          description="ถอดรหัสเลขศาสตร์ชื่อ-สกุล ทักษา ปีนักษัตร และราศี พร้อมสีและเลขมงคลเฉพาะตัว"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> {formatCoins(FORTUNE_PRICES.birthdate)} เหรียญ
            </span>
          }
          icon={<StarChartIcon className="size-10" />}
        />
        <ServiceCard
          index={2}
          href="/lucky-wheel"
          badge="🏆 แจ็กพอตใหญ่ ถอนได้"
          badgeTone="gold"
          title="กงล้อมหาเฮง ลุ้นโชคเสริมดวง"
          description="หมุนลุ้นเหรียญโบนัสและสิทธิ์ดูดวงฟรี เช็กอินทุกวันรับสิทธิ์หมุนเพิ่ม"
          price="ฟรี / ใช้สิทธิ์หมุน"
          icon={<WheelIcon className="size-10" />}
        />
        <ServiceCard
          index={3}
          href="/lucky-card"
          badge="🃏 เทพประทาน แจ็กพอตจริง"
          badgeTone="gold"
          title="ดวงดี มีเฮ เปิดไพ่ลุ้นโชค"
          description="เปิดไพ่ 1 ใบจาก 8 ใบ ลุ้น 108 ข้อความมงคล โบนัส 100 / 300 / 500 เหรียญ และรางวัลลับ “เทพประทานทรัพย์”"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> {formatCoins(20)} เหรียญ / เปิด 1 ใบ
            </span>
          }
          icon={<TarotIcon className="size-10" />}
        />
        <ServiceCard
          index={4}
          href="/cat-game"
          title="น้องเหมียว 9 ชีวิต จิ้มเหมียวลุ้นโชค"
          description="จิ้มน้องเหมียว 1 ตัวจาก 9 ตัว ลุ้นเหรียญ 200 / 300 / 400 / 500 / 1,000 เหรียญ โอกาสเท่ากัน เล่นได้วันละ 1 ครั้ง"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> {formatCoins(9)} เหรียญ / วันละ 1 ครั้ง
            </span>
          }
          icon={<span className="text-4xl leading-none">🐱</span>}
        />
        <ServiceCard
          index={5}
          href="/mystic-chests"
          badge="💎 เปิดปุ๊บ รับปั๊บ"
          badgeTone="gold-red"
          title="เปิดหีบมนตรา วัดใจสะสมตัวคูณ"
          description="เปิดหีบทีละใบ หลบจุดอาถรรพ์ 1–3 จุด ตัวคูณยิ่งเปิดยิ่งสูง กดรับเหรียญเมื่อไรก็ได้ รับสูงสุด 5,000 เหรียญต่อรอบ"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> เดิมพัน 10 – 100 เหรียญ
            </span>
          }
          icon={<span className="text-4xl leading-none">🎁</span>}
        />
        <ServiceCard
          index={6}
          href="/power-wheel"
          badge="⚡ ไต่ไว รับง่าย"
          badgeTone="violet"
          title="วงล้อไต่ชั้น สะสมพลัง เสี่ยงข้ามชั้น"
          description="หมุนวงล้อไต่ชั้นทีละขั้น พลังสะสมยิ่งสูง ตัดสินใจหยุดรับเหรียญหรือเสี่ยงหมุนต่อ โบนัสสูงสุดต่อรอบ 3,000 เหรียญ รางวัลสะสมเข้ากระเป๋าเหรียญ"
          price={
            <span className="inline-flex items-center gap-1">
              <CoinIcon className="size-4" /> เดิมพัน 10 – 100 เหรียญ
            </span>
          }
          icon={<span className="text-4xl leading-none">⚡</span>}
        />
      </section>

      <section className="mt-8 px-4">
        <MysticCard className="flex flex-col items-center gap-4 overflow-hidden px-5 py-7 text-center">
          <div
            aria-hidden
            className="absolute -top-16 left-1/2 size-48 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgb(212_175_55/0.25),transparent_70%)]"
          />
          <CoinIcon className="relative size-12 drop-shadow-[0_0_14px_rgb(212_175_55/0.6)]" />
          <div className="relative flex flex-col gap-1">
            <h2 className="font-serif text-lg font-semibold text-gold-light">เติมเหรียญเสริมบารมี</h2>
            <p className="text-sm text-cream-muted">
              สแกนพร้อมเพย์ เหรียญเข้าทันทีหลังตรวจสลิป
              <br />
              แพ็กเกจใหญ่ได้เหรียญโบนัสเพิ่มสูงสุด 10%
            </p>
          </div>
          <GoldButton href="/topup" size="lg" className="relative w-full max-w-xs">
            <CoinIcon className="size-5" /> เติมเหรียญเลย
          </GoldButton>
        </MysticCard>
      </section>

      <footer className="mt-10 px-4 text-center text-xs leading-relaxed text-cream-muted/70">
        © บ้าน ณ มัณตรา · แม่มูแซนดี้ ทำนายดวงชะตา
        <br />
        คำทำนายเพื่อเป็นแนวทางและกำลังใจในการใช้ชีวิต
      </footer>
    </main>
  );
}

