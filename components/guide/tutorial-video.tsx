"use client";

import { useRef } from "react";
import { formatTimestamp, type Tutorial } from "@/lib/guide/tutorials";

export function TutorialVideo({ tutorial }: { tutorial: Tutorial }) {
  const video = useRef<HTMLVideoElement>(null);
  const seek = (at: number) => {
    const player = video.current;
    if (!player) return;
    player.currentTime = at;
    void player.play().catch(() => {});
    player.focus();
  };
  return <section className="card guide-tutorial" aria-labelledby={`guide-${tutorial.id}`}>
    <div className="guide-tutorial-head">
      <h2 id={`guide-${tutorial.id}`}>{tutorial.title}</h2>
      <p>{tutorial.audience} · {tutorial.duration}</p>
    </div>
    <video ref={video} className="guide-video" controls preload="none" playsInline poster={tutorial.poster} aria-label={`${tutorial.title}教學影片`}>
      <source src={tutorial.src} type="video/mp4" />
      {/* Captions are also burned into the picture, so this track stays off by default. */}
      <track kind="captions" src={tutorial.captions} srcLang="zh-Hant" label="中文字幕" />
      你的瀏覽器無法播放影片，請<a href={tutorial.src}>下載影片</a>觀看。
    </video>
    <ol className="guide-chapters">
      {tutorial.chapters.map((chapter, index) => <li key={chapter.at}>
        <button type="button" onClick={() => seek(chapter.at)} aria-label={`從 ${formatTimestamp(chapter.at)} 播放第 ${index + 1} 章：${chapter.title}`}>
          <span className="guide-time">{formatTimestamp(chapter.at)}</span>
          <span><strong>{index + 1}. {chapter.title}</strong><small>{chapter.summary}</small></span>
        </button>
      </li>)}
    </ol>
  </section>;
}
