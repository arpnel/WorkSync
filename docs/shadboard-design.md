# Shadboard design adaptation

Reference: `H:\capstone\Shardboard\full-kit\src` (Shadboard by Qualiora).
The reference MIT license is retained in `licenses/shadboard-MIT.txt`.

## Applied patterns

- Analytics: OverviewCardV3-style metric cards with real trend area charts, restrained chart grids, and concentric status rings with counts and percentages.
- Dashboard: compact metrics, neutral cards, consistent headings, and restrained chart colors; existing activity and notifications remain available.
- Marketplace and My Listings: bordered cards, compact search/filter controls, and consistent spacing.
- Projects: summary cards, understated tabs, and CRM-inspired project rows with progress rings.
- Profile: full-width profile header above an About sidebar and tabbed details; existing profile editing and portfolio/document previews remain available.
- Schedule: bordered calendar cells and compact planner cards.
- Settings: section navigation beside existing settings panels, retaining unsaved panel state when switching sections.
- Notifications: grouped inbox-style rows with existing detail dialogs and actions.

Styling is scoped through `WorkspaceDesign`. `/home/messages` and its child routes bypass that wrapper. Shared header, sidebar, UI primitives, and Messages layout were not redesigned. Data contracts, queries, authentication, permissions, and realtime behavior were not changed for this design adaptation.

## Validation

- TypeScript and focused ESLint passed.
- Desktop and 375/390/414/430px browser checks used synthetic local fixtures across Analytics, Dashboard, Profile, Projects, Marketplace, Schedule, Settings, Notifications, and Messages. No horizontal page/main overflow was detected; Messages had no design wrapper.
- Analytics, Profile, and Settings were additionally reviewed in dark mode.
- Fixture-based checks do not verify authenticated production behavior or live Supabase data. The fixture session produces header/auth diagnostics; these are not evidence of a production failure. Production build was not rerun for this visual adaptation.
