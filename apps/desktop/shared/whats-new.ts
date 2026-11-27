export type ReleaseNotes = Readonly<{
  version: string;
  changes: ReadonlyArray<{ title: string; detail: string }>;
}>;

/** Add a matching entry here when shipping a desktop version with release notes. */
const RELEASE_NOTES: readonly ReleaseNotes[] = [
  {
    version: "0.3.3-lutfi.1",
    changes: [
      {
        title: "See why a playtest capture failed",
        detail: "Failed capture_moments calls keep the available reason in the run record.",
      },
      {
        title: "More context for Antigravity errors",
        detail: "When Antigravity returns INVALID_ARGUMENT, the run record lists the model and recent tool outcomes to help diagnose the failure.",
      },
    ],
  },
  {
    version: "0.3.2-lutfi.1",
    changes: [
      {
        title: "Generate images with your Codex account",
        detail: "Connect Codex in Settings → Models to use your ChatGPT account for image generation. The account is the default when you have no image provider configured.",
      },
      {
        title: "Review what changed after an update",
        detail: "Roqer shows the release notes the first time you open a newer build. Find them again in Settings → What’s New.",
      },
    ],
  },
];

export function releaseNotesFor(version: string | null): ReleaseNotes | undefined {
  return RELEASE_NOTES.find((entry) => entry.version === version);
}
