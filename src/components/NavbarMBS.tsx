import React from "react";

export default function NavbarMBS() {
  return (
    <div className="flex items-center justify-between h-16 px-5 sticky top-0 bg-white shadow">
      <div className="flex items-center gap-2 leading-none tracking-wide">
        <img src="/logo.svg" alt="MyBodyScan" className="h-8 w-auto" />
        <span className="text-slate-900 font-medium relative top-[1px]">
          MyBodyScan
        </span>
      </div>
      <div className="flex items-center gap-3">
        {/* Non-destructive slot for user avatar/menu if you want to mount later */}
      </div>
    </div>
  );
}
