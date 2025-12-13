export type CoachThreadRole = "user" | "assistant";

export type CoachThreadMessage = {
  id: string;
  role: CoachThreadRole;
  content: string;
  createdAt: Date;
  suggestions?: string[] | null;
  usedLLM?: boolean;
};

export function sanitizeCoachContent(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .split("")
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      // Preserve newlines; strip other control chars.
      if (code < 32 && code !== 10 && code !== 13) return " ";
      if (code === 127) return " ";
      return ch;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function sortCoachThreadMessages(
  messages: CoachThreadMessage[]
): CoachThreadMessage[] {
  return [...messages].sort((a, b) => {
    const at = a.createdAt.getTime();
    const bt = b.createdAt.getTime();
    if (at !== bt) return at - bt;
    return a.id.localeCompare(b.id);
  });
}

