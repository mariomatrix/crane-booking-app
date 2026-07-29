import type { Response } from "express";

interface ConnectedClient {
  id: string;
  res: Response;
  userId: string;
}

interface CalendarEventPayload {
  type: "CALENDAR_UPDATED";
  actorId?: string;
  actorName: string;
  reservationId?: string;
  actionText: string;
  timestamp: string;
}

class CalendarSyncManager {
  private clients: Map<string, ConnectedClient> = new Map();

  constructor() {
    // Send periodic heartbeats every 25s to keep connections alive
    setInterval(() => {
      this.clients.forEach((client) => {
        try {
          client.res.write(":ping\n\n");
        } catch {
          this.removeClient(client.id);
        }
      });
    }, 25000);
  }

  public addClient(client: ConnectedClient) {
    this.clients.set(client.id, client);
    client.res.on("close", () => {
      this.removeClient(client.id);
    });
  }

  public removeClient(id: string) {
    this.clients.delete(id);
  }

  public broadcast(payload: CalendarEventPayload) {
    const data = JSON.stringify(payload);
    this.clients.forEach((client) => {
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch (err) {
        console.warn(`[CalendarSync] Error writing to client ${client.id}:`, err);
        this.removeClient(client.id);
      }
    });
  }
}

export const calendarSync = new CalendarSyncManager();
