export type PlatformApiItem = {
  address: string;
  xinimg: string;
  Number: string;
  title: string;
};

export type RoomApiItem = {
  address: string;
  img: string;
  title: string;
};

export type Platform = {
  id: string;
  endpoint: string;
  cover: string;
  count: number;
  title: string;
};

export type StreamFormat = "flv" | "hls" | "mp4" | "unknown";

export type Room = {
  id: string;
  cover: string;
  format: StreamFormat;
  platformTitle: string;
  sourceHost: string;
  streamUrl: string;
  title: string;
};

export type AsyncState = "idle" | "loading" | "ready" | "error";
