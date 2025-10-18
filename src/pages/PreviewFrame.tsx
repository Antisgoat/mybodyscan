import PublicLayout from "@app/components/PublicLayout.tsx";
import Index from "@app/pages/Index.tsx";
import PublicLanding from "@app/pages/PublicLanding.tsx";
import { MBS_FLAGS } from "@app/lib/flags.ts";

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
