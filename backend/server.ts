import { createServer, type IncomingMessage } from "node:http";
import { parse } from "node:url";
import { randomUUID } from "node:crypto";
import next from "next";
import { WebSocketServer, type WebSocket } from "ws";

import { createOracle, setOracle } from "./src/server/oracle";
import { recoverUnpaid, startEngine, stopEngine } from "./src/server/engine";
import {
  addConnection,
  publishTick,
  removeConnection,
  type Connection,
  type ServerMessage,
} from "./src/server/realtime";
import { SESSION_COOKIE_NAME, resolveToken } from "./src/server/auth";

/**
 * Custom server.
 *
 * Next's route handlers cannot hold a WebSocket, and a trading terminal that
 * polls for prices is not a trading terminal. Running Next inside our own HTTP
 * server puts the market feed, the settlement engine, and the API in one
 * process, so a route handler and the engine talk to the same oracle instance
 * rather than to two copies that disagree about the price.
 *
 * The tradeoff is that this app is deployed as a container (Railway, Fly,
 * Render, ECS) rather than to a serverless platform. That is the correct shape
 * for something with a persistent price feed anyway.
 */

const dev = process.env.NODE_ENV !== "production";
const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOSTNAME ?? "localhost";

const HEARTBEAT_MS = 30_000;
/** Rate limit on inbound WebSocket frames, per connection. */
const MAX_FRAMES_PER_WINDOW = 60;
const RATE_WINDOW_MS = 10_000;

function readCookie(request: IncomingMessage, name: string): string | undefined {
  const header = request.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      return decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return undefined;
}

async function main() {
  const app = next({ dev, hostname, port });
  await app.prepare();
  const handle = app.getRequestHandler();

  // --- Market feed --------------------------------------------------------
  const oracle = await createOracle();
  setOracle(oracle);
  oracle.start();

  for (const symbol of oracle.symbols()) {
    oracle.subscribe(symbol, (tick) => {
      publishTick({
        t: "tick",
        s: tick.symbol,
        p: tick.mid,
        b: tick.bid,
        a: tick.ask,
        ts: tick.ts,
      });
    });
  }
  console.log(`[oracle] ${oracle.symbols().length} instruments live`);

  // --- Settlement ---------------------------------------------------------
  const repaired = await recoverUnpaid();
  if (repaired > 0) {
    console.log(`[engine] recovered ${repaired} decided-but-unpaid settlement(s)`);
  }
  startEngine();
  console.log("[engine] settlement loop started");

  // --- HTTP ---------------------------------------------------------------
  const server = createServer((req, res) => {
    handle(req, res, parse(req.url ?? "/", true)).catch((error) => {
      console.error("[http] handler error:", error);
      res.statusCode = 500;
      res.end("Internal Server Error");
    });
  });

  // --- WebSocket ----------------------------------------------------------
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

  server.on("upgrade", (request, socket, head) => {
    const { pathname } = parse(request.url ?? "/");

    // Next uses its own upgrade path for HMR in development; leave it alone.
    if (pathname !== "/ws") {
      if (dev) return;
      socket.destroy();
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  });

  wss.on("connection", async (ws: WebSocket, request: IncomingMessage) => {
    // The session cookie is sent on the upgrade request, so the socket is
    // authenticated at handshake time rather than by a client-supplied token in
    // the first frame (which a malicious client simply lies about).
    const user = await resolveToken(readCookie(request, SESSION_COOKIE_NAME));

    const connection: Connection = {
      id: randomUUID(),
      userId: user?.id ?? null,
      symbols: new Set(),
      isAlive: true,
      send(message: ServerMessage) {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(message));
        }
      },
      close() {
        ws.close();
      },
    };

    addConnection(connection);
    connection.send({
      t: "hello",
      userId: connection.userId,
      serverTime: Date.now(),
    });

    let frames = 0;
    const rateTimer = setInterval(() => {
      frames = 0;
    }, RATE_WINDOW_MS);
    rateTimer.unref?.();

    ws.on("message", (raw) => {
      frames += 1;
      if (frames > MAX_FRAMES_PER_WINDOW) {
        connection.close();
        return;
      }

      let message: unknown;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return; // Malformed frames are ignored, not fatal.
      }

      if (typeof message !== "object" || message === null) return;
      const payload = message as Record<string, unknown>;

      switch (payload.t) {
        case "sub": {
          const symbols = payload.symbols;
          if (!Array.isArray(symbols)) return;
          connection.symbols.clear();
          // Cap the subscription set so one socket cannot ask for everything
          // and turn itself into an amplification vector.
          for (const symbol of symbols.slice(0, 12)) {
            if (typeof symbol === "string") connection.symbols.add(symbol);
          }
          // Send the current price immediately so a newly-subscribed chart is
          // not blank until the next tick.
          for (const symbol of connection.symbols) {
            const tick = oracle.lastTick(symbol);
            if (tick) {
              connection.send({
                t: "tick",
                s: tick.symbol,
                p: tick.mid,
                b: tick.bid,
                a: tick.ask,
                ts: tick.ts,
              });
            }
          }
          return;
        }
        case "ping":
          connection.send({ t: "pong", ts: Date.now() });
          return;
        default:
          return;
      }
    });

    ws.on("pong", () => {
      connection.isAlive = true;
    });

    ws.on("close", () => {
      clearInterval(rateTimer);
      removeConnection(connection.id);
    });

    ws.on("error", () => {
      clearInterval(rateTimer);
      removeConnection(connection.id);
    });

    // Track liveness for the heartbeat sweep below.
    (ws as WebSocket & { __connection?: Connection }).__connection = connection;
  });

  // Drop sockets that stopped answering — otherwise half-open connections from
  // sleeping laptops accumulate and are broadcast to forever.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      const connection = (ws as WebSocket & { __connection?: Connection })
        .__connection;
      if (!connection) continue;

      if (!connection.isAlive) {
        ws.terminate();
        continue;
      }
      connection.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  server.listen(port, () => {
    console.log(`\n  Meridian ready on http://${hostname}:${port}\n`);
  });

  const shutdown = (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down`);
    clearInterval(heartbeat);
    stopEngine();
    oracle.stop();
    wss.close();
    server.close(() => process.exit(0));
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(0), 5_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[server] failed to start:", error);
  process.exit(1);
});
