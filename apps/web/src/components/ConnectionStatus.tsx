import { Button, StatusDot } from "../design-system/primitives";

export type ConnectionState = "ready" | "connected" | "connecting" | "offline" | "rate_limited";

const connectionCopy: Record<
  ConnectionState,
  { label: string; detail: string; tone: "active" | "quiet" | "warm" }
> = {
  ready: {
    label: "Studio ready",
    detail: "Learner data is synced",
    tone: "active",
  },
  connected: {
    label: "Voice connected",
    detail: "Ready for a live conversation",
    tone: "active",
  },
  connecting: {
    label: "Connecting",
    detail: "Checking your conversation line",
    tone: "warm",
  },
  offline: {
    label: "Offline practice",
    detail: "Your local session is ready",
    tone: "quiet",
  },
  rate_limited: {
    label: "Voice rate limited",
    detail: "Try again in a moment",
    tone: "warm",
  },
};

export function ConnectionStatus({
  compact = false,
  onReconnect,
  state = "offline",
}: {
  compact?: boolean;
  onReconnect?: () => void;
  state?: ConnectionState;
}) {
  const copy = connectionCopy[state];

  if (compact) {
    return (
      <div className={`connection-compact connection-compact--${state}`} role="status">
        <StatusDot tone={copy.tone} />
        <span>{copy.label}</span>
      </div>
    );
  }

  return (
    <div className={`connection-card connection-card--${state}`} role="status">
      <div className="connection-card__icon">
        <StatusDot tone={copy.tone} />
      </div>
      <div>
        <strong>{copy.label}</strong>
        <span>{copy.detail}</span>
      </div>
      {(state === "offline" || state === "rate_limited") && onReconnect ? (
        <Button aria-label="Try connecting again" onClick={onReconnect} size="sm" variant="ghost">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
