export async function startCheckout(
  priceId: string,
  mode: "payment" | "subscription"
) {
  const { getAuth } = await import("firebase/auth");
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(
    `${import.meta.env.VITE_FUNCTIONS_URL}/createCheckoutSession`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        priceId,
        mode,
        successUrl: window.location.origin + "/checkout/success",
        cancelUrl: window.location.origin + "/checkout/canceled",
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Checkout failed");
  window.location.assign(json.url as string);
}

export async function consumeOneCredit(): Promise<number> {
  const { getAuth } = await import("firebase/auth");
  const user = getAuth().currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  const res = await fetch(`${import.meta.env.VITE_FUNCTIONS_URL}/useCredit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 402) throw new Error("No credits available");
  const json = await res.json();
  return json.remaining as number;
}
