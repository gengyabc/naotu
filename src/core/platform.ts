export function isMacOS(): boolean {
  if (typeof navigator === "undefined") return false;
  if ("userAgentData" in navigator) {
    const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
    if (uaData?.platform) {
      return /mac/i.test(uaData.platform);
    }
  }
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform);
}

export function getModifierKey(): string {
  return isMacOS() ? "Cmd" : "Ctrl";
}