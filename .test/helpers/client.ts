import request from "supertest";
import type { Agent } from "supertest";

import { API_CONFIG } from "./config.js";

/**
 * A supertest agent for the main server. One agent is one browser-like session: it keeps the
 * connect.sid cookie that login sets and sends it back on every request.
 * A new agent has no cookie, so it is a guest.
 *
 * Usage (paths are relative to /api/v1):
 *   await client.get("/books").query({ page: 2 }).expect(200);
 *   await client.post("/books").send(body);
 *   await client.put(pathOf("/copies/:id", { id })).send(body);
 *   await client.delete(`/books/${id}`);
 */
export type Client = Agent;

/** A new session with no cookie. Every request asks for JSON and times out after 10 s. */
export function newClient(): Client {
    return request
        .agent(API_CONFIG.baseUrl)
        .set("Accept", "application/json")
        .timeout(API_CONFIG.requestTimeoutMs);
}

/**
 * Builds a path from a template and URL-encodes every value, e.g.
 * pathOf("/copies/:id", { id: "WB-00421" }) === "/copies/WB-00421".
 * @throws Error when the template has a :name with no value
 */
export function pathOf(template: string, params: Record<string, string | number>): string {
    return template.replace(/:([A-Za-z_]\w*)/g, (_whole, name: string) => {
        const value = params[name];
        if (value === undefined) throw new Error(`pathOf: no value for :${name} in ${template}`);
        return encodeURIComponent(String(value));
    });
}
