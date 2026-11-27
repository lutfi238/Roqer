import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HISTORY_FILE = "release-history.json";
const WORKSPACE_FILES = ["workspace-manifest.json", "workspace-manifest.previous.json", "workspace-state.json"];
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([\da-z-]+(?:\.[\da-z-]+)*))?(?:\+[\da-z-]+(?:\.[\da-z-]+)*)?$/i;
const NUMERIC = /^\d+$/;

function parseVersion(version: unknown): string[][] | undefined {
  if (typeof version !== "string" || version.length > 100) return undefined;
  const match = VERSION.exec(version);
  if (match === null) return undefined;
  return [match.slice(1, 4), match[4]?.split(".") ?? []];
}

/** Package versions compare numerically, with SemVer prerelease precedence. */
function isUpgrade(current: string[][], highest: string[][]): boolean {
  for (const [index, identifiers] of current.entries()) {
    const earlier = highest[index];
    if (index === 1 && (identifiers.length === 0 || earlier.length === 0)) {
      return identifiers.length === 0 && earlier.length > 0;
    }
    for (const [part, identifier] of identifiers.entries()) {
      const previous = earlier[part];
      if (previous === undefined) return true;
      if (identifier === previous) continue;
      const numeric = NUMERIC.test(identifier);
      const previousNumeric = NUMERIC.test(previous);
      if (numeric && previousNumeric) return BigInt(identifier) > BigInt(previous);
      if (numeric !== previousNumeric) return previousNumeric;
      return identifier > previous;
    }
    if (identifiers.length < earlier.length) return false;
  }
  return false;
}

async function fileExists(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Decides at desktop startup, before a fresh installation creates workspace files. */
export async function recordLaunchedVersion(userData: string, version: string): Promise<boolean> {
  const current = parseVersion(version);
  if (current === undefined) return false;
  const file = join(userData, HISTORY_FILE);
  let showNotes: boolean;

  if (await fileExists(file)) {
    const info = await stat(file);
    let history: unknown;
    if (info.size <= 1024) {
      const contents = await readFile(file, "utf8");
      try {
        history = JSON.parse(contents);
      } catch {
        // Preserve an unreadable marker instead of using it to infer an upgrade.
      }
    }
    if (history === null || typeof history !== "object" || !("schemaVersion" in history)) {
      await rename(file, `${file}.damaged-${randomUUID()}`);
      showNotes = false;
    } else if (history.schemaVersion !== 1) {
      return false;
    } else {
      const highest = parseVersion("highestVersion" in history ? history.highestVersion : undefined);
      if (highest === undefined) {
        await rename(file, `${file}.damaged-${randomUUID()}`);
        showNotes = false;
      } else {
        if (!isUpgrade(current, highest)) return false;
        showNotes = true;
      }
    }
  } else {
    // Older Roqer builds saved a workspace but did not track their version.
    // A first launch with files from that profile is the one-time migration.
    const existingWorkspace = await Promise.all(WORKSPACE_FILES.map((name) => fileExists(join(userData, name))));
    showNotes = existingWorkspace.some(Boolean);
  }

  const temporary = `${file}.${randomUUID()}.tmp`;
  await mkdir(userData, { recursive: true });
  try {
    await writeFile(temporary, `${JSON.stringify({ schemaVersion: 1, highestVersion: version })}\n`, { flag: "wx" });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
  return showNotes;
}
