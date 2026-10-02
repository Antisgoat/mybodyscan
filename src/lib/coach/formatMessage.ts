const LIST_BOUNDARY = /\s+(?=(?:[-•]|\d+\.)\s+)/g;

/**
 * Coach responses are stored as plain text. Models occasionally include
 * lightweight Markdown even though the chat does not render Markdown. Keep
 * the output safe and readable without introducing an HTML/Markdown renderer.
 */
export function formatCoachMessageText(content: string): string {
  return content
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(LIST_BOUNDARY, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
