import { Seo } from "@/components/Seo";
import MarkdownArticle from "@/components/MarkdownArticle";
import termsContent from "@/content/legal/terms.md?raw";

const Terms = () => {
  return (
    <>
      <Seo
        title="Terms of Service – MyBodyScan"
        description="License and subscription terms for using MyBodyScan."
        canonical="https://mybodyscanapp.com/legal/terms"
      />
      <MarkdownArticle title="Terms of Service" markdown={termsContent} />
    </>
  );
};

export default Terms;
