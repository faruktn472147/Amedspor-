import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-green text-white hover:bg-green-strong shadow-sm",
  secondary: "bg-muted text-fg hover:bg-border",
  ghost: "text-fg hover:bg-muted",
  danger: "bg-red text-white hover:bg-red-strong",
  outline: "border border-border text-fg hover:bg-muted",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
  icon: "h-10 w-10 rounded-full",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none select-none",
    variants[variant],
    sizes[size],
    className,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-border bg-elevated shadow-card", className)} {...props} />;
}

export function SectionHeader({ title, href, action, icon }: { title: string; href?: string; action?: string; icon?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
        {icon}
        {title}
      </h2>
      {href && (
        <Link href={href} className="text-sm font-semibold text-green hover:underline">
          {action ?? "Tümü"}
        </Link>
      )}
    </div>
  );
}

const badgeTones = {
  neutral: "bg-muted text-fg-muted",
  green: "bg-green/12 text-green",
  red: "bg-red/12 text-red",
  live: "bg-live text-white",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: keyof typeof badgeTones }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide", badgeTones[tone], className)}
      {...props}
    />
  );
}

export function LiveBadge({ label = "Canlı" }: { label?: string }) {
  return (
    <Badge tone="live">
      <span className="live-dot inline-block h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
      {label}
    </Badge>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-10 text-center", className)}>
      {icon && <div className="mb-3 text-fg-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {description && <div className="mt-1 max-w-sm text-sm text-fg-muted">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

export function Alert({ tone = "info", children, className }: { tone?: "info" | "error" | "success" | "warning"; children: ReactNode; className?: string }) {
  const t = {
    info: "border-border bg-muted text-fg",
    error: "border-red/30 bg-red/10 text-red",
    success: "border-green/30 bg-green/10 text-green",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("rounded-xl border px-4 py-3 text-sm", t, className)}>
      {children}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-xl border border-border bg-elevated px-3 text-[15px] outline-none transition placeholder:text-fg-muted focus:border-green",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-xl border border-border bg-elevated px-3 py-2.5 text-[15px] outline-none transition placeholder:text-fg-muted focus:border-green",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-11 w-full rounded-xl border border-border bg-elevated px-3 text-[15px] outline-none focus:border-green", className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("mb-1.5 block text-sm font-semibold", className)} {...props} />;
}

export function Avatar({ src, name, size = 40, className }: { src?: string | null; name: string; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toLocaleUpperCase("tr-TR");
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- Kullanıcı avatarları Supabase'den gelir; boyutu zaten küçük
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      className={cn("shrink-0 rounded-full bg-muted object-cover", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden
      className={cn("brand-gradient inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "A"}
    </span>
  );
}

export function PageHeader({ title, description, children }: { title: string; description?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {children}
    </div>
  );
}

export function SetupNotice({ feature }: { feature?: string }) {
  return (
    <Alert tone="warning">
      <strong>Kurulum bekleniyor.</strong> {feature ? `${feature} için ` : ""}veritabanı bağlantısı (Supabase) henüz yapılandırılmadı.
      Ayrıntılar: <code>docs/KURULUM.md</code>. Sahte veri gösterilmez.
    </Alert>
  );
}
