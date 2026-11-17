import type { ComponentProps } from "react";

/** Velvet card with a thin gold frame and soft inner glow. */
export function MysticCard({ className = "", ...props }: ComponentProps<"div">) {
  return (
    <div
      className={
        "border-gold-frame relative rounded-3xl bg-[linear-gradient(160deg,rgb(21_19_31/0.92),rgb(10_16_36/0.92))] " +
        "backdrop-blur-sm " +
        className
      }
      {...props}
    />
  );
}
