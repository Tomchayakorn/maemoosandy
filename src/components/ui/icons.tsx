import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

/** Brand emblem: crescent moon cradling a star. */
export function EmblemIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden {...props}>
      <defs>
        <linearGradient id="emblem-gold" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0" stopColor="#f3d98b" />
          <stop offset="0.55" stopColor="#d4af37" />
          <stop offset="1" stopColor="#a8841f" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="22.5" stroke="url(#emblem-gold)" strokeOpacity="0.6" />
      <path
        d="M30.5 9.5a15 15 0 1 0 8 26.6A12.5 12.5 0 1 1 30.5 9.5Z"
        fill="url(#emblem-gold)"
      />
      <path
        d="m29 17 1.6 3.6 3.9.4-2.9 2.6.8 3.9L29 25.5l-3.4 2 .8-3.9-2.9-2.6 3.9-.4L29 17Z"
        fill="#f6efdc"
      />
    </svg>
  );
}

export function CoinIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" fill="#d4af37" />
      <circle cx="12" cy="12" r="7.5" stroke="#a8841f" strokeWidth="1.2" />
      <path d="m12 7.5 1.2 2.7 2.9.3-2.2 1.9.6 2.9L12 13.8l-2.5 1.5.6-2.9-2.2-1.9 2.9-.3L12 7.5Z" fill="#f3d98b" />
    </svg>
  );
}

export function TarotIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden {...props}>
      <rect x="6" y="12" width="18" height="28" rx="2.5" transform="rotate(-12 15 26)" />
      <rect x="15" y="8" width="18" height="28" rx="2.5" />
      <rect x="24" y="12" width="18" height="28" rx="2.5" transform="rotate(12 33 26)" />
      <path d="M24 16.5 25.4 20l3.6.3-2.7 2.4.8 3.5-3.1-1.9-3.1 1.9.8-3.5-2.7-2.4 3.6-.3L24 16.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function StarChartIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden {...props}>
      <circle cx="24" cy="24" r="18" />
      <circle cx="24" cy="24" r="11" strokeDasharray="2 3" />
      <path d="M24 6v6M24 36v6M6 24h6M36 24h6M11.3 11.3l4.2 4.2M32.5 32.5l4.2 4.2M11.3 36.7l4.2-4.2M32.5 15.5l4.2-4.2" />
      <path d="M24 18.5 25.6 22l3.8.4-2.9 2.5.9 3.7-3.4-2-3.4 2 .9-3.7-2.9-2.5 3.8-.4L24 18.5Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function WheelIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden {...props}>
      <circle cx="24" cy="26" r="17" />
      <circle cx="24" cy="26" r="3" fill="currentColor" />
      <path d="M24 9v34M7 26h34M12 14l24 24M36 14 12 38" strokeOpacity="0.7" />
      <path d="m20 4 4 6 4-6h-8Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden {...props}>
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

export function GoogleIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.6 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12Z" />
    </svg>
  );
}

export function LineIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <rect width="24" height="24" rx="6" fill="#06C755" />
      <path
        fill="#fff"
        d="M19.4 11.1c0-3.3-3.3-6-7.4-6s-7.4 2.7-7.4 6c0 3 2.6 5.4 6.2 5.9.2.1.6.2.7.4.1.2.1.5 0 .7l-.1.6c0 .2-.2.7.6.4.8-.3 4.2-2.5 5.8-4.3 1.1-1.1 1.6-2.3 1.6-3.7Z"
      />
    </svg>
  );
}
