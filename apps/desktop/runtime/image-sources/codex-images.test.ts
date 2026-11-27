import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { rgbaPng } from "../test-rgba-png";

import type { AppServerNotification } from "../codex-app-server";
import { CODEX_IMAGE_MODEL } from "../../shared/image-generation";
import { CodexImageSource } from "./codex-images";
import type { ImageRequest } from "./openai-images";

const png = rgbaPng(1, 1, () => [0, 0, 255, 255]);
const request: ImageRequest = { prompt: "A blue star", kind: "icon", size: "512x512", count: 1, quality: "medium", background: "transparent" };

function fakeCodex(events: AppServerNotification[], connected = true) {
  let listener: ((event: AppServerNotification) => void) | undefined;
  let closed = false;
  const calls: { method: string; params: unknown }[] = [];
  return {
    calls,
    closed: () => closed,
    client: {
      start: async () => undefined,
      close: () => { closed = true; },
      getChatGptStatus: async () => ({ kind: connected ? "signed-in" as const : "signed-out" as const, message: "" }),
      onDisconnect: () => () => undefined,
      handleRequests: () => () => undefined,
      subscribe: (receive: (event: AppServerNotification) => void) => {
        listener = receive;
        return () => { listener = undefined; };
      },
      request: async <T>(method: string, params: unknown): Promise<T> => {
        calls.push({ method, params });
        if (method === "thread/start") return { thread: { id: "image" } } as T;
        for (const event of events) listener?.(event);
        return { turn: { id: "turn" } } as T;
      },
    },
  };
}

const itemEvent = (item: Record<string, unknown>, threadId = "image"): AppServerNotification =>
  ({ method: "item/completed", params: { threadId, item: { type: "imageGeneration", id: "one", ...item } } });
const end: AppServerNotification = { method: "turn/completed", params: { threadId: "image", turn: { status: "completed" } } };

test("uses the signed-in Codex account, isolates the image thread, and accepts a native PNG", async () => {
  const fake = fakeCodex([itemEvent({ result: png.toString("base64") }, "unrelated"), itemEvent({ result: png.toString("base64"), revisedPrompt: "Blue star" }), end]);
  const source = new CodexImageSource(tmpdir(), () => fake.client);
  const result = await source.generate({ ...request, reference: { bytes: png, name: "reference.png" } }, new AbortController().signal);
  assert.deepEqual(result, { model: CODEX_IMAGE_MODEL, images: [png], revisedPrompt: "Blue star" });
  assert.ok(fake.closed());
  assert.match(JSON.stringify(fake.calls[0].params), /"approvalPolicy":"never","sandbox":"read-only"/);
  assert.match(JSON.stringify(fake.calls[1].params), /data:image\/png;base64,/);
  assert.match(JSON.stringify(fake.calls[1].params), /fully transparent background/);
});

test("cannot spend or start a turn when the ChatGPT account is disconnected", async () => {
  const fake = fakeCodex([], false);
  await assert.rejects(new CodexImageSource(tmpdir(), () => fake.client).generate(request, new AbortController().signal), /Connect your ChatGPT account/);
  assert.deepEqual(fake.calls, []);
  assert.ok(fake.closed());
});

test("accepts a saved image only inside Codex's own generated images folder", async () => {
  const home = await mkdtemp(join(tmpdir(), "roqer-codex-image-"));
  try {
    const generated = join(home, "generated_images", "image");
    await mkdir(generated, { recursive: true });
    const savedPath = join(generated, "image.png");
    await writeFile(savedPath, png);
    const fromFile = fakeCodex([itemEvent({ savedPath }), end]);
    assert.deepEqual((await new CodexImageSource(home, () => fromFile.client).generate(request, new AbortController().signal)).images, [png]);
    const outside = join(home, "other.png");
    await writeFile(outside, png);
    const unexpected = fakeCodex([itemEvent({ savedPath: outside }), end]);
    await assert.rejects(new CodexImageSource(home, () => unexpected.client).generate(request, new AbortController().signal), /returned no PNG/);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("ends an image turn on cancellation or attempted external tools", async () => {
  const external = fakeCodex([{ method: "item/started", params: { threadId: "image", item: { type: "commandExecution" } } }]);
  await assert.rejects(new CodexImageSource(tmpdir(), () => external.client).generate(request, new AbortController().signal), /outside image generation/);
  assert.ok(external.closed());

  const fake = fakeCodex([]);
  const controller = new AbortController();
  const pending = new CodexImageSource(tmpdir(), () => fake.client).generate(request, controller.signal);
  controller.abort(new Error("Cancelled for test"));
  await assert.rejects(pending, /Cancelled for test/);
  assert.ok(fake.closed());
});
