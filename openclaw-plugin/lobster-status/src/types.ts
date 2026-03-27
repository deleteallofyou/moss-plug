export type RuntimeEventType =
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

export type DeviceEventName =
  | "page_load"
  | "visibility_change"
  | "pet_click"
  | "heartbeat";

export interface RuntimeSnapshot {
  lastEvent: RuntimeEventType;
  ts: number;
  source?: string;
  channelId?: string;
  conversationId?: string;
}

export interface DeviceEventMeta {
  deviceName?: string;
  source?: string;
  path?: string;
  visible?: boolean;
}

export interface DeviceEvent {
  id: string;
  deviceId: string;
  event: DeviceEventName;
  ts: number;
  meta?: DeviceEventMeta;
}

export interface DevicePresence {
  deviceId: string;
  deviceName?: string;
  source?: string;
  visible?: boolean;
  lastPath?: string;
  lastSeenAt: number;
  lastEvent: DeviceEventName;
}

export interface ActiveScene {
  id?: string;
  label?: string;
}

export interface PersistedPluginState {
  runtimeSnapshot: RuntimeSnapshot | null;
  devices: Record<string, DevicePresence>;
  recentDeviceEvents: DeviceEvent[];
  activeScene: ActiveScene | null;
}

export interface LobsterStatusDevicePayload {
  deviceId: string;
  deviceName?: string;
  source?: string;
  visible?: boolean;
  lastPath?: string;
  lastSeenAt: string;
  lastEvent: DeviceEventName;
}

export interface LobsterStatusEventPayload {
  id: string;
  deviceId: string;
  event: DeviceEventName;
  ts: string;
  meta?: DeviceEventMeta;
}

export interface LobsterStatusPayload {
  version: 2;
  online: boolean;
  state: LobsterState;
  mood: LobsterMood;
  title: string;
  message: string;
  updatedAt: string;
  ageMs: number;
  lastEvent: RuntimeEventType;
  deviceName?: string;
  runtimeSnapshot: RuntimeSnapshot | null;
  devices: LobsterStatusDevicePayload[];
  recentDeviceEvents: LobsterStatusEventPayload[];
  activeScene: ActiveScene | null;
  deviceCount: number;
  device: LobsterStatusDevicePayload | null;
  lastDeviceEvent: LobsterStatusEventPayload | null;
  streamPath: string;
  deviceEventPath: string;
  sseEnabled: boolean;
}
