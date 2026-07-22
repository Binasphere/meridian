/**
 * Realtime fan-out.
 *
 * The WebSocket server lives in `server.ts`, but route handlers and the
 * settlement engine also need to push messages, so the registry of live
 * connections is kept here on globalThis and shared by everything in the
 * process. (globalThis rather than a module-level constant because Next
 * re-evaluates modules on hot reload, which would otherwise leave the engine
 * publishing into an orphaned registry while the browser listens on a new one.)
 */

export type ServerMessage =
  | { t: "hello"; userId: string | null; serverTime: number }
  | { t: "tick"; s: string; p: number; b: number; a: number; ts: number }
  | { t: "trade"; trade: unknown }
  | { t: "balance"; accountId: string; balanceMinor: string }
  | { t: "chat"; message: unknown }
  | { t: "presence"; online: number }
  | { t: "pong"; ts: number };

export interface Connection {
  id: string;
  userId: string | null;
  /** Symbols this connection has asked for. Ticks for others are not sent. */
  symbols: Set<string>;
  send: (message: ServerMessage) => void;
  close: () => void;
  isAlive: boolean;
}

interface Registry {
  connections: Map<string, Connection>;
}

const globalForRealtime = globalThis as unknown as {
  __meridianRealtime: Registry | undefined;
};

function registry(): Registry {
  if (!globalForRealtime.__meridianRealtime) {
    globalForRealtime.__meridianRealtime = { connections: new Map() };
  }
  return globalForRealtime.__meridianRealtime;
}

export function addConnection(connection: Connection): void {
  registry().connections.set(connection.id, connection);
  publishPresence();
}

export function removeConnection(id: string): void {
  registry().connections.delete(id);
  publishPresence();
}

export function connectionCount(): number {
  return registry().connections.size;
}

/** Number of *distinct signed-in users* currently connected. */
export function onlineUserCount(): number {
  const users = new Set<string>();
  for (const c of registry().connections.values()) {
    if (c.userId) users.add(c.userId);
  }
  return users.size;
}

export function broadcast(message: ServerMessage): void {
  for (const connection of registry().connections.values()) {
    connection.send(message);
  }
}

/** Delivers to every connection belonging to one user (multiple tabs, phone). */
export function sendToUser(userId: string, message: ServerMessage): void {
  for (const connection of registry().connections.values()) {
    if (connection.userId === userId) connection.send(message);
  }
}

/** Ticks go only to connections that subscribed to that symbol. */
export function publishTick(message: Extract<ServerMessage, { t: "tick" }>): void {
  for (const connection of registry().connections.values()) {
    if (connection.symbols.has(message.s)) connection.send(message);
  }
}

export function publishPresence(): void {
  broadcast({ t: "presence", online: onlineUserCount() });
}

export function connections(): Iterable<Connection> {
  return registry().connections.values();
}
