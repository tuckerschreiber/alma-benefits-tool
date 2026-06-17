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

**Total cost: about $5,250.** Five weeks of part-time work. Ends in a Sunday-morning launch with the same URLs and the same SEO presence.

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
- They can compose new pages by stacking pre-built blocks (Hero, FAQ, Service list, Testimonial, and so on). They cannot break the design. Every block is brand-correct by default.
- Live preview as they type. Click "Publish" and it's live.

**For Alma:**

- The site loads faster. Google rewards this.
- The website and the Care Coordination app share one design system and one deploy pipeline. New features built for one are easier to extend to the other.
- No more $30/month subscription you don't really own.

## Cost

- **One-time:** $5,250 (70 hours at $75/hr).
- **Ongoing platform costs:** $0/month on free tiers. Up to $20/month at most if the site grows a lot. Saves Alma $300–450/year vs Webflow.

## Timeline

Five weeks of part-time work:

| Week | Milestone |
|---|---|
| 1 | Foundation built. Content structure designed. Current site backed up. |
| 2 | All page blocks built and styled. Demo pages live on a staging URL. |
| 3 | Top 15 most-trafficked pages migrated. Side-by-side comparisons. |
| 4 | All remaining pages migrated. Training session with editors. |
| 5 | Sunday morning cutover. Old site stays online 30 days as a safety net. |

## SEO: the most important piece

The site ranks for terms like "postpartum care," "in-home postpartum doula," and similar high-intent searches. Losing that ranking would cost the business meaningful revenue.

My approach:

- Capture a complete record of the current site's URLs, page titles, and rankings before any work starts.
- Every URL stays identical. Every page title and description copies over exactly.
- Run a full diff between the new staging site and the current site before cutting over. Zero broken links allowed.
- Monitor Google Search Console daily for four weeks after launch.

With this protocol, expected impact is under 5% temporary fluctuation, recovering within a month. The current site's SEO equity stays intact.

## The alternative (smaller fix)

If the budget isn't there for the full rebuild: transfer the existing Webflow project to a fresh account I control. About $450 and one week. Solves the ownership and API problems. Doesn't address the editor frustration or platform limits. A Band-Aid that buys 3–6 months before we'd want to migrate anyway.

## Next step

Reply to confirm whether you'd like to proceed with the full migration ($5,250, five weeks) or the smaller transfer ($450, one week). Happy to walk through this on a call.
