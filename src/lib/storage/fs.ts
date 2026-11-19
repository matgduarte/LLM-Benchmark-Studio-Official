import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Filesystem helpers with atomic writes.
 *
 * Atomicity strategy: write to a sibling temp file (`.tmp.<rand>`), `fsync` it,
 * then `rename` over the destination. On most POSIX filesystems rename is
 * atomic, so a reader never sees a partially-written file — critical while
 * concurrent executions stream their results to disk.
 */

/** Ensure a directory exists. */
export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

/** Read & parse a JSON file. Returns `fallback` if missing or corrupt. */
export async function readJson<T>(filePath: string, fallback?: T): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    try {
      return JSON.parse(raw) as T;
    } catch {
      if (fallback !== undefined) return fallback;
      // Re-throw so caller can decide; otherwise undefined.
      return undefined;
    }
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return fallback;
    throw err;
  }
}

/**
 * Serializes writes per destination path.
 *
 * POSIX `rename` happily replaces a destination that other handles have open;
 * Windows does not — it fails with EPERM/EACCES/EBUSY. Two concurrent atomic
 * writes to the same file (e.g. several executions refreshing `status.json`)
 * are therefore enough to break the batch on Windows. Chaining them keeps the
 * atomicity guarantee while making the last writer win deterministically.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  // Windows paths are case-insensitive, so normalize before keying.
  const key = path.resolve(filePath).toLowerCase();
  const prev = writeQueues.get(key) ?? Promise.resolve();
  // Run whether or not the previous write settled — one failure must not
  // wedge every later write to the same file.
  const run = prev.then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined
  );
  writeQueues.set(key, tail);
  void tail.then(() => {
    if (writeQueues.get(key) === tail) writeQueues.delete(key);
  });
  return run;
}

const RENAME_RETRY_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

/**
 * Rename with bounded retries. Even with writes serialized, an external holder
 * (antivirus, Windows Search indexer, an editor) can briefly lock the
 * destination. These locks clear in milliseconds, so a short backoff is enough.
 */
async function renameWithRetry(tmp: string, filePath: string, attempts = 12): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.rename(tmp, filePath);
      return;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code ?? "";
      if (!RENAME_RETRY_CODES.has(code) || i >= attempts) {
        // Don't leave the temp file behind on a permanent failure.
        await fs.unlink(tmp).catch(() => undefined);
        throw err;
      }
      const backoff = Math.min(200, 10 * 2 ** i);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
  }
}

/** The actual temp -> fsync -> rename write. Callers must hold the queue slot. */
async function performWrite(filePath: string, payload: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  const tmp = `${filePath}.tmp.${process.pid}.${Math.random().toString(36).slice(2)}`;
  const handle = await fs.open(tmp, "w");
  try {
    await handle.writeFile(payload, "utf8");
    await handle.sync(); // persist to disk before rename
  } finally {
    await handle.close();
  }
  await renameWithRetry(tmp, filePath);
}

/** Write JSON atomically: temp file -> fsync -> rename. */
export async function writeJsonAtomic<T>(filePath: string, data: T): Promise<void> {
  // Serialize the snapshot now, so a later mutation of `data` can't leak into
  // a write that is still queued.
  const payload = JSON.stringify(data, null, 2);
  return enqueueWrite(filePath, () => performWrite(filePath, payload));
}

/**
 * Read-modify-write a JSON file under the same per-path lock as
 * `writeJsonAtomic`, so concurrent updaters can't clobber each other's changes
 * (a plain read + write pair loses updates when two callers interleave).
 */
export async function updateJsonAtomic<T>(
  filePath: string,
  fallback: T,
  updater: (current: T) => T | Promise<T>
): Promise<T> {
  return enqueueWrite(filePath, async () => {
    const current = (await readJson<T>(filePath, fallback)) ?? fallback;
    const next = await updater(current);
    await performWrite(filePath, JSON.stringify(next, null, 2));
    return next;
  });
}

/** Append a line to a file (used for append-only audit logs). */
export async function appendLine(filePath: string, line: string): Promise<void> {
  const dir = path.dirname(filePath);
  await ensureDir(dir);
  await fs.appendFile(filePath, line + "\n", "utf8");
}

/** Delete a file, ignoring missing-file errors. */
export async function removeFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }
}

/** Remove a directory recursively, ignoring missing dirs. */
export async function removeDir(dir: string): Promise<void> {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* noop */
  }
}

/** Check whether a path exists. */
export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** List files in a directory (non-recursive), excluding temp files. */
export async function listFiles(dir: string, ext?: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && !e.name.endsWith(".tmp") && !e.name.includes(".tmp."))
      .map((e) => e.name)
      .filter((name) => (ext ? name.endsWith(ext) : true));
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

/** List sub-directory names of a directory (non-recursive). */
export async function listDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

/** Read raw text file. Returns undefined if missing. */
export async function readText(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return undefined;
    throw err;
  }
}
