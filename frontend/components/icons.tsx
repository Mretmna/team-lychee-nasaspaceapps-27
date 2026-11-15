import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8 };

export function PlayIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="m8 5 11 7-11 7V5Z" fill="currentColor" stroke="none" /></svg>;
}
export function PauseIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M8 5v14M16 5v14" /></svg>;
}
export function VolumeIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5ZM18 9.5a4 4 0 0 1 0 5" /></svg>;
}
export function MutedIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M5 9v6h4l5 4V5L9 9H5ZM18 9l4 4m0-4-4 4" /></svg>;
}
export function PinIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}
export function ArrowIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" /></svg>;
}

export function SoundWaveIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M3 12h2m2-4v8m3-12v16m4-13v10m3-7v4m3-2h1" /></svg>;
}

export function HeadphonesIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z" /></svg>;
}

export function ScanPathIcon({ mode, ...props }: IconProps & { mode: "clockwise" | "linear" | "circle_outward" | "circle_inward" }) {
  const shape = {
    clockwise: <><circle cx="24" cy="24" r="15" opacity=".35" /><path d="M24 9a15 15 0 0 1 15 15" /><path d="m34 20 5 4 3-5" /><path d="M24 24h15" /><circle cx="24" cy="24" r="2" fill="currentColor" stroke="none" /></>,
    linear: <><path d="M8 24h31m-7-7 7 7-7 7" /><circle cx="9" cy="24" r="3" fill="currentColor" stroke="none" /></>,
    circle_outward: <><circle cx="24" cy="24" r="5" /><circle cx="24" cy="24" r="13" opacity=".5" /><path d="M24 18V7m-5 5 5-5 5 5" /></>,
    circle_inward: <><circle cx="24" cy="24" r="15" /><circle cx="24" cy="24" r="7" opacity=".5" /><path d="M24 7v16m-5-5 5 5 5-5" /></>,
  }[mode];
  return <svg width="42" height="42" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" {...props} aria-hidden="true">{shape}</svg>;
}

export function DjIcon(props: IconProps) {
  return <svg {...base} {...props} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="12" r="7" /><circle cx="10" cy="12" r="2" /><path d="M18 5h3v4m0 0-5 5m1 5h4" /></svg>;
}
