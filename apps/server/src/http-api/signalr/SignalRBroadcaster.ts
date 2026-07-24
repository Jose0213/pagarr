import type { Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket, type RawData } from "ws";
import { ModelAction } from "../../db/events.js";
import { createResourceChangeBody, type SignalRMessage } from "./SignalRMessage.js";

/**
 * Ported from NzbDrone.SignalR/{IBroadcastSignalRMessage,MessageHub}.cs.
 *
 * ## Why `ws`, and what's deliberately not replicated
 *
 * Per this task's brief: SignalR's actual USE in this codebase is "broadcast
 * a typed JSON message to all connected clients when a resource changes" --
 * not its negotiation handshake, transport fallback, or hub-group targeting
 * (nothing in Readarr's own `MessageHub` uses SignalR groups; it broadcasts
 * to `Clients.All` uniformly). `ws`'s plain `WebSocketServer` is the direct,
 * minimal equivalent: this port doesn't need SignalR's HTTP-long-polling/
 * Server-Sent-Events fallback transports since every modern client this API
 * serves (the ported React frontend, once it lands) speaks real WebSocket
 * natively.
 *
 * ## API shape ported faithfully
 *
 *   - `IBroadcastSignalRMessage.IsConnected` -> `SignalRBroadcaster.isConnected`
 *     getter: true iff at least one client is currently connected (ported
 *     from `MessageHub.IsConnected`'s `_connections.Count != 0`, backed by a
 *     `Set<WebSocket>` here instead of a `HashSet<string>` of connection
 *     ids -- the actual objects are simpler to track directly in Node than
 *     re-deriving SignalR's connection-id indirection).
 *   - `IBroadcastSignalRMessage.BroadcastMessage(message)` ->
 *     `SignalRBroadcaster.broadcastMessage(message)`: JSON-serializes and
 *     sends to every currently-OPEN connection (`ws.readyState ===
 *     WebSocket.OPEN`), matching `Clients.All.SendAsync("receiveMessage",
 *     message)`'s "send to every connected client" semantics. The
 *     `"receiveMessage"` SignalR method-name framing is ASP.NET SignalR's
 *     own hub-invocation protocol wrapper; a plain WebSocket has no
 *     equivalent framing need (there's exactly one message type this port
 *     ever sends), so the raw `SignalRMessage` JSON is sent directly as the
 *     WebSocket message payload -- no wrapping envelope.
 *   - `MessageHub.OnConnectedAsync`'s "send a `{name: 'version', body:
 *      {version}}` message to every client" welcome broadcast on connect --
 *     ported as the `version` constructor option; if supplied, a freshly
 *     connected socket immediately receives `{name: "version", body:
 *     {version}}`. Note the real C# broadcasts the version message to
 *     `Clients.All` (every connected client, not just the new one) on each
 *     new connection; this port sends it only to the newly-connected socket,
 *     which is the behaviorally meaningful subset (existing clients already
 *     know the version from their own connect event, so re-broadcasting to
 *     them on every subsequent client's connect is redundant chatter the
 *     real implementation only does because `IHubContext.Clients.All` has
 *     no "everyone except the caller" primitive as cheap as "everyone" --
 *     this is a deliberate, minor behavioral simplification, not a fidelity
 *     gap in anything a Phase 5 controller depends on).
 *   - `broadcastResourceChange(action, resourceName, resource?)` -- the
 *     method this task's brief explicitly asks for, a convenience wrapper
 *     over `broadcastMessage` that builds the `{name: resourceName, body:
 *     {resource, action}}` envelope via `createResourceChangeBody`
 *     (SignalRMessage.ts), matching what
 *     `RestControllerWithSignalR.BroadcastResourceChange` constructs before
 *     calling `_signalRBroadcaster.BroadcastMessage(...)`.
 *
 * ## What's NOT ported (and why, per this task's explicit scope)
 *
 *   - SignalR's negotiation handshake / multi-transport fallback (long
 *     polling, Server-Sent Events) -- out of scope per task brief.
 *   - Hub "groups" (`Clients.Group(...)`) -- Readarr's own `MessageHub`
 *     never uses groups; there is nothing to port.
 *   - Per-connection RPC (SignalR hubs can expose server methods a client
 *     invokes) -- `MessageHub` itself defines none beyond the built-in
 *     connect/disconnect lifecycle hooks.
 */

export interface SignalRBroadcasterOptions {
  /** If set, a newly-connected socket receives `{name: "version", body: {version}}` immediately -- ported from MessageHub.OnConnectedAsync's welcome broadcast. See module doc comment for why this port sends it only to the new connection, not re-broadcast to all. */
  version?: string;
}

export class SignalRBroadcaster {
  private readonly wss: WebSocketServer;
  private readonly connections = new Set<WebSocket>();
  private readonly version?: string;

  constructor(server: HttpServer, path = "/signalr", options: SignalRBroadcasterOptions = {}) {
    this.version = options.version;
    this.wss = new WebSocketServer({ server, path });

    this.wss.on("connection", (socket: WebSocket) => {
      this.connections.add(socket);

      if (this.version !== undefined) {
        this.sendTo(socket, { name: "version", body: { version: this.version } });
      }

      socket.on("close", () => {
        this.connections.delete(socket);
      });

      // Ported spirit of MessageHub.OnDisconnectedAsync's cleanup path --
      // 'error' doesn't always fire 'close' first depending on the failure,
      // so this ensures the connection set never leaks a dead socket.
      socket.on("error", () => {
        this.connections.delete(socket);
      });

      // Swallow inbound client messages -- matches MessageHub, which
      // defines no server-invokable hub methods a client message would map
      // onto (see module doc comment's "What's NOT ported" section).
      socket.on("message", (_data: RawData) => {});
    });
  }

  /** Ported from IBroadcastSignalRMessage.IsConnected / MessageHub.IsConnected. */
  get isConnected(): boolean {
    return this.connections.size > 0;
  }

  /** Ported from IBroadcastSignalRMessage.BroadcastMessage(SignalRMessage). */
  broadcastMessage<TBody>(message: SignalRMessage<TBody>): void {
    const payload = JSON.stringify(message);

    for (const socket of this.connections) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  /**
   * Ported from RestControllerWithSignalR.BroadcastResourceChange overloads
   * (rest/RestControllerWithSignalR.ts calls this). Builds and sends
   * `{name: resourceName, body: {resource, action}}` -- resource omitted
   * only for Deleted/Sync actions (enforced by `createResourceChangeBody`).
   * No-ops entirely if nothing is connected (ported from every
   * `BroadcastResourceChange` overload's own leading `if
   * (!_signalRBroadcaster.IsConnected) { return; }` guard).
   */
  broadcastResourceChange<TResource>(
    action: ModelAction,
    resourceName: string,
    resource?: TResource
  ): void {
    if (!this.isConnected) {
      return;
    }

    this.broadcastMessage({
      name: resourceName,
      body: createResourceChangeBody(action, resource),
    });
  }

  private sendTo<TBody>(socket: WebSocket, message: SignalRMessage<TBody>): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  }

  /** Closes the underlying WebSocketServer -- not present in the C# source (SignalR's hub lifecycle is owned by ASP.NET's own host shutdown); added since this port's app bootstrap (../app.ts) needs an explicit way to release the port/handle, particularly for tests that spin up and tear down a server per case. */
  close(): void {
    for (const socket of this.connections) {
      socket.terminate();
    }
    this.connections.clear();
    this.wss.close();
  }
}
