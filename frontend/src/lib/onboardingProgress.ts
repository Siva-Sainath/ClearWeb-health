import type { PatientProfile } from "@/lib/types";
import { isPlaceholderProfileValue } from "@/lib/onboardingProfileGate";

export type OnboardingFieldKey = "procedure" | "insurance" | "city" | "zipCode" | "radiusMi";

export const ONBOARDING_STEPS: {
  key: OnboardingFieldKey;
  label: string;
  filled: (p: PatientProfile) => boolean;
}[] = [
  {
    key: "procedure",
    label: "Procedure",
    filled: (p) => {
      const v = p.procedure?.trim() || p.condition?.trim();
      return !!v && !isPlaceholderProfileValue(v);
    },
  },
  {
    key: "insurance",
    label: "Insurance",
    filled: (p) => !!p.insurance?.trim() && !isPlaceholderProfileValue(p.insurance),
  },
  {
    key: "city",
    label: "City",
    filled: (p) => !!p.city?.trim() && !isPlaceholderProfileValue(p.city),
  },
  {
    key: "zipCode",
    label: "ZIP",
    filled: (p) => !!p.zipCode?.trim() && !isPlaceholderProfileValue(p.zipCode),
  },
  {
    key: "radiusMi",
    label: "Radius",
    filled: (p) => p.radiusMi > 0,
  },
];

export function onboardingProgress(p: PatientProfile) {
  const filled = ONBOARDING_STEPS.filter((s) => s.filled(p)).length;
  return { filled, total: ONBOARDING_STEPS.length, percent: Math.round((filled / ONBOARDING_STEPS.length) * 100) };
}

export function nextMissingField(p: PatientProfile): string | null {
  const step = ONBOARDING_STEPS.find((s) => !s.filled(p));
  return step?.label ?? null;
}
