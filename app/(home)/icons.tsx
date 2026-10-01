/** The beta page's line icons, drawn on a 24px grid. Decorative: always aria-hidden. */
const PATHS = {
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.5 20c.9-3.6 3.9-5.4 7.5-5.4s6.6 1.8 7.5 5.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8.5" r="3.2" />
      <circle cx="17" cy="9.5" r="2.5" />
      <path d="M2.8 19c.7-3.2 3.1-4.8 6.2-4.8s5.5 1.6 6.2 4.8M16 14.6c2.5-.2 4.5 1.1 5.2 4.2" />
    </>
  ),
  chat: <path d="M4 5.5h16v10.5H9.5L5.5 19.5V16H4z" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.3" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  doc: (
    <>
      <path d="M6.5 3.5h7l4 4v13h-11z" />
      <path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" fillOpacity=".14" stroke="none" />
      <path d="M8 12.4l2.9 2.9L16.3 9.6" strokeWidth="2" />
    </>
  ),
  arrow: <path d="M5 12h13M13 6.5L18.5 12 13 17.5" strokeWidth="1.8" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.3" />
      <path d="M16 16l4.2 4.2" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="M4 7l8 6 8-6" />
    </>
  ),
  cal: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </>
  ),
  link: (
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  ),
  shield: (
    <>
      <path d="M12 3.5l7 2.6v5.6c0 4.4-3 7.6-7 8.8-4-1.2-7-4.4-7-8.8V6.1z" />
      <path d="M9 12l2.2 2.2L15.2 10" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20l1-4.2L16.2 4.6a2 2 0 0 1 2.8 0l.4.4a2 2 0 0 1 0 2.8L8.2 19z" />
      <path d="M14.5 6.5l3 3" />
    </>
  ),
  tap: (
    <>
      <rect x="6" y="3.5" width="12" height="17" rx="2.5" />
      <path d="M10 17.5h4" />
    </>
  ),
  layers: (
    <>
      <path d="M12 4l8 4.2-8 4.2L4 8.2z" />
      <path d="M4 12.2l8 4.2 8-4.2M4 16.2l8 4.2 8-4.2" />
    </>
  ),
  home: <path d="M4 11l8-6.5 8 6.5v8.5H4z" />,
  bell: <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15zM10 20.5h4" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
