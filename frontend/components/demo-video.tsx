function youtubeId(value: string): string | null {
  const raw = value.trim();
  const validId = /^[A-Za-z0-9_-]{11}$/;
  if (validId.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.replace(/^(www\.|m\.)/, "");
    const candidate = host === "youtu.be" ? url.pathname.slice(1) :
      (host === "youtube.com" || host === "youtube-nocookie.com") ?
        url.pathname === "/watch" ? url.searchParams.get("v") :
          /^(\/embed\/|\/shorts\/|\/live\/)/.test(url.pathname) ? url.pathname.split("/")[2] : null : null;
    return candidate && validId.test(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function DemoVideo() {
  const id = youtubeId(process.env.NEXT_PUBLIC_DEMO_YOUTUBE_URL || "npIuNV1xQ_I");
  return <div className="demo-video">
    {id ? <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title="Lychee Juicebox demo video"
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    /> : <div className="demo-video-placeholder">
      <strong>How it works</strong>
      <ol>
        <li><span>01</span> Choose an Earth map or upload your own.</li>
        <li><span>02</span> Pick an area on the globe or enter coordinates.</li>
        <li><span>03</span> Pick a sound and press Generate &amp; play my mix.</li>
      </ol>
      <p>Demo video coming soon.</p>
    </div>}
  </div>;
}
