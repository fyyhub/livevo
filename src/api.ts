import type { Platform, PlatformApiItem, Room, RoomApiItem, StreamFormat } from "./types";

const DEFAULT_API_ROOT = import.meta.env.DEV
  ? "/mf-api/mf/"
  : "http://api.hclyz.com:81/mf/";

export const API_ROOT = import.meta.env.VITE_API_ROOT ?? DEFAULT_API_ROOT;
export const SOURCE_DESCRIPTION_URL = "http://api.hclyz.com:81/mf/json.txt";

type PlatformResponse = {
  pingtai?: PlatformApiItem[];
};

type RoomResponse = {
  zhubo?: RoomApiItem[];
};

export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`请求失败：${status}`);
    this.name = "ApiHttpError";
  }
}

export async function loadPlatforms(signal?: AbortSignal): Promise<Platform[]> {
  const response = await fetchJson<PlatformResponse>("json.txt", signal);
  return (response.pingtai ?? [])
    .filter((item) => item.address && item.title)
    .map((item) => ({
      id: item.address,
      endpoint: item.address,
      cover: item.xinimg,
      count: Number.parseInt(item.Number, 10) || 0,
      title: decodeText(item.title)
    }));
}

export async function loadRooms(platform: Platform, signal?: AbortSignal): Promise<Room[]> {
  let response: RoomResponse;
  try {
    response = await fetchJson<RoomResponse>(platform.endpoint, signal);
  } catch (err) {
    if (err instanceof ApiHttpError && err.status === 404) {
      return [];
    }
    throw err;
  }

  return (response.zhubo ?? [])
    .filter((item) => item.address && item.title)
    .map((item, index) => {
      const streamUrl = item.address.trim();
      const sourceHost = getHost(streamUrl);
      const title = decodeText(item.title);
      return {
        id: `${platform.id}-${index}-${streamUrl}`,
        cover: item.img,
        format: getStreamFormat(streamUrl),
        platformTitle: platform.title,
        sourceHost,
        streamUrl,
        title
      };
    });
}

export function getPlaybackUrl(room: Room): string {
  if (!import.meta.env.DEV) {
    return room.streamUrl;
  }

  if (room.format === "flv" || room.format === "mp4") {
    return `/stream-proxy?url=${encodeURIComponent(room.streamUrl)}`;
  }

  return room.streamUrl;
}

async function fetchJson<T>(endpoint: string, signal?: AbortSignal): Promise<T> {
  const url = resolveApiUrl(endpoint);
  const response = await fetch(url, {
    cache: "no-store",
    signal
  });

  if (!response.ok) {
    throw new ApiHttpError(response.status, url);
  }

  const text = await response.text();
  return parseLooseJson<T>(text);
}

function resolveApiUrl(endpoint: string): string {
  const base = API_ROOT.endsWith("/") ? API_ROOT : `${API_ROOT}/`;
  if (base.startsWith("/")) {
    return `${base}${endpoint}`;
  }
  return new URL(endpoint, base).toString();
}

function parseLooseJson<T>(text: string): T {
  const trimmed = text.replace(/^\uFEFF/, "").trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("接口返回的不是 JSON");
  }

  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) as T;
}

function decodeText(value: string): string {
  const normalized = value.replace(/\+/g, "%20");
  try {
    return decodeURIComponent(normalized).trim();
  } catch {
    return value.trim();
  }
}

function getStreamFormat(url: string): StreamFormat {
  try {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith(".flv")) {
      return "flv";
    }
    if (path.endsWith(".m3u8")) {
      return "hls";
    }
    if (path.endsWith(".mp4")) {
      return "mp4";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
}

function getHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "未知源";
  }
}
