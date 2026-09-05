/** Escape plain text exactly once before inserting it into email HTML. */
export function escapeEmailHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
}

/** Subjects are plain text, not HTML: undo only our own single escaping pass. */
export function emailSubjectText(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|#39);/g, entity => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
  }[entity]!)).replace(/[\r\n]+/g, " ");
}

export function validateEmailUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("Email links must use HTTPS");
  }
  if (url.username || url.password) throw new Error("Email links cannot contain credentials");
  return value;
}
