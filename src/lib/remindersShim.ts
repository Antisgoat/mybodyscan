const TODO_LINK = 'https://linear.app/mybodyscan/issue/REMINDERS-SHIM';

function logShim(method: string) {
  console.info(`[shim] ${method}() – replace with reminders service. TODO: ${TODO_LINK}`);
}

export interface MockReminderPayload {
  type: 'scan' | 'workout' | 'meal';
  sendAt: string;
  channel: 'push' | 'email' | 'sms';
}

export async function scheduleReminderMock(payload: MockReminderPayload) {
  logShim('scheduleReminderMock');
  return {
    reminderId: `demo-reminder-${Date.now()}`,
    ...payload,
    status: 'scheduled',
  } as const;
}
