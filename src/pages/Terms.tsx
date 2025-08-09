import { Seo } from "@/components/Seo";

const Terms = () => {
  return (
    <>
      <Seo
        title="Terms of Service – MyBodyScan"
        description="General-wellness only; not medical advice. No refunds once a scan is processed except as required by law."
        canonical="https://mybodyscanapp.com/terms"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <h1>Terms of Service</h1>
        <p>
          MyBodyScan provides general-wellness information and is not a medical device. Results are estimates and should not be used for diagnosis or treatment. Always consult a qualified professional for medical advice.
        </p>
        <p>
          Purchases are non-refundable once a scan has been processed, except where required by applicable law.
        </p>
      </article>
    </>
  );
};

export default Terms;
