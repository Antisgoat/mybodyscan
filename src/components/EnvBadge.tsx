import React from "react";

export default function EnvBadge() {
  const currentHost = window.location.hostname;
  const isProduction = currentHost === "mybodyscanapp.com";
  
  if (isProduction) return null;
  
  return (
    <div className="fixed top-2 right-2 bg-orange-500 text-white px-2 py-1 text-xs rounded z-50">
      ENV: {currentHost}
    </div>
  );
}