import { cn } from '@/lib/utils';

/** Selector de opciones con radios reales (mismo aspecto que el Segmented del bento). */
export function SegmentedRadio<T extends string>({
  name,
  value,
  onChange,
  options,
  label,
  className,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <fieldset className={cn('grid auto-cols-fr grid-flow-col gap-[2px] rounded-xl bg-muted p-[3px]', className)}>
      <legend className="sr-only">{label}</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            'flex h-9 cursor-pointer items-center justify-center rounded-[9px] text-sm font-medium tracking-[-0.01em] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring max-md:h-10',
            value === o.value ? 'bg-background text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          <input type="radio" className="sr-only" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
