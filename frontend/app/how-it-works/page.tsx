import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, HeadphonesIcon, MapIcon, PinIcon, PlayIcon, SoundWaveIcon } from "@/components/icons";

const sourceUrl = "https://github.com/Mretmna/lychee-juicebox";

export const metadata: Metadata = {
  title: "How it works | Lychee Juicebox",
  description: "See how Lychee Juicebox turns the colors of an Earth map into a playable sound.",
};

const steps = [
  { number: "01", title: "Start with a map", text: "Choose one of our Earth images or bring your own PNG or JPEG world map. The image is the material the sound is made from.", icon: MapIcon },
  { number: "02", title: "Choose a place", text: "Pick a point on the globe, then set a circle, square, or the whole map. Your browser prepares just that area for the sound maker.", icon: PinIcon },
  { number: "03", title: "Scan its colors", text: "The sound service reads the selected pixels along your chosen path. Brightness and color shape the notes played by four synthesized voices.", icon: SoundWaveIcon },
  { number: "04", title: "Listen and play", text: "The service returns a WAV file. As it plays, the gold scan marker and color bars follow the sound. DJ mode lets you drag through it; Tone.js can replay it with browser instruments.", icon: PlayIcon },
];

export default function HowItWorksPage() {
  return <main id="main-content" className="how-page">
    <header className="site-header tutorial-header">
      <Link className="brand" href="/" aria-label="Lychee Juicebox home"><span className="brand-logo" aria-hidden="true" /><strong>Lychee<br /><small>Juicebox</small></strong></Link>
      <nav aria-label="Main navigation"><Link href="/">Home</Link><Link href="/tutorial">Tutorial</Link><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Source code</a></nav>
      <Link className="header-cta" href="/#maps">Try it <ArrowIcon /></Link>
    </header>

    <section className="how-hero" aria-labelledby="how-title">
      <p className="eyebrow">Behind the sound</p>
      <h1 id="how-title">How an Earth map becomes music</h1>
      <p>Lychee Juicebox listens to the colors in a map image. Choose an area and a scan path; the app turns that visual pattern into a short sound you can explore.</p>
      <div className="how-hero-actions"><Link href="/#maps" className="hero-primary">Make a sound <ArrowIcon /></Link><a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="how-source-link">View the source code <ArrowIcon /></a></div>
    </section>

    <section className="how-process" aria-labelledby="how-process-title">
      <div className="how-section-heading"><p className="eyebrow">The path from picture to playback</p><h2 id="how-process-title">Four steps, one map</h2></div>
      <div className="how-steps">{steps.map(({ number, title, text, icon: Icon }) => <article className="how-step" key={number}>
        <div className="how-step-top"><span>{number}</span><Icon /></div>
        <h3>{title}</h3><p>{text}</p>
      </article>)}</div>
    </section>

    <section className="how-details" aria-labelledby="how-details-title">
      <div><p className="eyebrow">What you hear</p><h2 id="how-details-title">A sound made from pixels</h2></div>
      <div className="how-details-copy">
        <p>Red, green, blue, gray, and brightness in the selected image influence the sound. You can choose a sound template, a 10, 20, or 30 second length, and a scan that moves left to right, spins, or grows or shrinks from the center.</p>
        <p><HeadphonesIcon /> Normal sound is centered. The 3D and 8D options add stereo movement, which is easiest to hear with headphones.</p>
        <p className="how-honest-note">This is an artistic reading of a rendered map. It is not a recording of Earth or a measurement of the map’s underlying scientific values. For animated maps, the current sound is made from the first selected video frame; the video then moves alongside the finished sound.</p>
      </div>
    </section>

    <section className="how-open-source"><div><p className="eyebrow">Built in the open</p><h2>Explore the code</h2><p>The parent repository links the Next.js frontend, the map service, and the separate sound service. It also includes architecture and data notes.</p></div><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open the Lychee Juicebox repository <ArrowIcon /></a></section>
    <footer><span>Lychee Juicebox</span><nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/tutorial">Tutorial</Link><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Source code</a></nav><p>Built for NASA Space Apps 2026</p></footer>
  </main>;
}
