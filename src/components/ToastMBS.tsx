import React, { useEffect, useState } from "react";

export default function ToastMBS({ msg }: { msg: string | null }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(!!msg);
    if (msg) setTimeout(() => setOpen(false), 3000);
  }, [msg]);

  if (!open || !msg) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-xl shadow">
      {msg}
    </div>
  );
}
