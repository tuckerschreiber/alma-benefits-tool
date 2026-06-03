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
        registered_nursing: 'In-Home Postpartum Support',
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
          rationale: 'Overnight in-home support in the first two weeks helps with sleep, feeding routines, and a smoother transition home.',
          priority: 'medium'
        },
        // ----- Postpartum-specific rules (apply when user is already postpartum) -----
        {
          service: 'registered_nursing',
          appliesWhen: { isPostpartum: true, weeksPostpartumMax: 2 },
          dosing: { sessions: 2, estimatedSessionCost: 220, window: 'first 2 weeks postpartum' },
          rationale: 'Overnight in-home support in the first two weeks helps with sleep, feeding routines, and a smoother transition home.',
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
          rationale: 'With a history of elevated blood pressure, overnight in-home support gives you an extra layer of help during the recovery weeks.',
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
          rationale: 'Recovery often takes a bit more time for parents over 35 — overnight in-home support in the early weeks helps you rest while you reset.',
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

      function formatNightsLine(eligibleAmount, hourlyRate, nightHours) {
        if (!eligibleAmount || eligibleAmount <= 0) return '';
        if (!hourlyRate || hourlyRate <= 0) return '';
        if (!nightHours || nightHours <= 0) return '';
        const hours = Math.floor(eligibleAmount / hourlyRate);
        const nights = Math.floor(hours / nightHours);
        if (nights <= 0) return '';
        const noun = nights === 1 ? 'night' : 'nights';
        return '≈ ' + nights + ' ' + noun + ' of overnight care (' + nightHours + ' hrs each, before HST)';
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

        const recommendedSet = new Set(recommendations.map(function (r) { return r.service; }));
        const alsoCovered = eligibleServiceIds.filter(function (id) { return !recommendedSet.has(id); });

        return {
          normalized: normalized,
          eligibleServiceIds: eligibleServiceIds,
          recommendations: recommendations,
          eligibleAmounts: eligibleAmounts,
          detectedConcerns: detectedConcerns,
          alsoCovered: alsoCovered
        };
      }

      // ---------- PDF (mirror of src/pdf.js + src/engine.js + src/rules.js) ----------
      // When changing src/pdf.js, also update this mirror. Tests run against
      // src/pdf.js only — drift between source and mirror is silent in CI.
      const ALMA_RN_HOURLY_RATE = 48;
      const ALMA_PSW_HOURLY_RATE = 48;
      const ALMA_NIGHT_HOURS = 10;

      const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December'];

      const POSTAL_PROVINCE = {
        A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC',
        K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON',
        R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT'
      };

      const SHIFT_HOURS = 10;
      const HST_RATE = 0.13;

      function formatLongDate(d) {
        return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
      }

      function formatCurrency(n) {
        return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }

      function parseLocalDate(value) {
        if (!value || typeof value !== 'string') return null;
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
        if (!m) return null;
        return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      }

      function fullName(lead) {
        return ((lead.firstName || '').trim() + ' ' + (lead.lastName || '').trim()).trim() || '—';
      }

      function clientAddressLines(lead) {
        const street = (lead.streetAddress || '').trim();
        const city = (lead.city || '').trim();
        const postal = (lead.postalCode || '').trim().toUpperCase();
        const province = postal ? POSTAL_PROVINCE[postal.charAt(0)] : '';
        const cityWithProv = [city, province].filter(Boolean).join(', ');
        const cityLine = [cityWithProv, postal].filter(Boolean).join(' ');
        const out = [];
        if (street) out.push(street);
        if (cityLine) out.push(cityLine);
        return out;
      }

      function buildClientColumn(lead) {
        const lines = [
          { text: 'Service Recipient Details:', bold: true, fontSize: 10 },
          { text: fullName(lead), fontSize: 10, margin: [0, 2, 0, 0] }
        ];
        const addrs = clientAddressLines(lead);
        for (let i = 0; i < addrs.length; i++) {
          lines.push({ text: addrs[i], fontSize: 10 });
        }
        if (lead.email) lines.push({ text: lead.email, fontSize: 10, margin: [0, 6, 0, 0] });
        if (lead.phone) lines.push({ text: lead.phone, fontSize: 10 });
        return lines;
      }

      function buildAlmaColumn() {
        return [
          { text: 'Alma Care Postnatal', bold: true, fontSize: 10 },
          { text: '280 Bloor St W', fontSize: 10, margin: [0, 2, 0, 0] },
          { text: 'Toronto, ON', fontSize: 10 },
          { text: '647-947-2792', fontSize: 10, margin: [0, 6, 0, 0] },
          { text: 'contact@almacare.ca', fontSize: 10 }
        ];
      }

      function buildDescription(lead) {
        const due = parseLocalDate(lead.dueDate);
        const dueText = due ? formatLongDate(due) : '';
        if (lead.isPostpartum && dueText) {
          return 'The client gave birth on ' + dueText + ' and is currently in the postpartum recovery period. In-home overnight postpartum support is recommended to help with rest, sleep, and a smoother transition through the early weeks at home.';
        }
        if (lead.isPostpartum) {
          return 'The client is currently in the postpartum recovery period. In-home overnight postpartum support is recommended to help with rest, sleep, and a smoother transition through the early weeks at home.';
        }
        if (dueText) {
          return 'The client is expecting on ' + dueText + '. In-home overnight postpartum support is recommended in the early weeks after birth to help with rest, sleep, and a smoother transition home.';
        }
        return 'In-home overnight postpartum support is recommended in the early weeks after birth to help with rest, sleep, and a smoother transition home.';
      }

      function buildSupportBullets() {
        const items = [
          'Settling and soothing baby through the night so the parent can rest',
          'Diaper changes, feeding support, and burping during overnight hours',
          'Light household tasks tied to baby care — bottle washing, laundry, tidying the feeding station',
          'Reassurance and check-ins during night feedings',
          'A consistent overnight presence so the parent can recover and reset'
        ];
        return items.map(function (t) { return { text: '• ' + t, fontSize: 10, margin: [0, 1, 0, 1] }; });
      }

      function buildFeeTable(numShifts, hourlyRate) {
        const shiftCost = SHIFT_HOURS * hourlyRate;
        const header = [
          { text: 'Visit', bold: true, alignment: 'center' },
          { text: 'Shift Type', bold: true, alignment: 'center' },
          { text: 'Total Hours', bold: true, alignment: 'center' },
          { text: 'Hourly Rate', bold: true, alignment: 'center' },
          { text: 'Cost per visit', bold: true, alignment: 'center' },
          { text: 'Price', bold: true, alignment: 'center' }
        ];
        const subtotal = numShifts * shiftCost;
        const subtotalText = formatCurrency(subtotal);
        const middleRow = Math.floor((numShifts - 1) / 2);

        const rows = [header];
        for (let i = 1; i <= numShifts; i++) {
          rows.push([
            { text: String(i), alignment: 'center' },
            { text: 'Overnight', alignment: 'center' },
            { text: String(SHIFT_HOURS), alignment: 'center' },
            { text: formatCurrency(hourlyRate), alignment: 'center' },
            { text: formatCurrency(shiftCost), alignment: 'center' },
            i === middleRow + 1
              ? { text: subtotalText, alignment: 'right' }
              : { text: '' }
          ]);
        }
        return rows;
      }

      /**
       * Build a pdfmake doc-definition for the coverage estimate.
       * Single-pathway: caller sums RN + PSW eligible $ upstream and passes
       * the total in results.nursing.eligibleAmount. Returns null when the
       * eligible amount can't cover at least one full overnight shift.
       */
      function buildEstimateDocDefinition(state, results, opts) {
        const eligibleAmount = results && results.nursing && results.nursing.eligibleAmount;
        const hourlyRate = opts && opts.hourlyRate;
        if (!eligibleAmount || eligibleAmount <= 0) return null;
        if (!hourlyRate || hourlyRate <= 0) return null;

        const shiftCost = SHIFT_HOURS * hourlyRate;
        const numShifts = Math.floor(eligibleAmount / shiftCost);
        if (numShifts < 1) return null;

        const today = (opts && opts.today) || new Date();
        const lead = state.lead || {};
        const subtotal = numShifts * shiftCost;
        const tax = Math.round(subtotal * HST_RATE * 100) / 100;
        const total = Math.round((subtotal + tax) * 100) / 100;

        const feeRows = buildFeeTable(numShifts, hourlyRate);
        const blankCell = { text: '', border: [false, false, false, false] };
        const totalsRows = [
          [blankCell, blankCell, blankCell, blankCell,
           { text: 'Subtotal', alignment: 'right', bold: true }, { text: formatCurrency(subtotal), alignment: 'right' }],
          [blankCell, blankCell, blankCell, blankCell,
           { text: 'Tax', alignment: 'right', bold: true }, { text: formatCurrency(tax), alignment: 'right' }],
          [blankCell, blankCell, blankCell, blankCell,
           { text: 'Total Cost of Care Visits', alignment: 'right', bold: true },
           { text: formatCurrency(total), alignment: 'right', bold: true }]
        ];

        return {
          pageSize: 'LETTER',
          pageMargins: [54, 54, 54, 54],
          defaultStyle: { font: 'Roboto', fontSize: 10, color: '#222' },
          content: [
            { text: 'alma care', alignment: 'center', fontSize: 16, color: '#156146', italics: true, margin: [0, 0, 0, 24] },

            { text: formatLongDate(today), fontSize: 10 },
            { text: 'ESTIMATE', bold: true, fontSize: 12, margin: [0, 6, 0, 12] },

            {
              columns: [
                { width: '*', stack: buildAlmaColumn() },
                { width: '*', stack: buildClientColumn(lead) }
              ],
              columnGap: 20,
              margin: [0, 0, 0, 14]
            },

            { text: 'Description of Services', bold: true, fontSize: 11, margin: [0, 0, 0, 4] },
            { text: buildDescription(lead), fontSize: 10, margin: [0, 0, 0, 10] },

            { text: 'Anticipated overnight support includes:', bold: true, fontSize: 11, margin: [0, 0, 0, 4] },
            ...buildSupportBullets(),
            {
              text: 'In-home overnight support is focused on helping the parent rest, recover, and feel supported through the early weeks at home.',
              fontSize: 10, margin: [0, 8, 0, 14]
            },

            { text: 'In-Home Postpartum Support', bold: true, fontSize: 11 },
            { text: 'Provider assigned at booking through Alma Care concierge.', fontSize: 10, color: '#555', margin: [0, 0, 0, 14] },

            { text: 'Preliminary Care Plan & Fee Structure', bold: true, fontSize: 11, margin: [0, 0, 0, 6] },
            {
              table: {
                headerRows: 1,
                widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
                body: feeRows
              },
              layout: {
                hLineColor: function () { return '#999'; },
                vLineColor: function () { return '#999'; },
                hLineWidth: function () { return 0.5; },
                vLineWidth: function () { return 0.5; },
                paddingTop: function () { return 3; },
                paddingBottom: function () { return 3; },
                paddingLeft: function () { return 6; },
                paddingRight: function () { return 6; }
              }
            },
            {
              table: {
                widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
                body: totalsRows
              },
              layout: {
                hLineColor: function () { return '#999'; },
                vLineColor: function () { return '#999'; },
                hLineWidth: function () { return 0.5; },
                vLineWidth: function () { return 0.5; },
                paddingTop: function () { return 4; },
                paddingBottom: function () { return 4; },
                paddingLeft: function () { return 6; },
                paddingRight: function () { return 6; }
              },
              margin: [0, 0, 0, 14]
            },

            {
              text: 'This is a preliminary estimate. To customize hours, mix overnight and daytime support, or confirm provider assignment, email concierge@almacare.ca.',
              fontSize: 9, italics: true, color: '#555', margin: [0, 8, 0, 0]
            }
          ]
        };
      }

      /**
       * Build the suggested filename for the downloaded estimate PDF.
       * Format: alma-coverage-estimate-{lastname-lowercase-alnum}-{YYYY-MM-DD}.pdf.
       * Falls back to "family" when lastName is missing/blank.
       */
      function buildEstimateFilename(state, today) {
        if (!today) today = new Date();
        const rawLast = (state && state.lead && state.lead.lastName) || '';
        const slug = rawLast.toLowerCase().replace(/[^a-z0-9]/g, '') || 'family';
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        return 'alma-coverage-estimate-' + slug + '-' + yyyy + '-' + mm + '-' + dd + '.pdf';
      }

      // === END ENGINE ===

      const STORAGE_KEY = 'ap_benefits_state';
      const STATE_SCHEMA_VERSION = 3;
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
        lead: { firstName: '', lastName: '', email: '', phone: '', streetAddress: '', city: '', postalCode: '' }
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
      const streetAddressInput = document.getElementById('ap-street-address');
      const cityInput = document.getElementById('ap-city');
      const postalCodeInput = document.getElementById('ap-postal-code');
      const postalCodeError = document.querySelector('[data-error-for="postalCode"]');
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
          if (saved) {
            const parsed = JSON.parse(saved);
            if (parsed && parsed._schemaVersion === STATE_SCHEMA_VERSION) {
              Object.assign(state, parsed);
            } else {
              // Old or unversioned state — discard and start fresh.
              try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
            }
          }
        } catch (e) {
          // Bad JSON / sessionStorage unavailable — silent fail, start fresh.
          try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
        }
        // Ensure lead object exists with current shape even if persisted state predates it.
        const fresh = { firstName: '', lastName: '', email: '', phone: '', streetAddress: '', city: '', postalCode: '' };
        if (!state.lead || typeof state.lead !== 'object') {
          state.lead = fresh;
        } else {
          state.lead = Object.assign(fresh, {
            firstName: state.lead.firstName || '',
            lastName: state.lead.lastName || '',
            email: state.lead.email || '',
            phone: state.lead.phone || '',
            streetAddress: state.lead.streetAddress || '',
            city: state.lead.city || '',
            postalCode: state.lead.postalCode || ''
          });
        }
      }

      function saveState() {
        try {
          state._schemaVersion = STATE_SCHEMA_VERSION;
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
          ? "What was your due date?"
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
      const POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

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
            PHONE_RE.test(state.lead.phone) &&
            !!state.lead.city.trim() &&
            POSTAL_RE.test(state.lead.postalCode);
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
        streetAddressInput.value = state.lead.streetAddress || '';
        cityInput.value = state.lead.city || '';
        postalCodeInput.value = state.lead.postalCode || '';
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
        // Wizard nav: also hidden on results (no further steps to continue to).
        const wizardNav = document.querySelector('.ap-nav');
        if (n > TOTAL_STEPS) {
          progressHeader.classList.add('ap-hidden');
          if (wizardNav) wizardNav.classList.add('ap-hidden');
        } else {
          progressHeader.classList.remove('ap-hidden');
          if (wizardNav) wizardNav.classList.remove('ap-hidden');
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
        { el: phoneInput, key: 'phone' },
        { el: streetAddressInput, key: 'streetAddress' },
        { el: cityInput, key: 'city' },
        { el: postalCodeInput, key: 'postalCode' }
      ];
      LEAD_INPUT_BINDINGS.forEach(({ el, key }) => {
        if (!el) return;
        el.addEventListener('input', (e) => {
          state.lead[key] = e.target.value;
          saveState();
          updateContinueButton();
        });
      });

      if (postalCodeInput) {
        postalCodeInput.addEventListener('blur', () => {
          const raw = (state.lead.postalCode || '').toUpperCase().replace(/[\s-]+/g, '');
          if (raw.length === 6) {
            state.lead.postalCode = raw.slice(0, 3) + ' ' + raw.slice(3);
            postalCodeInput.value = state.lead.postalCode;
          }
          if (postalCodeError) {
            const hasValue = !!state.lead.postalCode;
            const isValid = POSTAL_RE.test(state.lead.postalCode);
            postalCodeError.hidden = !hasValue || isValid;
          }
          saveState();
          updateContinueButton();
        });
      }

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
          + 'This estimate outlines potential care pathways based on your benefits shared. '
          + 'After your complimentary consultation, our Postnatal Care Concierge will prepare a '
          + 'holistic care plan that addresses your goals, total budget and scheduling.'
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
          let nightsLine = '';
          if (id === 'registered_nursing') {
            nightsLine = formatNightsLine(eligibleAmounts[id], ALMA_RN_HOURLY_RATE, ALMA_NIGHT_HOURS);
          } else if (id === 'psw') {
            nightsLine = formatNightsLine(eligibleAmounts[id], ALMA_PSW_HOURLY_RATE, ALMA_NIGHT_HOURS);
          }
          const nightsHtml = nightsLine
            ? '<div class="ap-coverage-list__nights">' + escapeHtml(nightsLine) + '</div>'
            : '';
          return '<li><span class="ap-coverage-list__check">✓</span>'
            + escapeHtml(name) + ' — <strong>' + amt + ' eligible</strong>'
            + nightsHtml
            + '</li>';
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
          || rec.service === 'registered_nursing'
          || rec.service === 'psw';
        const initial = (name || '').trim().charAt(0).toUpperCase();
        const badgeHtml = (typeof rank === 'number')
          ? '<div class="ap-rec-card__rank" aria-hidden="true">' + rank + '</div>'
          : '<div class="ap-rec-card__icon" aria-hidden="true">' + escapeHtml(initial) + '</div>';
        const asterisk = needsAsterisk
          ? ' <span class="ap-rec-card__asterisk" aria-label="Pre-determination may be required">*</span>'
          : '';
        return (
          '<div class="ap-rec-card">'
          + badgeHtml
          + '<div class="ap-rec-card__body">'
          + '<div class="ap-rec-card__title">' + escapeHtml(name) + asterisk + '</div>'
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
          body = '<p class="ap-empty-rec">We didn\'t have enough info to build personalized recommendations — email <a href="mailto:concierge@almacare.ca">concierge@almacare.ca</a> and we\'ll walk through your options together.</p>';
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
          return r.service === 'postpartum_doula_care' || r.service === 'registered_nursing' || r.service === 'psw';
        });
        const footnote = hasAsterisk
          ? '<p class="ap-rec__footnote">* Some insurers require pre-determination before approving coverage. '
              + '<a href="mailto:concierge@almacare.ca">Email Alma Care concierge</a> '
              + 'for a tailored estimate.</p>'
          : '';
        const alsoCovered = (results && results.alsoCovered) || [];
        const alsoCoveredHtml = (alsoCovered.length && recs.length)
          ? '<p class="ap-recs__also-covered">Also covered by your plan: '
              + alsoCovered.map(function (id) { return escapeHtml(SERVICE_NAMES[id] || id); }).join(' · ')
              + '</p>'
          : '';
        return (
          '<section class="ap-panel ap-panel--plan">'
          + '<h2>Care your plan covers</h2>'
          + body
          + alsoCoveredHtml
          + footnote
          + '</section>'
        );
      }

      function renderWhatHappensNext() {
        return (
          '<section class="ap-next">'
          + '<h2>What Happens Next</h2>'
          + '<ol class="ap-next__list">'
          +   '<li><strong>Email the Alma Care concierge</strong>'
          +     '<a class="ap-btn ap-btn--primary ap-next__cta" href="mailto:concierge@almacare.ca">Email concierge →</a>'
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

      function renderFinalCta(results) {
        const eligibleAmounts = (results && results.eligibleAmounts) || {};
        const eligibleNursing = eligibleAmounts.registered_nursing || 0;
        const eligiblePsw = eligibleAmounts.psw || 0;
        const rnConfigured = typeof ALMA_RN_HOURLY_RATE === 'number' && ALMA_RN_HOURLY_RATE > 0;
        const pswConfigured = typeof ALMA_PSW_HOURLY_RATE === 'number' && ALMA_PSW_HOURLY_RATE > 0;
        const showDownload =
          (eligibleNursing > 0 && rnConfigured) || (eligiblePsw > 0 && pswConfigured);

        return (
          '<section class="ap-final-cta">'
          + (showDownload
              ? '<div class="ap-download-block" id="ap-download-block">'
                +   '<div class="ap-download-block__eyebrow">INSURANCE COVERAGE ESTIMATE</div>'
                +   '<p class="ap-download-block__copy">Download a one-page coverage estimate you can share with your insurer for pre-determination or coverage verification.</p>'
                +   '<button type="button" class="ap-btn ap-btn--primary" id="ap-download-estimate">⬇ Download Coverage Estimate</button>'
                +   '<div class="ap-download-block__meta">PDF · One page · Insurer-ready</div>'
                + '</div>'
              : ''
            )
          + '</section>'
        );
      }

      // ---------- PDF download (lazy-load pdfmake from CDN) ----------
      const PDFMAKE_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/pdfmake.min.js';
      const PDFMAKE_FONTS_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.10/build/vfs_fonts.js';
      let pdfMakeReadyPromise = null;

      function loadExternalScript(src) {
        return new Promise(function (resolve, reject) {
          const existing = document.querySelector('script[data-pdfmake-src="' + src + '"]');
          if (existing) { resolve(); return; }
          const s = document.createElement('script');
          s.src = src;
          s.setAttribute('data-pdfmake-src', src);
          s.onload = function () { resolve(); };
          s.onerror = function () {
            s.remove();
            reject(new Error('Failed to load ' + src));
          };
          document.head.appendChild(s);
        });
      }

      function ensurePdfMake() {
        if (window.pdfMake && window.pdfMake.vfs) return Promise.resolve();
        if (pdfMakeReadyPromise) return pdfMakeReadyPromise;
        pdfMakeReadyPromise = loadExternalScript(PDFMAKE_URL)
          .then(function () { return loadExternalScript(PDFMAKE_FONTS_URL); })
          .catch(function (err) {
            // Allow a future retry to actually attempt loading again.
            pdfMakeReadyPromise = null;
            throw err;
          });
        return pdfMakeReadyPromise;
      }

      function handleDownloadEstimate() {
        const eligibleAmounts = (state.results && state.results.eligibleAmounts) || {};
        const eligibleNursing = eligibleAmounts.registered_nursing || 0;
        const eligiblePsw = eligibleAmounts.psw || 0;
        // PDF is single-pathway "In-Home Postpartum Support" — sum RN + PSW.
        const eligibleTotal = eligibleNursing + eligiblePsw;
        if (eligibleTotal <= 0) return;

        const downloadBtn = document.getElementById('ap-download-estimate') || document.getElementById('ap-download-redo');
        const originalLabel = downloadBtn ? downloadBtn.textContent : '';
        if (downloadBtn) {
          downloadBtn.disabled = true;
          downloadBtn.textContent = 'Generating…';
        }

        // The PDF reads dueDate and isPostpartum from state.lead, but the wizard
        // stores those at the top level of state. Fold them in without mutating.
        const leadForPdf = Object.assign({}, state.lead, {
          dueDate: state.dueDate,
          isPostpartum: state.isPostpartum
        });
        const adapterResults = { nursing: { eligibleAmount: eligibleTotal } };
        const today = new Date();
        const doc = buildEstimateDocDefinition({ lead: leadForPdf }, adapterResults, {
          hourlyRate: ALMA_RN_HOURLY_RATE,
          today: today
        });
        if (!doc) {
          if (downloadBtn) { downloadBtn.disabled = false; downloadBtn.textContent = originalLabel; }
          console.warn('Estimate doc unavailable (missing data or rate)');
          return;
        }
        const filename = buildEstimateFilename(state, today);

        ensurePdfMake().then(function () {
          try {
            window.pdfMake.createPdf(doc).download(filename);
          } catch (err) {
            console.error('pdfmake.createPdf failed', err);
            swapDownloadBlockToError();
            return;
          }
          // Fire-and-forget — user has already received the PDF, don't block UI on Hubspot.
          submitDownloadToHubspot(state);
          const shiftCost = SHIFT_HOURS * ALMA_RN_HOURLY_RATE;
          track('estimate_downloaded', { shifts_estimated: Math.floor(eligibleTotal / shiftCost) });
          swapDownloadBlockToDone();
        }).catch(function (err) {
          console.error('pdfmake load failed', err);
          swapDownloadBlockToError();
        });
      }

      function swapDownloadBlockToDone() {
        const block = document.getElementById('ap-download-block');
        if (!block) return;
        block.classList.add('ap-download-block--done');
        block.innerHTML = (
          '<div class="ap-download-block__check">✓</div>'
          + '<div class="ap-download-block__eyebrow">Coverage estimate downloaded</div>'
          + '<p class="ap-download-block__copy">Want to tailor your hours, mix overnight and daytime, or confirm provider assignment?</p>'
          + '<a class="ap-btn ap-btn--primary" href="mailto:concierge@almacare.ca">Email Alma Care concierge →</a>'
          + '<button type="button" class="ap-download-block__redo" id="ap-download-redo">Re-download estimate</button>'
        );
        const redoBtn = document.getElementById('ap-download-redo');
        if (redoBtn) {
          redoBtn.addEventListener('click', handleDownloadEstimate);
        }
      }

      function swapDownloadBlockToError() {
        const block = document.getElementById('ap-download-block');
        if (!block) return;
        block.classList.remove('ap-download-block--done');
        block.innerHTML = (
          '<p class="ap-download-block__copy">We couldn\'t generate the estimate just now. Email the Alma Care concierge and we\'ll send you one directly.</p>'
          + '<a class="ap-btn ap-btn--primary" href="mailto:concierge@almacare.ca">Email Alma Care concierge →</a>'
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
          { name: 'ap_concerns',        value: hsValue(state.concerns) },
          { name: 'ap_street_address',  value: hsValue(lead.streetAddress) },
          { name: 'ap_city',            value: hsValue(lead.city) },
          { name: 'ap_postal_code',     value: hsValue(lead.postalCode) }
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

      function submitDownloadToHubspot(state) {
        const lead = state.lead || {};
        const fields = [
          { name: 'email',                      value: hsValue(lead.email) },
          { name: 'ap_estimate_downloaded',     value: 'true' },
          { name: 'ap_estimate_downloaded_at',  value: new Date().toISOString() }
        ];
        return submitHubspotPayload(fields, 'estimate_downloaded');
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
          + renderFinalCta(results);

        const downloadBtn = document.getElementById('ap-download-estimate');
        if (downloadBtn) {
          downloadBtn.addEventListener('click', handleDownloadEstimate);
        }
      }

      // ---------- Init ----------
      loadState();
      hydrateUI();
    })();
