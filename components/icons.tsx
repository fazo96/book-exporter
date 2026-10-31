// Hairline icons, drawn on a 20×20 grid (from pen), for Construct's panel.
type P = React.SVGProps<SVGSVGElement>;

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;


export const IconConstruct = (p: P) => (
  <svg {...base} {...p}>
    <circle cx="10" cy="10" r="1.2" fill="currentColor" stroke="none" />
    <ellipse cx="10" cy="10" rx="7" ry="3" />
    <ellipse cx="10" cy="10" rx="3" ry="7" />
  </svg>
);

export const IconClose = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 5 10 10M15 5 5 15" />
  </svg>
);

export const IconTrash = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4.5 6h11M8 6V4.5h4V6M6 6l.7 9.5h6.6L14 6M8.7 8.5v4.5M11.3 8.5v4.5" />
  </svg>
);

export const IconPlus = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 4v12M4 10h12" />
  </svg>
);

export const IconSend = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 16V4M5 9l5-5 5 5" />
  </svg>
);

export const IconStop = (p: P) => (
  <svg {...base} {...p}>
    <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
  </svg>
);

export const IconChats = (p: P) => (
  <svg {...base} {...p}>
    <path d="M3.5 10a6.5 6.5 0 1 0 1.9-4.6M3.5 3.5v2.4h2.4M10 6.5V10l2.5 1.5" />
  </svg>
);

export const IconPencil = (p: P) => (
  <svg {...base} {...p}>
    <path d="M12.5 4.5l3 3L7.5 15.5l-3.7.7.7-3.7zM11 6l3 3" />
  </svg>
);

export const IconDown = (p: P) => (
  <svg {...base} {...p}>
    <path d="m5 7.5 5 5 5-5" />
  </svg>
);

export const IconCompact = (p: P) => (
  <svg {...base} {...p}>
    <path d="M10 2.5v5M7 5l3 2.5L13 5M10 17.5v-5M7 15l3-2.5 3 2.5M4 10h12" />
  </svg>
);
