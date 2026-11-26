import { API_CONFIG } from "./config.js";

export type Query = Record<string, string | number | boolean>;

export interface RequestOptions {
    query?: Query | undefined;
    headers?: Record<string, string> | undefined;
}

export interface ApiResponse {
    status: number;
    headers: Headers;
    /**
     * Parsed JSON body, or undefined when the body is empty or not JSON.
     * Typed `any` on purpose: the tests check its shape with expect().
     */
    body: any;
    /** Raw body text. */
    text: string;
}

/**
 * HTTP client for the main server. One instance is one browser-like session: it keeps the
 * connect.sid cookie that login sets and sends it back on every request.
 * A new instance has no cookie, so it is a guest.
 */
export class ApiClient {
    readonly baseUrl: string;
    #cookie: string | null = null;

    constructor(baseUrl: string = API_CONFIG.baseUrl) {
        this.baseUrl = baseUrl;
    }

    /** The "connect.sid=..." pair of this session, or null for a guest. */
    get sessionCookie(): string | null {
        return this.#cookie;
    }

    get(path: string, options?: RequestOptions): Promise<ApiResponse> {
        return this.request("GET", path, undefined, options);
    }

    post(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
        return this.request("POST", path, body, options);
    }

    put(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse> {
        return this.request("PUT", path, body, options);
    }

    delete(path: string, options?: RequestOptions): Promise<ApiResponse> {
        return this.request("DELETE", path, undefined, options);
    }

    /**
     * Sends one request and reads the whole response.
     * @param path path under /api/v1, e.g. "/books/1". Encode ids yourself (see `pathOf`).
     * @param body sent as JSON when it is not undefined
     * @throws Error when the server cannot be reached or does not answer in time
     */
    async request(method: string, path: string, body?: unknown, options: RequestOptions = {}): Promise<ApiResponse> {
        const url = new URL(this.baseUrl + path);
        for (const [key, value] of Object.entries(options.query ?? {})) {
            url.searchParams.append(key, String(value));
        }

        const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
        if (this.#cookie) headers.Cookie = this.#cookie;
        if (body !== undefined) headers["Content-Type"] = "application/json";

        let response: Response;
        try {
            response = await fetch(url, {
                method,
                headers,
                body: body === undefined ? null : JSON.stringify(body),
                signal: AbortSignal.timeout(API_CONFIG.requestTimeoutMs)
            });
        } catch (error) {
            throw new Error(`${method} ${url.toString()} failed: ${describeFetchError(error)}`);
        }

        this.#rememberSessionCookie(response);
        const text = await response.text();
        return { status: response.status, headers: response.headers, body: parseJson(text), text };
    }

    #rememberSessionCookie(response: Response): void {
        for (const cookie of response.headers.getSetCookie()) {
            const pair = cookie.split(";")[0]?.trim() ?? "";
            if (pair.startsWith(`${API_CONFIG.sessionCookieName}=`)) this.#cookie = pair;
        }
    }
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

function parseJson(text: string): unknown {
    if (text === "") return undefined;
    try {
        return JSON.parse(text);
    } catch {
        return undefined;
    }
}

function describeFetchError(error: unknown): string {
    if (error instanceof Error && error.name === "TimeoutError") {
        return `no answer within ${API_CONFIG.requestTimeoutMs} ms`;
    }
    const code = error instanceof Error ? (error.cause as { code?: string } | undefined)?.code : undefined;
    if (code === "ECONNREFUSED") return "ECONNREFUSED (is the main server running? npm run dev:test)";
    return code ?? (error instanceof Error ? error.message : String(error));
}
