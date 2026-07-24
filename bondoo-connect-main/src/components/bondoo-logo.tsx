export function BondooLogo({ className = "h-10" }: { className?: string }) {
  return (
    <div className={`bondoo-logo-wrap flex items-center ${className}`}>
      <span className="text-[2rem] leading-none font-extrabold tracking-tight text-primary">
        Bond
      </span>
      <BondooEyes className="h-[1.75em] -ml-0.5" />
    </div>
  );
}

export function BondooEyes({ className = "h-8" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 88 44"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="oo"
    >
      {/* left eye */}
      <g className="bondoo-eye">
        <circle cx="22" cy="22" r="16" stroke="#FF9500" strokeWidth="5" />
        <circle cx="22" cy="22" r="4.5" fill="#0B1F3A" />
      </g>
      <path
        className="bondoo-brow"
        d="M8 8 Q 22 -2 36 8"
        stroke="#FF9500"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* right eye */}
      <g className="bondoo-eye bondoo-eye-right">
        <circle cx="66" cy="22" r="16" stroke="#FF9500" strokeWidth="5" />
        <circle cx="66" cy="22" r="4.5" fill="#0B1F3A" />
      </g>
      <path
        className="bondoo-brow"
        d="M52 8 Q 66 -2 80 8"
        stroke="#FF9500"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      {/* smile */}
      <path
        className="bondoo-smile"
        d="M30 36 Q 44 46 58 36"
        stroke="#FF9500"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}