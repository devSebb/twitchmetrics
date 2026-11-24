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

## Chunk 2: channels and creator views — implemented, 23 November 2026

The Channels directory and search now use the editorial design, with platform/game filters, all existing sort choices, grid/list modes, pagination and URL state retained. The directory seeds matching filtered grid results from its server response. List mode keeps all streaming columns and provides a complete stacked layout on small screens. Creator cards distinguish total followers from followers on a selected platform; unknown growth stays distinct from zero.

The full public creator profile uses a dark identity header, linked platform totals and numbered sections for performance, audience, content, partnerships and additional enabled information. All 14 existing widget IDs remain mapped, preserving saved widget selections and availability checks. Sections whose widgets resolve without data disappear from navigation without unmounting the widgets, so refetches can recover. Line charts, platform bars, periods, platform comparisons, zoom controls, stream sorting, popular games, clips, provenance and freshness explanations remain available.

The public media kit remains a separate composition with a concise overview, platform totals and 30-day growth, available streaming statistics, featured clips, audience information, popular content and public partnerships. Its static overview remains visible even when optional widgets have no data. It links back to the detailed profile. Copy link always uses the configured public creator-kit URL, including from the authenticated owner preview; clipboard failure provides a selectable link. PDF export remains explicitly unavailable. No unsupported ranking, contact, pricing or representation claims were added.

`getPublicCreatorView` supplies both public views and the owner preview through the existing read-only services. It projects an explicit public payload instead of forwarding the raw creator record. First-party demographics require both a claimed profile and the existing public-sharing setting; the old kit checked only the claim state. This corrects that presentation-layer discrepancy without changing any permission service or endpoint. Third-party public estimates retain the existing freshness policy and source attribution. Public partnerships still require `isPublic`. The preview intentionally exposes the same public information as the shareable page.

`AppearanceProvider` opts migrated analytical modules into resolved Noticed canvas colours and scoped DOM colours. Legacy is the default, preserving the unconverted owner workspace for chunk 4. Chart definitions and calculations remain unchanged. Tooltips carry the appearance into their portal. Query failures have retry actions; changing to an empty follower-history period keeps the controls available. Recent-stream sorting uses labelled native buttons. Directory/search/profile routes have matching loading and recoverable error states.

Country flags are local SVG assets from `flag-icons` 7.6.0, with an MIT licence and source record under `public/country-flags`. The downloaded package was verified against its published SHA-512 integrity value. Only the 257 4:3 flag assets are included, with a neutral fallback for unknown country codes; no runtime dependency was added.

### Verification

- Type checking and ESLint passed before browser review. The final production build passed compilation, lint, type validation and all 108 static-page generation steps after the responsive refinements, canonical-title correction and sparse-overview fix. Non-blocking warnings remain the existing OpenTelemetry/Sentry dependencies, Browserslist data and Tailwind configuration module type.
- 101 tests across 14 files passed, covering public-payload privacy and consent, all widget section mappings, canonical share URLs, saved layouts, periods, freshness, demographic age buckets, platform follower totals and profile URLs, search, formatting, creator lists/growth/viewer history and visibility.
- New privacy tests prove that disabled public sharing and unclaimed profiles never query first-party analytics, owner-only fields are omitted, approved analytics are included, and aggregate platform totals/custom avatars retain their existing behaviour.
- Desktop browser review covered the full creator header, linked platform totals, section anchors, follower-period changes and All-platform comparison, viewer histories, demographic sources and SVG flags, metric tooltips, recent-stream sorting and the separate media-kit composition. The kit's copy action exposed the correct selectable public URL when clipboard access was unavailable.
- The 320px directory review identified cramped filter controls; sort options now wrap onto their own row, and the page-title minimum size was reduced. Follow-up browser control became unreliable (`noWindowsAvailable` despite readable accessibility state), and device emulation retained an incorrect page scale. Full post-fix mobile visual sign-off, grid/list/filter/search navigation and successful clipboard-permission behaviour remain explicit checks for chunk 5. These are not recorded as passed.
- Production HTTP review confirmed the public profile and kit render, profile caching retains the existing one-hour window, configured-origin canonicals are preserved, and the owner kit redirects anonymous visitors through the existing login flow. The public payload contains no owner user ID.
- Final-build HTTP checks returned 200 for Valkyrae's kit, a limited-data UR · Cristiano kit and creator search. Both kits have a single Noticed title suffix, the expected canonical URL and a retained overview in the server-rendered markup. Creator search includes the expected profile result; browser navigation after changing the search scope remains part of final visual QA.

The local cache connection continues to fall through to the existing database reader and can delay initial responses. One transient database connection failure recovered on retry. The preview runs on port 3001 while the existing auth origin uses localhost:3000; claim-link prefetch therefore reports a local connection failure and report-only CSP warning. Backend configuration, services, APIs, workers and database schema remain unchanged. Authenticated journeys are not exercised on real accounts; isolated payload tests cover the owner preview's public visibility boundary, and full authenticated journeys remain scheduled for chunk 4.

## Chunk 3: categories and games — implemented, 23 November 2026

The category directory now uses the Noticed typography, open cover grid and responsive filter band. All seven verticals, three sorts, gaming genre filters and pagination remain available. Matching server-filtered results seed the client grid; errors have retry feedback distinct from an empty result. Covers retain their fallback and the first cover receives loading priority. Existing counts, genres, filter normalisation, queries and URLs are preserved.

Game and non-game detail pages have a dark identity header and numbered sections for the overview, viewership, channel activity, discovery, recent streams and available clips. The overview retains all five metrics, platform contributions, broadcast language percentages and metric explanations. The combined peak is explicitly labelled as the highest combined moment, preserving its distinction from individual platform peaks. Game developer, publisher and release metadata appear only for gaming entries; non-game entries use category wording and WebPage structured data. Freshness and the existing enterprise destination remain available.

Both platform charts use the shared light appearance. Their independent 24-hour, 7-day and 30-day selectors, shared query identity, snapshot end time, initial 7-day data, summary arithmetic, missing values and platform legends are unchanged. The extracted chart option builder retains the daily-average intervals and source notes. Registering ECharts' MarkArea component makes the existing estimated-interval overlay render. Discovery keeps both emerging and most-watched selections, source windows and profile links. The stream table retains all six columns, null values and rows in a labelled, keyboard-focusable scrolling region. Clips retain their original destinations, view counts and thumbnails. Route loading and recoverable error states use the same design.

No API handler, backend service, database schema, ingestion, ranking implementation or metric calculation changed in this chunk. Category revalidation remains 300 seconds and game detail revalidation remains 1,800 seconds.

### Verification

- Type checking and ESLint passed. The final production build passed compilation, lint, type validation and all 108 static-page generation steps. Its non-blocking warnings remain the existing OpenTelemetry/Sentry dependencies, Browserslist data and Tailwind configuration module type. All 90 tests across 11 relevant files passed, covering game filters/listing, metrics and platform aggregation, snapshot series, discovery, recent streams, covers and formatting. Four new chart tests check timestamp/value preservation, null versus zero, channel observations, estimated intervals and visible-series tooltip totals.
- Browser review covered the desktop category directory, the IRL filter and its real results, 390px and 320px directory layouts, the 320px non-game identity header, stacked metrics, viewer chart with platform legend and estimation note, section navigation and the stream-table frame. The desktop League of Legends header and its game metadata also render correctly. Accessibility inspection confirms all detail sections and metric/table content remain present.
- Browser review caught a React child-key warning in the server-to-client section composition; explicit content keys were added. A fresh game-page console showed no recurrence before the automation became unreliable. The existing cache connection can delay category/history requests while falling back to the database; the 24-hour history request returned 200.
- Native browser automation subsequently returned `noWindowsAvailable` and stale screenshots/control states. Final visual confirmation of period-result changes, legend toggles, the rightmost mobile table columns, directory sort/genre/pagination interaction and sparse-data rendering remains on the chunk 5 integration checklist. These checks are not recorded as passed.
- Production HTTP checks returned 200 for League of Legends, Just Chatting, IRL sorted by hours watched and a directory selection with no matches. Both detail pages retain all six populated sections and `s-maxage=1800`, use the configured-origin canonical URL and have a single Noticed title suffix. Structured data distinguishes VideoGame from WebPage; the non-game header omits game metadata. The empty directory renders its selection-specific message. `git diff --check` passes and the backend/worker/schema directories have no changes.

## Remaining chunks

4. Creator and talent-manager workspaces: dashboards, customisation, settings, private analytics, claiming/connections, partnerships, roster, invitations, permissions and exports; authentication/onboarding and the creator/manager solution pages.
5. Supporting screens and final integration: reports and transactional states, company/contact/legal/admin screens, remaining shared states and presentation-only email/export attribution; complete responsive, accessibility, performance and information-parity checks, then remove migration compatibility styling.

Standalone rankings remain outside this rebrand scope. Domain activation and final logo delivery remain launch inputs, not reasons to change backend contracts.
