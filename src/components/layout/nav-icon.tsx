import { Clapperboard, Home, Landmark, Newspaper, Plus, Shirt, Target, Trophy, Users, type LucideIcon } from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  home: Home,
  users: Users,
  clapperboard: Clapperboard,
  trophy: Trophy,
  newspaper: Newspaper,
  shirt: Shirt,
  target: Target,
  landmark: Landmark,
  plus: Plus,
};

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Home;
  return <Icon className={className} aria-hidden />;
}
