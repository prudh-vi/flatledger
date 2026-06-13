import { cn } from "@/lib/utils"

export function BrutalCard({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("rounded-2xl border-2 border-brutal bg-white shadow-[4px_4px_0px_#000]", className)}>
      {children}
    </div>
  )
}

export function BrutalBadge({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={cn("inline-flex items-center rounded-full bg-brutal px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white", className)}>
      {children}
    </span>
  )
}

export function SectionHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <h2 className="text-sm font-black uppercase tracking-widest">{label}</h2>
      {count !== undefined && <BrutalBadge>{count}</BrutalBadge>}
    </div>
  )
}
