# Noticed web design system and implementation record

Branch: `codex/noticed-rebrand`. Keep all five chunks together. Do not merge to main; the user will merge.

The [rebrand plan](PLAN-22-NOTICED-REBRAND.md) remains the screen and information preservation register. The approved handoff is a visual system and baseline content template. Existing analytical information and working interactions remain part of the product.

## Foundation

`apps/web/src/lib/constants/noticed.ts` owns the shared values. Root CSS variables, Tailwind `n-*` colours and the ECharts theme use these values. Wrap a migrated surface in `.noticed` to adopt the light palette and Golos Text. This temporary scope prevents unfinished dark pages from becoming unreadable; remove compatibility styling once migration is complete.

| Role      | Value                                                 | Use                                             |
| --------- | ----------------------------------------------------- | ----------------------------------------------- |
| Canvas    | `#FFFFFF`                                             | Main background                                 |
| Ink       | `#151F2C`                                             | Primary text, dark editorial hero               |
| Brand red | `#C4262C`                                             | Primary action, wordmark dot, numbered sections |
| Navy      | `#022658`                                             | Manager section, selected analytical emphasis   |
| Slate     | `#4A505B`                                             | Secondary text                                  |
| Surface   | `#EFEFEF`                                             | Quiet grouped surfaces and loading states       |
| Line      | `#D9D9D9`                                             | Dividers and table rules                        |
| Control   | `#D2D5D7`                                             | Input and secondary-button borders              |
| Status    | Success `#167044`, warning `#895C0A`, error `#B4232B` | Meaningful state with accompanying text         |

Use the temporary heavy `noticed.` wordmark with a red dot and optional “powered by Hatchet” attribution. Final logo assets can replace `Wordmark` without rebuilding layouts. The favicon and generated social preview use the temporary brand. Domain, canonical URL configuration and social account identifiers remain unchanged pending launch decisions.

Golos Text is served locally at weights 400–900 using WOFF2 and `font-display: swap`. The original variable TTF and SIL Open Font License are retained in `public/fonts`. Source: the Google Fonts `ofl/golostext` directory, downloaded 23 November 2026. `golos-text-bold.ttf` is a static weight-700 instance for Next ImageResponse, which cannot render this variable TTF reliably. The WOFF2 and static TTF were generated with FontTools 4.68.0 and Brotli 1.2.0; these are asset preparation tools, not application dependencies.

## Layout and controls

- Main container: 1,280px maximum; 20px mobile, 32px small-screen and 40px large-screen gutters. Editorial sections use 64–96px vertical spacing, with denser rows inside data lists.
- Typography: 16px body; 14px controls; 12px secondary metadata; oversized fluid hero type, tight headline tracking and tabular numeric figures. Thin horizontal rules separate open sections. Bounded panels are reserved for grouped tasks, forms and the hero profile preview.
- `Container`, `SectionHeading`, `ActionLink` and `EmptyState` live in `components/ui/Editorial.tsx`. `Button` accepts `appearance="noticed"`; its default remains legacy until the consuming screen migrates.
- `.n-input`, `.n-table`, `.n-eyebrow` and `.n-button` define reusable presentation. Forms retain native semantics, labels, disabled/error states and existing payloads. Primary buttons have at least 44px height.
- Focus remains visible, mobile navigation traps focus and returns it to its trigger, Escape closes disclosures, and the public shell has a skip link. Horizontally scrolling lists/tables are labelled and keyboard reachable. Reduced-motion styles apply within migrated surfaces.
- Public header/footer, cookie notice and navigation use the new design. The shared notification component uses scoped colour variables with legacy fallbacks, retaining the existing behaviour in unmigrated dashboard navigation.
- Homepage search uses the existing search endpoint and result URLs. It has debounced suggestions, loading/error/empty feedback, arrow-key selection, Enter navigation, Escape and clear controls. Creator-only search keeps its `type` parameter through full-result navigation.

## Analytics contract

`BaseChart` accepts `appearance="noticed"`. The default remains legacy while analytical pages migrate. The new theme changes typography, axes, rules, legends, tooltip and zoom presentation only. Actual canvas colours use resolved values, not unresolved CSS variable strings.

Preserve metric definitions, periods, series, step behaviour, missing-data treatment, units, provenance and permissions when migrating each chart. Series options with explicit old colours must be reviewed at their call sites because they override the theme. Platform chart colours are adjusted for white backgrounds; platform marks retain their identities. A line/bar colour is never the only explanation of a value.

The development-only `/design-system` specimen demonstrates brand colours, controls, errors, disabled and success states, a period selector, line and bar charts, zoom controls, empty/loading states and a horizontally scrollable dense table. Its figures are explicitly illustrative. Production returns not found and the route is marked noindex.

## Chunk 1: design foundation and homepage — complete, 23 November 2026

Implemented: temporary brand, local fonts, tokens, scoped base styles, shared component specimen and chart theme; public shell; complete homepage with search-led hero, real creator preview, creator discovery, how it works, media-kit comparison, popular creators, categories, further trending creators, manager introduction, FAQ and calls to action.

The homepage loader and its three existing data queries are unchanged. The existing 600-second revalidation and client-only header authentication boundary are retained. All previously displayed creator selections remain represented: the first carousel creator appears in the hero, remaining carousel creators follow it, and the rest of the trending selection remains below. Follower totals, seven-day changes and percentages, tracked platforms, game viewers and live-channel counts remain available. Missing growth history is distinct from zero change. No template placeholder metrics are used on the homepage.

No ingestion, schema, API handler, access service, calculation, worker or standalone ranking implementation is changed. Profile, kit, directory and workspace bodies remain scheduled for later chunks. The two creator views remain distinct.

### Verification

- Type checking passed after the initial implementation.
- Five relevant existing test files passed: search URLs, public game list, number formatting, chart formatting and profile layout; 57 tests total.
- Browser review covered desktop homepage, 390px mobile homepage/navigation, 320px complete creator rows and FAQ, 390px chart specimen and chart resizing at 768px. Search suggestions returned live data and keyboard selection opened the expected creator profile. Mobile menu focus trapping and Escape focus restoration passed.
- The generated Open Graph image returned a valid 1,200 × 630 PNG and was visually inspected. The duplicate public/app favicon route conflict was removed; `app/icon.svg` is the sole route owner.
- Changed frontend files pass ESLint with no warnings. The production build passes compilation, lint, type validation and all 108 static-page generation steps. Its non-blocking warnings concern existing OpenTelemetry/Sentry dependencies, Browserslist data and the Tailwind configuration module type.
- Production HTTP checks: homepage 200 with `x-nextjs-cache: HIT` and `s-maxage=600`; Open Graph image 200; development specimen 404. The build manifest confirms 600-second homepage revalidation. `git diff --check` passes and the backend/worker/schema directories have no changes.

Authenticated mutation journeys and newsletter submission are not exercised against real user accounts during this design review. Their payloads and services are preserved. Authenticated workspace journeys receive their full redesign and isolated validation in chunk 4.

Local search returned the expected results using the existing database fallback when the cache connection failed. That infrastructure warning is separate from the frontend migration. The production preview uses the repository's existing start script at `http://127.0.0.1:3001/`; the component specimen requires the development server.

## Remaining chunks

2. Channels and creator views: directory/search, full analytical profile, separate public media kit and owner kit preview. Preserve every working chart, table, filter, optional widget and visibility rule.
3. Categories and games: browsing and game/non-game detail, viewer/channel charts, broadcast languages, discovery, recent streams and clips.
4. Creator and talent-manager workspaces: dashboards, customisation, settings, private analytics, claiming/connections, partnerships, roster, invitations, permissions and exports; authentication/onboarding and the creator/manager solution pages.
5. Supporting screens and final integration: reports and transactional states, company/contact/legal/admin screens, remaining shared states and presentation-only email/export attribution; complete responsive, accessibility, performance and information-parity checks, then remove migration compatibility styling.

Standalone rankings remain outside this rebrand scope. Domain activation and final logo delivery remain launch inputs, not reasons to change backend contracts.
