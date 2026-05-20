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

      function computeEligibleAmounts(coverage) {
        const out = {};
        if (!coverage) return out;
        for (const serviceId of Object.keys(coverage)) {
          const c = coverage[serviceId];
          if (!c || typeof c.amount !== 'number') continue;
          const pct = typeof c.reimbursementPercent === 'number' ? c.reimbursementPercent : 100;
          out[serviceId] = c.amount * (pct / 100);
        }
        return out;
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

        const recommendations = matched;
        const coverageMap = normalized.coverage || {};
        for (const rec of recommendations) {
          rec.isCovered = !!coverageMap[rec.service];
          const dosingWindow = rec.dosing && rec.dosing.window;
          rec.windowRank = isInWindow(normalized.weeksPostpartum, dosingWindow) ? 0 : 1;
        }

        recommendations.sort(function (a, b) {
          if (a.isCovered !== b.isCovered) return a.isCovered ? -1 : 1;
          const pa = PRIORITY_RANK[a.priority] != null ? PRIORITY_RANK[a.priority] : 99;
          const pb = PRIORITY_RANK[b.priority] != null ? PRIORITY_RANK[b.priority] : 99;
          if (pa !== pb) return pa - pb;
          return (a.windowRank != null ? a.windowRank : 99) - (b.windowRank != null ? b.windowRank : 99);
        });

        const eligibleAmounts = computeEligibleAmounts(normalized.coverage);

        return {
          normalized: normalized,
          eligibleServiceIds: eligibleServiceIds,
          recommendations: recommendations,
          eligibleAmounts: eligibleAmounts,
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
        isPostpartum: null,
        firstTimeParent: null,
        concerns: '',
        insurer: null,
        hasHsa: null,
        hsaBalance: null,
        coverage: {},
        results: null,
        lead: {
          firstName: '',
          lastName: '',
          email: '',
          phone: ''
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
      const dueDateLabel = document.getElementById('ap-due-date-label');
      const concernsInput = document.getElementById('ap-concerns');
      const stageButtons = document.querySelectorAll('[data-toggle="stage"]');
      const firstNameInput = document.getElementById('ap-first-name');
      const lastNameInput = document.getElementById('ap-last-name');
      const emailInput = document.getElementById('ap-email');
      const phoneInput = document.getElementById('ap-phone');
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

      function isoDate(d) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      }

      // Apply date-input min/max constraints based on stage.
      // Pregnant: today → today+1yr. Postpartum: no constraints (past dates allowed).
      function applyDueDateConstraints() {
        if (state.isPostpartum) {
          dueDateInput.removeAttribute('max');
          dueDateInput.removeAttribute('min');
          return;
        }
        const today = new Date();
        const oneYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
        dueDateInput.setAttribute('min', isoDate(today));
        dueDateInput.setAttribute('max', isoDate(oneYear));
      }

      // ---------- Persistence ----------
      function loadState() {
        try {
          const saved = sessionStorage.getItem(STORAGE_KEY);
          if (saved) Object.assign(state, JSON.parse(saved));
        } catch (e) { /* sessionStorage unavailable — silent fail */ }
        // Ensure lead object exists with current shape even if persisted state predates it.
        const fresh = { firstName: '', lastName: '', email: '', phone: '' };
        if (!state.lead || typeof state.lead !== 'object') {
          state.lead = fresh;
        } else {
          state.lead = Object.assign(fresh, {
            firstName: state.lead.firstName || '',
            lastName: state.lead.lastName || '',
            email: state.lead.email || '',
            phone: state.lead.phone || ''
          });
        }
      }

      function saveState() {
        try {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) { /* silent */ }
      }

      // ---------- UI updates ----------
      // Apply a stage selection. `clearDate` is true when the user clicked a
      // stage button (we want to discard the prior date because it likely
      // belongs to the other stage), false during hydration so persisted
      // values survive a reload.
      function applyStage(stageValue, opts) {
        const clearDate = !opts || opts.clearDate !== false;
        state.isPostpartum = (stageValue === 'postpartum');
        stageButtons.forEach((b) => {
          const isSelected = b.getAttribute('data-value') === stageValue;
          b.classList.toggle('ap-toggle--selected', isSelected);
          b.setAttribute('aria-pressed', String(isSelected));
        });
        dueDateField.classList.remove('ap-hidden');
        dueDateLabel.textContent = state.isPostpartum
          ? "What was baby's original due date?"
          : 'When are you due?';
        applyDueDateConstraints();
        if (clearDate) {
          state.dueDate = null;
          dueDateInput.value = '';
        }
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

      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const PHONE_RE = /^[\d\s()+\-]{7,}$/;

      function updateContinueButton() {
        let canContinue;
        if (currentStep === 1) {
          canContinue =
            state.isPostpartum !== null &&
            !!state.dueDate &&
            state.firstTimeParent !== null &&
            !!state.lead.firstName.trim() &&
            !!state.lead.lastName.trim() &&
            EMAIL_RE.test(state.lead.email) &&
            PHONE_RE.test(state.lead.phone);
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
        concernsInput.value = state.concerns || '';
        if (state.isPostpartum === true) applyStage('postpartum', { clearDate: false });
        else if (state.isPostpartum === false) applyStage('pregnant', { clearDate: false });
        if (state.firstTimeParent !== null) applyFirstTimeParentUI(state.firstTimeParent);
        firstNameInput.value = state.lead.firstName || '';
        lastNameInput.value = state.lead.lastName || '';
        emailInput.value = state.lead.email || '';
        phoneInput.value = state.lead.phone || '';
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

      concernsInput.addEventListener('input', (e) => {
        state.concerns = e.target.value;
        saveState();
      });

      stageButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          applyStage(btn.getAttribute('data-value'));
        });
      });

      const LEAD_INPUT_BINDINGS = [
        { el: firstNameInput, key: 'firstName' },
        { el: lastNameInput, key: 'lastName' },
        { el: emailInput, key: 'email' },
        { el: phoneInput, key: 'phone' }
      ];
      LEAD_INPUT_BINDINGS.forEach(({ el, key }) => {
        if (!el) return;
        el.addEventListener('input', (e) => {
          state.lead[key] = e.target.value;
          saveState();
          updateContinueButton();
        });
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
        // Step 1 → submit contact info to Hubspot immediately so the lead is
        // captured even if the user bails on Step 2 or 3.
        if (currentStep === 1) {
          submitStep1ToHubspot(state).then(function (r) {
            track('step1_submitted', { hubspot_ok: !!(r && r.ok) });
          });
        }
        if (currentStep === TOTAL_STEPS) {
          // Final intake step → run engine, render panels, then advance.
          state.results = computeResults(state, RULES, ALMA_SERVICES, new Date());
          track('intake_step_completed', { step: currentStep });
          renderResults(state.results);
          track('results_viewed', {
            recommendations_count: state.results.recommendations.length,
            has_concerns: state.results.detectedConcerns.length > 0
          });
          // Enrich the Hubspot contact with coverage + recs once they reach the plan.
          submitEnrichmentToHubspot(state).then(function (r) {
            track('plan_viewed', { hubspot_ok: !!(r && r.ok) });
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

      function formatMoney(n) {
        return '$' + Math.round(n);
      }

      function renderIntro() {
        return (
          '<header class="ap-results__intro">'
          + '<h2>Your Personalized Care Plan</h2>'
          + '</header>'
        );
      }

      function renderClarifier() {
        return (
          '<p class="ap-results__clarifier">'
          + 'This care plan outlines eligible coverage pathways and recommended postpartum supports. '
          + 'After your complimentary consultation, we’ll prepare a tailored estimate with specific care '
          + 'providers, hours, and costs — ready to submit to your insurer.'
          + '</p>'
        );
      }

      function renderSnapshot(results) {
        const eligibleAmounts = (results && results.eligibleAmounts) || {};
        const coveredIds = Object.keys(eligibleAmounts);
        const notCoveredIds = ALMA_SERVICES.filter(function (id) {
          return coveredIds.indexOf(id) === -1;
        });

        const eligibleItems = coveredIds.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          const amt = formatMoney(eligibleAmounts[id]);
          return '<li><span class="ap-coverage-list__check">✓</span>'
            + escapeHtml(name) + ' — <strong>' + amt + ' eligible</strong></li>';
        }).join('');

        const notEligibleItems = notCoveredIds.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          return '<li class="ap-coverage-list__item--muted">'
            + '<span class="ap-coverage-list__dash">—</span>' + escapeHtml(name) + '</li>';
        }).join('');

        const totalEligible = coveredIds.reduce(function (sum, id) {
          return sum + eligibleAmounts[id];
        }, 0);
        const totalLine = coveredIds.length
          ? '<p class="ap-coverage-list__total"><strong>Total eligible: ' + formatMoney(totalEligible) + '</strong></p>'
          : '';

        const showHsa = state.hasHsa === 'yes'
          && typeof state.hsaBalance === 'number'
          && state.hsaBalance > 0;
        const hsaHtml = showHsa
          ? '<div class="ap-coverage-card ap-coverage-card--hsa">'
              + '<h3>HSA available: ' + formatMoney(state.hsaBalance) + '</h3>'
              + '<p>Can be applied to any service above.</p>'
              + '</div>'
          : '';

        return (
          '<section class="ap-panel ap-panel--snapshot">'
          + '<h2>Your Coverage at a Glance</h2>'
          + '<div class="ap-coverage-card ap-coverage-card--eligible">'
          +   '<h3>✓ What\'s Eligible for Coverage</h3>'
          +   (coveredIds.length
                ? '<ul>' + eligibleItems + '</ul>' + totalLine
                : '<p class="ap-coverage-list__item--muted">No services selected.</p>')
          + '</div>'
          + '<div class="ap-coverage-card ap-coverage-card--not-eligible">'
          +   '<h3>✗ What\'s Not Eligible for Coverage</h3>'
          +   (notEligibleItems
                ? '<ul>' + notEligibleItems + '</ul>'
                : '<p class="ap-coverage-list__item--muted">All services have coverage.</p>')
          + '</div>'
          + hsaHtml
          + '</section>'
        );
      }

      function renderRecCard(rec, rank) {
        const name = SERVICE_NAMES[rec.service] || rec.service;
        const needsAsterisk = rec.service === 'postpartum_doula_care'
          || rec.service === 'registered_nursing';
        const priorityKey = rec.priority || '';
        const priorityLabel = priorityKey
          ? priorityKey.charAt(0).toUpperCase() + priorityKey.slice(1)
          : '';
        const initial = (name || '').trim().charAt(0).toUpperCase();
        const badgeHtml = (typeof rank === 'number')
          ? '<div class="ap-rec-card__rank" aria-hidden="true">' + rank + '</div>'
          : '<div class="ap-rec-card__icon" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        const asterisk = needsAsterisk
          ? ' <span class="ap-rec-card__asterisk" aria-label="Pre-assessment approval required">*</span>'
          : '';
        const priorityBadge = priorityLabel
          ? ' <span class="ap-rec-card__priority ap-rec-card__priority--' + escapeHtml(priorityKey) + '">'
              + escapeHtml(priorityLabel) + '</span>'
          : '';
        return (
          '<div class="ap-rec-card">'
          + badgeHtml
          + '<div class="ap-rec-card__body">'
          + '<div class="ap-rec-card__title">' + escapeHtml(name) + asterisk + priorityBadge + '</div>'
          + (rec.concernCallout
              ? '<p class="ap-rec-card__callout">Based on what you shared, we’d especially encourage this.</p>'
              : '')
          + '<div class="ap-rec-card__rationale">' + escapeHtml(rec.rationale || '') + '</div>'
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
        const hasAsterisk = recs.some(function (r) {
          return r.service === 'postpartum_doula_care' || r.service === 'registered_nursing';
        });
        const footnote = hasAsterisk
          ? '<p class="ap-rec__footnote">* Pre-assessment approval may be required and varies by insurer. '
              + '<a href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a consultation</a> '
              + 'to get a tailored estimate.</p>'
          : '';
        return (
          '<section class="ap-panel ap-panel--plan">'
          + '<h2>Your highest-priority postpartum supports</h2>'
          + body
          + footnote
          + '</section>'
        );
      }

      function renderWhatHappensNext() {
        return (
          '<section class="ap-next">'
          + '<h2>What Happens Next</h2>'
          + '<ol class="ap-next__list">'
          +   '<li><strong>Book a complimentary consultation</strong>'
          +     '<a class="ap-btn ap-btn--primary ap-next__cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a call →</a>'
          +   '</li>'
          +   '<li>Submit an intake form and refundable deposit</li>'
          +   '<li>Receive bios of qualified Postnatal Care Specialists within 2 business days</li>'
          +   '<li>Interview your candidates and select your care team</li>'
          + '</ol>'
          + '</section>'
        );
      }

      function renderGiftCardsCallout(results) {
        const eligibleIds = Object.keys((results && results.eligibleAmounts) || {});
        if (eligibleIds.length === ALMA_SERVICES.length) return '';
        return (
          '<aside class="ap-gift-callout">'
          + '<h3>No coverage? Or covering the gap?</h3>'
          + '<p>Postpartum care makes one of the most meaningful registry gifts. Add Alma Care gift cards to your baby registry — friends and family can contribute directly to your recovery support.</p>'
          + '<a class="ap-gift-callout__cta" href="https://www.almacare.ca/gift-cards" target="_blank" rel="noopener">Learn about Alma Care gift cards →</a>'
          + '</aside>'
        );
      }

      function renderFinalCta() {
        return (
          '<section class="ap-final-cta">'
          + '<div class="ap-cta-row">'
          +   '<a class="ap-btn ap-btn--primary" id="ap-consult-cta" href="' + CONSULT_URL + '" target="_blank" rel="noopener">Book a complimentary consultation</a>'
          +   '<button type="button" class="ap-btn ap-btn--secondary" id="ap-print-plan">Send me my care plan</button>'
          + '</div>'
          + '<p class="ap-print-tip">Tip: in the print dialog, expand "More settings" and uncheck "Headers and footers" for a cleaner PDF.</p>'
          + '</section>'
        );
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

      async function submitHubspotPayload(fields, pageNameSuffix) {
        if (!HUBSPOT.portalId || HUBSPOT.portalId === 'TODO_FILL_IN' || !HUBSPOT.formId || HUBSPOT.formId === 'TODO_FILL_IN') {
          console.warn('Hubspot config not set — skipping submission');
          return { ok: false, reason: 'not_configured' };
        }
        const url = 'https://api.hsforms.com/submissions/v3/integrations/submit/' + HUBSPOT.portalId + '/' + HUBSPOT.formId;
        const payload = {
          fields: fields,
          context: {
            pageUri: window.location.href,
            pageName: 'Benefits Eligibility Tool — ' + (pageNameSuffix || '')
          }
        };
        try {
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) return { ok: false, reason: 'http_error', status: res.status };
          return { ok: true };
        } catch (e) {
          return { ok: false, reason: 'network_error' };
        }
      }

      function buildStep1Fields(state) {
        const lead = state.lead || {};
        return [
          { name: 'firstname',          value: hsValue(lead.firstName) },
          { name: 'lastname',           value: hsValue(lead.lastName) },
          { name: 'email',              value: hsValue(lead.email) },
          { name: 'phone',              value: hsValue(lead.phone) },
          { name: 'ap_due_date',        value: hsValue(state.dueDate) },
          { name: 'ap_is_postpartum',   value: hsValue(state.isPostpartum) },
          { name: 'ap_first_time_parent', value: hsValue(state.firstTimeParent) },
          { name: 'ap_concerns',        value: hsValue(state.concerns) }
        ];
      }

      function buildEnrichmentFields(state) {
        const coverageKeys = state.coverage ? Object.keys(state.coverage) : [];
        const servicesCovered = coverageKeys.join(';');
        const totalCoverageValue = coverageKeys.reduce(function (sum, id) {
          const entry = state.coverage[id];
          const amount = entry && typeof entry.amount === 'number' ? entry.amount : 0;
          return sum + amount;
        }, 0);
        const recs = (state.results && state.results.recommendations) || [];
        const recommendedServices = recs
          .map(function (r) { return SERVICE_NAMES[r.service] || r.service; })
          .join(';');
        const detectedConcerns = state.results && state.results.detectedConcerns
          ? state.results.detectedConcerns.join(';')
          : '';
        // Total eligible across all selected services (after reimbursement %)
        const eligible = (state.results && state.results.eligibleAmounts) || {};
        const totalEligible = Object.keys(eligible).reduce(function (sum, id) {
          return sum + eligible[id];
        }, 0);
        const lead = state.lead || {};
        return [
          { name: 'email',                value: hsValue(lead.email) },
          { name: 'ap_insurer',           value: hsValue(state.insurer) },
          { name: 'ap_has_hsa',           value: hsValue(state.hasHsa) },
          { name: 'ap_hsa_balance',       value: hsValue(state.hsaBalance) },
          { name: 'ap_services_covered',  value: hsValue(servicesCovered) },
          { name: 'ap_total_coverage_value', value: hsValue(totalCoverageValue) },
          { name: 'ap_total_eligible',    value: hsValue(totalEligible) },
          { name: 'ap_recommended_services', value: hsValue(recommendedServices) },
          { name: 'ap_detected_concerns', value: hsValue(detectedConcerns) }
        ];
      }

      function submitStep1ToHubspot(state) {
        return submitHubspotPayload(buildStep1Fields(state), 'Step 1');
      }

      function submitEnrichmentToHubspot(state) {
        return submitHubspotPayload(buildEnrichmentFields(state), 'Plan Viewed');
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
        const eligibleAmounts = (results && results.eligibleAmounts) || {};
        const coveredIds = Object.keys(eligibleAmounts);
        const totalEligible = coveredIds.reduce(function (sum, id) {
          return sum + eligibleAmounts[id];
        }, 0);
        const heroHtml = coveredIds.length > 0
          ? '<div class="ap-pdf__hero">' + formatMoney(totalEligible) + ' eligible for coverage</div>'
          : '<div class="ap-pdf__hero ap-pdf__hero--muted">No extended benefits — that\'s okay.</div>';

        const showHsa = state.hasHsa === 'yes'
          && typeof state.hsaBalance === 'number'
          && state.hsaBalance > 0;
        const hsaHtml = showHsa
          ? '<div class="ap-pdf__hsa">+ ' + formatMoney(state.hsaBalance) + ' flexible HSA spend</div>'
          : '';

        const eligibleItems = coveredIds.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          return '<li>' + escapeHtml(name) + ' — <strong>' + formatMoney(eligibleAmounts[id]) + ' eligible</strong></li>';
        }).join('');

        const notCoveredIds = ALMA_SERVICES.filter(function (id) {
          return coveredIds.indexOf(id) === -1;
        });
        const notEligibleItems = notCoveredIds.map(function (id) {
          const name = SERVICE_NAMES[id] || id;
          return '<li class="muted">' + escapeHtml(name) + '</li>';
        }).join('');

        const eligibleCol = '<div class="ap-pdf__cov-col"><h4>What\'s eligible for coverage</h4>'
          + (coveredIds.length
              ? '<ul>' + eligibleItems + '</ul>'
              : '<ul><li class="muted">No services selected.</li></ul>')
          + '</div>';

        const notEligibleCol = notEligibleItems
          ? '<div class="ap-pdf__cov-col"><h4>What\'s not eligible for coverage</h4><ul>' + notEligibleItems + '</ul></div>'
          : '';

        return (
          '<section class="ap-pdf__panel">'
          + '<h3>Your Coverage at a Glance</h3>'
          + heroHtml
          + hsaHtml
          + eligibleCol
          + notEligibleCol
          + '</section>'
        );
      }

      function renderPdfPlan(results) {
        const recs = results.recommendations || [];
        let body;
        if (recs.length === 0) {
          body = '<p>We didn\'t have enough info to build personalized recommendations — book a complimentary consultation and we\'ll walk through your options together.</p>';
        } else {
          body = recs.map(function (rec) {
            const name = SERVICE_NAMES[rec.service] || rec.service;
            const needsAsterisk = rec.service === 'postpartum_doula_care'
              || rec.service === 'registered_nursing';
            const asterisk = needsAsterisk ? ' *' : '';
            return (
              '<div class="ap-pdf__rec">'
              + '<div class="ap-pdf__rec-title">' + escapeHtml(name) + asterisk + '</div>'
              + '<div class="ap-pdf__rec-rationale">' + escapeHtml(rec.rationale || '') + '</div>'
              + '</div>'
            );
          }).join('');
        }
        const hasAsterisk = recs.some(function (r) {
          return r.service === 'postpartum_doula_care' || r.service === 'registered_nursing';
        });
        const footnote = hasAsterisk
          ? '<p class="ap-pdf__footnote">* Pre-assessment approval may be required and varies by insurer. Book a consultation at almacare.ca/booking/book-a-call to get a tailored estimate.</p>'
          : '';
        return (
          '<section class="ap-pdf__panel">'
          + '<h3>Your Highest-Priority Postpartum Supports</h3>'
          + body
          + footnote
          + '</section>'
        );
      }

      function renderPdfWhatHappensNext() {
        return (
          '<section class="ap-pdf__panel">'
          + '<h3>What Happens Next</h3>'
          + '<ol class="ap-pdf__next">'
          +   '<li>Book a complimentary consultation</li>'
          +   '<li>Submit an intake form and refundable deposit</li>'
          +   '<li>Receive bios of qualified Postnatal Care Specialists within 2 business days</li>'
          +   '<li>Interview your candidates and select your care team</li>'
          + '</ol>'
          + '</section>'
        );
      }

      function renderPdfSource(results) {
        const today = formatPdfDate(new Date());
        const lead = state.lead || {};
        const fullName = ((lead.firstName || '') + ' ' + (lead.lastName || '')).trim();
        const contact = [];
        if (lead.email) contact.push(escapeHtml(lead.email));
        if (lead.phone) contact.push(escapeHtml(lead.phone));

        return (
          '<div class="ap-pdf__letterhead">'
          + '<div class="ap-pdf__brand">' + BRAND_MARK_SVG + '<span>Alma Care</span></div>'
          + '<div class="ap-pdf__brand-tag">Postpartum care, personalized</div>'
          + '<div class="ap-pdf__meta">'
          + '<div><strong>Prepared for:</strong> ' + escapeHtml(fullName) + '</div>'
          + (contact.length ? '<div>' + contact.join(' • ') + '</div>' : '')
          + '<div><strong>Date:</strong> ' + escapeHtml(today) + '</div>'
          + '</div>'
          + '</div>'
          + '<h2 class="ap-pdf__heading">Your Personalized Care Plan</h2>'
          + '<p class="ap-pdf__clarifier">This care plan outlines eligible coverage pathways and recommended postpartum supports. After your complimentary consultation, we’ll prepare a tailored estimate with specific care providers, hours, and costs — ready to submit to your insurer.</p>'
          + renderPdfSnapshot(results)
          + renderPdfPlan(results)
          + renderPdfWhatHappensNext()
          + '<div class="ap-pdf__footer">'
          + 'This care plan is based on the information you provided. Eligible amounts reflect your plan\'s annual maximums and reimbursement percentages — they are not a guarantee of coverage. Confirm details with your benefits provider.'
          + '<br>Book your complimentary consultation: <span class="ap-pdf__footer-link">almacare.ca/booking/book-a-call</span>'
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
          const firstName = (state.lead && state.lead.firstName) ? state.lead.firstName.trim() : '';
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
          renderIntro()
          + renderClarifier()
          + renderSnapshot(results)
          + renderPlan(results)
          + renderWhatHappensNext()
          + renderGiftCardsCallout(results)
          + renderFinalCta();

        const printBtn = document.getElementById('ap-print-plan');
        if (printBtn) {
          printBtn.addEventListener('click', function () {
            printCarePlan().catch(function (err) {
              console.error('print failed', err);
            });
          });
        }

        const consultBtn = document.getElementById('ap-consult-cta');
        if (consultBtn) {
          consultBtn.addEventListener('click', function () {
            track('consult_cta_clicked', { source: 'results_primary_cta' });
          });
        }
      }

      // ---------- Init ----------
      loadState();
      hydrateUI();
    })();
