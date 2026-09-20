import { cn } from '@/lib/cn';

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return <label className={cn('text-ink-2 text-sm font-medium', className)} {...props} />;
}

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'border-line bg-surface text-ink placeholder:text-ink-3/70 h-12 w-full rounded-lg border px-3',
        'focus:border-accent focus:ring-accent/20 text-base focus:ring-2 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(
        'border-line bg-surface text-ink placeholder:text-ink-3/70 w-full rounded-lg border px-3 py-2.5',
        'focus:border-accent focus:ring-accent/20 text-base focus:ring-2 focus:outline-none',
        className,
      )}
      {...props}
    />
  );
}

/** Label + control + optional hint and error, in the order a screen reader wants. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {hint ? <p className="text-ink-3 -mt-0.5 text-[13px] leading-snug">{hint}</p> : null}
      {children}
      {error ? (
        <p className="text-crit text-[13px] font-medium" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
