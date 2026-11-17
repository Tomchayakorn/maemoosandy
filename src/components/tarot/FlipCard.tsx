"use client";

import { forwardRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { CardBack, CardFace } from "./CardArt";
import type { DrawnCardView } from "@/lib/tarot/deck";

type Props = {
  card: DrawnCardView | null;
  flipped: boolean;
  className?: string;
  onFlipped?: () => void;
};

/**
 * 3D card that turns from its back to its face when `flipped` becomes true.
 * Once revealed it floats gently on a breathing golden aura, and a sweep of
 * light crosses the face.
 */
export const FlipCard = forwardRef<HTMLDivElement, Props>(function FlipCard(
  { card, flipped, className = "", onFlipped },
  ref,
) {
  const reduce = useReducedMotion();
  const [revealed, setRevealed] = useState(false);

  return (
    <motion.div
      ref={ref}
      className={`relative ${className}`}
      animate={revealed && !reduce ? { y: [0, -6, 0] } : { y: 0 }}
      transition={revealed && !reduce ? { duration: 4.2, repeat: Infinity, ease: "easeInOut" } : { duration: 0.3 }}
    >
      {revealed && <span aria-hidden className="tarot-aura" />}

      <div className="perspective-1000 relative aspect-[5/8]">
        <motion.div
          className="preserve-3d relative size-full"
          initial={false}
          animate={{ rotateY: flipped ? 180 : 0, scale: flipped ? [1, 1.08, 1] : 1 }}
          transition={reduce ? { duration: 0 } : { duration: 0.9, ease: [0.3, 0.7, 0.2, 1] }}
          onAnimationComplete={() => {
            if (flipped && !revealed) {
              setRevealed(true);
              onFlipped?.();
            }
          }}
        >
          <div className="backface-hidden absolute inset-0 drop-shadow-[0_10px_20px_rgb(0_0_0/0.55)]">
            <CardBack />
          </div>
          <div
            className="tarot-sheen backface-hidden absolute inset-0 overflow-hidden rounded-[7%] drop-shadow-[0_0_16px_rgb(212_175_55/0.5)]"
            data-shine={revealed}
            style={{ transform: "rotateY(180deg)" }}
          >
            {card && <CardFace card={card} reversed={card.isReversed} />}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
});
