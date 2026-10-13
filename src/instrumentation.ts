// Lets the ingestion worker run inside the same Node process as the Next.js server,
// for deployment targets that only offer one long-running process type (e.g. Render's
// free tier has no "background worker" resource — only a web service, which this
// becomes a part of). Local dev and the Docker Compose deployment are unaffected: both
// run `worker/index.ts` as its own separate process and never set this env var, so this
// hook is a no-op for them. See ARCHITECTURE.md's deployment section.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.ENABLE_INPROCESS_WORKER === "true") {
    await import("../worker/index");
  }
}
