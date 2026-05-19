// Alma Care — Benefits Eligibility Tool
// Generated from preview.html by build-webflow.mjs — do not edit by hand.
(function(){
      'use strict';

      // === ENGINE (mirror of src/engine.js + src/rules.js — keep in sync) ===
      // Pure functions only: no DOM, no globals, no I/O. Runs identically in Node and browser.

      const SERVICE_NAMES = {
        massage_therapy: 'Registered Massage Therapy (RMT)',
        acupuncture: 'Acupuncture',
        lactation_consulting: 'Lactation Consultant / IBCLC',
        postpartum_doula_care: 'Certified Postpartum Doula',
        registered_nursing: 'Private Duty Nursing',
        psw: 'Personal Support Worker (PSW)',
        mental_health: 'Psychotherapy / Mental Health Support',
        nutritionist: 'Nutrition Counselling'
      };

      const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
      const MS_PER_WEEK = 1000 * 60 * 60 * 24 * 7;

      /**
       * Returns true iff `weeksPostpartum` falls inside a dosing.window phrased like
       * "first 3 weeks postpartum" or "first 12 weeks postpartum". Returns false for
       * any other window shape or missing inputs (so unparseable windows rank lower).
       */
      function isInWindow(weeksPostpartum, window) {
        if (typeof weeksPostpartum !== 'number' || !window) return false;
        const m = /first\s+(\d+)\s+weeks?/i.exec(window);
        if (!m) return false;
        return weeksPostpartum <= parseInt(m[1], 10);
      }

      // DRAFT v1 — Awaiting Alma clinical sign-off (see docs/clinical/benefits-tool-rule-matrix-DRAFT.md)
      const ALMA_SERVICES = [
        'massage_therapy', 'acupuncture', 'lactation_consulting',
        'postpartum_doula_care', 'registered_nursing', 'psw',
        'mental_health', 'nutritionist'
      ];

      const RULES = [
        {
          service: 'lactation_consulting',
          appliesWhen: { weeksUntilDueMax: 8, firstTimeParent: true },
          dosing: { sessions: 2, estimatedSessionCost: 150, window: 'first 2 weeks postpartum' },
          rationale: 'First-time parents benefit most from early lactation support — small adjustments in the first 10 days prevent most feeding issues.',
          priority: 'high'
        },
        {
          service: 'postpartum_doula_care',
          appliesWhen: { weeksUntilDueMax: 12 },
          dosing: { sessions: 4, estimatedSessionCost: 180, window: 'weeks 1–4 postpartum' },
          rationale: 'Doula care eases the transition home — practical support, recovery guidance, and a calmer first month.',
          priority: 'high'
        },
        {
          service: 'massage_therapy',
          appliesWhen: {},
          dosing: { sessions: 4, estimatedSessionCost: 120, window: 'spread across 8 weeks postpartum' },
          rationale: 'Postpartum massage helps with muscle recovery, stress reduction, and circulation in the early weeks.',
          priority: 'medium'
        },
        {
          service: 'mental_health',
          appliesWhen: { firstTimeParent: true, weeksUntilDueMax: 16 },
          dosing: { sessions: 3, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
          rationale: 'Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.',
          priority: 'medium'
        },
        {
          service: 'acupuncture',
          appliesWhen: {},
          dosing: { sessions: 3, estimatedSessionCost: 110, window: 'late pregnancy + early postpartum' },
          rationale: 'Acupuncture supports labor preparation and early postpartum recovery — particularly for sleep and mood.',
          priority: 'low'
        },
        {
          service: 'registered_nursing',
          appliesWhen: { weeksUntilDueMax: 4 },
          dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
          rationale: 'A few in-home nursing visits in the first two weeks catch feeding, healing, and newborn questions before they escalate.',
          priority: 'medium'
        },
        // ----- Postpartum-specific rules (apply when user is already postpartum) -----
        {
          service: 'registered_nursing',
          appliesWhen: { isPostpartum: true, weeksPostpartumMax: 2 },
          dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
          rationale: 'In-home nursing visits in the first two weeks help with feeding, healing, and newborn questions before they escalate.',
          priority: 'high'
        },
        {
          service: 'postpartum_doula_care',
          appliesWhen: { isPostpartum: true, weeksPostpartumMax: 6 },
          dosing: { sessions: 4, estimatedSessionCost: 180, window: 'weeks 1–6 postpartum' },
          rationale: 'Doula support eases the transition home — practical help, recovery guidance, and a calmer first month.',
          priority: 'high'
        },
        {
          service: 'lactation_consulting',
          appliesWhen: { isPostpartum: true, weeksPostpartumMax: 4, firstTimeParent: true },
          dosing: { sessions: 2, estimatedSessionCost: 150, window: 'first 4 weeks postpartum' },
          rationale: 'Lactation challenges often surface in the first 2 weeks. A couple of focused sessions resolve most issues quickly.',
          priority: 'high'
        },
        {
          service: 'mental_health',
          appliesWhen: { isPostpartum: true, weeksPostpartumMax: 12 },
          dosing: { sessions: 4, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
          rationale: 'Postpartum mood shifts affect 1 in 5 parents. A few sessions of preventative therapy keep small things from becoming bigger ones.',
          priority: 'medium'
        }
      ];

      const CONCERN_KEYWORDS = {
        ppd: ['ppd', 'depression', 'postpartum depression', 'mood', 'anxious', 'anxiety'],
        hbp: ['blood pressure', 'preeclampsia', 'hypertension'],
        csection: ['c-section', 'csection', 'cesarean', 'caesarean'],
        twins: ['twins', 'twin pregnancy', 'twin babies', 'multiples'],
        nicu: ['nicu', 'preemie', 'premature'],
        ama: ['advanced maternal age', 'ama ', 'over 35', '35+'],
        loss: ['miscarriage', 'stillbirth', 'previous loss', 'pregnancy loss']
      };

      const CONCERN_TO_SERVICE_RULE = {
        ppd: {
          service: 'mental_health',
          rationale: 'Based on what you shared, we\'d especially encourage early mental health support — addressing mood shifts proactively makes a real difference.',
          dosing: { sessions: 4, estimatedSessionCost: 200, window: 'first 12 weeks postpartum' },
          priority: 'high',
          concernCallout: true
        },
        hbp: {
          service: 'registered_nursing',
          rationale: 'With elevated blood pressure history, in-home nursing checks add an extra layer of monitoring during recovery.',
          dosing: { sessions: 3, estimatedSessionCost: 220, window: 'first 3 weeks postpartum' },
          priority: 'high',
          concernCallout: true
        },
        csection: {
          service: 'massage_therapy',
          rationale: 'C-section recovery benefits from gentle massage starting around week 6 — once your incision has healed.',
          dosing: { sessions: 4, estimatedSessionCost: 120, window: 'weeks 6–10 postpartum' },
          priority: 'high',
          concernCallout: true
        },
        twins: {
          service: 'postpartum_doula_care',
          rationale: 'Twins double the workload. Extra doula hours in the early weeks make all the difference.',
          dosing: { sessions: 6, estimatedSessionCost: 180, window: 'weeks 1–8 postpartum' },
          priority: 'high',
          concernCallout: true
        },
        nicu: {
          service: 'lactation_consulting',
          rationale: 'NICU stays often complicate feeding — focused lactation support helps re-establish or transition to direct feeding.',
          dosing: { sessions: 3, estimatedSessionCost: 150, window: 'first 4 weeks home' },
          priority: 'high',
          concernCallout: true
        },
        ama: {
          service: 'registered_nursing',
          rationale: 'Postpartum recovery for parents over 35 benefits from extra clinical follow-up in the first weeks.',
          dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
          priority: 'high',
          concernCallout: true
        },
        loss: {
          service: 'mental_health',
          rationale: 'Pregnancy after loss carries unique emotional weight. Mental health support is a powerful protective tool.',
          dosing: { sessions: 4, estimatedSessionCost: 200, window: 'spread across pregnancy and first 12 weeks postpartum' },
          priority: 'high',
          concernCallout: true
        }
      };

      function detectConcerns(concernsText) {
        if (!concernsText || typeof concernsText !== 'string') return [];
        const lower = concernsText.toLowerCase();
        const tags = [];
        for (const [tag, keywords] of Object.entries(CONCERN_KEYWORDS)) {
          if (keywords.some(function (kw) { return lower.includes(kw); })) {
            tags.push(tag);
          }
        }
        return tags;
      }

      function normalizeInputs(inputs, today) {
        if (!today) today = new Date();
        const raw = inputs || {};
        const dueDate = raw.dueDate;
        const isPostpartum = raw.isPostpartum;
        const weeksPostpartum = raw.weeksPostpartum;
        const firstTimeParent = raw.firstTimeParent;
        const coverage = raw.coverage;
        const coveredServices = raw.coveredServices;
        const hasHsa = raw.hasHsa;
        const hsaBalance = raw.hsaBalance;
        const concerns = raw.concerns;

        // `coveredServices` is an alias for `coverage` accepted by newer callers.
        const resolvedCoverage = coverage || coveredServices || {};

        const base = {
          firstTimeParent: firstTimeParent,
          coverage: resolvedCoverage,
          hasHsa: hasHsa,
          hsaBalance: typeof hsaBalance === 'number' ? hsaBalance : 0,
          concerns: typeof concerns === 'string' ? concerns : ''
        };

        if (isPostpartum) {
          return Object.assign({
            isPostpartum: true,
            weeksPostpartum: typeof weeksPostpartum === 'number' ? weeksPostpartum : 0
          }, base);
        }

        let weeksUntilDue = 0;
        if (dueDate) {
          const due = new Date(dueDate);
          weeksUntilDue = Math.floor((due - today) / MS_PER_WEEK);
        }

        // If the due date is in the past, the user is actually postpartum — auto-flip
        // rather than letting a negative weeksUntilDue silently match prenatal rules.
        if (weeksUntilDue < 0) {
          return Object.assign({
            isPostpartum: true,
            weeksPostpartum: -weeksUntilDue
          }, base);
        }

        return Object.assign({
          isPostpartum: false,
          weeksUntilDue: weeksUntilDue
        }, base);
      }

      function eligibilityFilter(coveredServices, almaServices) {
        if (!coveredServices || !almaServices) return [];
        const covered = Object.keys(coveredServices);
        return almaServices.filter(function (id) { return covered.includes(id); });
      }

      function ruleMatches(normalized, appliesWhen) {
        if (!appliesWhen) return true;
        for (const [key, value] of Object.entries(appliesWhen)) {
          switch (key) {
            case 'weeksUntilDueMax':
              if (normalized.isPostpartum) break;
              if (!(normalized.weeksUntilDue <= value)) return false;
              break;
            case 'weeksUntilDueMin':
              if (normalized.isPostpartum) break;
              if (!(normalized.weeksUntilDue >= value)) return false;
              break;
            case 'weeksPostpartumMax':
              if (!normalized.isPostpartum) break;
              if (!(normalized.weeksPostpartum <= value)) return false;
              break;
            case 'weeksPostpartumMin':
              if (!normalized.isPostpartum) break;
              if (!(normalized.weeksPostpartum >= value)) return false;
              break;
            case 'firstTimeParent':
              if (normalized.firstTimeParent !== value) return false;
              break;
            case 'isPostpartum':
              if (normalized.isPostpartum !== value) return false;
              break;
            default:
              // Unknown condition — ignore (forward-compatible)
              break;
          }
        }
        return true;
      }

      function applyRules(normalized, eligibleServiceIds, rules) {
        if (!rules || !rules.length) return [];
        const eligibleSet = new Set(eligibleServiceIds || []);
        const matches = [];

        rules.forEach(function (rule, index) {
          if (!eligibleSet.has(rule.service)) return;
          if (!ruleMatches(normalized, rule.appliesWhen)) return;
          matches.push({
            service: rule.service,
            dosing: rule.dosing,
            rationale: rule.rationale,
            priority: rule.priority,
            _order: index
          });
        });

        matches.sort(function (a, b) {
          const pa = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 99;
          const pb = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 99;
          if (pa !== pb) return pa - pb;
          return a._order - b._order;
        });

        return matches.map(function (m) {
          const copy = {};
          for (const k of Object.keys(m)) {
            if (k !== '_order') copy[k] = m[k];
          }
          return copy;
        });
      }

      function recommendationCost(rec) {
        if (rec.dosing && typeof rec.dosing.totalCost === 'number') {
          return rec.dosing.totalCost;
        }
        const sessions = (rec.dosing && rec.dosing.sessions) || 0;
        if (sessions > 0 && !(rec.dosing && typeof rec.dosing.estimatedSessionCost === 'number')) {
          throw new Error(
            'Rule for "' + rec.service + '" must specify dosing.estimatedSessionCost or dosing.totalCost'
          );
        }
        const cost = rec.dosing && typeof rec.dosing.estimatedSessionCost === 'number'
          ? rec.dosing.estimatedSessionCost
          : 0;
        return sessions * cost;
      }

      function allocateFunding(recommendations, coverage, hsaBalance) {
        let remainingHsa = typeof hsaBalance === 'number' ? hsaBalance : 0;
        const cov = coverage || {};
        return (recommendations || []).map(function (rec) {
          const totalCost = recommendationCost(rec);
          const c = cov[rec.service];
          let covered = 0;
          if (c && typeof c.amount === 'number') {
            const reimbPct = typeof c.reimbursementPercent === 'number' ? c.reimbursementPercent : 100;
            const maxCovered = c.amount * (reimbPct / 100);
            covered = Math.min(totalCost, maxCovered);
          }
          const afterCoverage = Math.max(0, totalCost - covered);
          const fromHsa = Math.min(afterCoverage, remainingHsa);
          remainingHsa -= fromHsa;
          const outOfPocket = Math.max(0, afterCoverage - fromHsa);
          return Object.assign({}, rec, {
            totalCost: totalCost,
            covered: covered,
            fromHsa: fromHsa,
            outOfPocket: outOfPocket
          });
        });
      }

      function formatMoney(n) {
        return '$' + Math.round(n);
      }

      function buildFundingStrategy(recommendations, coverage, hsaBalance, totalCovered) {
        const lines = [];
        const cov = coverage || {};

        // Track which services were actually used in recommendations
        const usedServices = new Set(recommendations.map(function (r) { return r.service; }));

        for (const serviceId of usedServices) {
          const c = cov[serviceId];
          if (c && typeof c.amount === 'number' && c.amount > 0) {
            const name = SERVICE_NAMES[serviceId] || serviceId;
            lines.push('Use your ' + name + ' benefits — ' + formatMoney(c.amount) + ' available.');
          }
        }

        const totalFromHsa = recommendations.reduce(function (s, r) { return s + (r.fromHsa || 0); }, 0);
        if (totalFromHsa > 0) {
          lines.push('Cover ' + formatMoney(totalFromHsa) + ' with your ' + formatMoney(hsaBalance) + ' HSA.');
        }

        const totalOop = recommendations.reduce(function (s, r) { return s + (r.outOfPocket || 0); }, 0);
        if (totalOop > 0) {
          lines.push(
            '~' + formatMoney(totalOop) + ' out-of-pocket — consider adding Alma gift cards to your registry.'
          );
        }

        if (totalCovered === 0 && (!hsaBalance || hsaBalance === 0)) {
          lines.push('Most of your care will be out-of-pocket — here\'s how to plan smartly.');
          lines.push('Consider Alma gift cards on your registry to offset costs.');
        }

        return lines;
      }

      function computeResults(rawInputs, rules, almaServices, today) {
        if (!today) today = new Date();
        const normalized = normalizeInputs(rawInputs, today);
        const eligibleServiceIds = eligibilityFilter(normalized.coverage, almaServices);
        const matched = applyRules(normalized, eligibleServiceIds, rules);

        // ----- Concern keyword detection & injection -----
        const detectedConcerns = detectConcerns(normalized.concerns);
        const eligibleSet = new Set(eligibleServiceIds);
        const existingServices = new Set(matched.map(function (r) { return r.service; }));
        for (const tag of detectedConcerns) {
          const concernRule = CONCERN_TO_SERVICE_RULE[tag];
          if (!concernRule) continue;
          if (!eligibleSet.has(concernRule.service)) continue;
          if (existingServices.has(concernRule.service)) continue;
          matched.push({
            service: concernRule.service,
            dosing: concernRule.dosing,
            rationale: concernRule.rationale,
            priority: concernRule.priority,
            concernCallout: true
          });
          existingServices.add(concernRule.service);
        }
        matched.sort(function (a, b) {
          const pa = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 99;
          const pb = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 99;
          return pa - pb;
        });

        const recommendations = allocateFunding(matched, normalized.coverage, normalized.hsaBalance);

        // totalCovered = sum of covered $ across recommendations
        const totalCovered = recommendations.reduce(function (sum, r) { return sum + (r.covered || 0); }, 0);
        const totalRecommendedCost = recommendations.reduce(function (sum, r) { return sum + (r.totalCost || 0); }, 0);

        // ----- Annotate recs with isCovered (boolean) + windowRank for the hybrid sort -----
        // `rec.covered` stays as the dollar amount written by allocateFunding; we add a
        // separate `isCovered` boolean so the UI's dollar-amount reads keep working.
        const coverageMap = normalized.coverage || {};
        for (const rec of recommendations) {
          rec.isCovered = !!coverageMap[rec.service];
          const dosingWindow = rec.dosing && rec.dosing.window;
          rec.windowRank = isInWindow(normalized.weeksPostpartum, dosingWindow) ? 0 : 1;
        }

        // ----- Hybrid final sort: isCovered (true first) -> priority asc -> windowRank asc -----
        recommendations.sort(function (a, b) {
          if (a.isCovered !== b.isCovered) return a.isCovered ? -1 : 1;
          const pa = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 99;
          const pb = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 99;
          if (pa !== pb) return pa - pb;
          return (a.windowRank != null ? a.windowRank : 99) - (b.windowRank != null ? b.windowRank : 99);
        });

        const fundingStrategy = buildFundingStrategy(
          recommendations,
          normalized.coverage,
          normalized.hsaBalance,
          totalCovered
        );

        return {
          normalized: normalized,
          eligibleServiceIds: eligibleServiceIds,
          recommendations: recommendations,
          totalCovered: totalCovered,
          totalRecommendedCost: totalRecommendedCost,
          fundingStrategy: fundingStrategy,
          detectedConcerns: detectedConcerns
        };
      }

      // === END ENGINE ===

      const STORAGE_KEY = 'ap_benefits_state';
      const CONSULT_URL = 'https://www.almacare.ca/booking/book-a-call';
      const BRAND_MARK_SVG = '<svg class="ap-pdf__brand-mark" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15.8824 14.5159C14.0886 17.1544 10.1939 18.5457 6.90264 17.7997C3.30689 16.9828 0.583086 14.1157 0.0875972 10.6277C-0.421732 7.01991 1.37476 4.02478 3.28198 2.71508C0.488969 7.14516 2.19411 11.6488 4.71862 13.8897C7.49225 16.3511 12.007 17.0917 15.8796 14.5159H15.8824Z" fill="#032215"/><path d="M13.6596 12.5698C14.6445 6.75767 10.9451 1.31856 5.0865 0.120987C6.70739 -0.484559 10.4709 1.2672 12.3094 3.49745C14.9318 6.67386 14.7895 10.6288 13.6596 12.5698Z" fill="#032215"/><path d="M6.6478 12.9721C6.53855 12.2334 6.52735 11.5002 5.96711 10.9288C5.40687 10.3573 4.66735 10.3462 3.94463 10.2235C4.67855 10.1734 5.38726 10.1148 5.9531 9.56288C6.52735 8.99979 6.53295 8.26388 6.63939 7.5419C6.69822 8.26945 6.72623 8.99422 7.28367 9.55173C7.84671 10.1176 8.56662 10.1901 9.34256 10.2263C7.51897 10.2542 6.58057 11.1211 6.6478 12.9693V12.9721Z" fill="#032215"/><path d="M11.2618 13.1732C11.0609 12.6421 10.7672 12.2888 10.3806 12.113C10.9121 11.9096 11.0041 11.8036 11.2411 11.0615C11.3447 11.6632 11.6092 12.007 12.1453 12.0987C11.6599 12.2649 11.3147 12.5084 11.2618 13.1732Z" fill="#032215"/><path d="M9.82793 7.54503C9.85348 7.57322 9.92647 7.67343 10.0214 7.75485C10.1162 7.83627 10.233 7.89577 10.2768 7.92395C10.0651 8.08053 9.84253 8.24338 9.62356 8.40622C9.69655 8.41875 9.76589 8.4344 9.83888 8.44693C9.63451 8.26217 9.4265 8.0774 9.34256 7.99911C9.43015 7.91769 9.61991 7.73919 9.82793 7.5419V7.54503Z" fill="#032215"/></svg>';
      const HUBSPOT = {
        portalId: 'TODO_FILL_IN',
        formId: 'TODO_FILL_IN'
      };

      // Lightweight analytics: fires through Plausible and/or GA when present,
      // falls back to console.log in dev when neither is loaded. No PII allowed
      // in props — keep these to enums, counts, and booleans.
      function track(event, props) {
        const safeProps = props || {};
        try {
          if (typeof window.plausible === 'function') {
            window.plausible(event, { props: safeProps });
          }
        } catch (e) { /* swallow */ }
        try {
          if (typeof window.gtag === 'function') {
            window.gtag('event', event, safeProps);
          }
        } catch (e) { /* swallow */ }
        // Dev visibility — only when neither analytics lib is present
        if (typeof window.plausible !== 'function' && typeof window.gtag !== 'function') {
          if (window.console) console.log('[track]', event, safeProps);
        }
      }

      const state = {
        dueDate: null,
        isPostpartum: false,
        weeksPostpartum: null,
        firstTimeParent: null,
        concerns: '',
        insurer: null,
        hasHsa: null,
        hsaBalance: null,
        coverage: {},
        results: null,
        lead: {
          name: '',
          email: '',
          address: '',
          leadConcerns: ''
        }
      };

      let currentStep = 1;
      const TOTAL_STEPS = 3;
      const SERVICE_IDS = [
        'massage_therapy',
        'acupuncture',
        'lactation_consulting',
        'postpartum_doula_care',
        'registered_nursing',
        'psw',
        'mental_health',
        'nutritionist'
      ];

      // ---------- Element refs ----------
      const dueDateInput = document.getElementById('ap-due-date');
      const dueDateField = document.getElementById('ap-due-date-field');
      const weeksInput = document.getElementById('ap-weeks-postpartum');
      const weeksField = document.getElementById('ap-weeks-postpartum-field');
      const concernsInput = document.getElementById('ap-concerns');
      const postpartumToggle = document.getElementById('ap-postpartum-toggle');
      const firstTimeButtons = document.querySelectorAll('[data-toggle="firstTimeParent"]');
      const insurerSelect = document.getElementById('ap-insurer');
      const hsaButtons = document.querySelectorAll('[data-toggle="hasHsa"]');
      const hsaBalanceField = document.getElementById('ap-hsa-balance-field');
      const hsaBalanceInput = document.getElementById('ap-hsa-balance');
      const hsaInfoBtn = document.getElementById('ap-hsa-info-btn');
      const hsaTooltip = document.getElementById('ap-hsa-tooltip');
      const continueBtn = document.querySelector('.ap-nav .ap-btn--continue');
      const backBtn = document.querySelector('.ap-btn--back');
      const progressLabel = document.querySelector('.ap-progress__label');
      const progressBar = document.querySelector('.ap-progress__bar');
      const progressSegments = document.querySelectorAll('.ap-progress__segment');
      const progressHeader = document.querySelector('.ap-progress');
      const serviceCards = document.querySelectorAll('.ap-service-card');
      const coverageInputs = document.querySelectorAll('[data-coverage-field]');
      const coverageHelpTrigger = document.getElementById('ap-coverage-help-trigger');
      const coverageModal = document.getElementById('ap-coverage-modal');
      const coverageModalClose = document.getElementById('ap-coverage-modal-close');

      // ---------- Set max on due date input (1 year from today) ----------
      function setDueDateMax() {
        const today = new Date();
        const maxDate = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
        const yyyy = maxDate.getFullYear();
        const mm = String(maxDate.getMonth() + 1).padStart(2, '0');
        const dd = String(maxDate.getDate()).padStart(2, '0');
        dueDateInput.setAttribute('max', `${yyyy}-${mm}-${dd}`);
      }

      // ---------- Set min on due date input (today) ----------
      // Prevents picking a past date in the UI. The engine still auto-flips
      // past dates to postpartum as a safety net for any path that bypasses
      // the picker (e.g. hydrated state).
      function setDueDateMin() {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dueDateInput.setAttribute('min', `${yyyy}-${mm}-${dd}`);
      }

      // ---------- Persistence ----------
      function loadState() {
        try {
          const saved = sessionStorage.getItem(STORAGE_KEY);
          if (saved) Object.assign(state, JSON.parse(saved));
        } catch (e) { /* sessionStorage unavailable — silent fail */ }
        // Ensure lead object exists even if persisted state predates it.
        if (!state.lead || typeof state.lead !== 'object') {
          state.lead = { name: '', email: '', address: '', leadConcerns: '' };
        } else {
          state.lead.name = state.lead.name || '';
          state.lead.email = state.lead.email || '';
          state.lead.address = state.lead.address || '';
          state.lead.leadConcerns = state.lead.leadConcerns || '';
        }
      }

      function saveState() {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* silent */ }
      }

      // ---------- UI updates ----------
      // `opts.clearOther` clears the value of the field we're switching *away* from.
      // We pass false during hydration so persisted values aren't wiped on reload.
      function togglePostpartum(toPostpartum, opts) {
        const clearOther = !opts || opts.clearOther !== false;
        state.isPostpartum = !!toPostpartum;
        if (state.isPostpartum) {
          dueDateField.classList.add('ap-hidden');
          weeksField.classList.remove('ap-hidden');
          postpartumToggle.innerHTML = 'Still expecting? <strong>Switch back</strong>';
          if (clearOther) {
            state.dueDate = null;
            dueDateInput.value = '';
          }
        } else {
          dueDateField.classList.remove('ap-hidden');
          weeksField.classList.add('ap-hidden');
          postpartumToggle.innerHTML = 'Already had your baby? <strong>Switch to postpartum</strong>';
          if (clearOther) {
            state.weeksPostpartum = null;
            weeksInput.value = '';
          }
        }
        // Move the toggle link into whichever field is currently visible
        const visibleField = state.isPostpartum ? weeksField : dueDateField;
        const footer = postpartumToggle.parentElement;
        if (footer && footer.classList.contains('ap-field__footer') && footer.parentElement !== visibleField) {
          visibleField.appendChild(footer);
        }
        postpartumToggle.setAttribute('aria-pressed', String(state.isPostpartum));
        saveState();
        updateContinueButton();
      }

      // Visual-only update for the first-time-parent toggle. Called by
      // selectFirstTimeParent (after state mutation) and by hydrateUI (to
      // avoid a redundant saveState write on page load).
      function applyFirstTimeParentUI(value) {
        firstTimeButtons.forEach((btn) => {
          const btnValue = btn.getAttribute('data-value') === 'true';
          const isSelected = btnValue === value;
          btn.classList.toggle('ap-toggle--selected', isSelected);
          btn.setAttribute('aria-pressed', String(isSelected));
        });
      }

      function selectFirstTimeParent(value) {
        state.firstTimeParent = value;
        applyFirstTimeParentUI(value);
        saveState();
        updateContinueButton();
      }

      // Visual-only update for the HSA toggle. Mirrors applyFirstTimeParentUI:
      // hydrateUI calls this directly to avoid a redundant saveState write.
      function applyHsaUI(value) {
        hsaButtons.forEach((btn) => {
          const isSelected = btn.getAttribute('data-value') === value;
          btn.classList.toggle('ap-toggle--selected', isSelected);
          btn.setAttribute('aria-pressed', String(isSelected));
        });
      }

      // Show/hide the HSA balance input. When hiding, also clear the value
      // so a stale balance can't survive a switch to "no" or "not sure".
      function applyHsaBalanceVisibility(value) {
        if (value === 'yes') {
          hsaBalanceField.classList.remove('ap-hidden');
        } else {
          hsaBalanceField.classList.add('ap-hidden');
          state.hsaBalance = null;
          hsaBalanceInput.value = '';
        }
      }

      function selectHsa(value) {
        state.hasHsa = value;
        applyHsaUI(value);
        applyHsaBalanceVisibility(value);
        saveState();
        updateContinueButton();
      }

      // ---------- Coverage (step 3) ----------
      function findCard(serviceId) {
        return document.querySelector(`.ap-service-card[data-service="${serviceId}"]`);
      }

      function findDetail(serviceId) {
        return document.querySelector(`[data-coverage-detail="${serviceId}"]`);
      }

      function setCardChecked(serviceId, isChecked) {
        const card = findCard(serviceId);
        const detail = findDetail(serviceId);
        if (!card || !detail) return;
        card.setAttribute('aria-checked', String(isChecked));
        detail.classList.toggle('ap-hidden', !isChecked);
      }

      function setCoverageInputValue(serviceId, field, value) {
        const input = document.querySelector(
          `[data-coverage-field="${field}"][data-service="${serviceId}"]`
        );
        if (!input) return;
        input.value = value == null ? '' : value;
      }

      function clearCoverageInputs(serviceId) {
        setCoverageInputValue(serviceId, 'amount', null);
        setCoverageInputValue(serviceId, 'perVisitCap', null);
        setCoverageInputValue(serviceId, 'reimbursementPercent', null);
      }

      function toggleService(serviceId) {
        if (!state.coverage) state.coverage = {};
        const isChecked = Object.prototype.hasOwnProperty.call(state.coverage, serviceId);
        if (isChecked) {
          delete state.coverage[serviceId];
          setCardChecked(serviceId, false);
          clearCoverageInputs(serviceId);
        } else {
          state.coverage[serviceId] = { amount: null, perVisitCap: null, reimbursementPercent: 100 };
          setCardChecked(serviceId, true);
          setCoverageInputValue(serviceId, 'reimbursementPercent', 100);
        }
        saveState();
        updateContinueButton();
      }

      function updateCoverageField(serviceId, field, rawValue) {
        if (!state.coverage || !state.coverage[serviceId]) return;
        let parsed;
        if (rawValue === '' || rawValue == null) {
          parsed = null;
        } else {
          const num = parseFloat(rawValue);
          parsed = Number.isNaN(num) ? null : num;
        }
        state.coverage[serviceId][field] = parsed;
        saveState();
        updateContinueButton();
      }

      // Sync DOM to state.coverage. Used by hydrateUI on load.
      function applyCoverageUI() {
        SERVICE_IDS.forEach((serviceId) => {
          const entry = state.coverage ? state.coverage[serviceId] : null;
          const isChecked = !!entry;
          setCardChecked(serviceId, isChecked);
          if (isChecked) {
            setCoverageInputValue(serviceId, 'amount', entry.amount);
            setCoverageInputValue(serviceId, 'perVisitCap', entry.perVisitCap);
            setCoverageInputValue(
              serviceId,
              'reimbursementPercent',
              entry.reimbursementPercent == null ? '' : entry.reimbursementPercent
            );
          } else {
            clearCoverageInputs(serviceId);
          }
        });
      }

      function isCoverageValidForContinue() {
        // Empty coverage map is valid (zero-coverage path).
        const keys = state.coverage ? Object.keys(state.coverage) : [];
        if (keys.length === 0) return true;
        // Every checked service must have a positive amount.
        return keys.every((id) => {
          const entry = state.coverage[id];
          return entry && typeof entry.amount === 'number' && entry.amount > 0;
        });
      }

      function hasValidTimingAnswer() {
        if (state.isPostpartum) {
          return typeof state.weeksPostpartum === 'number' && !Number.isNaN(state.weeksPostpartum);
        }
        return !!state.dueDate;
      }

      function updateContinueButton() {
        let canContinue;
        if (currentStep === 1) {
          canContinue = hasValidTimingAnswer() && state.firstTimeParent !== null;
        } else if (currentStep === 2) {
          canContinue = !!state.insurer;
        } else if (currentStep === 3) {
          canContinue = isCoverageValidForContinue();
        } else {
          canContinue = true;
        }
        continueBtn.disabled = !canContinue;
      }

      function hydrateUI() {
        dueDateInput.value = state.dueDate || '';
        weeksInput.value = state.weeksPostpartum != null ? state.weeksPostpartum : '';
        concernsInput.value = state.concerns || '';
        if (state.isPostpartum) togglePostpartum(true, { clearOther: false });
        if (state.firstTimeParent !== null) applyFirstTimeParentUI(state.firstTimeParent);
        // Step 2
        insurerSelect.value = state.insurer || '';
        if (state.hasHsa !== null) applyHsaUI(state.hasHsa);
        if (state.hasHsa === 'yes') {
          hsaBalanceField.classList.remove('ap-hidden');
        } else {
          hsaBalanceField.classList.add('ap-hidden');
        }
        hsaBalanceInput.value = state.hsaBalance != null ? state.hsaBalance : '';
        // Step 3
        applyCoverageUI();
        updateContinueButton();
      }

      // ---------- Navigation ----------
      // n=4 corresponds to the results section (#ap-results), which is beyond
      // intake. Progress bar hides and the wizard nav remains for back-to-edit.
      function goToStep(n) {
        if (n < 1 || n > TOTAL_STEPS + 1) return;
        // Hide all step sections, then reveal the target one.
        document.querySelectorAll('.ap-step').forEach((el) => el.classList.remove('ap-step--active'));
        const nextEl = n > TOTAL_STEPS
          ? document.getElementById('ap-results')
          : document.getElementById(`ap-step-${n}`);
        if (nextEl) nextEl.classList.add('ap-step--active');
        currentStep = n;

        // Progress bar: visible during intake, hidden on results.
        if (n > TOTAL_STEPS) {
          progressHeader.classList.add('ap-hidden');
        } else {
          progressHeader.classList.remove('ap-hidden');
          progressLabel.textContent = `Step ${n} of ${TOTAL_STEPS}`;
          progressBar.setAttribute('aria-valuenow', String(n));
          progressSegments.forEach((seg, i) => {
            if (i < n) {
              seg.classList.add('ap-progress__segment--active');
            } else {
              seg.classList.remove('ap-progress__segment--active');
            }
          });
        }

        // Continue label changes on the final intake step.
        if (n === 3) {
          continueBtn.textContent = 'See my care plan →';
        } else {
          continueBtn.textContent = 'Continue assessment';
        }

        // Back disabled on step 1
        backBtn.disabled = n === 1;

        // Continue requirement is step-specific; updateContinueButton reads
        // currentStep to apply the right gating.
        updateContinueButton();

        // Scroll the embed back to the top so the user sees the new step's
        // heading, not whatever was visible at the bottom of the previous
        // step. Honor prefers-reduced-motion.
        const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const appEl = document.querySelector('.ap-app');
        if (appEl && appEl.scrollIntoView) {
          appEl.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
        }
      }

      // ---------- Event wiring ----------
      dueDateInput.addEventListener('change', (e) => {
        state.dueDate = e.target.value || null;
        saveState();
        updateContinueButton();
      });

      weeksInput.addEventListener('input', (e) => {
        const raw = e.target.value;
        if (raw === '') {
          state.weeksPostpartum = null;
        } else {
          const num = parseInt(raw, 10);
          state.weeksPostpartum = Number.isNaN(num) ? null : num;
        }
        saveState();
        updateContinueButton();
      });

      concernsInput.addEventListener('input', (e) => {
        state.concerns = e.target.value;
        saveState();
      });

      postpartumToggle.addEventListener('click', () => {
        togglePostpartum(!state.isPostpartum);
      });

      firstTimeButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const value = btn.getAttribute('data-value') === 'true';
          selectFirstTimeParent(value);
        });
      });

      insurerSelect.addEventListener('change', (e) => {
        state.insurer = e.target.value || null;
        saveState();
        updateContinueButton();
      });

      hsaButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          selectHsa(btn.getAttribute('data-value'));
        });
      });

      hsaBalanceInput.addEventListener('input', (e) => {
        const raw = e.target.value;
        if (raw === '') {
          state.hsaBalance = null;
        } else {
          const num = parseFloat(raw);
          state.hsaBalance = Number.isNaN(num) ? null : num;
        }
        saveState();
      });

      // Tooltip: toggle visibility on click; close on outside click or Escape.
      function closeHsaTooltip() {
        hsaTooltip.classList.add('ap-hidden');
        hsaInfoBtn.setAttribute('aria-expanded', 'false');
      }

      hsaInfoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = !hsaTooltip.classList.contains('ap-hidden');
        if (isOpen) {
          closeHsaTooltip();
        } else {
          hsaTooltip.classList.remove('ap-hidden');
          hsaInfoBtn.setAttribute('aria-expanded', 'true');
        }
      });

      document.addEventListener('click', (e) => {
        if (hsaTooltip.classList.contains('ap-hidden')) return;
        if (e.target === hsaInfoBtn || hsaTooltip.contains(e.target)) return;
        closeHsaTooltip();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !hsaTooltip.classList.contains('ap-hidden')) {
          closeHsaTooltip();
          hsaInfoBtn.focus();
        }
      });

      continueBtn.addEventListener('click', () => {
        if (continueBtn.disabled) return;
        if (currentStep === TOTAL_STEPS) {
          // Final intake step → run engine, render panels, then advance.
          state.results = computeResults(state, RULES, ALMA_SERVICES, new Date());
          track('intake_step_completed', { step: currentStep });
          renderResults(state.results);
          track('results_viewed', {
            recommendations_count: state.results.recommendations.length,
            total_covered: state.results.totalCovered,
            has_concerns: state.results.detectedConcerns.length > 0
          });
          if (state.results.detectedConcerns.length > 0) {
            track('concerns_detected', {
              tags: state.results.detectedConcerns.join(',')
            });
          }
          goToStep(TOTAL_STEPS + 1);
        } else if (currentStep < TOTAL_STEPS) {
          track('intake_step_completed', { step: currentStep });
          goToStep(currentStep + 1);
        }
      });

      backBtn.addEventListener('click', () => {
        if (backBtn.disabled) return;
        if (currentStep > 1) goToStep(currentStep - 1);
      });

      // ---------- Landing → Begin assessment ----------
      const beginBtn = document.getElementById('ap-landing-begin');
      const landingEl = document.getElementById('ap-landing');
      const assessmentEl = document.getElementById('ap-assessment');
      if (beginBtn && landingEl && assessmentEl) {
        beginBtn.addEventListener('click', function () {
          landingEl.classList.add('ap-landing--hidden');
          assessmentEl.classList.remove('ap-assessment--hidden');
          if (typeof track === 'function') track('assessment_started');
          const firstFocusable = document.querySelector('#ap-step-1 input, #ap-step-1 button:not([disabled]), #ap-step-1 select');
          if (firstFocusable) firstFocusable.focus();
        });
      }

      // ---------- Service cards (step 3) ----------
      serviceCards.forEach((card) => {
        card.addEventListener('click', () => {
          const serviceId = card.getAttribute('data-service');
          if (serviceId) toggleService(serviceId);
        });
        // Spacebar/Enter on the button already fires `click`; nothing extra needed.
      });

      coverageInputs.forEach((input) => {
        input.addEventListener('input', (e) => {
          const serviceId = input.getAttribute('data-service');
          const field = input.getAttribute('data-coverage-field');
          updateCoverageField(serviceId, field, e.target.value);
        });
      });

      // ---------- Coverage help modal ----------
      let modalLastFocus = null;

      function openCoverageModal() {
        modalLastFocus = document.activeElement;
        coverageModal.hidden = false;
        // Move focus to the close button for keyboard users.
        coverageModalClose.focus();
      }

      function closeCoverageModal() {
        if (coverageModal.hidden) return;
        coverageModal.hidden = true;
        if (modalLastFocus && typeof modalLastFocus.focus === 'function') {
          modalLastFocus.focus();
        }
        modalLastFocus = null;
      }

      coverageHelpTrigger.addEventListener('click', openCoverageModal);
      coverageModalClose.addEventListener('click', closeCoverageModal);

      // Click on the dim overlay (but not the card) closes the modal.
      coverageModal.addEventListener('click', (e) => {
        if (e.target === coverageModal) closeCoverageModal();
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !coverageModal.hidden) {
          closeCoverageModal();
        }
      });

      // ---------- Results rendering ----------
      function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function dosingLine(dosing) {
        if (!dosing) return '';
        const sessions = dosing.sessions;
        const win = dosing.window;
        if (sessions && win) return sessions + ' session' + (sessions === 1 ? '' : 's') + ' — ' + win;
        if (sessions) return sessions + ' session' + (sessions === 1 ? '' : 's');
        if (win) return win;
        return '';
      }

      function renderSnapshot(results) {
        const total = results.totalCovered || 0;
        const heroHtml = total > 0
          ? '<div class="ap-snapshot-hero">' + formatMoney(total) + ' in benefits to use</div>'
          : '<div class="ap-snapshot-hero ap-snapshot-hero--muted">No extended benefits — that\'s okay.</div>';

        const showHsa = state.hasHsa === 'yes'
          && typeof state.hsaBalance === 'number'
          && state.hsaBalance > 0;
        const hsaHtml = showHsa
          ? '<div class="ap-hsa-callout">+ ' + formatMoney(state.hsaBalance) + ' flexible HSA spend</div>'
          : '';

        const coveredIds = Object.keys(state.coverage || {});
        const coveredItems = coveredIds.map(function (id) {
          const entry = state.coverage[id];
          const amount = entry && typeof entry.amount === 'number' ? entry.amount : 0;
          const name = SERVICE_NAMES[id] || id;
          return '<li><span class="ap-coverage-list__check">✓</span>'
            + escapeHtml(name) + ' — ' + formatMoney(amount) + '</li>';
        }).join('');

        const notCovered = ALMA_SERVICES.filter(function (id) { return coveredIds.indexOf(id) === -1; });
        const notCoveredItems = notCovered.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          return '<li class="ap-coverage-list__item--muted"><span class="ap-coverage-list__dash">—</span>'
            + escapeHtml(name) + '</li>';
        }).join('');

        const coveredColHtml = coveredItems
          ? '<div class="ap-coverage-list__column"><h3>What\'s covered</h3><ul>' + coveredItems + '</ul></div>'
          : '<div class="ap-coverage-list__column"><h3>What\'s covered</h3><ul><li class="ap-coverage-list__item--muted">Nothing selected.</li></ul></div>';

        const notCoveredColHtml = notCoveredItems
          ? '<div class="ap-coverage-list__column"><h3>What\'s not covered</h3><ul>' + notCoveredItems + '</ul></div>'
          : '';

        return (
          '<section class="ap-panel ap-panel--snapshot">'
          + '<h2>Your coverage at a glance</h2>'
          + heroHtml
          + hsaHtml
          + '<div class="ap-coverage-list">' + coveredColHtml + notCoveredColHtml + '</div>'
          + '</section>'
        );
      }

      function renderCostBreakdown(rec) {
        const rows = [];
        rows.push(
          '<div class="ap-cost-breakdown__row ap-cost-breakdown__row--total">'
          + '<span>Estimated total</span><span>' + formatMoney(rec.totalCost || 0) + '</span></div>'
        );
        if ((rec.covered || 0) > 0) {
          rows.push(
            '<div class="ap-cost-breakdown__row ap-cost-breakdown__row--covered">'
            + '<span>Covered by insurance</span><span>' + formatMoney(rec.covered) + '</span></div>'
          );
        }
        if ((rec.fromHsa || 0) > 0) {
          rows.push(
            '<div class="ap-cost-breakdown__row ap-cost-breakdown__row--covered">'
            + '<span>From HSA</span><span>' + formatMoney(rec.fromHsa) + '</span></div>'
          );
        }
        if ((rec.outOfPocket || 0) > 0) {
          rows.push(
            '<div class="ap-cost-breakdown__row ap-cost-breakdown__row--oop">'
            + '<span>Out-of-pocket</span><span>' + formatMoney(rec.outOfPocket) + '</span></div>'
          );
        }
        return '<div class="ap-cost-breakdown">' + rows.join('') + '</div>';
      }

      function renderIntro(/* results */) {
        return (
          '<header class="ap-results__intro">'
          + '<h2>You may have more support available to you than you think.</h2>'
          + '<p>Based on your responses, there appear to be several potential pathways to offset postpartum care through extended health benefits and/or HSA funding. We\'ve outlined the options most relevant to your stage of recovery and care goals below.</p>'
          + '</header>'
        );
      }

      function renderRecCard(rec, rank) {
        const name = SERVICE_NAMES[rec.service] || rec.service;
        const initial = (name || '').trim().charAt(0).toUpperCase();
        const badgeHtml = (typeof rank === 'number')
          ? '<div class="ap-rec-card__rank" aria-hidden="true">' + rank + '</div>'
          : '<div class="ap-rec-card__icon" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        return (
          '<div class="ap-rec-card">'
          + badgeHtml
          + '<div class="ap-rec-card__body">'
          + '<div class="ap-rec-card__title">' + escapeHtml(name) + '</div>'
          + (dosingLine(rec.dosing)
              ? '<div class="ap-rec-card__dosing">' + escapeHtml(dosingLine(rec.dosing)) + '</div>'
              : '')
          + (rec.concernCallout
              ? '<p class="ap-rec-card__callout">Based on what you shared, we’d especially encourage this.</p>'
              : '')
          + '<div class="ap-rec-card__rationale">' + escapeHtml(rec.rationale || '') + '</div>'
          + renderCostBreakdown(rec)
          + '</div>'
          + '</div>'
        );
      }

      function renderPlan(results) {
        const recs = results.recommendations || [];
        let body;
        if (recs.length === 0) {
          body = '<p class="ap-empty-rec">We didn\'t have enough info to build personalized recommendations — book a free consult and we\'ll walk through your options together.</p>';
        } else {
          const topThree = recs.slice(0, 3);
          const rest = recs.slice(3);
          body = topThree.map(function (rec, i) { return renderRecCard(rec, i + 1); }).join('');
          if (rest.length) {
            body += '<details class="ap-recs__more">';
            body += '<summary>See additional recommendations</summary>';
            body += rest.map(function (rec, i) { return renderRecCard(rec, i + 4); }).join('');
            body += '</details>';
          }
        }
        return (
          '<section class="ap-panel ap-panel--plan">'
          + '<h2>Your highest-priority postpartum supports</h2>'
          + body
          + '</section>'
        );
      }

      function renderHsaEligible(/* results */) {
        const coveredIds = Object.keys(state.coverage || {});
        const uncovered = ALMA_SERVICES.filter(function (id) { return coveredIds.indexOf(id) === -1; });
        if (uncovered.length === 0) return '';
        return (
          '<section class="ap-hsa">'
          + '<h2>Additional services that may be eligible through your HSA</h2>'
          + '<p>Even when a practitioner category is not included in your extended health benefits, many families are still able to use Health Spending Account (HSA) funds toward eligible care providers. Depending on your plan, this may include:</p>'
          + '<ul>'
          + '<li>Private duty nursing</li>'
          + '<li>Nursing-led postpartum support</li>'
          + '<li>Lactation support provided by eligible practitioners</li>'
          + '<li>Select wellness and recovery services</li>'
          + '</ul>'
          + '<p class="ap-hsa__footnote">We recommend confirming practitioner eligibility directly with your benefits provider before booking care.</p>'
          + '</section>'
        );
      }

      function renderWhatHappensNext() {
        return (
          '<section class="ap-next">'
          + '<h2>What happens next</h2>'
          + '<ol>'
          + '<li>Complete your coverage assessment</li>'
          + '<li>Review your personalized care recommendations</li>'
          + '<li>Speak with an Alma Care specialist</li>'
          + '<li>Build a postpartum support plan tailored to your family</li>'
          + '<li>Begin care with trusted practitioners and guidance on eligible reimbursement pathways</li>'
          + '</ol>'
          + '</section>'
        );
      }

      function renderNavigateDetails() {
        return (
          '<section class="ap-navigate">'
          + '<h2>We help families navigate the details</h2>'
          + '<p>Our team regularly helps families:</p>'
          + '<ul>'
          + '<li>Understand eligible practitioner categories</li>'
          + '<li>Maximize extended health benefits</li>'
          + '<li>Utilize HSA and wellness spending accounts</li>'
          + '<li>Prepare documentation for reimbursement</li>'
          + '<li>Coordinate layered postpartum support plans</li>'
          + '</ul>'
          + '</section>'
        );
      }

      function renderEmotionalPermission() {
        return (
          '<section class="ap-permission">'
          + '<h2>Support is not a luxury during postpartum recovery</h2>'
          + '<p>Families often prepare extensively for birth — but far less for recovery, healing, feeding support, sleep, and the realities of the first weeks at home. Increasingly, families are choosing to include postpartum care support as part of their baby registry, allowing loved ones to contribute meaningfully to recovery and wellbeing during one of life\'s most important transitions.</p>'
          + '</section>'
        );
      }

      function renderFunding(results) {
        const lines = results.fundingStrategy || [];
        const items = lines.length === 0
          ? '<li>Speak with our care team for a personalized funding plan.</li>'
          : lines.map(function (line) {
              return '<li>' + escapeHtml(line) + '</li>';
            }).join('');
        return (
          '<section class="ap-panel ap-panel--funding">'
          + '<h2>How to fund your care</h2>'
          + '<ul class="ap-funding-list">' + items + '</ul>'
          + '</section>'
        );
      }

      function renderFinalCta() {
        return (
          '<section class="ap-final-cta">'
          + '<h2>Review your options with an Alma Care specialist</h2>'
          + '<p>Our team can help you:</p>'
          + '<ul>'
          + '<li>Understand eligible coverage pathways</li>'
          + '<li>Maximize HSA utilization</li>'
          + '<li>Navigate documentation requirements</li>'
          + '<li>Build a personalized postpartum support plan</li>'
          + '</ul>'
          + '<div class="ap-cta-row">'
          + '<a class="ap-btn ap-btn--primary" id="ap-consult-cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a free consult</a>'
          + '<button type="button" class="ap-btn ap-btn--secondary" id="ap-email-plan">Email me my care plan</button>'
          + '</div>'
          + '</section>'
          + renderLeadDrawer()
        );
      }

      function renderTrustStrip() {
        return (
          '<aside class="ap-trust">'
          + '<div class="ap-trust__item"><strong>Trusted postpartum professionals</strong></div>'
          + '<div class="ap-trust__item"><strong>Personalized practitioner matching</strong></div>'
          + '<div class="ap-trust__item"><strong>Guided care coordination across Canada</strong></div>'
          + '</aside>'
        );
      }

      function renderLeadDrawer() {
        return (
          '<section id="ap-lead-drawer" class="ap-panel ap-panel--lead ap-hidden">'
          + '<h2>Send your care plan</h2>'
          + '<p>We\'ll email you a branded PDF estimate you can use for insurance pre-approval, and our care team will follow up.</p>'
          + '<form id="ap-lead-form" novalidate>'
          + '<div class="ap-field">'
          + '<label for="ap-lead-name">Your name</label>'
          + '<input type="text" id="ap-lead-name" name="name" autocomplete="name" required>'
          + '</div>'
          + '<div class="ap-field">'
          + '<label for="ap-lead-email">Email</label>'
          + '<input type="email" id="ap-lead-email" name="email" autocomplete="email" inputmode="email" required>'
          + '</div>'
          + '<div class="ap-field">'
          + '<label for="ap-lead-address">Address (for the PDF letterhead)</label>'
          + '<input type="text" id="ap-lead-address" name="address" autocomplete="street-address" required>'
          + '</div>'
          + '<div class="ap-field">'
          + '<label for="ap-lead-concerns">Anything else we should know? <span class="ap-optional">(optional)</span></label>'
          + '<textarea id="ap-lead-concerns" name="leadConcerns" rows="3"></textarea>'
          + '</div>'
          + '<p class="ap-privacy">We\'ll only use this to send your plan and follow up about your care. No spam.</p>'
          + '<button type="submit" class="ap-btn ap-lead-submit">Send me my care plan</button>'
          + '<p class="ap-print-tip">Tip: in the print dialog, expand "More settings" and uncheck "Headers and footers" for a cleaner PDF.</p>'
          + '<p id="ap-lead-status" class="ap-lead-status" aria-live="polite"></p>'
          + '</form>'
          + '</section>'
        );
      }

      // ---------- Lead capture form ----------
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      function openLeadDrawer() {
        const drawer = document.getElementById('ap-lead-drawer');
        if (!drawer) return;
        drawer.classList.remove('ap-hidden');

        const nameInput = document.getElementById('ap-lead-name');
        const emailInput = document.getElementById('ap-lead-email');
        const addressInput = document.getElementById('ap-lead-address');
        const concernsTextarea = document.getElementById('ap-lead-concerns');

        if (nameInput) nameInput.value = state.lead.name || '';
        if (emailInput) emailInput.value = state.lead.email || '';
        if (addressInput) addressInput.value = state.lead.address || '';
        // Concerns textarea pre-fills from state.concerns if leadConcerns is empty,
        // otherwise keep what they previously typed in the drawer.
        if (concernsTextarea) {
          const existing = state.lead.leadConcerns;
          concernsTextarea.value = existing && existing.length > 0
            ? existing
            : (state.concerns || '');
          // Sync state so what's shown is also what we submit.
          state.lead.leadConcerns = concernsTextarea.value;
          saveState();
        }

        if (nameInput && typeof nameInput.focus === 'function') nameInput.focus();
      }

      function clearLeadInvalid() {
        ['ap-lead-name', 'ap-lead-email', 'ap-lead-address'].forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.removeAttribute('aria-invalid');
        });
      }

      function setLeadStatus(message, kind) {
        const status = document.getElementById('ap-lead-status');
        if (!status) return;
        status.textContent = message || '';
        status.classList.remove('ap-lead-status--error', 'ap-lead-status--success');
        if (kind === 'error') status.classList.add('ap-lead-status--error');
        if (kind === 'success') status.classList.add('ap-lead-status--success');
      }

      // ---------- Hubspot submission ----------
      // Coerce any field value to a Hubspot-friendly string. Booleans become
      // 'true'/'false', numbers become numeric strings, null/undefined become ''.
      function hsValue(v) {
        if (v === null || typeof v === 'undefined') return '';
        if (typeof v === 'boolean') return v ? 'true' : 'false';
        if (typeof v === 'number') return String(v);
        return String(v);
      }

      function buildHubspotFields(state) {
        const fullName = (state.lead && state.lead.name) ? state.lead.name.trim() : '';
        const firstName = fullName ? fullName.split(/\s+/)[0] : '';

        // Recompute normalized weeksUntilDue so Hubspot sees the same number
        // the engine used when generating recommendations.
        const normalized = normalizeInputs(state, new Date());
        const weeksUntilDue = typeof normalized.weeksUntilDue === 'number'
          ? normalized.weeksUntilDue
          : '';

        const coverageKeys = state.coverage ? Object.keys(state.coverage) : [];
        const servicesCovered = coverageKeys.join(';');
        const totalCoverageValue = coverageKeys.reduce(function (sum, id) {
          const entry = state.coverage[id];
          const amount = entry && typeof entry.amount === 'number' ? entry.amount : 0;
          return sum + amount;
        }, 0);

        // Combine step-1 concerns with the lead-form concerns when both are
        // present; otherwise use whichever the user actually filled in.
        const stepConcerns = (state.concerns || '').trim();
        const leadConcerns = (state.lead && state.lead.leadConcerns ? state.lead.leadConcerns : '').trim();
        let concernsText = '';
        if (stepConcerns && leadConcerns) {
          concernsText = stepConcerns + '\n\n' + leadConcerns;
        } else if (stepConcerns) {
          concernsText = stepConcerns;
        } else if (leadConcerns) {
          concernsText = leadConcerns;
        }

        const recs = (state.results && state.results.recommendations) || [];
        const recommendedServices = recs
          .map(function (r) { return SERVICE_NAMES[r.service] || r.service; })
          .join(';');
        const recommendedTotalCost = state.results && typeof state.results.totalRecommendedCost === 'number'
          ? state.results.totalRecommendedCost
          : 0;

        return [
          { name: 'firstname',             value: hsValue(firstName) },
          { name: 'email',                 value: hsValue(state.lead && state.lead.email) },
          { name: 'address',               value: hsValue(state.lead && state.lead.address) },
          { name: 'due_date',              value: hsValue(state.dueDate) },
          { name: 'weeks_until_due',       value: hsValue(weeksUntilDue) },
          { name: 'is_postpartum',         value: hsValue(state.isPostpartum) },
          { name: 'weeks_postpartum',      value: hsValue(state.weeksPostpartum) },
          { name: 'first_time_parent',     value: hsValue(state.firstTimeParent) },
          { name: 'insurer',               value: hsValue(state.insurer) },
          { name: 'has_hsa',               value: hsValue(state.hasHsa) },
          { name: 'hsa_balance',           value: hsValue(state.hsaBalance) },
          { name: 'services_covered',      value: hsValue(servicesCovered) },
          { name: 'total_coverage_value',  value: hsValue(totalCoverageValue) },
          { name: 'concerns_text',         value: hsValue(concernsText) },
          { name: 'detected_concerns',     value: hsValue(state.results && state.results.detectedConcerns ? state.results.detectedConcerns.join(';') : '') },
          { name: 'recommended_services',  value: hsValue(recommendedServices) },
          { name: 'recommended_total_cost', value: hsValue(recommendedTotalCost) }
        ];
      }

      async function submitToHubspot(state) {
        if (!HUBSPOT.portalId || HUBSPOT.portalId === 'TODO_FILL_IN' || !HUBSPOT.formId || HUBSPOT.formId === 'TODO_FILL_IN') {
          console.warn('Hubspot config not set — skipping submission');
          return { ok: false, reason: 'not_configured' };
        }

        const fields = buildHubspotFields(state);
        const url = 'https://api.hsforms.com/submissions/v3/integrations/submit/' + HUBSPOT.portalId + '/' + HUBSPOT.formId;

        const payload = {
          fields: fields,
          context: {
            pageUri: window.location.href,
            pageName: 'Benefits Eligibility Tool'
          }
        };

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const errorText = await res.text().catch(function () { return ''; });
          return { ok: false, reason: 'http_error', status: res.status, body: errorText };
        }
        return { ok: true };
      }

      function wireLeadForm() {
        const form = document.getElementById('ap-lead-form');
        if (!form) return;

        const fields = [
          { id: 'ap-lead-name', key: 'name' },
          { id: 'ap-lead-email', key: 'email' },
          { id: 'ap-lead-address', key: 'address' },
          { id: 'ap-lead-concerns', key: 'leadConcerns' }
        ];

        fields.forEach(function (f) {
          const el = document.getElementById(f.id);
          if (!el) return;
          el.addEventListener('input', function (e) {
            state.lead[f.key] = e.target.value;
            saveState();
          });
        });

        form.addEventListener('submit', async function (e) {
          e.preventDefault();
          clearLeadInvalid();

          const nameInput = document.getElementById('ap-lead-name');
          const emailInput = document.getElementById('ap-lead-email');
          const addressInput = document.getElementById('ap-lead-address');
          const submitBtn = form.querySelector('.ap-lead-submit');

          const name = (state.lead.name || '').trim();
          const email = (state.lead.email || '').trim();
          const address = (state.lead.address || '').trim();

          let invalid = false;
          if (!name) { nameInput && nameInput.setAttribute('aria-invalid', 'true'); invalid = true; }
          if (!email || !EMAIL_RE.test(email)) {
            emailInput && emailInput.setAttribute('aria-invalid', 'true');
            invalid = true;
          }
          if (!address) { addressInput && addressInput.setAttribute('aria-invalid', 'true'); invalid = true; }

          if (invalid) {
            setLeadStatus('Please fill all required fields and enter a valid email.', 'error');
            track('submission_failed', { stage: 'validation' });
            return;
          }

          setLeadStatus('Preparing your care plan…', '');
          if (submitBtn) submitBtn.disabled = true;

          // Submit to Hubspot first so the care team is notified even if
          // the user cancels the print dialog.
          let hubspotResult;
          try {
            hubspotResult = await submitToHubspot(state);
          } catch (err) {
            console.error('Hubspot submit failed:', err);
            hubspotResult = { ok: false, reason: 'network_error' };
          }

          // Set the final status message before opening the print dialog
          // (the dialog can block the page momentarily).
          if (hubspotResult && hubspotResult.ok) {
            setLeadStatus('We\'ve shared your details with our care team. Choose "Save as PDF" in the print dialog to download your plan.', 'success');
            track('submission_succeeded', { hubspot_ok: true, hubspot_reason: 'configured' });
          } else if (hubspotResult && hubspotResult.reason === 'not_configured') {
            setLeadStatus('Choose "Save as PDF" in the print dialog to download your plan.', 'success');
            track('submission_succeeded', { hubspot_ok: false, hubspot_reason: 'not_configured' });
          } else {
            setLeadStatus('Choose "Save as PDF" in the print dialog to download your plan. We had trouble notifying our care team — feel free to email care@almacare.ca and we\'ll follow up.', 'success');
            track('submission_succeeded', {
              hubspot_ok: false,
              hubspot_reason: (hubspotResult && hubspotResult.reason) || 'http_error'
            });
          }

          try {
            await printCarePlan();
          } catch (err) {
            console.error('print failed', err);
            setLeadStatus('Something went wrong opening the print dialog. Please try again.', 'error');
            track('submission_failed', { stage: 'print_error' });
          } finally {
            if (submitBtn) submitBtn.disabled = false;
          }
        });
      }

      // ---------- PDF generation ----------
      function formatPdfDate(date) {
        try {
          return new Intl.DateTimeFormat('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
          }).format(date);
        } catch (e) {
          return date.toDateString();
        }
      }

      function renderPdfSnapshot(results) {
        const total = results.totalCovered || 0;
        const heroHtml = total > 0
          ? '<div class="ap-pdf__hero">' + formatMoney(total) + ' in benefits to use</div>'
          : '<div class="ap-pdf__hero ap-pdf__hero--muted">No extended benefits — that\'s okay.</div>';

        const showHsa = state.hasHsa === 'yes'
          && typeof state.hsaBalance === 'number'
          && state.hsaBalance > 0;
        const hsaHtml = showHsa
          ? '<div class="ap-pdf__hsa">+ ' + formatMoney(state.hsaBalance) + ' flexible HSA spend</div>'
          : '';

        const coveredIds = Object.keys(state.coverage || {});
        const coveredItems = coveredIds.map(function (id) {
          const entry = state.coverage[id];
          const amount = entry && typeof entry.amount === 'number' ? entry.amount : 0;
          const name = SERVICE_NAMES[id] || id;
          return '<li>' + escapeHtml(name) + ' — ' + formatMoney(amount) + '</li>';
        }).join('');

        const notCovered = ALMA_SERVICES.filter(function (id) { return coveredIds.indexOf(id) === -1; });
        const notCoveredItems = notCovered.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          return '<li class="muted">' + escapeHtml(name) + '</li>';
        }).join('');

        const coveredCol = coveredItems
          ? '<div class="ap-pdf__cov-col"><h4>What\'s covered</h4><ul>' + coveredItems + '</ul></div>'
          : '<div class="ap-pdf__cov-col"><h4>What\'s covered</h4><ul><li class="muted">Nothing selected.</li></ul></div>';

        const notCoveredCol = notCoveredItems
          ? '<div class="ap-pdf__cov-col"><h4>What\'s not covered</h4><ul>' + notCoveredItems + '</ul></div>'
          : '';

        return (
          '<section class="ap-pdf__panel">'
          + '<h3>Your coverage at a glance</h3>'
          + heroHtml
          + hsaHtml
          + '<div class="ap-pdf__cov-grid">' + coveredCol + notCoveredCol + '</div>'
          + '</section>'
        );
      }

      function renderPdfCostBreakdown(rec) {
        const rows = [];
        rows.push(
          '<div class="ap-pdf__cost-row ap-pdf__cost-row--total">'
          + '<span>Estimated total</span><span>' + formatMoney(rec.totalCost || 0) + '</span></div>'
        );
        if ((rec.covered || 0) > 0) {
          rows.push(
            '<div class="ap-pdf__cost-row ap-pdf__cost-row--covered">'
            + '<span>Covered by insurance</span><span>' + formatMoney(rec.covered) + '</span></div>'
          );
        }
        if ((rec.fromHsa || 0) > 0) {
          rows.push(
            '<div class="ap-pdf__cost-row ap-pdf__cost-row--covered">'
            + '<span>From HSA</span><span>' + formatMoney(rec.fromHsa) + '</span></div>'
          );
        }
        if ((rec.outOfPocket || 0) > 0) {
          rows.push(
            '<div class="ap-pdf__cost-row ap-pdf__cost-row--oop">'
            + '<span>Out-of-pocket</span><span>' + formatMoney(rec.outOfPocket) + '</span></div>'
          );
        }
        return '<div class="ap-pdf__cost">' + rows.join('') + '</div>';
      }

      function renderPdfPlan(results) {
        const recs = results.recommendations || [];
        let body;
        if (recs.length === 0) {
          body = '<p>We didn\'t have enough info to build personalized recommendations — book a free consult and we\'ll walk through your options together.</p>';
        } else {
          body = recs.map(function (rec) {
            const name = SERVICE_NAMES[rec.service] || rec.service;
            const dosing = dosingLine(rec.dosing);
            return (
              '<div class="ap-pdf__rec">'
              + '<div class="ap-pdf__rec-title">' + escapeHtml(name) + '</div>'
              + (dosing ? '<div class="ap-pdf__rec-dosing">' + escapeHtml(dosing) + '</div>' : '')
              + '<div class="ap-pdf__rec-rationale">' + escapeHtml(rec.rationale || '') + '</div>'
              + renderPdfCostBreakdown(rec)
              + '</div>'
            );
          }).join('');
        }
        return (
          '<section class="ap-pdf__panel">'
          + '<h3>Your personalized care plan</h3>'
          + '<p>Recommendations based on your due date, benefits, and what you shared.</p>'
          + body
          + '</section>'
        );
      }

      function renderPdfFunding(results) {
        const lines = results.fundingStrategy || [];
        const items = lines.length === 0
          ? '<li>Speak with our care team for a personalized funding plan.</li>'
          : lines.map(function (line) {
              return '<li>' + escapeHtml(line) + '</li>';
            }).join('');
        return (
          '<section class="ap-pdf__panel">'
          + '<h3>How to fund your care</h3>'
          + '<ul class="ap-pdf__funding">' + items + '</ul>'
          + '</section>'
        );
      }

      function renderPdfSource(results) {
        const today = formatPdfDate(new Date());
        const name = (state.lead.name || '').trim();
        const address = (state.lead.address || '').trim();

        return (
          '<div class="ap-pdf__letterhead">'
          + '<div class="ap-pdf__brand">' + BRAND_MARK_SVG + '<span>Alma Care</span></div>'
          + '<div class="ap-pdf__brand-tag">Postpartum care, personalized</div>'
          + '<div class="ap-pdf__meta">'
          + '<div><strong>Prepared for:</strong> ' + escapeHtml(name) + '</div>'
          + '<div>' + escapeHtml(address) + '</div>'
          + '<div><strong>Date:</strong> ' + escapeHtml(today) + '</div>'
          + '</div>'
          + '</div>'
          + '<h2 class="ap-pdf__heading">Your personalized postpartum care plan</h2>'
          + renderPdfSnapshot(results)
          + renderPdfPlan(results)
          + renderPdfFunding(results)
          + '<div class="ap-pdf__footer">'
          + 'This estimate is based on the information you provided. Actual coverage and pricing may vary. Speak with your benefits provider for confirmation.'
          + '<br>Book your free consult: <span class="ap-pdf__footer-link">almacare.ca/booking/book-a-call</span>'
          + '</div>'
          + '<footer class="ap-pdf__brandline">Alma Care — care@almacare.ca — almacare.ca/benefits</footer>'
        );
      }

      // Native print → "Save as PDF". Populates #ap-print-root with the
      // branded care plan markup and triggers window.print(). The
      // @media print CSS hides everything else on the page so the
      // browser's PDF output is just the care plan.
      function printCarePlan() {
        if (!state.results) {
          return Promise.reject(new Error('No results available to print.'));
        }
        return new Promise(function (resolve) {
          // Remove any stale print root from a prior run.
          const stale = document.getElementById('ap-print-root');
          if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

          const printRoot = document.createElement('div');
          printRoot.id = 'ap-print-root';
          printRoot.innerHTML = renderPdfSource(state.results);
          document.body.appendChild(printRoot);

          // Set a clean document title so Chrome's PDF picker pre-fills with
          // "Alma Care plan — [first name]" instead of the page URL.
          const originalTitle = document.title;
          const leadName = (state.lead && state.lead.name) ? state.lead.name : '';
          const firstName = state.firstName
            || (leadName ? leadName.split(/\s+/)[0] : '')
            || '';
          document.title = 'Alma Care plan' + (firstName ? ' — ' + firstName : '');
          const restoreTitle = function () { document.title = originalTitle; };
          window.addEventListener('afterprint', restoreTitle, { once: true });

          let cleaned = false;
          function cleanup() {
            if (cleaned) return;
            cleaned = true;
            window.removeEventListener('afterprint', cleanup);
            if (printRoot.parentNode) printRoot.parentNode.removeChild(printRoot);
            resolve();
          }
          window.addEventListener('afterprint', cleanup);
          // Safety: some browsers don't fire afterprint reliably. Clean up
          // after 60s no matter what.
          setTimeout(cleanup, 60000);

          // Defer print() one frame so the print root has a chance to lay out.
          requestAnimationFrame(function () {
            window.print();
            track('care_plan_printed', {
              has_recommendations: (state.results.recommendations || []).length > 0
            });
          });
        });
      }

      function renderResults(results) {
        const container = document.getElementById('ap-results');
        if (!container) return;
        container.innerHTML =
          renderSnapshot(results)
          + renderIntro(results)
          + renderPlan(results)
          + renderHsaEligible(results)
          + renderWhatHappensNext()
          + renderNavigateDetails()
          + renderEmotionalPermission()
          + renderFunding(results)
          + renderFinalCta()
          + renderTrustStrip();

        const emailBtn = document.getElementById('ap-email-plan');
        const drawer = document.getElementById('ap-lead-drawer');
        if (emailBtn && drawer) {
          emailBtn.addEventListener('click', function () {
            const isHidden = drawer.classList.contains('ap-hidden');
            if (isHidden) {
              openLeadDrawer();
              emailBtn.textContent = 'Hide';
              track('lead_drawer_opened', { has_results: true });
            } else {
              drawer.classList.add('ap-hidden');
              emailBtn.textContent = 'Email me my care plan';
            }
          });
        }

        const consultBtn = document.getElementById('ap-consult-cta');
        if (consultBtn) {
          consultBtn.addEventListener('click', function () {
            track('consult_cta_clicked', { source: 'results_primary_cta' });
          });
        }

        wireLeadForm();
      }

      // ---------- Init ----------
      setDueDateMax();
      setDueDateMin();
      loadState();
      hydrateUI();
    })();
