import type { FeatureSample } from "@/types/track";

export function SyntheticVisual({ time, feature }: { time: number; feature: FeatureSample }) {
  const phase = time * 0.55;
  const warm = Math.round(40 + feature.colorWarmth * 45);
  const cool = Math.round(92 - feature.colorWarmth * 22);
  const wave = (offset: number, amplitude: number) => {
    const points = Array.from({ length: 13 }, (_, index) => {
      const x = index * 80;
      const y = 220 + Math.sin(index * 0.68 + phase + offset) * amplitude;
      return `${x},${y.toFixed(1)}`;
    });
    return `M 0 360 L ${points.join(" L ")} L 960 360 Z`;
  };

  return (
    <div className="synthetic-visual" aria-label="Synthetic animated ocean preview">
      <svg viewBox="0 0 960 540" role="img" aria-labelledby="preview-title preview-description" preserveAspectRatio="xMidYMid slice">
        <title id="preview-title">Synthetic ocean visualization</title>
        <desc id="preview-description">Layered animated waves driven by the labeled preview timeline.</desc>
        <rect width="960" height="540" fill={`hsl(${cool} 39% 16%)`} />
        <circle cx={720 + Math.sin(phase * 0.35) * 60} cy="116" r={72 + feature.variation * 22} fill={`hsl(${warm} 74% 62%)`} opacity=".82" />
        <path d={wave(0, 34 + feature.motion * 26)} fill="hsl(190 52% 35%)" opacity=".75" />
        <path d={wave(1.8, 28 + feature.variation * 32)} fill="hsl(173 44% 47%)" opacity=".66" transform="translate(0 65)" />
        <path d={wave(3.7, 20 + feature.motion * 35)} fill="hsl(201 51% 22%)" opacity=".84" transform="translate(0 132)" />
      </svg>
      <span className="preview-stamp">Synthetic visual preview</span>
    </div>
  );
}
