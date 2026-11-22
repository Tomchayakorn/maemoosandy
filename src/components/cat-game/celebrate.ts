import { goldCelebration, goldSparkleAt } from "@/components/fx/confetti";

/** Bigger prize = bigger celebration (shared by the game page and the surprise pop-up). */
export function celebrateCatReward(reward: number, tile: HTMLElement | null): void {
  if (reward >= 1000) {
    for (let i = 0; i < 5; i++) setTimeout(goldCelebration, i * 600);
  } else if (reward >= 500) {
    goldCelebration();
    setTimeout(goldCelebration, 500);
  } else if (reward >= 300) {
    goldSparkleAt(tile);
    setTimeout(goldCelebration, 150);
  } else {
    goldSparkleAt(tile);
  }
}
