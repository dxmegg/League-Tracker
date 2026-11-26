// The "back up first?" decision, kept free of Electron so scripts/check-storage.mjs can run it.
export type BackupAnswer = "backup" | "skip" | "cancel";

// Whether a destructive operation may go ahead
export async function backupFirst(
  ask: () => Promise<BackupAnswer>,
  take: () => Promise<unknown>,
  onFailure: (message: string) => Promise<boolean>,
): Promise<boolean> {
  const answer = await ask();
  if (answer !== "backup") return answer === "skip";
  try {
    await take();
    return true;
  } catch (err) {
    return onFailure(err instanceof Error ? err.message : String(err));
  }
}
