import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { format } from "date-fns";
import { useHealthDaily } from "@/hooks/useHealthDaily";
import { useAuthUser } from "@/lib/auth";

const DebugHealth = () => {
  const { platform, connect } = useHealthDaily();
  const [perm, setPerm] = useState<boolean | null>(null);
  const [last, setLast] = useState<any>(null);
  const { user } = useAuthUser();
  const uid = user?.uid;

  useEffect(() => {
    connect().then((v) => setPerm(v));
  }, []);

  useEffect(() => {
    if (!uid) return;
    const today = format(new Date(), "yyyy-MM-dd");
    getDoc(doc(db, "users", uid, "healthDaily", today)).then((snap) => {
      if (snap.exists()) setLast(snap.data());
    });
  }, [uid]);

  return (
    <pre className="text-xs whitespace-pre-wrap">
      {JSON.stringify({ platform, permission: perm, last }, null, 2)}
    </pre>
  );
};

export default DebugHealth;
