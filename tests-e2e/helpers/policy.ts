import { expect, type Page } from "@playwright/test";

type AcceptPolicyOptions = {
  required?: boolean;
  timeoutMs?: number;
};

export async function acceptPolicyGate(
  page: Page,
  { required = false, timeoutMs = 5_000 }: AcceptPolicyOptions = {}
) {
  const dialog = page.getByRole("dialog", {
    name: "Welcome to MyBodyScan",
  });
  const becameVisible = await dialog
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);

  if (!becameVisible) {
    if (required) {
      await expect(dialog).toBeVisible();
    }
    return false;
  }

  for (const checkbox of await dialog.getByRole("checkbox").all()) {
    if (!(await checkbox.isChecked())) await checkbox.check();
  }
  await dialog.getByRole("button", { name: "I Accept" }).click();
  await expect(dialog).toBeHidden();
  return true;
}
