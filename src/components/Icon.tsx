/**
 * アイコン（docs/design.md）。線の太さをそろえた自作の SVG。24px・線 1.8px・角は丸め。
 * 装飾なので読み上げない（aria-hidden）。意味は、隣の文字か aria-label で伝える。
 */
const PATHS = {
  home: 'M3.5 10.5 12 4l8.5 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-6v6H5A1.5 1.5 0 0 1 3.5 19z',
  pencil: 'M15.5 4.5l4 4L9 19l-4.5 1 1-4.5zM13.5 6.5l4 4',
  book: 'M4 5.5C4 4.7 4.7 4 5.5 4H11v15.5H5.5c-.8 0-1.5.7-1.5 1.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15.5h5.5c.8 0 1.5.7 1.5 1.5z',
  chart: 'M4 20h16M7 20V12M12 20V6M17 20v-9',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7 7 0 0 1-2.2 1.3l-.3 2h-4l-.3-2a7 7 0 0 1-2.2-1.3l-1.9.7-2-3.4 1.6-1.2a7 7 0 0 1 0-3l-1.6-1.2 2-3.4 1.9.7a7 7 0 0 1 2.2-1.3l.3-2h4l.3 2a7 7 0 0 1 2.2 1.3l1.9-.7 2 3.4-1.6 1.2a7 7 0 0 1 0 3z',
  shield: 'M12 3.5 19 6v5.5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V6z',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  close: 'M6 6l12 12M18 6 6 18',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  cross: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  circle: 'M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15z',
  play: 'M8 5.5v13l10.5-6.5z',
  redo: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4',
  target: 'M12 4.5a7.5 7.5 0 1 1 0 15 7.5 7.5 0 0 1 0-15zM12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  sun: 'M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4',
  zoomIn: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20M10.5 8v5M8 10.5h5',
  zoomOut: 'M10.5 4a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM15.5 15.5 20 20M8 10.5h5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  info: 'M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16zM12 11v5M12 8h.01',
  list: 'M8 6.5h12M8 12h12M8 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3.5V7M15 3.5V7',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 24, filled = false, className }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  return (
    <svg
      className={`icon ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
