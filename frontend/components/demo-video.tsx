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
  const id = youtubeId(process.env.NEXT_PUBLIC_DEMO_YOUTUBE_URL ?? "");
  return <div className="demo-video">
    {id ? <iframe
      src={`https://www.youtube-nocookie.com/embed/${id}`}
      title="Earth Information Jukebox demo video"
      loading="lazy"
      allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
    /> : <div className="demo-video-placeholder">
      <strong>Video coming soon</strong>
    </div>}
  </div>;
}
