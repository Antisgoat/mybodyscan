import React from 'react';

export default function ScanTipsMBS() {
  return (
    <div className="rounded-2xl border border-slate-200 p-4 bg-white">
      <div className="font-medium mb-1">Great scans = better results</div>
      <ul className="list-disc ml-5 text-slate-700 space-y-1">
        <li>Tight clothing, neutral background, good lighting</li>
        <li>Arms slightly out, camera at chest height</li>
        <li>Photos: front, left, back, right</li>
        <li>Video: slow 360° in 10s</li>
      </ul>
    </div>
  );
}