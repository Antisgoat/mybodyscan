import PublicLayout from "@/components/PublicLayout";
import Index from "@/pages/Index";
import PublicLanding from "@/pages/PublicLanding";
import { MBS_FLAGS } from "@/lib/flags";

const PreviewFrame = () => {
  if (MBS_FLAGS.ENABLE_PUBLIC_MARKETING_PAGE) {
    return (
      <PublicLayout>
        <PublicLanding />
      </PublicLayout>
    );
  }

  return <Index />;
};

export default PreviewFrame;
