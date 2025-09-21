import { useState } from 'react';

export default function useSteps(totalSteps: number) {
  const [step, setStep] = useState(1);

  const goNextStep = () => setStep((prev) => (prev < totalSteps ? prev + 1 : prev));
  const goLastStep = () => setStep(totalSteps);
  const resetStep = () => setStep(1);

  return { step, goNextStep, goLastStep, resetStep };
}
