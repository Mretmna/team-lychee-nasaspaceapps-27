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
