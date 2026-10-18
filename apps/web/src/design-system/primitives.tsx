import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  ReactNode,
  SVGProps,
} from "react";

export type IconName =
  | "arrow-left"
  | "arrow-up-right"
  | "book-open"
  | "check"
  | "cloud-off"
  | "compass"
  | "chevron-down"
  | "clock"
  | "headphones"
  | "lock"
  | "mic"
  | "more"
  | "play"
  | "plus"
  | "spark"
  | "sliders"
  | "sound"
  | "text-cursor"
  | "waveform";

const iconPaths: Record<IconName, ReactNode> = {
  "arrow-left": <path d="m11 5-5 5 5 5M6 10h12" />,
  "arrow-up-right": <path d="M7 17 17 7M8 7h9v9" />,
  "book-open": (
    <>
      <path d="M3.5 5.5A2.5 2.5 0 0 1 6 3h4.5v15H6a2.5 2.5 0 0 0-2.5 2.5z" />
      <path d="M20.5 5.5A2.5 2.5 0 0 0 18 3h-4.5v15H18a2.5 2.5 0 0 1 2.5 2.5z" />
    </>
  ),
  check: <path d="m5 12 4 4L19 6" />,
  "cloud-off": <path d="m5 5 14 14M5.5 18.5A4.5 4.5 0 0 1 7 9.8 6.5 6.5 0 0 1 19.2 12" />,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 4-4 2 2-4z" /></>,
  "chevron-down": <path d="m6 9 6 6 6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  headphones: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14h3v5H5.5A1.5 1.5 0 0 1 4 17.5zM20 14h-3v5h1.5a1.5 1.5 0 0 0 1.5-1.5z" />
    </>
  ),
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  mic: (
    <>
      <rect x="8.5" y="3" width="7" height="11" rx="3.5" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M8 21h8" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  play: <path d="m9 6 9 6-9 6z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  spark: (
    <>
      <path d="m12 3 1.3 5.7L19 10l-5.7 1.3L12 17l-1.3-5.7L5 10l5.7-1.3z" />
      <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="9" cy="7" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  "text-cursor": <><path d="M6 5h12M6 19h12M9 5v14M15 5v14" /></>,
  sound: (
    <>
      <path d="M4 10v4h3l4 3V7l-4 3z" />
      <path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.5 7.5 0 0 1 0 10" />
    </>
  ),
  waveform: <path d="M3 12h2l1.5-5 3 10 3-14 3 14 1.5-5H21" />,
};

export function Icon({
  name,
  size = 18,
  strokeWidth = 1.8,
  ...props
}: { name: IconName; size?: number; strokeWidth?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}

export type ButtonVariant = "accent" | "ghost" | "outline" | "primary";

export function Button({
  children,
  className = "",
  icon,
  size = "md",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  className?: string;
  icon?: IconName;
  size?: "sm" | "md" | "lg";
  variant?: ButtonVariant;
}) {
  return (
    <button
      className={`button button--${variant} button--${size} ${className}`.trim()}
      type="button"
      {...props}
    >
      <span>{children}</span>
      {icon ? <Icon name={icon} size={size === "sm" ? 15 : 17} /> : null}
    </button>
  );
}

export function Kicker({ children, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p className="kicker" {...props}>
      {children}
    </p>
  );
}

export function StatusDot({ tone = "quiet" }: { tone?: "active" | "quiet" | "warm" }) {
  return <span aria-hidden="true" className={`status-dot status-dot--${tone}`} />;
}

export function Divider() {
  return <span aria-hidden="true" className="divider" />;
}
