import type { LucideIcon, LucideProps } from "lucide-react";
import { cn } from "@/lib/utils";

// Deviation from docs/03-design-system.md: takes `icon` (a Lucide component
// reference) rather than `name` (a string). String-name lookup requires
// `import * as Icons` which breaks tree-shaking and inflates the landing-page
// bundle. Call sites do `import { Zap } from "lucide-react"` then
// `<Icon icon={Zap} />` — slightly more verbose, properly tree-shaken.
export interface IconProps extends Omit<LucideProps, "ref"> {
  icon: LucideIcon;
}

export function Icon({
  icon: IconComponent,
  size = 18,
  strokeWidth = 1.5,
  className,
  ...rest
}: IconProps) {
  return (
    <IconComponent
      size={size}
      strokeWidth={strokeWidth}
      className={cn("shrink-0", className)}
      aria-hidden={rest["aria-label"] ? undefined : true}
      {...rest}
    />
  );
}
