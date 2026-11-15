"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Preferences = { largeText: boolean; highContrast: boolean; reduceMotion: boolean; screenReader: boolean };
type Spotlight = { top: number; left: number; width: number; height: number; viewportWidth: number; viewportHeight: number };
const defaultPreferences: Preferences = { largeText: false, highContrast: false, reduceMotion: false, screenReader: false };
const preferencesKey = "team-lychee-accessibility-v1";
const tourKey = "team-lychee-tour-v3";

const tourSteps = [
  { title: "Welcome to Lychee Juicebox", description: "Turn an Earth map into sound in a few steps. This quick guide shows where everything is; you can skip it or replay it later.", target: "" },
  { title: "Pick your map", description: "Choose a supplied Earth map, or switch to Bring your own map to upload a PNG or JPEG. Both paths use the same sound controls.", target: ".map-mode-tabs" },
  { title: "Pick the image", description: "Select a map card. If you chose your own map, upload an image and prepare the selected area here.", target: "[data-tour-map-choice]" },
  { title: "Find your spot", description: "Click or drag the globe to set the center of the area you want to hear.", target: "#globe-view" },
  { title: "Set the area", description: "Choose Circle, Square, or Entire map. For a smaller area, move the radius slider. City and coordinate search are under Advanced location options.", target: ".location-picker" },
  { title: "Shape the sound", description: "Choose a sound template, a scan path, a listening mode, and a length below this heading. Headphones help with the spatial modes.", target: ".sound-builder-heading" },
  { title: "Play your mix", description: "Press Generate & play my mix. The map preview shows the scan; the player lets you pause or replay. DJ mode lets you scrub through it.", target: ".sound-generate" },
] as const;

function readPreferences(): Preferences {
  try {
    const saved = JSON.parse(window.localStorage.getItem(preferencesKey) ?? "{}");
    return {
      largeText: saved.largeText === true,
      highContrast: saved.highContrast === true,
      reduceMotion: saved.reduceMotion === true,
      screenReader: saved.screenReader === true,
    };
  } catch {
    return defaultPreferences;
  }
}

export function SiteHelp() {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [preferences, setPreferences] = useState<Preferences>(defaultPreferences);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  const tourHeading = useRef<HTMLHeadingElement>(null);
  const tourTrigger = useRef<HTMLButtonElement>(null);
  const settingsTrigger = useRef<HTMLButtonElement>(null);
  const wasOpenedManually = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreferences(readPreferences()), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.largeText = String(preferences.largeText);
    document.documentElement.dataset.highContrast = String(preferences.highContrast);
    document.documentElement.dataset.reducedMotion = String(preferences.reduceMotion);
    document.documentElement.dataset.screenReader = String(preferences.screenReader);
  }, [preferences]);

  useEffect(() => {
    if (!isHome) return;
    const timer = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(tourKey)) return;
      } catch { /* The tour still works when storage is unavailable. */ }
      wasOpenedManually.current = false;
      setStep(0);
      setTourOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, [isHome]);

  useEffect(() => {
    if (!tourOpen || settingsOpen || !isHome) return;
    const target = step === 3 && preferences.screenReader ? ".keyboard-location-link" : tourSteps[step].target;
    if (!target) window.scrollTo({ top: 0, behavior: "auto" });
    const element = target === "[data-tour-map-choice]"
      ? document.querySelector("#default-map-panel:not([hidden]) .map-choice-card, #upload-map-panel:not([hidden]) .file-picker")
      : target ? document.querySelector(target) : null;
    let frame = 0;
    function updateSpotlight() {
      if (!element) { setSpotlight(null); return; }
      const rect = element.getBoundingClientRect();
      const padding = 9;
      const left = Math.max(0, Math.min(window.innerWidth, rect.left - padding));
      const top = Math.max(0, Math.min(window.innerHeight, rect.top - padding));
      const right = Math.max(left, Math.min(window.innerWidth, rect.right + padding));
      const bottom = Math.max(top, Math.min(window.innerHeight, rect.bottom + padding));
      setSpotlight({ top, left, width: right - left, height: bottom - top, viewportWidth: window.innerWidth, viewportHeight: window.innerHeight });
    }
    function scheduleUpdate() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateSpotlight);
    }
    const observer = element ? new ResizeObserver(scheduleUpdate) : null;
    if (element) {
      observer?.observe(element);
      const reduced = preferences.reduceMotion || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      element.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    }
    scheduleUpdate();
    window.addEventListener("scroll", scheduleUpdate, { capture: true, passive: true });
    window.addEventListener("resize", scheduleUpdate);
    tourHeading.current?.focus({ preventScroll: true });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("scroll", scheduleUpdate, true);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [tourOpen, settingsOpen, step, isHome, preferences.reduceMotion, preferences.screenReader]);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (settingsOpen) {
        setSettingsOpen(false);
        settingsTrigger.current?.focus();
      } else if (tourOpen) {
        finishTour();
      }
    }
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [settingsOpen, tourOpen]);

  function finishTour() {
    try { window.localStorage.setItem(tourKey, "seen"); } catch { /* Private browsing can block storage. */ }
    setTourOpen(false);
    if (wasOpenedManually.current) tourTrigger.current?.focus();
  }

  function updatePreference(name: keyof Preferences) {
    setPreferences((current) => {
      const next = { ...current, [name]: !current[name] };
      try { window.localStorage.setItem(preferencesKey, JSON.stringify(next)); } catch { /* Keep the session setting. */ }
      return next;
    });
  }

  function startTour() {
    wasOpenedManually.current = true;
    setSettingsOpen(false);
    setStep(0);
    setTourOpen(true);
  }

  return <>
    <div className={`site-help-toolbar${isHome && tourOpen && !settingsOpen ? " tour-active" : ""}`} id="site-help-controls" tabIndex={-1} aria-label="Site help">
      {isHome && <button ref={tourTrigger} type="button" onClick={startTour} aria-label="Take the site tour">Take a tour</button>}
      <button ref={settingsTrigger} type="button" aria-expanded={settingsOpen} aria-controls="accessibility-settings" onClick={() => setSettingsOpen((open) => !open)}>Accessibility</button>
    </div>
    {settingsOpen && <section className="accessibility-settings" id="accessibility-settings" aria-labelledby="accessibility-title">
      <div className="site-help-panel-heading"><div><span className="site-help-kicker">Make it comfortable</span><h2 id="accessibility-title">Accessibility</h2></div><button type="button" className="site-help-close" aria-label="Close accessibility settings" onClick={() => { setSettingsOpen(false); settingsTrigger.current?.focus(); }}>×</button></div>
      <p>Adjust how the site looks and moves. Your choices are saved in this browser.</p>
      <button type="button" className="accessibility-option" aria-pressed={preferences.largeText} onClick={() => updatePreference("largeText")}><span><strong>Larger text</strong><small>Make labels and instructions easier to read.</small></span><span className="accessibility-switch" aria-hidden="true" /></button>
      <button type="button" className="accessibility-option" aria-pressed={preferences.highContrast} onClick={() => updatePreference("highContrast")}><span><strong>Higher contrast</strong><small>Strengthen text, backgrounds, and focus outlines.</small></span><span className="accessibility-switch" aria-hidden="true" /></button>
      <button type="button" className="accessibility-option" aria-pressed={preferences.reduceMotion} onClick={() => updatePreference("reduceMotion")}><span><strong>Reduce motion</strong><small>Stop decorative animation and smooth scrolling.</small></span><span className="accessibility-switch" aria-hidden="true" /></button>
      <button type="button" className="accessibility-option" aria-pressed={preferences.screenReader} onClick={() => updatePreference("screenReader")}><span><strong>Screen reader guidance</strong><small>Show a keyboard route and a readable sound setup summary.</small></span><span className="accessibility-switch" aria-hidden="true" /></button>
      {preferences.screenReader && isHome && <a className="accessibility-guide-link" href="#screen-reader-guide" onClick={() => setSettingsOpen(false)}>Go to keyboard guide</a>}
      <p className="accessibility-note">Your device’s reduced motion setting is always respected.</p>
    </section>}
    {isHome && tourOpen && !settingsOpen && <>
      {spotlight ? <div className="site-tour-shade" aria-hidden="true">
        <div style={{ top: 0, left: 0, right: 0, height: spotlight.top }} />
        <div style={{ top: spotlight.top + spotlight.height, left: 0, right: 0, bottom: 0 }} />
        <div style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} />
        <div style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} />
        <span className="site-tour-spotlight" style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }} />
      </div> : <div className="site-tour-full-shade" aria-hidden="true" />}
      <aside className={`site-tour ${spotlight && spotlight.left + spotlight.width / 2 > spotlight.viewportWidth / 2 ? "tour-card-left" : "tour-card-right"} ${spotlight && spotlight.top + spotlight.height / 2 > spotlight.viewportHeight / 2 ? "tour-card-top" : "tour-card-bottom"}`} role="dialog" aria-modal="false" aria-labelledby="site-tour-title" aria-describedby="site-tour-description">
      <div className="site-help-panel-heading"><span className="site-help-kicker">Quick site tour · {step + 1} of {tourSteps.length}</span><button type="button" className="site-help-close" aria-label="Close tour" onClick={finishTour}>×</button></div>
      <h2 id="site-tour-title" tabIndex={-1} ref={tourHeading}>{tourSteps[step].title}</h2>
      <p id="site-tour-description">{step === 3 && preferences.screenReader ? "Use Enter a place without the globe to open Latitude and Longitude. Type coordinates and press Set point." : tourSteps[step].description}</p>
      <button type="button" className="tour-accessibility" onClick={() => setSettingsOpen(true)}>Accessibility options</button>
      <div className="tour-progress" aria-hidden="true">{tourSteps.map((_, index) => <span key={index} className={index <= step ? "active" : ""} />)}</div>
      <div className="tour-actions">
        <button type="button" className="tour-skip" onClick={finishTour}>Skip tour</button>
        {step > 0 && <button type="button" className="tour-back" onClick={() => setStep((current) => current - 1)}>Back</button>}
        <button type="button" className="tour-next" onClick={() => step === tourSteps.length - 1 ? finishTour() : setStep((current) => current + 1)}>{step === tourSteps.length - 1 ? "Finish" : step === 0 ? "Show me" : "Next"}</button>
      </div>
      {step === tourSteps.length - 1 && <Link href="/tutorial" onClick={finishTour} className="tour-tutorial-link">Read the full tutorial</Link>}
      </aside>
    </>}
  </>;
}
