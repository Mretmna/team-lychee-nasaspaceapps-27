import type { Metadata } from "next";
import Link from "next/link";
import { ArrowIcon, HeadphonesIcon, PinIcon, PlayIcon, ScanPathIcon, SoundWaveIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "How to use the Earth Information Jukebox",
  description: "Choose a map, location, and sound settings, then play the result.",
};

export default function TutorialPage() {
  return <main className="tutorial-page">
    <header className="site-header tutorial-header"><Link className="brand" href="/" aria-label="Earth Information Jukebox home"><span>EI</span><strong>Earth Information<br />Jukebox</strong></Link><Link className="header-cta" href="/#explore">Open the jukebox <ArrowIcon /></Link></header>
    <section className="tutorial-hero" aria-labelledby="tutorial-title"><h1 id="tutorial-title">How to use the jukebox</h1><p>Choose a map and a place, adjust the sound settings, then press Generate.</p><Link href="/#maps" className="hero-primary">Start with a map <ArrowIcon /></Link></section>
    <section className="tutorial-steps" aria-label="Jukebox tutorial">
      <article id="choose-map"><div className="tutorial-step-icon"><SoundWaveIcon /></div><div><span className="tutorial-step-number">01 / CHOOSE A MAP</span><h2>Choose a map</h2><p>Choose a supplied map, or select <strong>Create your own map</strong> to upload a PNG or JPEG world map.</p><p className="tutorial-tip">Animated maps show their timeline as the sound plays.</p></div></article>
      <article id="choose-place"><div className="tutorial-step-icon"><PinIcon /></div><div><span className="tutorial-step-number">02 / CHOOSE A PLACE</span><h2>Choose a place</h2><p>Click the globe to set a center. Use the radius slider below it to change the selected area.</p><p className="tutorial-tip">Use <strong>Advanced location options</strong> for city search, coordinates, and saved places.</p></div></article>
      <article id="shape-sound"><div className="tutorial-step-icon"><ScanPathIcon mode="linear" /></div><div><span className="tutorial-step-number">03 / SHAPE THE SOUND</span><h2>Set the sound</h2><p>Choose the instruments and scan path. The gold line shows the path. After generating sound, turn on DJ mode to hold and drag the line through the audio.</p><p className="tutorial-tip">The position slider offers precise seeking.</p></div></article>
      <article id="listening-style"><div className="tutorial-step-icon"><HeadphonesIcon /></div><div><span className="tutorial-step-number">04 / CHOOSE A LISTENING STYLE</span><h2>Choose a listening mode</h2><p><strong>Normal</strong> is centered. <strong>3D</strong> follows the scan in stereo. <strong>8D</strong> adds wider movement and a soft echo. Choose 10, 20, or 30 seconds.</p><p className="tutorial-tip">Use headphones for 3D and 8D.</p></div></article>
      <article id="play-sound"><div className="tutorial-step-icon"><PlayIcon /></div><div><span className="tutorial-step-number">05 / GENERATE AND PLAY</span><h2>Generate and play</h2><p>Press <strong>Generate & play sound</strong>. The map and player come into view. Use the controls beside the map to pause, replay, or try browser instruments.</p><p className="tutorial-tip">If playback does not start automatically, press Play in the audio controls.</p></div></article>
    </section>
    <footer><span>Earth Information Jukebox</span><nav aria-label="Footer navigation"><Link href="/">Home</Link><Link href="/#demo">Demo</Link><Link href="/#sources">Sources</Link></nav><p>Built for NASA Space Apps 2026</p></footer>
  </main>;
}
