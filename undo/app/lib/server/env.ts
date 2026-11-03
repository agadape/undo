// Server-only: secrets come from the repository's root .env (gitignored), never from the browser.
// Re-read on use so values appended while the dev server runs (e.g. by deploy scripts) are picked up;
// dotenv only fills variables that are not set yet.
import path from "node:path";
import dotenv from "dotenv";

const ENV_PATH = path.resolve(process.cwd(), "..", "..", ".env");
const load = () => dotenv.config({ path: ENV_PATH, quiet: true });
load();

export function need(name: string): string {
  if (!process.env[name]) load();
  const v = process.env[name];
  if (!v) throw new Error(`${name} missing in .env`);
  return v;
}

export function optional(name: string): string | undefined {
  if (!process.env[name]) load();
  return process.env[name];
}
