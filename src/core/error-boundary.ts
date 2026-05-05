export async function safeAsync(
  fn: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    onError(error);
  }
}

export function safeSync(
  fn: () => void,
  onError: (error: unknown) => void,
): void {
  try {
    fn();
  } catch (error) {
    onError(error);
  }
}
