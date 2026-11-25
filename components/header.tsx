"use client";

import { ArrowUpRight, Menu, Moon, Sun, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export function Mark() {
  return <span className="brand-mark" aria-hidden="true"><i /><i /><i /></span>;
}

const links = [["/solve", "Tutor"], ["/trace", "Learning trace"], ["/compare", "Compare"], ["/evaluate", "Evaluation"], ["/about", "About"]];
export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  function toggleTheme() {
    const root = document.documentElement;
    const theme = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = theme;
    try { localStorage.setItem("stepwise-theme", theme); } catch {}
  }

  return <header className="site-header">
    <div className="nav-wrap">
      <Link className="brand" href="/" onClick={() => setOpen(false)}><Mark /> StepWise<span className="brand-tail">Tutor</span></Link>
      <nav aria-label="Main navigation" className={open ? "navigation open" : "navigation"}>
        {links.map(([href, name]) => <Link key={href} href={href} aria-current={path === href ? "page" : undefined} onClick={() => setOpen(false)}>{name}</Link>)}
      </nav>
      <div className="nav-actions">
        <button className="icon-button" aria-label="Toggle light or dark theme" onClick={toggleTheme}><Moon className="moon" size={17} /><Sun className="sun" size={17} /></button>
        <Link className="button nav-cta" href="/solve">Start solving <ArrowUpRight size={15} /></Link>
        <button className="icon-button mobile-menu" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X size={19} /> : <Menu size={19} />}</button>
      </div>
    </div>
  </header>;
}
