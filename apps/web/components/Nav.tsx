"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/activity", label: "activity" },
  { href: "/opportunities", label: "opportunities" },
  { href: "/merges", label: "merges" },
  { href: "/evals", label: "evals" },
] as const;

export const Nav = (): React.JSX.Element => {
  const path = usePathname();
  return (
    <nav className="nav">
      <div className="nav-brand">autoresearcher · v1.0</div>
      {items.map((it) => (
        <Link key={it.href} href={it.href} className={path?.startsWith(it.href) ? "active" : ""}>
          /{it.label}
        </Link>
      ))}
      <div className="nav-foot">
        operator dashboard<br />
        karpathy-minimal<br />
        © cory · 2026
      </div>
    </nav>
  );
};
