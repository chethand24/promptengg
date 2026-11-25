"use client";

import { ArrowUpRight, Binary, Code2, FunctionSquare } from "lucide-react";
import { domains, samples } from "@/lib/samples";

const icons = { math: FunctionSquare, programming: Code2, algorithm: Binary };
export function SamplePicker({ onPick, selected }: { onPick: (sample: typeof samples[number]) => void; selected?: string }) {
  return <div className="sample-grid">{samples.map(sample => {
    const Icon = icons[sample.domain];
    return <button type="button" key={sample.id} className="sample-card" aria-pressed={selected === sample.id} onClick={() => onPick(sample)}>
      <span className="sample-icon"><Icon size={18} /></span>
      <span><small>{domains[sample.domain]}</small><strong>{sample.title}</strong></span>
      <ArrowUpRight className="sample-arrow" size={16} />
    </button>;
  })}</div>;
}
