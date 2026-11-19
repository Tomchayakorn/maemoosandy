import type { Metadata, Viewport } from "next";
import { Charm, Cinzel, Noto_Serif_Thai, Prompt } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { BgmBootstrap } from "@/components/audio/BgmBootstrap";
import LineSupportButton from "@/components/LineSupportButton";
const prompt = Prompt({
  variable: "--font-prompt",
  subsets: ["thai", "latin"],
  weight: ["300", "400", "500", "600"],
  display: "swap",
});

const charm = Charm({
  variable: "--font-charm",
  subsets: ["thai", "latin"],
  weight: ["400", "700"],
  display: "swap",
});

const notoSerifThai = Noto_Serif_Thai({
  variable: "--font-noto-serif-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "600"],
  display: "swap",
});

// Classic engraved-style capitals for tarot card titles and numerals.
const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  applicationName: "แม่มูแซนดี้ บ้าน ณ มัณตรา",
  openGraph: {
    type: "website",
    locale: "th_TH",
    siteName: "แม่มูแซนดี้ บ้าน ณ มัณตรา",
    title: "แม่มูแซนดี้ ทำนายดวงชะตา | บ้าน ณ มัณตรา",
    description: "ไพ่ยิปซีสื่อจิต ตรวจดวงจากชื่อและวันเดือนปีเกิด และกงล้อมหาเฮงเสริมดวง",
  },
  twitter: { card: "summary_large_image" },
  title: {
    default: "แม่มูแซนดี้ ทำนายดวงชะตา | บ้าน ณ มัณตรา",
    template: "%s | แม่มูแซนดี้ บ้าน ณ มัณตรา",
  },
  description:
    "เปิดดวงชะตากับแม่มูแซนดี้ แห่งบ้าน ณ มัณตรา — ไพ่ยิปซีสื่อจิต ตรวจดวงจากชื่อและวันเดือนปีเกิด และกงล้อมหาเฮงเสริมดวง",
};

export const viewport: Viewport = {
  themeColor: "#0b0a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="th"
      className={`${prompt.variable} ${charm.variable} ${notoSerifThai.variable} ${cinzel.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <Header />
        {children}
        <BgmBootstrap />
        <LineSupportButton />
      </body>
    </html>
  );
}
