import { Seo } from "@/components/Seo";

const Privacy = () => {
  return (
    <>
      <Seo
        title="Privacy Policy – MyBodyScan"
        description="We collect account email and user media to provide estimates; stored securely; never sold; delete on request."
        canonical="https://mybodyscanapp.com/privacy"
      />
      <article className="prose prose-neutral dark:prose-invert max-w-none">
        <h1>Privacy Policy</h1>
        <p>
          We collect your account email and user media (photos/videos) solely to provide estimates such as body fat %, weight, and BMI. Your data is stored securely, never sold, and retained only as needed to operate the service.
        </p>
        <p>
          You can request data deletion at any time by contacting <a href="mailto:support@mybodyscanapp.com">support@mybodyscanapp.com</a>.
        </p>
          <p>
            When enabled, we query public food databases (USDA FoodData Central and Open Food Facts) to help fill
            nutrition facts; no personal data is sent.
          </p>
        </article>
    </>
  );
};

export default Privacy;
