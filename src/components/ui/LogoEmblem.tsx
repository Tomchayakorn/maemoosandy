import Image from "next/image";
import logoIcon from "../../../public/logo-icon.png";

/*
 * Brand emblem from public/logo-icon.png (2565×4560, transparent) — an ornate gold
 * ring with crescent moon and star, centred in the canvas and ~56% of its width.
 * We crop it into a circle: object-cover keeps the centre square, then scale by
 * 2565/1440 ≈ 1.78 so the emblem fills the circle edge to edge.
 */
const EMBLEM_SCALE = 1.78;

type Props = {
  /** Tailwind size classes, e.g. "size-10" or "size-28 sm:size-32". */
  className?: string;
  /** CSS pixel width of the circle at each breakpoint (drives the served image size). */
  sizes: string;
  /** Load immediately (use above the fold). */
  eager?: boolean;
  /** Stronger halo for hero use. */
  glow?: "soft" | "strong";
  alt?: string;
};

export function LogoEmblem({ className = "size-10", sizes, eager, glow = "soft", alt = "" }: Props) {
  return (
    <span
      className={
        "relative inline-flex shrink-0 rounded-full p-[1.5px] " +
        // thin polished-gold ring
        "bg-[conic-gradient(from_210deg,#7a5a12,#f9e7a6,#d4af37,#fff6d5,#b8891f,#6e4f0e,#f3d98b,#7a5a12)] " +
        (glow === "strong"
          ? "shadow-[0_0_28px_rgb(212_175_55/0.55),0_0_70px_rgb(212_175_55/0.25)] "
          : "shadow-[0_0_10px_rgb(212_175_55/0.45)] ") +
        className
      }
    >
      <span className="relative size-full overflow-hidden rounded-full bg-[radial-gradient(circle_at_50%_38%,#2a2160_0%,#141036_55%,#0b0a12_100%)]">
        <Image
          src={logoIcon}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          className="object-cover drop-shadow-[0_0_6px_rgb(243_217_139/0.35)]"
          style={{ transform: `scale(${EMBLEM_SCALE})` }}
        />
      </span>
    </span>
  );
}
