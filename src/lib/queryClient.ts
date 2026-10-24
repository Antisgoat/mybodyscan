import { QueryClient } from "@tanstack/react-query";

// Shared with the auth boundary so cached member data is removed before the
// next identity is published, not in a later React effect.
export const queryClient = new QueryClient();
