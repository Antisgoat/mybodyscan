import { Seo } from "@/components/Seo";
import MarkdownArticle from "@/components/MarkdownArticle";
import privacyContent from "@/content/legal/privacy.md?raw";

const Privacy = () => {
  return (
    <>
      <Seo
        title="Privacy Policy – MyBodyScan"
        description="How MyBodyScan handles accounts, scan media, wellness information, purchases, notifications, and privacy choices."
        canonical="https://mybodyscanapp.com/legal/privacy"
      />
      <MarkdownArticle title="Privacy Policy" markdown={privacyContent} />
    </>
  );
};

export default Privacy;
