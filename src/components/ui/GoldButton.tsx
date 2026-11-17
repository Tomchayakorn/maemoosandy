import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "solid" | "outline" | "ghost";
type Size = "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium transition " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-light focus-visible:ring-offset-2 " +
  "focus-visible:ring-offset-velvet disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]";

const variants: Record<Variant, string> = {
  solid:
    "bg-[linear-gradient(135deg,var(--gold-light),var(--gold)_45%,var(--gold-deep))] text-velvet " +
    "shadow-[0_6px_24px_-6px_rgb(212_175_55/0.6)] hover:brightness-110",
  outline: "border border-gold/60 text-gold-light hover:bg-gold/10",
  ghost: "text-gold-light hover:bg-gold/10",
};

const sizes: Record<Size, string> = {
  md: "h-11 px-5 text-sm",
  lg: "h-14 px-7 text-base",
};

type Common = { variant?: Variant; size?: Size; className?: string; children: ReactNode };

export function goldButtonClass({
  variant = "solid",
  size = "md",
  className = "",
}: Omit<Common, "children">) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

/** Gold call-to-action. Renders a <Link> when `href` is given, otherwise a <button>. */
export function GoldButton(
  props: (Common & { href: string } & Omit<ComponentProps<typeof Link>, "href" | "className">) |
    (Common & { href?: undefined } & Omit<ComponentProps<"button">, "className">),
) {
  const { variant, size, className, children, ...rest } = props;
  const cls = goldButtonClass({ variant, size, className });

  if (rest.href !== undefined) {
    const { href, ...linkRest } = rest as { href: string } & Omit<ComponentProps<typeof Link>, "href">;
    return (
      <Link href={href} className={cls} {...linkRest}>
        {children}
      </Link>
    );
  }
  const buttonRest = rest as ComponentProps<"button">;
  return (
    <button type={buttonRest.type ?? "button"} className={cls} {...buttonRest}>
      {children}
    </button>
  );
}
