import type { IncomingMessage, ServerResponse } from "node:http";

export class SseBus {
  private readonly clients = new Set<ServerResponse<IncomingMessage>>();

  private readonly heartbeatMs: number;

  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(heartbeatMs = 25_000) {
    this.heartbeatMs = heartbeatMs;
  }

  addClient(
    req: IncomingMessage,
    res: ServerResponse<IncomingMessage>,
    initialStatus?: unknown,
  ) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });

    res.write(": connected\n\n");
    this.clients.add(res);
    this.ensureHeartbeat();

    if (initialStatus) {
      this.emitTo(res, "status", initialStatus);
    }

    const cleanup = () => {
      this.clients.delete(res);
      if (!this.clients.size && this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
  }

  broadcast(event: string, payload: unknown) {
    for (const client of this.clients) {
      this.emitTo(client, event, payload);
    }
  }

  private emitTo(res: ServerResponse<IncomingMessage>, event: string, payload: unknown) {
    try {
      const body = JSON.stringify(payload);
      res.write(`event: ${event}\n`);
      res.write(`data: ${body}\n\n`);
    } catch {
      this.clients.delete(res);
      res.end();
    }
  }

  private ensureHeartbeat() {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(() => {
      for (const client of this.clients) {
        try {
          client.write(`: heartbeat ${Date.now()}\n\n`);
        } catch {
          this.clients.delete(client);
          client.end();
        }
      }
    }, this.heartbeatMs);
  }
}
