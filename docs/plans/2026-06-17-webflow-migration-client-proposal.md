# Proposal: Move almacare.ca off Webflow

**For:** Alma Care leadership
**From:** Tucker Schreiber
**Date:** June 17, 2026

## The short version

Webflow is causing more problems than it solves. I recommend rebuilding the website on a faster platform that you'll own outright. The new setup will:

- Let non-technical team members update copy and build pages without designer-level skills
- Load 30–50% faster (which helps Google rankings and conversion)
- Cost $0–20/month going forward, vs $23–39/month today
- Share infrastructure with the Care Coordination app we're already building, saving time on both

**Total cost: $3,000 (flat-rate). Three weeks of part-time work.** Sunday-morning launch with the same URLs and the same SEO presence.

## What's broken today

Four problems stack on each other:

1. **Account ownership and access are messy.** The current Webflow account doesn't have API access, which blocks the automation I've built.
2. **The editor is slow and frustrating.** Every page change takes longer than it should. I've built workarounds (writing pages locally and pasting them in) to stay productive.
3. **The platform has hard limits.** The benefits tool we shipped needed engineering hacks to fit inside Webflow's character cap. Future tools will hit the same walls.
4. **We're maintaining two systems.** Webflow for the website, Next.js for the Care Coordination app. This split doubles the work over time and prevents the two products from sharing components.

## The proposed solution

Rebuild almacare.ca on **Next.js + Sanity**. This is the same modern stack used by Loom, Linear, Notion's marketing site, and most websites that feel fast and well-built.

**For the editors (non-technical team members):**

- A simple form-based interface. They see labeled fields like "Headline," "Body text," "Button label" and fill them in.
- They can compose new pages by stacking pre-built blocks. They cannot break the design. Every block is brand-correct by default.
- Live preview as they type. Click "Publish" and it's live.

**For Alma:**

- The site loads faster. Google rewards this.
- The website and the Care Coordination app share one design system and one deploy pipeline.
- No more $30/month subscription you don't really own.

## What's in scope at $3,000

This is a Phase 1 — get the site rebuilt, launched, and SEO-safe. Phase 2 polish is deferred and scoped separately later if you want it.

**Phase 1 (in scope, $3,000):**

- Next.js + Sanity + Vercel infrastructure
- 5 reusable page blocks covering 90%+ of current page patterns (Hero, Image+Text, FAQ, Service list, CTA)
- All current pages migrated with identical URLs and SEO metadata
- HubSpot forms wired (already proven on the benefits tool)
- Full SEO migration protocol (baseline crawl, identical URLs, verbatim metadata, staging diff before cutover)
- Sunday morning DNS cutover, sitemap submitted to Google Search Console
- Editor training (short doc plus a 30-minute walkthrough call)
- One week of post-launch monitoring
- Old Webflow site stays paid for 30 days as a safety net

**Deferred to a possible Phase 2 (separate proposal if/when you want it):**

- Additional block types beyond the initial 5
- Visual "click-on-the-page-to-edit" mode polish
- Deep Lighthouse and performance tuning
- Extended editor documentation
- Animations and richer interactive elements

## Cost

- **One-time:** $3,000 flat (40 hours of work).
- **Ongoing platform costs:** $0/month on free tiers. Up to $20/month if the site grows a lot. Saves Alma $300–450/year vs Webflow.

## Timeline

Three weeks of part-time work:

| Week | Milestone |
|---|---|
| 1 | Foundation built. Schemas designed. 5 block types styled to brand. Baseline of current site captured. |
| 2 | All pages migrated to staging. Side-by-side comparison against the Webflow site. HubSpot forms wired. |
| 3 | Final QA, Sunday morning cutover, sitemap submitted, editor training. |

## SEO: the most important piece

The site ranks for terms like "postpartum care," "in-home postpartum doula," and similar high-intent searches. Losing that ranking would cost the business meaningful revenue.

My approach (not cut from the budget):

- Capture a complete record of the current site's URLs, page titles, and rankings before any work starts.
- Every URL stays identical. Every page title and description copies over exactly.
- Run a full diff between the new staging site and the current site before cutting over. Zero broken links allowed.
- Monitor Google Search Console daily for one week after launch, with spot-checks for three more weeks.

With this protocol, expected impact is under 5% temporary fluctuation, recovering within a month. The current site's SEO equity stays intact.

## The alternative (smaller fix)

If even $3,000 isn't workable right now: transfer the existing Webflow project to a fresh account I control. About $450 and one week. Solves the ownership and API problems. Doesn't address the editor frustration or platform limits. A Band-Aid that buys 3–6 months before we'd want to migrate anyway.

## Next step

Reply to confirm whether you'd like to proceed with the full migration ($3,000, three weeks) or the smaller transfer ($450, one week). Happy to walk through this on a call.
