# Helios Website UI Kit

Recreation of the Helios Marketing site (`heliosmarketingwebsite` repo, `src/app/components/*`). Single-file static HTML — no build, no React runtime — but visually 1:1 with the live components.

## Sections (in render order)
1. **Header** — fixed, transparent above the fold over the dark hero, glassmorphism (`bg-white/95 backdrop-blur`) once scrolled past 50px. Wordmark on the left, 4-link nav center, pill CTA right (white above hero, `--helios-green` once scrolled).
2. **Hero** — full-viewport black surface, "We Build / **AI Marketing** / Systems" stacked uppercase Pragmatica Extended at clamp(48px, 9vw, 100px), the middle line on the orange `bg-clip-text` gradient. Below: `Content · Sales · More` with orange dot dividers. (We use a static dark gradient instead of the original looping `helios demo reel.webm`.)
3. **Hero subhead** — white surface with the 30-minute lede and the Book a Call (orange + glow) + View Case Studies (outline) CTA pair.
4. **Ticker** — infinite-scrolling client logo strip on white with edge fades.
5. **Services** — two premium cards (32px radius). Light "Retainer" card with green pill, dark "One-Off Project" card with orange pill. Each lists 5 features with `CheckCircle2`.
6. **Team** — 4-up grid with placeholder portraits (real photos are not in the repo's `public/` — initials cards are used as a respectful fallback).
7. **Case Studies** — 3-up grid: FlyerStudio.AI, Local Boy Outfitters, The Source Real Estate, using real thumbnails from `assets/case-studies/`.
8. **Footer** — dark surface, 3-column grid: brand block + Instagram link, Platform links, "Message us…" pill input.

## Motion
- Scroll-reveal on every block: `opacity 0→1`, `y 20→0`, 600ms, ease-out, with stagger.
- Header transitions on scroll past 50px.
- Image hover: `scale(1.05)` over 1000ms inside `overflow-hidden`.
- Card hover: `translateY(-2px)` + xl shadow.

## Substitutions / caveats
- Team portraits → initials placeholders (the repo loads them from a `teamData` source that wasn't bundled with photos).
- Hero video → static radial-gradient dark surface.
- All other imagery (client logos, case-study thumbnails) is the real production asset.
