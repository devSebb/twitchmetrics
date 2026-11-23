# PLAN-22 — Noticed frontend rebrand

**Status:** Implementation authorised by the user on 23 November 2026. Chunks 1 (design foundation and homepage) and 2 (channels and creator views) are implemented. Chunk 2's remaining mobile visual checks are explicitly recorded in `docs/noticed-design-system.md` for final integration. Chunks 3–5 remain.
**Branch:** `codex/noticed-rebrand`. All five chunks stay on this branch. The user will merge; do not merge to main.
**Audit date:** 23 November 2026.
**Objective:** Apply the approved Noticed design system to the complete existing product, preserving its working information, interactions, data and architecture.
**Delivery structure:** Five substantial chunks: design foundation and homepage → channels and creator views → categories and games → creator and manager workspaces → supporting screens and final integration. Verification is part of every chunk.

## 1. Decisions and scope

The supplied HTML files establish visual direction and an information baseline. They are not an exhaustive specification of the product. Existing analytics, graphs, controls and workflows must be incorporated into the new layouts even when the templates omit them.

Confirmed with the user:

- Use Noticed, powered by Hatchet, Golos Text and the approved Hatchet-derived editorial style. The working primary red is #C4262C.
- Keep the detailed public creator profile and the shareable media kit as **two distinct views with one design system**.
- Use the temporary heavy “noticed.” wordmark with the red full stop until final logo assets arrive. Make replacement a shared-component change.
- Start with design foundations, then the homepage, then channels, then categories/games. Complete the other existing screens using the same system.
- Preserve ingestion, database structure, metric calculations, backend services, API contracts, authentication and permissions.
- Defer the proposed standalone ranking-page system entirely. Do not implement or adapt the ranking-page template in this workstream.
- Planning is complete; the user subsequently authorised implementation in five chunks on one branch, with a brief and remaining steps after each.

**Existing sorted discovery remains in scope.** The Channels directory already supports followers, viewership, peak, trending and recent sorting. Games already show most-watched and emerging channels. Preserve these existing capabilities and their calculations. The future generated ranking URLs, ranking badges and monthly ranking products remain out of scope. Some existing service filenames contain “ranking”; their names do not make the current directory a new ranking project.

**Information preservation means preserving the information each viewer is entitled to see.** It does not mean exposing every database field publicly. Owner analytics, manager permissions, public-sharing settings and intentionally unrendered fields retain their boundaries.

## 2. Evidence and review limits

The source audit covered all 50 page files, their route families and shared UI dependencies, including 133 non-test TSX component files. Route aliases are included in the page count. The review traced the main creator and game data paths, chart options, settings mutations, roster access, reports, branding assets and operational documentation.

Visual samples were inspected in Chrome: the supplied homepage and creator-kit concepts, the existing Channels directory, the public Valkyrae profile and the League of Legends page. The source review is broader than the browser sample. Authenticated creator/manager/admin journeys, every interaction and mobile layouts have **not** been runtime-tested in this planning pass.

Inputs:

- [Noticed brief](/Users/sebb/Downloads/noticed-design-handoff/CLAUDE.md)
- [Homepage reference](/Users/sebb/Downloads/noticed-design-handoff/designs/01-homepage.html)
- [Creator-kit reference](/Users/sebb/Downloads/noticed-design-handoff/designs/02-creator-media-kit.html)
- [Hatchet tokens](/Users/sebb/Downloads/noticed-design-handoff/design-system/hatchet-tokens.json)
- [Hatchet design guidance](/Users/sebb/Downloads/noticed-design-handoff/design-system/hatchet-design-system-README.md)
- Current source and [ingestion guide](INGESTION-PIPELINES.md). Older architecture/roadmap prose sometimes describes functionality that is now implemented; the current code takes precedence for the inventory.

The repository baseline at the final check is commit `6147451` (game pages: fill outage days from SH daily averages). It includes the game page, snapshot endpoint, GamePlatformChart, metric information, game-series services/tests and the new game-series-load service reviewed during this audit. That work was not edited by this planning task. Preserve it when creating the implementation baseline; do not overwrite it with an older version.

### Findings that shape the plan

| Finding | Consequence |
| --- | --- |
| The old palette appears 2,767 times across 171 source files in a scan of 12 common old colour literals. | Changing one theme file will leave large parts of the application in the old design. Migrate components and states systematically. This count includes legacy/unmounted files and is not a screen count. |
| Tailwind tokens, the JavaScript THEME object, literal styles, chart options and global CSS overlap. | Establish a coherent token source and adapters for DOM, ECharts and export rendering before redesigning pages. |
| The root layout forces dark mode and loads Gotham fonts. | Introduce the new foundation in an isolated preview/implementation branch and change global defaults only with compatible shells and components. |
| Public profile and owner dashboard share CreatorHeader and DashboardGrid. | Share the redesigned information modules while keeping owner controls and private reads separate. |
| The shareable MediaKitLayout is a separate, narrower implementation. | Do not replace the rich profile with the current kit. Build shared presentation modules with two page compositions. |
| The current layout packs only available widgets and honours saved widget IDs. | New editorial sections must preserve availability and saved selections, with no blank navigation targets or empty layout gaps. |
| Public pages use SSR/ISR; HeaderAuth loads session-dependent controls separately. | Preserve caching, server-rendered public content and the existing client/server split. A new header must not make all public pages session-dependent. |
| Game header and chart figures share a series and snapshot boundary. | Preserve this relationship, including estimated periods, late platform starts and distinct peak windows. |
| The general Hatchet tokens originate from a slide canvas. | Translate typography and spacing into a responsive web scale. Do not import slide dimensions literally. |
| Several components and settings panels are placeholders or older alternatives. | Audit actual route imports before changing them. Preserve working features and honest unavailable states; do not turn placeholders into accidental feature commitments. |

## 3. Frontend implementation boundary

The project continues to use Next.js/React, Tailwind, ECharts, existing tRPC/REST endpoints, Prisma/PostgreSQL, Redis, Inngest and the current worker setup. No framework migration or replacement data layer is required.

| Allowed in the rebrand | Preserve without functional changes |
| --- | --- |
| Fonts, brand assets, semantic colours, spacing, typography and responsive composition | Prisma schema, migrations, persisted records and identity relationships |
| JSX structure, page sections, navigation presentation, cards, tables, charts and forms | Ingestion schedules, platform adapters, workers, rollups and freshness calculations |
| Accessible labels, focus, empty/loading/error treatments and clearer supported copy | API request/response contracts, cache keys, aggregation windows and sorting rules |
| Read-only composition of already-authorised data into new sections | Claim verification, OAuth scopes, role checks, roster acceptance and revocation |
| Shared UI components, existing chart styling and route-specific view composition | Report pricing, billing, payment verification, download authorisation and export data selection |
| Brand text, icons and social-preview presentation | Existing routes, aliases, canonicalisation, redirects and sitemap behaviour |

Server Component page files contain both rendering and data access. Editing their presentation does not require changing their queries. Where a kit needs existing public data already used elsewhere, reuse existing readers and visibility rules; identify any genuinely missing backend capability as a separate task instead of adding it silently.

Some presentation lives under server/services: PDF layouts, HTML email bodies and export attribution. These may receive narrowly scoped branding changes in the final consistency phase. Their permissions, delivery, payment logic, CSV columns and metrics stay unchanged. Keep these diffs separate from general backend code.

Domain activation is a later launch operation. Design previews should continue to use the configured origin and existing route paths. Do not change DNS, OAuth callbacks, sender domains, webhook URLs or production environment variables as part of page styling. Final logo delivery and domain readiness do not block design work.

## 4. Design foundation, before page implementation

The first deliverable is a reviewable web design specification and component specimen, followed by desktop/mobile page compositions. The specimen is proposed future work, not an artifact created during this planning pass.

### Brand, colour and type

| Element | Proposed application |
| --- | --- |
| Wordmark | Temporary “noticed.” in heavy Golos Text, red full stop, light/dark variants and a consistent “powered by Hatchet” relationship. Centralise sizing, clear space and accessible name. |
| Primary canvas | White #FFFFFF for content and analytics. |
| Secondary canvas | #EFEFEF for grouped controls, secondary sections and workspace background where useful. |
| Ink | #151F2C for primary text and dark editorial hero/header sections. |
| Accent | #C4262C for primary actions, selected emphasis and the most important highlight. |
| Secondary text | #4A505B, with readable contrast at actual text sizes. |
| Secondary emphasis | #022658 for restrained navy accents and suitable chart series. |
| Dividers | #D9D9D9 and #D2D5D7 for section rules and field/table boundaries. |
| Font | Golos Text, with body, label, heading and large-number roles; local font assets where practical. |
| Numbers | Tabular figures, consistent decimal/unit formatting and clear signs for changes. Preserve the existing metric formatters. |
| Status colours | Separate success, warning, error and neutral tokens. Brand red does not replace every status or platform identity. |
| Platform colours | Recognisable, consistent platform identities with chart variants legible on white. Check Kick green, TikTok cyan and X marks particularly carefully. |

Suggested starting web scale for the specimen: 16px body, 14px regularly used labels/controls, 12–13px secondary metadata, fluid 32–72px page/hero titles, 20–32px section titles and 28–56px headline figures. These are proposed responsive web values to refine visually, not exact dimensions copied from the slide system.

Use a common content width around 1,200–1,280px with fluid gutters, a small consistent spacing scale, generous separation between editorial sections and denser spacing inside analytical tables. Preserve the templates' numbered editorial sections where they aid the page structure; do not add decorative numbering to forms or operational tables.

Use thin rules and open sections as the main structure. Reserve bounded panels for forms, chart controls, dialogs and grouped tasks where boundaries help. Avoid retaining the old card grid simply with new colours.

### Shared components to define

- Brand lockup, temporary icon/favicon treatment and social-preview treatment.
- Public header/footer, mobile navigation, authenticated account menu and notifications.
- Editorial page header, section heading, metric strip and timestamp/source note.
- Buttons, text links, inputs, selects, textareas, checkboxes, toggles and validation messages.
- Platform tabs, period selectors, filter bars, view switches and pagination.
- Data table, creator row/card, category card and clip tile.
- Chart frame, legend, tooltip, source note and loading/empty/error states.
- Dialog, drawer, toast/status feedback, tooltip and confirmation treatment.
- SVG country flags, platform marks, avatar/cover fallbacks and image-crop rules.

Preserve the existing platform icon and avatar-selection behaviour. Replace emoji country flags with SVG flags as requested by the brief, while retaining readable country names and a neutral fallback.

The specimen must show light content and dark headers together, all primary form states, a multi-platform chart, a long data table and a mobile navigation example. This validates the system against real product complexity before it spreads across the site.

### Chart design is a dedicated part of the foundation

Retain ECharts and the existing series builders. Specify actual chart font values, grid/axis contrast, tooltip surfaces, series colours, marker sizes, legends and responsive dimensions. Canvas charts must receive the resolved theme values; they do not automatically inherit every DOM style change.

Preserve:

- Creator follower step lines, available-platform tabs, All-platform comparison, zoom slider and existing periods.
- Creator viewer histories, multi-platform lines, average/peak annotations and live/freshness labels.
- Platform follower bars, demographic age/gender bars, country distributions and private device/traffic charts.
- Game viewer and live-channel series, legend toggles, totals, periods and snapshot alignment.
- Missing observations, daily-average annotations, late-start captions and currently defined interpolation behaviour. Do not smooth or fill series differently for visual polish.

Chart frames should allocate enough width and height for analytical reading. On mobile, stack charts and reposition controls/legends; do not remove metrics or reduce the charts to decorative sparklines. Keep important summaries available as text as well as marks in the chart.

## 5. Homepage composition

Primary files: apps/web/src/app/(public)/page.tsx; components/landing; components/layout; components/search.

Proposed order:

1. **Header:** Noticed lockup, Channels/Creators, Categories, Reports, Solutions/agency access, search and account actions. Preserve existing destinations. No ranking navigation item.
2. **Dark editorial hero:** large creator-focused headline, search-first “Find my media kit” flow and a real-data kit example. Retain clear entry points for existing users and managers.
3. **How it works:** find the profile, connect supported platforms, share the kit. Link each action to an existing workflow.
4. **Benefits/comparison:** use the template's editorial table treatment with accurate existing capabilities. Omit unsupported ranking promises.
5. **Creator discovery:** use the current top-creator/showcase data in the new visual system. Avoid repeating the same records in multiple adjacent sections.
6. **Trending and categories:** preserve existing trending and top-game/category information, labelled with its actual time window. Link to the existing directories.
7. **Agency band:** explain representation and roster workflow; link to the current manager solution. Keep existing exports accurately described.
8. **FAQ and footer:** support the existing claiming, data-source and platform questions; retain reports, company, legal, newsletter and cookie-settings access.

The template's dedicated ranking section becomes useful navigation into the current Channels and Categories experiences, with copy matching those destinations. Do not leave inactive ranking links, fake rank badges or a “coming soon” ranking product taking up the homepage.

The current trending service uses seven-day growth. Keep that period and its calculation. Gaming and non-gaming discovery can receive balanced design prominence using the existing category structure; do not fabricate a second Lifestyle leaderboard or change classification to satisfy sample copy.

The hero should reuse search and carry the selected profile through the existing claim/login return flow. “Start from scratch” must describe the supported registration path; it must not imply new platform onboarding.

**Acceptance:** all currently available homepage information has an explicit destination; search, discovery, claim and agency journeys work; template placeholders are absent; desktop and mobile composition are reviewed before proceeding to the channel phase.

## 6. Channels, full profiles and shareable kits

### Existing Channels directory and search

Primary files: apps/web/src/app/(public)/creators/page.tsx; components/creators; components/shared/CreatorCard.tsx; apps/web/src/app/(public)/search/page.tsx; components/search/SearchBar.tsx.

Use an editorial directory header, a clear filter band, restrained creator cards and a legible table/list option. Preserve:

- All/Twitch/YouTube/Instagram/TikTok/X/Kick selections.
- Existing game filter, followers/viewership/peak/trending/recent sorting and explanatory time windows.
- Both grid and list modes, their available columns, pagination, URL query state and browser Back behaviour.
- Creator identity, avatars, linked platforms, metric values, changes and profile destinations.
- Existing month-stamped page titles and canonical query handling, with brand presentation updated where appropriate.
- Search scopes, query state, result counts, pagination, empty results and the current untracked-creator fallback.

No new country/gender/audience-size ranking filters are added merely because they appear in a different template.

### Full public creator profile

Primary files: apps/web/src/app/(public)/creator/[slug]/page.tsx; components/creator/CreatorHeader.tsx; components/dashboard/DashboardGrid.tsx; components/widgets; components/charts.

Proposed page structure:

| Position | New section | Existing information and interactions retained |
| --- | --- | --- |
| 1 | Dark editorial identity header | Avatar/banner where available, display name, biography, location/language/age when currently rendered, total followers, linked platforms, claim state, claim action and update time. No new ranking badge. |
| 2 | Sticky section navigation | Overview, Performance, Audience, Content and Partners, plus other enabled content. Only include rendered sections; allow horizontal navigation on narrow screens. |
| 3 | Overview | Platform audience strip, existing streaming KPIs and period control. Optional plain-language summary derived only from the same authorised visible values. |
| 4 | Performance | Follower history, viewer history, comparisons, source/freshness notes, zoom and period controls. Give the graphs meaningful space. |
| 5 | Audience | Current platform audience bars and demographics: gender, age, countries, platform/source switching and estimate/freshness attribution. |
| 6 | Content | Featured clips, popular games/categories and recent-stream table with its sorting/pagination. All three remain first-class content. |
| 7 | Partners and enabled extras | Creator-entered public partnerships, dates/campaigns where currently displayed, interests and existing enabled optional widgets. Honour access and unavailable states. |
| 8 | Footer/actions | Public kit link and existing public navigation, with no exposure of private account information. |

The exact ordering of clips versus performance can be refined in the composition review; the information mapping is fixed. The analytical profile should make charts easy to find while adopting the kit's editorial hierarchy.

### Creator information-preservation register

| Current module | Must survive the redesign |
| --- | --- |
| CreatorHeader | Identity, avatar precedence, platform links/counts, total-followers explanation, freshness, claim and owner variants. |
| StatsRow | Airtime, average airtime, best-platform peak, average viewers, new followers; 7D/30D/3M/6M/1Y; exact period dates, platform contributors, automatic initial-period note, last-stream/no-stream states and partial follower-history notes. |
| FollowerGrowthWidget | Eligible tracked platforms, All comparison, 7d/30d/90d/1y/all, step rendering, zoom and peak marker; keep controls visible after selecting an empty result. |
| ViewerCountWidget | Existing viewer history and additional platforms, 7d/30d/90d, live indicator and latest timestamp, average/peak detail and game labels. |
| PlatformBreakdownWidget | Per-platform follower bars using the same follower-count helper as the header, including already-accounted-for other channels. |
| DemographicsWidget | First-party/public-sharing behaviour, estimated social-audience fallback, platform tabs, gender/age/countries, report date and stale warning. Household income is currently intentionally not rendered. |
| PopularGamesWidget | Existing last-30-day ordering, game/category identity, cover, platform contribution, airtime, average viewers and links where available. |
| RecentStreamsWidget | Dates, platforms, games/categories, durations, average/peak viewers, sorting, pagination and fallback presentation. |
| FeaturedClipsWidget | Real thumbnails, titles, views, age/date where shown and external clip destinations. |
| BrandPartnersWidget | Owner editing and public viewing, logos/names, campaign/date fields, visibility and existing add/edit/remove workflows. Label supplied partnerships as creator-entered. |
| Interests | Saved interests when enabled; retain the existing settings limits. |
| Brand safety | Existing optional data and Not Rated state; do not create a new safety score. |
| Featured posts, rates, streamer qualities | Existing optional/placeholder behaviour remains honest. No new editor, pricing workflow or data system is implied. |
| Widget configuration | Keep stored widget identifiers and defaults valid; map them into the new section composition without a database migration. |

### Shareable media kit

Primary files: apps/web/src/app/(public)/creator/[slug]/media-kit/page.tsx; components/media-kit/MediaKitLayout.tsx; the authenticated /media-kit preview page.

Follow the supplied kit's identity header, platform strip, overview, clips, audience, content and partner sections. Share the typography, data modules and chart treatment with the full profile, using a more concise composition and a clear link to the complete analytics view.

Retain existing kit totals, platform information, growth details, partnerships and share behaviour. Add the template's supported clips/content/summary using existing authorised data sources, without creating another calculation pipeline. The kit need not duplicate every long table; the complete profile remains the home of full analytical depth.

Copy-kit actions must use the public kit URL, including when invoked from the authenticated preview. The current MediaKitLayout copies the current browser URL, which can be a private preview path; include this in link acceptance checks.

The current kit and full profile have divergent demographic handling: the kit's page query gates first-party analytics on claimed status, while the full profile explicitly uses the public-sharing flag and freshness-filtered estimates. This is a pre-existing discrepancy to review before sharing modules. Do not copy private owner payloads into public views or silently redefine consent. The new public composition should respect the existing explicit sharing control; any required policy/backend correction must be isolated and reviewed as its own change.

The kit's Download PDF button is currently disabled. Working manager roster PDF export is a different feature. Preserve this distinction; do not advertise a working creator-kit PDF download as part of the visual rebrand.

Press, representation/contact blocks and ranking badges require capabilities or decisions beyond the current presentation. Leave them out of the launch composition until backed by an existing supported public source and workflow. Do not expose a manager's private contact data to fill a placeholder.

## 7. Categories and game/category detail

### Categories browse

Primary files: apps/web/src/app/(public)/browse/page.tsx; components/browse; components/games; lib/game-list.ts.

Use an editorial page header, compact category navigation, a coherent filter/sort row and redesigned cover cards. Keep the current category model and route structure. “Game” is the existing storage model for both games and non-game categories.

Preserve Gaming, IRL, Music, Creative, Sports, Other and All; viewers/channels/hours-watched sorting with its current time windows; genre filtering where applicable; record counts; pagination/loading; and cover fallbacks. Maintain existing URL parameters, defaults and filtering semantics. A new Lifestyle taxonomy is not part of a frontend rebrand.

### Game/category detail

Primary files: apps/web/src/app/(public)/game/[slug]/page.tsx; components/game.

There is no dedicated game-detail template in the handoff. Extend the approved editorial system with this explicit composition:

1. **Identity header:** game/category cover, name, available metadata, update time and a restrained Hatchet enterprise-data link.
2. **Metric strip:** latest viewers, latest live channels, average viewers over seven days, peak viewers over 24 hours and average live channels over seven days. Retain platform breakdowns and qualifiers.
3. **Section navigation:** Overview, Viewership, Channels, Streams and Clips; use only available sections.
4. **Viewership:** a wide multi-platform viewer chart with the existing 24h/7d/30d controls and source notes.
5. **Channel activity:** the existing live-channel series at a useful width, preserving its own selected period and legend behaviour.
6. **Broadcast languages:** clear labelled distribution bars using existing percentages.
7. **Channel discovery:** preserve both Emerging Channels and Most Watched Channels, their distinct metrics, timestamps and links.
8. **Recent streams:** retain date, channel/platform, airtime, average viewers, peak viewers and hours watched, including missing-value presentation and time window.
9. **Clips:** retain the current clip thumbnails, titles, views and destinations.

The new structure must work for Just Chatting/Music/other non-game entries without inventing developer or release information. Do not remove useful category information to make it look like a game-only page.

Preserve the shared game-series source for header and charts, snapshot “until” alignment, combined-versus-platform peaks, daily-average estimation overlays, late-start captions and current sparse-data treatment. These are part of the information design and not visual clutter.

**Acceptance:** existing metrics and charts match the same input payload; each existing discovery and stream module remains available; mobile tables keep every column accessible; game and non-game examples both work.

## 8. Creator workspace and settings

The authenticated workspace uses the same light content surfaces, typography and controls, with a compact operational header. Reserve oversized editorial treatments for identity and introductory sections; keep editing tasks efficient.

| Screen or flow | Proposed treatment | Preserve |
| --- | --- | --- |
| Home / onboarding progress | Clear next-action and account-summary layout | Role-dependent routing, claim prompts, quick stats and existing setup actions. |
| Owner dashboard | New profile composition plus a distinct owner toolbar | Completion percentage, sharing, public preview, customisation, enabled widgets and owner-only data. |
| Customisation drawer | Group controls by the sections they affect | Current widget IDs/defaults, save feedback, reset behaviour and public-demographics toggle. No new drag-and-drop persistence schema. |
| Profile settings | Group identity, biography, personal details, interests, image and connected accounts into clear form sections | Name, read-only email/tag, country, age, gender, language, bio limit, interest limits, avatar rules, existing save payloads and completion calculation. |
| Partnerships | Consistent list/editor and modal treatment | Existing fields, public visibility, logo handling and add/edit/remove mutations. |
| Connections | Clear platform rows/cards with account identity and status | Supported/unsupported provider states, connect/disconnect actions, sync details and callbacks. |
| Claim flow | Clear step sequence and status panels | Confirm → method → action → result; OAuth, bio challenge and manual review; high-value restrictions, evidence, countdown, retries and history. |
| Private analytics | Platform tabs, metric strips and the redesigned chart frames | YouTube watch time/subscribers/views/revenue/engagement, Instagram reach/impressions/profile/website metrics, Twitch subscriber metrics and current demographics/device/traffic charts. |
| Kit preview | Same kit presentation as the public view, with owner navigation | Public share destination and existing data availability; no new PDF capability. |
| Security | Readable grouped form and clearly separated destructive action | Current password, validation, account deletion confirmation and session/auth behaviour. |

Current settings include Coming Soon cards for manual featured-post/clip curation. Automatic public featured clips already work. Preserve that distinction in labels and do not build a new curation editor in this phase.

## 9. Manager workspace and invitations

Use the same form/table system, a concise roster header, legible status labels and a restrained metrics strip.

- Preserve grid/list roster views and the saved browser preference.
- Preserve active, pending and expired invitation states, invitation search, copyable invite links, DM text and regeneration.
- Preserve active-only roster totals and the existing creator-level permission display.
- Keep accepted, non-revoked access as the requirement for private analytics and export; pending invitations do not grant access.
- Restyle creator detail and existing analytics views without broadening access.
- Preserve removal/revocation behaviour and its feedback.
- Restyle manager profile/settings, agency/contact/language fields, avatar selection, completion and invitation preview.
- Preserve CSV/PDF exports and the manager's chosen logo/brand colour; Noticed is the platform attribution, not a replacement for the agency's identity.
- Design every invitation terminal state: valid, login required, wrong account, expired, already accepted, declined, revoked/unavailable and unknown token as applicable to the existing route.

The brief's “organise by theme and content type” is not evidence of an existing roster grouping workflow. Preserve the actual current controls; any new grouping model is a separate feature.

Agency marketing should avoid the current conflicting “free roster” promise. Use neutral supported wording until pricing copy is supplied. Existing access and billing behaviour stay unchanged; this plan adds no paid gate.

## 10. Complete screen coverage

This matrix accounts for all 50 current page files. Aliases share a redesign but still need navigation checks. API endpoints are not additional visual screens.

| Route(s) | Page files | Design work |
| --- | ---: | --- |
| / | 1 | Homepage composition. |
| /creators | 1 | Channels directory, filters, grid/list. |
| /search | 1 | Search and all result/empty states. |
| /creator/[slug] | 1 | Complete public analytical profile. |
| /creator/[slug]/media-kit | 1 | Shareable kit. |
| /browse | 1 | Categories browse. |
| /game/[slug] | 1 | Game and non-game detail. |
| /solutions/creators, /solutions/talent-managers | 2 | Marketing pages, screenshots, supported copy and FAQ. |
| /about, /contact | 2 | Editorial/company content and contact form states. |
| /reports, /reports/request, /reports/success | 3 | Marketing, lead/configuration forms, quote/payment/download result states. |
| /invite/roster/[token] | 1 | Public invitation and terminal states. |
| /terms, /privacy, /cookies and their /es equivalents | 6 | Legal reading layout and brand presentation, preserving approved legal substance. |
| /login, /register, /forgot-password, /reset-password, /onboarding | 5 | Auth forms, role selection, validation, return destinations and reset states. |
| /dashboard | 1 | Owner profile/workspace composition. |
| /home and /dashboard/home | 2 | Shared role-dependent home. |
| /analytics and /dashboard/analytics | 2 | Shared private analytics. |
| /claim and /dashboard/claim | 2 | Shared claiming flow and claim history. |
| /connections and /dashboard/connections | 2 | Shared platform connections. |
| /brand-partnerships | 1 | Partnership editor. |
| /media-kit | 1 | Authenticated kit preview. |
| /roster and /dashboard/roster | 2 | Shared manager roster. |
| /talent-manager/creator/[slug] | 1 | Permission-aware manager creator detail. |
| /dashboard/settings, /dashboard/settings/security | 2 | Creator/manager settings branches and security. |
| /claims and /dashboard/admin/claims | 2 | Claim queue, filters, selection and review panels. |
| /manage-creators and /dashboard/admin/manage-creators | 2 | Creator search/filter/table, tier actions and import modal. |
| /dashboard/admin/users | 1 | User table, role/filter/suspension controls. |
| /dashboard/admin/audit-log | 1 | Audit filters and log table. |
| /dashboard/admin/health | 1 | Infrastructure/pipeline health presentation. |
| /dashboard/admin/metrics | 1 | System KPI and chart presentation. |
| **Total** | **50** | |

Shared surfaces also included: header, footer, mobile drawer, account menu, notifications, cookie banner/preferences, newsletter form, avatar editor, dialogs, tooltips, skeletons, no-data states, not-found and global-error pages. Retain existing behaviour and persistence keys.

Reports retain entity selection, platform/metric/time-range controls, quote-versus-checkout paths, submission failures, verification/loading, download errors and repeat downloads. No price or report-engine change is needed.

Admin pages receive the common design system and useful table/filter improvements. Their operational actions are not executed as part of visual review.

Existing legacy channel/game redirect handlers and URL aliases are preserved and checked. No new ranking route is introduced.

## 11. Template gaps and explicit treatment

| Template element | Treatment in this design release |
| --- | --- |
| Finished Noticed logo | Temporary wordmark confirmed; later asset swap through shared brand component. |
| Creator and clip imagery | Use real existing avatars/thumbnails/covers and designed fallbacks. Avoid invented creator photography or fake production statistics. |
| At-a-glance paragraph | Proposed deterministic presentation of already-visible data, with exact period/source context and missing clauses omitted; no AI generation pipeline. |
| Ranking pages, filters and badges | Deferred; no launch UI suggesting they work. |
| Press | No existing press editor/source was found in the reviewed creator model and flows. Reserve a future extension point, omit unsupported live section. |
| Representation/contact block | Deferred unless an existing explicitly public source is confirmed. Roster membership alone must not publish private contact details. |
| General engagement rate | Do not invent a cross-platform formula. Preserve existing platform metrics where available. |
| Lifestyle trending | Preserve the current category taxonomy and supported discovery data; no fabricated data or silent classification change. |
| New roster grouping | Separate product feature; preserve the working roster. |
| Creator-kit PDF | Currently disabled; separate from working manager PDF export. |
| Advanced featured-post/clip editors, rates | Preserve current honest unavailable states; no new backend implementation. |

Where the brief's suggested wording overstates current behaviour, use accurate launch wording. In particular, distinguish claimed ownership, OAuth connections, public metrics and estimated demographics. The design should make provenance clearer.

## 12. Five delivery chunks and review points

The repository audit and planning are complete. Consolidate the remaining work into five substantial delivery chunks, preserving every requirement in sections 4–11 and the acceptance criteria in section 14. Detailed tasks remain internal to each chunk; they are not separate handoffs. No implementation or automatic production publication is authorised by this planning update.

| Chunk | Complete deliverable | Completion evidence |
| --- | --- | --- |
| 1. Design foundation and homepage | Establish the current baseline and preservation map; define the responsive web design specification, temporary brand assets, component specimen and chart rules; implement fonts, tokens, shared controls, compatible navigation/footer and the complete desktop/mobile homepage. Design decisions precede page implementation within this chunk. | A working homepage demonstrates the new system with real data. Component states, marketing/analytics examples and mobile composition are reviewed. Existing search, claim, directory, report and agency paths remain valid; public SSR/cache boundaries are preserved. |
| 2. Channels and creator views | Complete the Channels directory and search, full analytical creator profile, separate shareable media kit and matching owner kit preview. Incorporate every current profile module, chart, table, filter and supported optional widget into the new structure. | The creator information register passes; periods, values, source notes, URL state, sorting and pagination survive. Saved widget selections remain valid. Profile and kit remain distinct and linked, with correct public sharing URLs and explicit demographic visibility handling. |
| 3. Categories and games | Complete category browsing and game/non-game detail layouts, including metrics, viewer/channel charts, broadcast languages, channel discovery, recent streams and clips. | Rich, sparse and non-game examples retain their information and controls. Header/chart snapshot alignment, platform contributions, peak definitions, estimation notes and current data gaps are preserved. Mobile charts and tables remain usable. |
| 4. Creator and talent-manager workspaces | Complete the owner dashboard, customisation, profile/security settings, private analytics, claim and connection flows, partnerships, manager roster, invitation states, permission-aware creator detail, agency settings and CSV/PDF export presentation. Include authentication/onboarding and the public creator/manager solution pages so the account journeys are coherent. | Creator and manager journeys work from entry to their main tasks. Form payloads, saved settings, role routing, active/pending/revoked distinctions and analytics/export permissions remain intact. Agency branding is preserved in exports; private data stays within existing access boundaries. |
| 5. Supporting screens and final integration | Complete reports and their quote/payment/download states, company/contact/legal pages, admin screens, remaining shared states and presentation-only email/export attribution. Finish whole-site consistency, performance and regression review, and remove temporary migration styling. | All 50 page files and shared surfaces are accounted for. No active old-brand islands, unsupported feature promises or unresolved regressions remain. Integrated responsive, accessibility, information-parity and technical checks have recorded results. Domain activation remains a separate launch task. |

Each chunk includes its own desktop/mobile review, applicable loading/empty/error/permission states, information and interaction checks, relevant existing tests and appropriate build/type checks. Fix regressions within that chunk before declaring it complete. Chunk 5 performs whole-site integration checks; it is not the first time quality is checked.

A chunk ends with a substantial working result and a concise account of what changed, what was verified and any unresolved limitation. The larger grouping does not reduce the preservation checklist, remove detailed tasks or justify carrying unfinished screens forward as complete.

Build the new foundation in an isolated branch/preview. During migration, use explicit page/surface boundaries or a temporary compatibility scope so a token change does not produce white text on white backgrounds in unfinished screens. Avoid a permanent second design system or a database-backed theme setting. Remove transitional styling after all pages migrate.

Use the existing apps/web UI organisation unless a small refactor materially improves reuse. A migration of every component into packages/ui, a new state library or a new chart library is unnecessary scope.

## 13. File-level implementation map

| Responsibility | Primary source locations |
| --- | --- |
| Web tokens and fonts | apps/web/src/app/layout.tsx; apps/web/src/app/globals.css; apps/web/src/lib/constants/theme.ts; packages/config/tailwind/base.ts; apps/web/tailwind.config.ts |
| Shared controls and surfaces | apps/web/src/components/ui; components/shared; components/layout; components/legal |
| Chart presentation | components/charts/theme.ts; BaseChart.tsx; format.ts; specific chart options in widgets, analytics and game components |
| Home | app/(public)/page.tsx; components/landing |
| Channels/search | app/(public)/creators; app/(public)/search; components/creators; components/search |
| Full profile and owner layout | app/(public)/creator/[slug]/page.tsx; app/(dashboard)/dashboard/page.tsx; components/creator/CreatorHeader.tsx; components/dashboard/OwnerDashboardView.tsx; DashboardGrid.tsx; WidgetToggle.tsx |
| Section visibility and packing | lib/constants/widgets.ts; lib/profile-layout.ts; existing data-availability readers |
| Shareable kit | app/(public)/creator/[slug]/media-kit/page.tsx; app/(dashboard)/(creator)/media-kit/page.tsx; components/media-kit |
| Category/game layouts | app/(public)/browse; app/(public)/game/[slug]; components/browse; components/games; components/game |
| Creator forms and workflows | components/settings; components/avatar; components/claim; components/connections; components/analytics |
| Manager | components/manager; components/settings/manager; components/invite; existing manager and invite pages |
| Supporting screens | components/auth; components/onboarding; components/reports; components/contact; components/admin; app not-found/global-error |
| Brand artifacts | apps/web/public/brand; apps/web/public/og-default.png; app/icon.svg; lib/constants/seo.ts; existing marketing screenshots |
| Export/email presentation only | server/services/pdf/roster-report.tsx and fonts.ts; existing notification HTML; narrowly scoped attribution strings in export renderers |

The live routes primarily use components/widgets for public analytics. Older alternatives such as GrowthSection, DemographicsSection, SettingsForm, Sidebar and DashboardNavbar must be checked for actual usage before spending redesign effort on them. Do not delete them as an unrelated cleanup during this work.

Keep workers, ingestion functions, packages/core calculations, database files, API handlers and access services outside the ordinary implementation diff. Exceptions must be justified by a specific reviewed requirement, not by the redesign's convenience.

## 14. Acceptance and regression plan

### Information and behaviour comparison

Use the same recorded input payloads/time windows for before/after comparisons. Live counts change continuously; comparing screenshots taken hours apart is not a reliable numerical regression check.

Representative cases:

- A rich unclaimed multi-platform creator such as the reviewed Valkyrae profile.
- A claimed creator with public first-party demographics enabled and the same case with sharing disabled.
- A creator with social-audience estimates, including a stale report.
- A single-platform creator, a social-only/link-only account, sparse history and no streams in the default period.
- A creator with missing imagery, a long name/bio and non-Latin text.
- Owner configurations with several widgets disabled and optional widgets enabled.
- A multi-platform game such as League of Legends, a sparse-data game and a non-game category.
- Active/pending/expired/declined/revoked manager invitation cases and a manager without private analytics/export permission.
- Report quote, checkout return, verification failure and download-error cases using isolated fixtures or test-mode flows.

Check every metric value, unit, label, date window, freshness/source note and available action against the preservation register. Verify that hiding unavailable sections does not hide controls after a user chooses an empty chart period. Test widget preferences after a save and reload; stored widget IDs must remain compatible.

### Layout and interaction review

Review narrow mobile, wider mobile, tablet, laptop and wide desktop compositions, including long names and populated tables. Check stacked KPIs, non-overlapping legends, reachable horizontal table columns, chart resize, sticky-header offsets and anchor navigation.

Check keyboard access, visible focus, form labels, field errors, dialog/drawer focus behaviour, touch targets, readable contrast, text zoom and reduced-motion preferences. Keep useful data in readable text rather than relying only on canvas or colour.

Exercise search, filters, sorting, pagination, grid/list switches, claim-return URLs, connection-return URLs, public sharing, preview links, widget toggles and form states. Authenticated mutation checks belong in an isolated test environment, not against real user accounts during design inspection.

### Existing technical verification

Run relevant existing tests as the corresponding areas change. Examples already in the repository include profile-layout, stats-period, metric-freshness, social-age-buckets, platform-follower-count, chart formatting, creator visibility/list, public game list, game-series, most-watched/recent-streams and platform-connection tests. Run type checking and the production build at integration checkpoints, with lint according to repository workflow.

New tests should target meaningful risks introduced by the new composition: public versus owner visibility, preserved widget configuration, section/anchor availability and correct public sharing links. Do not create tests that merely restate colour literals or component markup.

Before release, verify the public pages remain server-rendered and cached as intended, query fan-out has not increased unexpectedly, fonts/images do not cause substantial layout movement and the existing URLs/redirects still resolve. Recheck the full relevant suite once the integrated frontend is complete; record pre-existing failures separately.

### Final completion conditions

- Every screen in the coverage matrix has the new design and reviewed essential states.
- Every existing working analytical module has a verified place in the redesign.
- Profiles and kits remain separate, coherent and linked.
- Core data, ingestion, calculations, access and transactional contracts are unchanged.
- No unsupported ranking UI, fake production data or accidental new paid feature appears.
- Old-brand presentation is removed from active user-facing surfaces; technical package names and historic records need not be renamed.
- Existing custom agency branding remains intact in exports.
- Mobile and desktop review plus relevant automated checks are complete.

## 15. Remaining inputs, without blocking the plan

The user has resolved the two structural questions: retain two creator views and use the temporary wordmark. No further answer is required to start the design-specification phase when implementation is requested.

Later inputs are final logo assets, approved agency/pricing wording, approved Hatchet discovery claims and launch/domain details. Use accurate current-functionality copy and the temporary brand in the meantime. Press, ranking products, new contact workflows and unsupported editors remain separate product decisions rather than prerequisites for this frontend rebrand.

**Implementation record:** See [Noticed design system](noticed-design-system.md) for the foundation, component contract, verification record and remaining chunks. Report a brief after each completed chunk and relist the remaining work.
