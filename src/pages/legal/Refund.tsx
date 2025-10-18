import { Seo } from "@app/components/Seo.tsx";

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
        <p>All purchases of digital goods are final and non-refundable.</p>
        <p>
          For billing issues, contact <a href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a>.
        </p>
        <p>Consumer rights required by law are not affected.</p>
      </article>
    </>
  );
};

export default Refund;
