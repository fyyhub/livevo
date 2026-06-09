import flvjs from "flv.js";
import Hls from "hls.js";
import {
  AlertCircle,
  BadgeCheck,
  CirclePlay,
  Clipboard,
  Heart,
  Loader2,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Tv,
  Video,
  X
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getPlaybackUrl, loadPlatforms, loadRooms } from "./api";
import type { AsyncState, Platform, Room } from "./types";

const FAVORITES_KEY = "zhibolive:favorites";

function App() {
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [selectedPlatformId, setSelectedPlatformId] = useState("");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [platformState, setPlatformState] = useState<AsyncState>("idle");
  const [roomState, setRoomState] = useState<AsyncState>("idle");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readFavorites());
  const [lastUpdated, setLastUpdated] = useState("");

  const selectedPlatform = useMemo(
    () => platforms.find((platform) => platform.id === selectedPlatformId) ?? null,
    [platforms, selectedPlatformId]
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const filteredPlatforms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return platforms;
    }
    return platforms.filter((platform) => platform.title.toLowerCase().includes(needle));
  }, [platforms, query]);

  const visibleRooms = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = needle
      ? rooms.filter((room) => {
          const text = `${room.title} ${room.platformTitle} ${room.sourceHost}`.toLowerCase();
          return text.includes(needle);
        })
      : rooms;

    return [...base].sort((a, b) => {
      const aFav = favoriteSet.has(a.streamUrl) ? 1 : 0;
      const bFav = favoriteSet.has(b.streamUrl) ? 1 : 0;
      return bFav - aFav;
    });
  }, [favoriteSet, query, rooms]);

  const refreshPlatforms = useCallback(async () => {
    const controller = new AbortController();
    setPlatformState("loading");
    setError("");

    try {
      const nextPlatforms = await loadPlatforms(controller.signal);
      setPlatforms(nextPlatforms);
      setPlatformState("ready");
      setSelectedPlatformId((current) => {
        if (current && nextPlatforms.some((platform) => platform.id === current)) {
          return current;
        }
        return pickInitialPlatform(nextPlatforms)?.id ?? "";
      });
    } catch (err) {
      setPlatformState("error");
      setError(err instanceof Error ? err.message : "平台列表加载失败");
    }

    return () => controller.abort();
  }, []);

  const refreshRooms = useCallback(async (platform: Platform) => {
    const controller = new AbortController();
    setRoomState("loading");
    setError("");
    setRooms([]);
    setSelectedRoom(null);

    try {
      const nextRooms = await loadRooms(platform, controller.signal);
      setRooms(nextRooms);
      setLastUpdated(formatTime(new Date()));
      setRoomState("ready");
      setSelectedRoom(nextRooms[0] ?? null);
    } catch (err) {
      setRoomState("error");
      setError(err instanceof Error ? err.message : "直播间加载失败");
    }

    return () => controller.abort();
  }, []);

  useEffect(() => {
    void refreshPlatforms();
  }, [refreshPlatforms]);

  useEffect(() => {
    if (!selectedPlatform) {
      return;
    }
    void refreshRooms(selectedPlatform);
  }, [refreshRooms, selectedPlatform]);

  useEffect(() => {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (room: Room) => {
    setFavorites((current) =>
      current.includes(room.streamUrl)
        ? current.filter((item) => item !== room.streamUrl)
        : [...current, room.streamUrl]
    );
  };

  const isLoading = platformState === "loading" || roomState === "loading";

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="平台">
        <div className="brand">
          <div className="brand-mark">
            <Tv size={22} aria-hidden="true" />
          </div>
          <div>
            <strong>星流 Live</strong>
            <span>实时直播聚合</span>
          </div>
        </div>

        <div className="search-wrap">
          <Search size={17} aria-hidden="true" />
          <input
            aria-label="搜索平台或直播间"
            placeholder="搜索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button className="icon-button ghost" type="button" onClick={() => setQuery("")} title="清空搜索">
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="platform-list">
          {platformState === "loading" && <InlineLoading label="正在同步平台" />}
          {filteredPlatforms.map((platform) => (
            <button
              className={`platform-item ${platform.id === selectedPlatformId ? "active" : ""}`}
              data-platform-id={platform.id}
              data-testid="platform-button"
              key={platform.id}
              type="button"
              onClick={() => setSelectedPlatformId(platform.id)}
              title={platform.title}
            >
              <img src={platform.cover} alt="" loading="lazy" />
              <span>{platform.title}</span>
              <em>{platform.count || "Live"}</em>
            </button>
          ))}
        </div>
      </aside>

      <main className="main-view">
        <header className="topbar">
          <div className="topbar-title">
            <span className="eyebrow">
              <ShieldCheck size={15} aria-hidden="true" />
              接口原样展示
            </span>
            <h1>{selectedPlatform?.title ?? "直播频道"}</h1>
          </div>
          <div className="actions">
            <button
              className="icon-button"
              type="button"
              onClick={() => {
                if (selectedPlatform) {
                  void refreshRooms(selectedPlatform);
                } else {
                  void refreshPlatforms();
                }
              }}
              title="刷新"
            >
              <RefreshCw size={18} aria-hidden="true" className={isLoading ? "spin" : ""} />
            </button>
          </div>
        </header>

        <section className="status-strip" aria-label="频道状态">
          <Metric icon={<BadgeCheck size={16} />} label="可播放" value={rooms.length.toString()} />
          <Metric icon={<Video size={16} />} label="源总数" value={rooms.length.toString()} />
          <Metric icon={<ShieldCheck size={16} />} label="平台数" value={platforms.length.toString()} />
          <Metric icon={<RefreshCw size={16} />} label="更新" value={lastUpdated || "--:--"} />
        </section>

        {error && (
          <div className="notice" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <LivePlayer room={selectedRoom} onClose={() => setSelectedRoom(null)} />

        <section className="room-section" aria-label="直播间">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Live Rooms</span>
              <h2>正在直播</h2>
            </div>
            <span>{visibleRooms.length} 个房间</span>
          </div>

          {roomState === "loading" && (
            <div className="empty-state">
              <Loader2 size={26} className="spin" aria-hidden="true" />
              <span>正在加载直播间</span>
            </div>
          )}

          {roomState === "ready" && visibleRooms.length === 0 && (
            <div className="empty-state">
              <ShieldCheck size={28} aria-hidden="true" />
              <span>当前频道暂无直播</span>
            </div>
          )}

          <div className="room-grid">
            {visibleRooms.map((room) => (
              <article
                className={`room-card ${selectedRoom?.id === room.id ? "selected" : ""}`}
                data-testid="room-card"
                key={room.id}
              >
                <button className="cover-button" type="button" onClick={() => setSelectedRoom(room)}>
                  <img src={room.cover} alt="" loading="lazy" />
                  <span className="live-badge">LIVE</span>
                  <span className="play-float">
                    <Play size={18} fill="currentColor" aria-hidden="true" />
                  </span>
                </button>
                <div className="room-meta">
                  <div>
                    <h3>{room.title}</h3>
                    <p>{room.sourceHost}</p>
                  </div>
                  <button
                    className={`icon-button tiny ${favoriteSet.has(room.streamUrl) ? "liked" : ""}`}
                    type="button"
                    onClick={() => toggleFavorite(room)}
                    title={favoriteSet.has(room.streamUrl) ? "取消收藏" : "收藏"}
                  >
                    <Heart size={16} aria-hidden="true" fill="currentColor" />
                  </button>
                </div>
                <div className="room-footer">
                  <span>{room.format.toUpperCase()}</span>
                  <button
                    className="link-button"
                    type="button"
                    onClick={() => void navigator.clipboard.writeText(room.streamUrl)}
                  >
                    <Clipboard size={14} aria-hidden="true" />
                    复制
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="mobile-tabbar" aria-label="移动端操作">
        <button className="tab-item active" type="button">
          <Tv size={19} aria-hidden="true" />
          频道
        </button>
        <button className="tab-item" type="button" onClick={() => selectedPlatform && void refreshRooms(selectedPlatform)}>
          <RefreshCw size={19} aria-hidden="true" />
          刷新
        </button>
        <button className="tab-item" type="button" onClick={() => setQuery("")}>
          <Search size={19} aria-hidden="true" />
          搜索
        </button>
      </footer>
    </div>
  );
}

function LivePlayer({ room, onClose }: { room: Room | null; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState("选择一个直播间");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !room) {
      setStatus("选择一个直播间");
      return;
    }

    let flvPlayer: flvjs.Player | null = null;
    let hlsPlayer: Hls | null = null;
    const playbackUrl = getPlaybackUrl(room);

    video.pause();
    video.removeAttribute("src");
    video.load();
    setStatus("正在连接");

    if (room.format === "flv" && flvjs.isSupported()) {
      flvPlayer = flvjs.createPlayer(
        {
          type: "flv",
          url: playbackUrl,
          isLive: true
        },
        {
          enableStashBuffer: false,
          stashInitialSize: 128
        }
      );
      flvPlayer.attachMediaElement(video);
      flvPlayer.load();
      flvPlayer.on(flvjs.Events.ERROR, () => setStatus("直播流连接失败"));
      void video.play().then(() => setStatus("正在播放")).catch(() => setStatus("点击播放"));
    } else if (room.format === "hls" && Hls.isSupported()) {
      hlsPlayer = new Hls({
        liveDurationInfinity: true,
        lowLatencyMode: true
      });
      hlsPlayer.loadSource(playbackUrl);
      hlsPlayer.attachMedia(video);
      hlsPlayer.on(Hls.Events.ERROR, () => setStatus("直播流连接失败"));
      void video.play().then(() => setStatus("正在播放")).catch(() => setStatus("点击播放"));
    } else {
      video.src = playbackUrl;
      void video.play().then(() => setStatus("正在播放")).catch(() => setStatus("点击播放"));
    }

    return () => {
      flvPlayer?.destroy();
      hlsPlayer?.destroy();
    };
  }, [room]);

  if (!room) {
    return (
      <section className="player-frame empty-player" aria-label="播放器">
        <CirclePlay size={48} aria-hidden="true" />
        <div>
          <span className="eyebrow">Ready</span>
          <h2>选择直播间开始播放</h2>
        </div>
      </section>
    );
  }

  return (
    <section className="player-frame" aria-label="播放器">
      <video ref={videoRef} controls muted playsInline poster={room.cover} />
      <div className="player-overlay">
        <div>
          <span className="eyebrow">{status}</span>
          <h2>{room.title}</h2>
          <p>{room.platformTitle} · {room.format.toUpperCase()}</p>
        </div>
        <button className="icon-button glass" type="button" onClick={onClose} title="关闭播放器">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="metric">
      <span aria-hidden="true">{icon}</span>
      <div>
        <strong>{value}</strong>
        <em>{label}</em>
      </div>
    </div>
  );
}

function InlineLoading({ label }: { label: string }) {
  return (
    <div className="inline-loading">
      <Loader2 size={16} className="spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function pickInitialPlatform(platforms: Platform[]): Platform | null {
  return platforms.find((platform) => platform.title === "映客") ?? platforms[0] ?? null;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

export default App;
