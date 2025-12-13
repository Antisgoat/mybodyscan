export const coachPlanDocPath = (uid: string) =>
  `users/${uid}/coachPlans/current`;

export const coachChatCollectionPath = (uid: string) =>
  `users/${uid}/coach/chatMeta/chat`;

export const coachThreadsCollectionPath = (uid: string) =>
  `users/${uid}/coachThreads`;

export const coachThreadMessagesCollectionPath = (uid: string, threadId: string) =>
  `users/${uid}/coachThreads/${threadId}/messages`;
