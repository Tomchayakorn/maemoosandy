/**
 * Tiny client-side bus so a page can push wallet values to the header coin badge instantly
 * (optimistic deduction on click, final balance at the reveal) without waiting for a server refresh.
 * `hold()` makes the badge ignore Realtime/server updates — used during a spin so the live
 * Realtime event (which carries the already-credited prize) can't spoil the result.
 * Display only: the server is always the source of truth.
 */
const EVENT = "bnm:wallet";

type Detail = { balance?: number; hold?: boolean };

let held = false;

export const walletBus = {
  isHeld: () => held,
  hold(balance?: number) {
    held = true;
    emit({ balance, hold: true });
  },
  /** Release the hold and show the server-confirmed balance. */
  release(balance: number) {
    held = false;
    emit({ balance, hold: false });
  },
  set(balance: number) {
    emit({ balance });
  },
  subscribe(fn: (d: Detail) => void) {
    const h = (e: Event) => fn((e as CustomEvent<Detail>).detail);
    window.addEventListener(EVENT, h);
    return () => window.removeEventListener(EVENT, h);
  },
};

function emit(detail: Detail) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(EVENT, { detail }));
}
