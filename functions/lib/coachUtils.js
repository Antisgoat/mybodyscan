export function formatCoachReply(text) {
    const MAX_CHARS = 2500;
    let body = (text || "").toString().trim();
    if (body.length > MAX_CHARS)
        body = body.slice(0, MAX_CHARS) + "…";
    body = body.replace(/\b(diagnose|prescribe|cure|disease|medical treatment)\b/gi, "—");
    const disclaimer = "⚠️ Coach is informational only — not medical advice. Consult a licensed professional for medical concerns.";
    return `${body}\n\n${disclaimer}`;
}
//# sourceMappingURL=coachUtils.js.map