export type TutorCharacterState = "idle" | "listening" | "speaking" | "connected";

const stateLabels: Record<TutorCharacterState, string> = {
  idle: "Maya is ready when you are",
  listening: "Maya is listening",
  speaking: "Maya is speaking",
  connected: "Maya is connected",
};

export function TutorCharacter({ state }: { state: TutorCharacterState }) {
  return (
    <div
      aria-label={stateLabels[state]}
      className={`tutor-character tutor-character--${state}`}
      role="img"
    >
      <div aria-hidden="true" className="tutor-character__halo tutor-character__halo--outer" />
      <div aria-hidden="true" className="tutor-character__halo tutor-character__halo--inner" />
      <svg
        aria-hidden="true"
        className="tutor-character__art"
        fill="none"
        viewBox="0 0 280 280"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="tutor-face" x1="64" x2="214" y1="49" y2="248" gradientUnits="userSpaceOnUse">
            <stop stopColor="#FFE5C7" />
            <stop offset="1" stopColor="#F6B993" />
          </linearGradient>
          <linearGradient id="tutor-hair" x1="70" x2="206" y1="31" y2="152" gradientUnits="userSpaceOnUse">
            <stop stopColor="#47325D" />
            <stop offset="1" stopColor="#2E2243" />
          </linearGradient>
          <linearGradient id="tutor-sweater" x1="74" x2="213" y1="198" y2="279" gradientUnits="userSpaceOnUse">
            <stop stopColor="#A5D9D0" />
            <stop offset="1" stopColor="#68AFA8" />
          </linearGradient>
          <filter id="tutor-shadow" colorInterpolationFilters="sRGB" height="160%" width="160%" x="-30%" y="-30%">
            <feDropShadow dx="0" dy="12" floodColor="#312748" floodOpacity=".18" stdDeviation="12" />
          </filter>
        </defs>
        <ellipse className="tutor-character__shadow" cx="140" cy="255" rx="73" ry="12" />
        <g className="tutor-character__body" filter="url(#tutor-shadow)">
          <path d="M66 280c2-48 28-76 74-76s72 28 74 76H66Z" fill="url(#tutor-sweater)" />
          <path className="tutor-character__collar" d="m109 213 31 27 31-27 18 67h-98l18-67Z" fill="#D6F1E6" />
          <path d="M102 221c13 7 25 10 38 10s25-3 38-10" stroke="#4D948F" strokeLinecap="round" strokeWidth="3" />
          <path d="M122 246c9 6 27 6 36 0" stroke="#4D948F" strokeLinecap="round" strokeWidth="3" />
        </g>
        <g className="tutor-character__head">
          <path className="tutor-character__ear tutor-character__ear--left" d="M65 125c-18-12-29 4-22 22 5 13 17 20 29 14" fill="#F6B993" />
          <path className="tutor-character__ear tutor-character__ear--right" d="M215 125c18-12 29 4 22 22-5 13-17 20-29 14" fill="#F6B993" />
          <path d="M71 112c0-51 28-82 69-82s69 31 69 82v43c0 49-29 72-69 72s-69-23-69-72v-43Z" fill="url(#tutor-face)" />
          <path className="tutor-character__hair" d="M69 119C54 96 62 52 90 34c16-10 30-15 50-15 30 0 58 14 71 39 12 23 7 49 0 67-7-18-18-29-32-38-4 17-22 27-44 28-26 1-47-7-66-20Z" fill="url(#tutor-hair)" />
          <path className="tutor-character__tuft" d="M110 27c7-20 35-22 43-1-12-4-28 0-43 1Z" fill="#574069" />
          <path className="tutor-character__brow tutor-character__brow--left" d="m93 127 21-3" stroke="#6A3C4B" strokeLinecap="round" strokeWidth="4" />
          <path className="tutor-character__brow tutor-character__brow--right" d="m166 124 21 3" stroke="#6A3C4B" strokeLinecap="round" strokeWidth="4" />
          <g className="tutor-character__eyes">
            <ellipse className="tutor-character__eye tutor-character__eye--left" cx="105" cy="143" rx="7" ry="9" fill="#32233F" />
            <ellipse className="tutor-character__eye tutor-character__eye--right" cx="175" cy="143" rx="7" ry="9" fill="#32233F" />
            <circle cx="108" cy="140" r="2.5" fill="white" />
            <circle cx="178" cy="140" r="2.5" fill="white" />
          </g>
          <path className="tutor-character__nose" d="M139 145c-2 9-4 17 3 20 4 2 8 1 10-2" stroke="#D88E78" strokeLinecap="round" strokeWidth="3" />
          <ellipse className="tutor-character__cheek tutor-character__cheek--left" cx="88" cy="164" rx="13" ry="7" />
          <ellipse className="tutor-character__cheek tutor-character__cheek--right" cx="192" cy="164" rx="13" ry="7" />
          <path className="tutor-character__mouth" d="M122 179c10 8 26 8 36 0" stroke="#6A3C4B" strokeLinecap="round" strokeWidth="4" />
          <path className="tutor-character__mouth-inner" d="M130 184c6 2 14 2 20 0" stroke="#E88785" strokeLinecap="round" strokeWidth="3" />
          <circle cx="79" cy="100" r="4" fill="#F8C9A6" />
          <circle cx="201" cy="100" r="4" fill="#F8C9A6" />
        </g>
        <g className="tutor-character__sparkles" fill="#F4C86C">
          <path d="m39 73 3 9 9 3-9 3-3 9-3-9-9-3 9-3 3-9Z" />
          <path d="m234 89 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z" />
        </g>
      </svg>
      <span className="sr-only">{stateLabels[state]}</span>
    </div>
  );
}
