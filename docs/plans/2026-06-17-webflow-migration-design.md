# Webflow Migration Analysis — almacare.ca

**Date:** 2026-06-17
**Author:** Tucker Schreiber
**Status:** Design approved, ready for client proposal

## Summary

Move almacare.ca off Webflow and onto Next.js + Sanity CMS, deployed on Vercel. Five-week phased migration. Total labor cost: ~$5,250. Ongoing platform cost: $0–20/mo (vs $23–39/mo on Webflow today).

Hedge option: transfer the existing Webflow project to a new account as a $450 stopgap. Defers the structural problems by 3–6 months.

## Why migrate

Today's setup has four overlapping problems:

1. **Account access.** No API token on the current Webflow account. Programmatic page deploys are blocked. The `push.js` script in this repo sits unused.
2. **Editor friction.** Tucker (the only person editing today) hates the Webflow editor. The local-HTML-to-Embed-paste workflow exists because the native editor was slower.
3. **Platform limits.** The 50K-character cap on Embed elements forced the benefits tool's JS to be hosted externally on jsDelivr. CSS classes need an `ap-` prefix to avoid conflicts with Webflow's own styles. Future interactive tools will hit the same walls.
4. **Stack split.** The Care Coordination app is being built in Next.js. Running two different stacks for one company doubles maintenance forever and prevents shared components.

Content editing also needs to shift to non-technical team members who do mostly copy updates and image swaps, with the ability to compose new pages from approved blocks.

## Options considered

### Option A: Transfer Webflow project to a new account

Webflow supports project transfers. New account can be on a different plan tier, which unlocks API access.

| Field | Value |
|---|---|
| Hours | 6–10 |
| Labor cost | $450–750 |
| Monthly cost | $23–39 (same) |
| Fixes | Account access, API token, ownership |
| Doesn't fix | Editor friction, 50K Embed cap, no real components, stack split |
| SEO risk | Zero (same site, same URLs) |

Useful as a 3–6 month stopgap. Doesn't address the structural problems.

### Option B: Rebuild on Framer

Framer is the closest direct Webflow competitor. Better editor UX in most reviews. Supports CMS, has API, decent SEO.

| Field | Value |
|---|---|
| Hours | 35–55 |
| Labor cost | $2,625–4,125 |
| Monthly cost | ~$30 |
| Fixes | Editor friction, some platform limits |
| Doesn't fix | SaaS lock-in, stack split with Care app |
| SEO risk | Medium (must replicate URLs, metadata, structured data) |

Mid-tier choice. Better than Webflow on most dimensions. Still a separate stack from the Care app.

### Option C: Rebuild on Next.js + Sanity (recommended)

Custom Next.js app. Sanity CMS for content. Vercel for hosting. Sanity Studio runs as a route inside the Next.js app at `/studio`.

| Field | Value |
|---|---|
| Hours | ~70 |
| Labor cost | ~$5,250 |
| Monthly cost | $0–20 (free tiers cover Alma's scale) |
| Fixes | Everything above |
| Bonus | Shared stack with Care app |
| SEO risk | Medium (same protocol as Option B) |

## CMS choice: Sanity over Contentful, Storyblok, Payload

Considered:

- **Contentful.** Biggest market share. Tight free tier (25K records, 5 users). $300/mo at the next tier. Fully hosted UI Tucker cannot customize.
- **Storyblok.** Visual-editor strength. Built for marketing teams composing pages. Overkill for Alma's editor profile (mostly copy updates, occasional new pages).
- **Payload.** Self-hosted, Postgres-backed, runs inside Next.js. Strong contender for the Care app's data layer later. Less polished admin UI than Sanity for marketing-site editing.
- **Sanity (picked).** Generous free tier. Open-source Studio that lives in the Next.js codebase. Mature Next.js integrations. Supports the block-based page builder pattern that fits Alma's editor profile.

Sanity's "Presentation" mode (released 2024) provides the visual-editing experience without the design-from-scratch overhead Storyblok forces.

## Editor profile and the block-based page builder

Alma's editors are non-technical, non-marketing team members. They mostly update copy and swap images. They occasionally need to build a new page.

The pattern that fits:

- Define ~10 reusable block types once (Hero, ImageWithText, FAQ, ServiceList, Testimonial, CTA, etc.).
- Editors build pages by adding blocks from a list and filling in labeled fields. Each block is brand-correct by default.
- Live preview shows the page rendering as they type.
- Visual editing mode lets them click on a rendered page to jump to that field.

Floor: edit a labeled field. Ceiling: compose a new page from approved blocks. Webflow gave them the ceiling without the floor. Too much rope for the actual use case.

## SEO migration protocol

Non-negotiable. With the protocol: under 5% temporary traffic dip, full recovery in 4 weeks. Without it: 30–50% permanent loss is possible.

**Week 0 baseline:**

- Screaming Frog crawl of current almacare.ca. Export every URL with title, meta description, H1, canonical, structured data, status code.
- Pull Google Search Console data: top 100 ranking pages, top 100 queries, current impressions and clicks.
- Pull backlink list from GSC's link report.

**During migration:**

- URLs stay identical. Any URL change requires a 301 redirect.
- Meta titles and descriptions copy over verbatim. No "improvements" during migration so any ranking shifts are attributable.
- JSON-LD structured data preserved (already standard practice on this site).
- Heading hierarchy (H1, H2) preserved.
- Image alt text preserved.
- Canonical tags point to almacare.ca.

**Cutover day:**

- Deploy to staging.almacare.ca first. Screaming Frog crawl of staging. Diff against baseline. Zero broken links, zero missing metadata.
- DNS cutover during low-traffic window (early Sunday morning).
- Submit new sitemap to GSC same day.
- 301 redirects ship with the new site, not after.

**Post-launch (4 weeks):**

- GSC daily check for Coverage errors and impression drops.
- Weekly rank tracking against baseline.
- Expect 1–3 weeks of mild fluctuation. Full recovery within 4 weeks if the protocol is followed.

## Cost breakdown — Option C

| Phase | Hours |
|---|---|
| Project setup (Next.js + Sanity + Tailwind + Vercel) | 6 |
| Sanity schema design (page types, block types, settings) | 10 |
| Page templates + components (header, footer, all blocks) | 16 |
| Content migration (30–50 pages, ~15–20 min each) | 14 |
| SEO migration protocol | 8 |
| QA, Lighthouse pass, launch | 8 |
| Editor training (doc + walkthrough call) | 4 |
| Post-launch monitoring (4 weeks) | 4 |
| **Total** | **~70 hrs** |

At $75/hr: **~$5,250 labor**.

Ongoing platform: $0/mo on free tiers. Vercel Pro is $20/mo if traffic outgrows Hobby tier. Sanity Growth is $99/mo if content scale outgrows free. Neither is likely in year one.

vs Webflow today at $23–39/mo: saves $275–470/year on platform costs alone.

## Phased plan

**Week 1.** Repo scaffold. Sanity schemas designed. Screaming Frog + GSC baseline captured. Nav, header, footer built. Working skeleton plus schema spec ready for client review.

**Week 2.** All block components built and styled to brand. HubSpot forms wired. Live preview at staging.almacare.ca with 2–3 demo pages.

**Week 3.** Top 15 highest-traffic pages migrated and QA'd side-by-side against the Webflow site.

**Week 4.** Remaining pages migrated. Screaming Frog diff against baseline shows zero broken links and zero missing metadata. Editor training doc written. Walkthrough call with non-technical editors.

**Week 5.** Sunday early-morning DNS cutover. Sitemap submitted to GSC. Daily monitoring through week 6. Old Webflow stays paid for 30 days as a rollback option.

## Sequencing with the Care Coordination app

Two options:

- **(a) Marketing site first.** Delays Care app by ~5 weeks. Care app benefits from shared infrastructure once started.
- **(b) Care app MVP first.** Marketing site migration follows. Webflow pain continues another ~2 months.

Recommendation: **(b)**. The Care app has higher cognitive load (auth, scheduling, chat) and momentum matters. Marketing site migration is a lower-load project that pairs well as a second sprint. Exception: flip to (a) if a specific Webflow bottleneck is blocking a near-term campaign or product launch.

## Plan B (hedge)

If the client cannot commit to $5,250 upfront:

1. This week: transfer the Webflow project to a new account. ~6 hrs, $450.
2. Buys 3–6 months on the worst pain (ownership, API access for the benefits tool, clean access grants).
3. Revisit migration in Q4 2026 once the Care app is stable.

Net cost over a year if both happen: $450 + $5,250 = $5,700. Plan B is a $450 tax for not committing now. Worth it only if cash flow is tight or the client is not sold yet.

## Next steps

1. Send client-facing proposal (separate doc).
2. Get sign-off on Plan A or Plan B.
3. Plan A: schedule kickoff after Care app MVP milestone.
4. Plan B: schedule Webflow transfer this week.

## Open questions for kickoff (Plan A)

- Confirm full page inventory (export from Webflow as authoritative list).
- Confirm form integration target (HubSpot already wired on benefits tool, assume same).
- Confirm staging subdomain (staging.almacare.ca) DNS access.
- Confirm GSC access for baseline capture.
- Confirm whether the existing Airtable integrations affect any marketing-site pages or only the Care app surface.
