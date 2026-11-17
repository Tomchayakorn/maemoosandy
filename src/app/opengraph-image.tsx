import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "แม่มูแซนดี้ ทำนายดวงชะตา | บ้าน ณ มัณตรา";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "แม่มูแซนดี้";
const SUB = "ทำนายดวงชะตา · บ้าน ณ มัณตรา";
const TAGLINE = "ไพ่ยิปซี · ดวงวันเกิด · กงล้อมหาเฮง";

/** Thai glyph subset from Google Fonts; null if offline (the image then shows the emblem only). */
async function loadThaiFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=Noto+Serif+Thai:wght@600&text=${encodeURIComponent(text)}`,
      )
    ).text();
    const url = css.match(/src: url\((.+?)\) format/)?.[1];
    if (!url) return null;
    return await (await fetch(url)).arrayBuffer();
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const emblem = await readFile(join(process.cwd(), "src/app/icon.png"));
  const emblemSrc = `data:image/png;base64,${emblem.toString("base64")}`;
  const font = await loadThaiFont(TITLE + SUB + TAGLINE);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 56,
          background: "radial-gradient(circle at 30% 40%, #1b2447 0%, #0b0a12 70%)",
          color: "#f6efdc",
          fontFamily: font ? "Noto Serif Thai" : "sans-serif",
        }}
      >
        <img src={emblemSrc} width={380} height={380} alt="" />
        {font && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ fontSize: 96, color: "#f3d98b", lineHeight: 1.2 }}>{TITLE}</div>
            <div style={{ fontSize: 40, color: "#d4af37" }}>{SUB}</div>
            <div style={{ fontSize: 30, opacity: 0.8 }}>{TAGLINE}</div>
          </div>
        )}
      </div>
    ),
    {
      ...size,
      fonts: font ? [{ name: "Noto Serif Thai", data: font, weight: 600, style: "normal" }] : undefined,
    },
  );
}
