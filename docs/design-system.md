# Shared visual system

The visual source is `docs/style_reference/royal-square-dashboard-concepts.html`.

- `client/src/styles/design-tokens.css` copies the reference palette and typography rules.
- Lora is the body font (14px / 1.55); Merriweather is the heading and financial figure font. Font files are bundled locally through Fontsource.
- The reference opens in dark mode. `ThemeToggle` switches between the reference palettes and remembers the preference on this browser.
- Desktop sidebars are 216px, main content has 18px padding / 12px gaps, cards have 14px corners / 16px padding, and navigation rows follow the reference's 8px / 10px spacing.
- Below 860px, navigation becomes a horizontal strip. Forms and cards reflow at 640px and 1100px to match the reference breakpoints.
- `Brand` recreates the two-colour mark and wordmark from the reference.
- `index.css` contains shared controls and maps the same tokens to the existing Tailwind components. `App.css` handles the authenticated workspace, login, profiles and FNA forms. `Dev4Workspace.css` uses these same tokens for reminders, notifications and messaging.

Use `var(--bg)`, `var(--card)`, `var(--card-2)`, `var(--border)`, `var(--text)`, `var(--muted)`, `var(--taupe)` and `var(--red)` rather than introducing feature-specific colour values. Avoid replacing these fonts with Geist, Arial or an unbundled substitute.

The reference's sample claims, balances and projected returns are presentation examples, not live data. Existing data flows and role checks are retained. Authenticated pages still require the team's Supabase configuration.
