export type LobsterEventType =
  | "gateway:startup"
  | "message:received"
  | "message:sent"
  | "command:new"
  | "command:reset"
  | "command:stop";

export type LobsterState =
  | "idle"
  | "thinking"
  | "replying"
  | "sleeping"
  | "error";

export type LobsterMood =
  | "calm"
  | "focused"
  | "bright"
  | "sleepy"
  | "alert";

export interface LobsterSnapshot {
  lastEvent: LobsterEventType;
  ts: number;
  source?: string;
  channelId?: string;
  conversationId?: string;
}

export interface LobsterStatusPayload {
  version: 1;
  online: boolean;
  state: LobsterState;
  mood: LobsterMood;
  title: string;
  message: string;
  updatedAt: string;
  ageMs: number;
  lastEvent: LobsterEventType;
  deviceName?: string;
}
