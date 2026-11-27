import { strict as assert } from "node:assert";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { recordLaunchedVersion } from "./release-history";

async function profile(t: TestContext): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "roqer-release-history-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("a fresh profile has no popup, and only an upgrade gets one", async (t) => {
  const dir = await profile(t);
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), false);
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), false, "reinstalling the same build");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.10"), true);
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.2"), false, "downgrading");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.10"), false, "returning to the already-seen build");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2"), true, "stable outranks its prereleases");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2+build.1"), false, "metadata does not change precedence");
  assert.equal(await recordLaunchedVersion(dir, "0.3.10"), true);
  assert.equal(await recordLaunchedVersion(dir, "0.3.9"), false, "compare core versions numerically");
});

test("an existing profile created before release history is treated as an upgrade once", async (t) => {
  const dir = await profile(t);
  await writeFile(join(dir, "workspace-manifest.json"), "{}");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), true);
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), false);
});

test("a damaged marker is retained and does not claim an upgrade", async (t) => {
  const dir = await profile(t);
  const file = join(dir, "release-history.json");
  await writeFile(file, "{");
  await writeFile(join(dir, "workspace-state.json"), "{}");
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), false);
  assert.deepEqual(JSON.parse(await readFile(file, "utf8")), { schemaVersion: 1, highestVersion: "0.3.2-lutfi.1" });
  assert.equal((await readdir(dir)).filter((name) => name.startsWith("release-history.json.damaged-")).length, 1);
});

test("a newer history schema is left alone", async (t) => {
  const dir = await profile(t);
  const file = join(dir, "release-history.json");
  const future = '{"schemaVersion":2,"highestVersion":"1.0.0"}';
  await writeFile(file, future);
  assert.equal(await recordLaunchedVersion(dir, "0.3.2-lutfi.1"), false);
  assert.equal(await readFile(file, "utf8"), future);
});
