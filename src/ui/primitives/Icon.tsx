import styles from './Icon.module.css'

/**
 * Skup linijskih ikonica.
 *
 * Ucrtane su u kod, ne učitane iz biblioteke. Razlog nije štednja nego
 * ujednačenost: ikonice iz raznih skupova imaju različitu debljinu linije i
 * različit optički raspon, pa red sa četiri ikonice iz dva izvora izgleda
 * neuredno i pre nego što se primeti zašto.
 *
 * Sve dele istu mrežu 24×24, debljinu 1.5 i `currentColor`, pa nasleđuju boju
 * teksta i rade u obe teme bez ijedne posebne vrednosti.
 *
 * Ikonica NIKAD ne stoji sama kao jedini nosilac značenja — uz nju ide tekst
 * ili `aria-label`. Ikonica bez imena je zagonetka za čitač ekrana.
 */

const PATHS = {
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  ask: 'M4 5h16v11H8l-4 4V5ZM9 9h6M9 12.5h4',
  note: 'M6 3h9l4 4v14H6V3ZM15 3v4h4M9 12h7M9 16h5',
  bell: 'M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5h-15S6 13 6 9ZM10 18a2 2 0 0 0 4 0',
  chart: 'M4 20V10M9.5 20V5M15 20v-7M20.5 20V8',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7h-.3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h.1A1.6 1.6 0 0 0 10 3.2V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.3a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.3.7Z',
  users: 'M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM22 20v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3.5 2',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  monitor: 'M3 5h18v11H3V5ZM8.5 20h7M12 16v4',
  upload: 'M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15M12 15V3.5M7.5 8 12 3.5 16.5 8',
  send: 'M21 3 10.5 13.5M21 3l-6.5 18-4-8-8-4L21 3Z',
  trash: 'M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5M10.5 10v6M13.5 10v6',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v5.5A1.5 1.5 0 0 1 16.5 21h-11A1.5 1.5 0 0 1 4 19.5v-11A1.5 1.5 0 0 1 5.5 7H11',
  check: 'M4.5 12.5 9.5 18 20 6',
  warning: 'M12 3.5 22 20H2L12 3.5ZM12 10v4.5M12 17.2v.1',
  megaphone: 'M4 10v4a1.5 1.5 0 0 0 1.5 1.5H7l9 4.5V4L7 8.5H5.5A1.5 1.5 0 0 0 4 10ZM7 8.5v7M19.5 9.5a3.5 3.5 0 0 1 0 5',
  box: 'M3 8 12 3.5 21 8v8L12 20.5 3 16V8ZM3 8l9 4.5M21 8l-9 4.5M12 12.5V20.5',
  receipt: 'M5 3.5h14v17l-2.5-1.5L14 20.5 12 19l-2 1.5-2.5-1.5L5 20.5v-17ZM9 8h6M9 12h6',
  wallet: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h13A1.5 1.5 0 0 1 19 7.5V9M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18v-7.5H5.5A2.5 2.5 0 0 1 3 8ZM16.5 14v.1',
  building: 'M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21M14 10h4.5A1.5 1.5 0 0 1 20 11.5V21M2.5 21h19M7 8h4M7 12h4M7 16h4M16.5 14h1M16.5 17.5h1',
  plus: 'M12 5v14M5 12h14',
} as const

export type IconName = keyof typeof PATHS

export function Icon({
  name,
  size = 18,
  label,
  className,
}: {
  name: IconName
  size?: number
  /** Kada ikonica NOSI značenje sama, ovde ide njeno ime. Inače ostaje prazno. */
  label?: string
  className?: string
}) {
  return (
    <svg
      className={[styles.icon, className].filter(Boolean).join(' ')}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Bez imena je ukras — čitač ekrana je preskače, jer je značenje već u
      // tekstu pored nje.
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
