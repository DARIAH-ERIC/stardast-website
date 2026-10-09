import type { APIRoute } from "astro";

/**
 * Liveness: whether the process can respond at all. Deliberately checks nothing else - a failing liveness check makes
 * kubernetes restart the pod, which helps neither with broken configuration, nor with github being unavailable.
 */
export const GET: APIRoute = () => new Response("ok", { headers: { "cache-control": "no-store" } });
