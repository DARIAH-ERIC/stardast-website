import { fileURLToPath } from "node:url";

import { loadEnv } from "vite";

const projectDir = fileURLToPath(new URL("..", import.meta.url));

/**
 * Loads `.env` files into `process.env`, with the same files and priorities as vite, without overriding variables which
 * are already set.
 *
 * Vite only loads `.env` files into `import.meta.env`, and only after the astro config is evaluated, while server-only
 * variables are read from `process.env` at runtime, see `env.config.ts`. Astro sets `NODE_ENV` before evaluating the
 * config, depending on the command.
 */
export function loadEnvFiles(mode = process.env.NODE_ENV ?? "development"): void {
	for (const [key, value] of Object.entries(loadEnv(mode, projectDir, ""))) {
		process.env[key] ??= value;
	}
}
