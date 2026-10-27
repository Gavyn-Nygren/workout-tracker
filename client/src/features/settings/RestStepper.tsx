import { Stepper } from '@/components/ui';
import { REST_LIMITS_SEC } from '@/data/preferences';
import { formatClock, spokenDuration } from '@/hooks/useNow';

type Props = {
  /** Read by VoiceOver, e.g. "Compound lifts rest". */
  label: string;
  value: number;
  onChange: (sec: number) => void;
};

/** A rest length in 15-second steps, shown as "3:00" and spoken as "3 minutes". Settings and exercise pages share it. */
export function RestStepper({ label, value, onChange }: Props) {
  return (
    <Stepper
      label={label}
      value={value}
      onChange={onChange}
      step={REST_LIMITS_SEC.step}
      min={REST_LIMITS_SEC.min}
      max={REST_LIMITS_SEC.max}
      formatValue={formatClock}
      spokenValue={spokenDuration}
    />
  );
}
