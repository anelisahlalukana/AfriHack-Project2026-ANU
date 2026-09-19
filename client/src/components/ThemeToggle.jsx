import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  const [theme, setTheme] = useState(
    () => document.documentElement.dataset.theme || "dark",
  );
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#0b0908" : "#f1eeec");
    try {
      localStorage.setItem("royal-square-theme", next);
    } catch {
      /* Browsers may disable storage. */
    }
    setTheme(next);
  }
  return (
    <button type="button" className="theme-toggle" onClick={toggle}>
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}Switch to{" "}
      {theme === "dark" ? "light" : "dark"}
    </button>
  );
}
