import { Seo } from "@/components/Seo";

const Refund = () => {
  return (
    <>
      <Seo
        title="Refund Policy – MyBodyScan"
        description="Refund information for digital purchases on MyBodyScan."
        canonical="https://mybodyscanapp.com/legal/refund"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none p-6">
        <h1>Refund Policy</h1>
        <p>
          <strong>Effective date: July 22, 2026</strong>
        </p>
        <p>
          MyBodyScan is operated by ADLR Labs. Except where required by law,
          purchases of digital scans, credit packs, add-ons, and subscription
          periods are final and non-refundable.
        </p>
        <h2>Subscriptions</h2>
        <p>
          You may cancel future renewal from Settings → Billing or through the
          app-store account used to purchase. Cancellation does not normally
          refund the current billing period.
        </p>
        <h2>Failed scans and billing errors</h2>
        <p>
          A scan that fails before valid results are produced is designed to
          restore its credit automatically. A restored credit is not a cash
          refund. We will investigate duplicate or unauthorized billing claims.
        </p>
        <p>
          For a billing issue, contact{" "}
          <a href="mailto:support@mybodyscanapp.com">
            support@mybodyscanapp.com
          </a>{" "}
          with the purchase date and transaction identifier. Do not send full
          payment-card details.
        </p>
        <p>Consumer rights required by law are not affected.</p>
      </article>
    </>
  );
};

export default Refund;
