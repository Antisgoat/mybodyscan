import { Seo } from "@/components/Seo";

const Privacy = () => {
  return (
    <>
      <Seo
        title="Privacy Policy – MyBodyScan"
        description="How MyBodyScan handles your account, credits and scan metadata."
        canonical="https://mybodyscanapp.com/legal/privacy"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none p-6">
        <h1>Privacy Policy</h1>
        <p>
          We store your account details, credit balances and basic scan metadata only.
          We do not keep medical information.
        </p>
        <p>
          To remove your data, email <a href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a> from your account address.
        </p>
        <p>
          Credits expire 12 months after purchase and transaction logs are kept only as required for payments.
        </p>
        <p className="text-sm text-muted-foreground">This app is not medical advice.</p>
      </article>
    </>
  );
};

export default Privacy;
