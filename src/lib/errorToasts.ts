type ToastVariant = "default" | "destructive";

type ToastContent = {
  title: string;
  description?: string;
  variant?: ToastVariant;
};

type ErrorToastOptions = {
  fallback?: ToastContent;
  includeCodeInDev?: boolean;
  logError?: boolean;
};

const DEFAULT_FALLBACK: ToastContent = {
  title: "Something went wrong",
  description: "Try again in a moment.",
  variant: "destructive",
};

const CODE_MESSAGES: Record<string, ToastContent> = {
  auth_required: {
    title: "Sign in required",
    description: "Sign in to continue.",
  },
  coach_chat_in_flight: {
    title: "Coach is already replying",
    description: "Wait for the current response to finish.",
  },
  message_required: {
    title: "Enter a message",
    description: "Type a message before sending.",
  },
  file_too_large: {
    title: "Photo too large",
    description: "Each photo must be under 15 MB.",
  },
  invalid_type: {
    title: "Unsupported file",
    description: "Use JPEG or PNG photos.",
  },
  coach_chat_failed: {
    title: "Coach unavailable",
    description: "Try again shortly.",
  },
};

const STATUS_MESSAGES: Record<number, ToastContent> = {
  400: {
    title: "Request invalid",
    description: "Check your input and try again.",
  },
  401: {
    title: "Sign in required",
    description: "Sign in again to continue.",
  },
  402: {
    title: "Add credits",
    description: "Purchase credits to continue.",
  },
  403: {
    title: "Access denied",
    description: "You don't have access to this action.",
  },
  404: {
    title: "Not found",
    description: "That item is no longer available.",
  },
  409: {
    title: "Conflict",
    description: "Another request conflicted. Try again.",
  },
  422: {
    title: "Validation failed",
    description: "Check your input and try again.",
  },
  429: {
    title: "Slow down",
    description: "Too many attempts. Try again shortly.",
  },
  500: {
    title: "Server error",
    description: "We hit a snag. Try again shortly.",
  },
  503: {
    title: "Service unavailable",
    description: "Service is temporarily unavailable. Try again later.",
  },
};

function getErrorCode(error: unknown): string | undefined {
  const anyError = error as { code?: unknown } | null | undefined;
  const raw = anyError?.code;
  return typeof raw === "string" && raw.trim().length ? raw : undefined;
}

function getStatusCode(error: unknown): number | undefined {
  const anyError = error as { status?: unknown } | null | undefined;
  const raw = anyError?.status;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
}

export function buildErrorToast(error: unknown, options?: ErrorToastOptions): ToastContent {
  const { fallback = DEFAULT_FALLBACK, includeCodeInDev = true, logError = true } = options ?? {};

  if (logError && error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }

  const code = getErrorCode(error);
  const status = getStatusCode(error);
  const message = typeof (error as any)?.message === "string" ? (error as any).message : undefined;

  const mapping =
    (code ? CODE_MESSAGES[code] : undefined) ||
    (typeof status === "number" ? STATUS_MESSAGES[status] : undefined) ||
    (message
      ? { title: fallback.title, description: message, variant: fallback.variant ?? DEFAULT_FALLBACK.variant }
      : undefined) ||
    fallback;

  const result: ToastContent = {
    title: mapping.title || fallback.title,
    description: mapping.description,
    variant: mapping.variant ?? fallback.variant ?? "destructive",
  };

  if (includeCodeInDev && import.meta.env.DEV) {
    const details = [code, typeof status === "number" ? `HTTP ${status}` : undefined]
      .filter(Boolean)
      .join(" · ");
    if (details) {
      result.description = result.description ? `${result.description} (${details})` : details;
    }
  }

  return result;
}
