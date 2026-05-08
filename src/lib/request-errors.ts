export function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function isTransientRequestError(error: unknown): boolean {
  if (isAbortLikeError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return [
    "failed to fetch",
    "networkerror",
    "load failed",
    "fetch failed",
    "network request failed",
    "err_connection_closed",
    "the network connection was lost",
  ].some((pattern) => message.includes(pattern));
}

export function shouldSkipBackgroundRequest(): boolean {
  if (typeof document !== "undefined" && document.hidden) {
    return true;
  }

  if (typeof navigator !== "undefined" && "onLine" in navigator && !navigator.onLine) {
    return true;
  }

  return false;
}
