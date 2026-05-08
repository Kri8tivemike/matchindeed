"use client";

import { Check } from "lucide-react";

export type RegistrationStep = {
  id: string;
  label: string;
};

type StepIndicatorProps = {
  steps: RegistrationStep[];
  currentStep: number;
};

export default function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  const safeStep = Math.max(0, Math.min(currentStep, steps.length - 1));
  const progress = ((safeStep + 1) / steps.length) * 100;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs font-medium text-gray-500">
        <span>
          Step {safeStep + 1} of {steps.length}
        </span>
        <span>{Math.round(progress)}%</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-[#1f419a] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {steps.map((step, index) => {
          const complete = index < safeStep;
          const active = index === safeStep;

          return (
            <div
              key={step.id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-xs transition-colors ${
                complete
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : active
                  ? "border-[#1f419a]/30 bg-[#eef2ff] text-[#1f419a]"
                  : "border-gray-200 bg-white text-gray-500"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                  complete
                    ? "bg-emerald-600 text-white"
                    : active
                    ? "bg-[#1f419a] text-white"
                    : "bg-gray-200 text-gray-600"
                }`}
              >
                {complete ? <Check className="h-3 w-3" /> : index + 1}
              </span>
              <span className="line-clamp-1">{step.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
