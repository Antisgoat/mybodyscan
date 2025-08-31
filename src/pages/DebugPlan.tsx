import { useUserProfile } from "@/hooks/useUserProfile";

const DebugPlan = () => {
  const { profile, plan } = useUserProfile();
  return (
    <pre className="text-xs whitespace-pre-wrap">
      {JSON.stringify({ profile, plan }, null, 2)}
    </pre>
  );
};

export default DebugPlan;

