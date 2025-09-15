import { Seo } from "@/components/Seo";

const Terms = () => {
  return (
    <>
      <Seo
        title="Terms of Service – MyBodyScan"
        description="License and subscription terms for using MyBodyScan."
        canonical="https://mybodyscanapp.com/legal/terms"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none p-6">
        <h1>Terms of Service</h1>
        <p>You receive a personal, non-transferable license to use the app.</p>
        <p>
          Subscriptions renew monthly or annually until cancelled. No refunds are offered except where required by law.
        </p>
        <p>Keep your account secure and use the service responsibly.</p>
        <p>We may terminate accounts for misuse or non-payment.</p>
        <p>These terms are governed by the laws of your jurisdiction.</p>
      </article>
    </>
  );
};

export default Terms;
