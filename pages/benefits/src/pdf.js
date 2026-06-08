// Alma Care — coverage estimate PDF builder.
// Pure functions only. Returns a pdfmake-compatible doc definition object
// (or null when no estimate is warranted). Caller passes the object to
// `pdfmake.createPdf(doc)` to render.
//
// Format mirrors the real Alma Care estimate Karla generates by hand:
// two-column contact header, a short description, a list of supports,
// then a visit-by-visit fee table with subtotal / HST / total.
//
// Scope (round 5): overnight-only, single "In-Home Postpartum Support"
// pathway. Caller sums RN + PSW eligible $ upstream and passes the total
// in `results.nursing.eligibleAmount`. Daytime support is offered by email.

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
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
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
  return `${(lead.firstName || '').trim()} ${(lead.lastName || '').trim()}`.trim() || '—';
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
  for (const addr of clientAddressLines(lead)) {
    lines.push({ text: addr, fontSize: 10 });
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
    return `The client gave birth on ${dueText} and is currently in the postpartum recovery period. In-home overnight postpartum support is recommended to help with rest, sleep, and a smoother transition through the early weeks at home.`;
  }
  if (lead.isPostpartum) {
    return 'The client is currently in the postpartum recovery period. In-home overnight postpartum support is recommended to help with rest, sleep, and a smoother transition through the early weeks at home.';
  }
  if (dueText) {
    return `The client is expecting on ${dueText}. In-home overnight postpartum support is recommended in the early weeks after birth to help with rest, sleep, and a smoother transition home.`;
  }
  return 'In-home overnight postpartum support is recommended in the early weeks after birth to help with rest, sleep, and a smoother transition home.';
}

function buildSupportBullets() {
  return [
    'Settling and soothing baby through the night so the parent can rest',
    'Diaper changes, feeding support, and burping during overnight hours',
    'Light household tasks tied to baby care — bottle washing, laundry, tidying the feeding station',
    'Reassurance and check-ins during night feedings',
    'A consistent overnight presence so the parent can recover and reset'
  ].map((t) => ({ text: '• ' + t, fontSize: 10, margin: [0, 1, 0, 1] }));
}

// `visits` is an array of { hours, shiftType } describing each row.
// All rows are billed at `hourlyRate`. Subtotal sits in the middle of the
// Price column to mirror Karla's layout.
function buildFeeTable(visits, hourlyRate) {
  const header = [
    { text: 'Visit', bold: true, alignment: 'center' },
    { text: 'Shift Type', bold: true, alignment: 'center' },
    { text: 'Total Hours', bold: true, alignment: 'center' },
    { text: 'Hourly Rate', bold: true, alignment: 'center' },
    { text: 'Cost per visit', bold: true, alignment: 'center' },
    { text: 'Price', bold: true, alignment: 'center' }
  ];
  let subtotal = 0;
  for (const v of visits) subtotal += v.hours * hourlyRate;
  const subtotalText = formatCurrency(subtotal);
  const middleRow = Math.floor((visits.length - 1) / 2);

  const rows = [header];
  visits.forEach((v, idx) => {
    rows.push([
      { text: String(idx + 1), alignment: 'center' },
      { text: v.shiftType, alignment: 'center' },
      { text: String(v.hours), alignment: 'center' },
      { text: formatCurrency(hourlyRate), alignment: 'center' },
      { text: formatCurrency(v.hours * hourlyRate), alignment: 'center' },
      idx === middleRow
        ? { text: subtotalText, alignment: 'right' }
        : { text: '' }
    ]);
  });
  return { rows, subtotal };
}

/**
 * Build a pdfmake doc-definition for the coverage estimate.
 * Returns null when the eligible amount can't cover at least one hour of
 * care at the configured hourly rate, or when the hourly rate isn't set.
 *
 * @param {{lead: object}} state
 * @param {{nursing?: {eligibleAmount: number}}} results
 *   The caller sums Doula + RN + PSW eligible amounts upstream and passes
 *   the total here. We treat them as one "in-home postpartum support"
 *   pathway in the PDF.
 * @param {{hourlyRate: number|null, today: Date}} opts
 */
export function buildEstimateDocDefinition(state, results, opts) {
  const eligibleAmount = results && results.nursing && results.nursing.eligibleAmount;
  const hourlyRate = opts && opts.hourlyRate;
  if (!eligibleAmount || eligibleAmount <= 0) return null;
  if (!hourlyRate || hourlyRate <= 0) return null;

  // Build the visit list. Full shifts first, then a single partial-overnight
  // row for any remaining hours. If the amount can't cover even one hour,
  // there are no visits and we return null.
  const shiftCost = SHIFT_HOURS * hourlyRate;
  const numFullShifts = Math.floor(eligibleAmount / shiftCost);
  const remainingAmount = eligibleAmount - numFullShifts * shiftCost;
  const partialHours = Math.floor(remainingAmount / hourlyRate);

  const visits = [];
  if (numFullShifts > 0) {
    for (let i = 0; i < numFullShifts; i++) {
      visits.push({ hours: SHIFT_HOURS, shiftType: 'Overnight' });
    }
  } else if (partialHours > 0) {
    visits.push({ hours: partialHours, shiftType: 'Partial overnight' });
  }
  if (visits.length === 0) return null;

  const today = (opts && opts.today) || new Date();
  const lead = state.lead || {};
  const { rows: feeRows, subtotal } = buildFeeTable(visits, hourlyRate);
  const tax = Math.round(subtotal * HST_RATE * 100) / 100;
  const total = Math.round((subtotal + tax) * 100) / 100;
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
          hLineColor: () => '#999',
          vLineColor: () => '#999',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          paddingLeft: () => 6,
          paddingRight: () => 6
        }
      },
      {
        table: {
          widths: ['auto', '*', 'auto', 'auto', 'auto', 'auto'],
          body: totalsRows
        },
        layout: {
          hLineColor: () => '#999',
          vLineColor: () => '#999',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 4,
          paddingBottom: () => 4,
          paddingLeft: () => 6,
          paddingRight: () => 6
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
 *
 * @param {{lead?: object}} state
 * @param {Date} [today=new Date()]
 */
export function buildEstimateFilename(state, today = new Date()) {
  const rawLast = (state && state.lead && state.lead.lastName) || '';
  const slug = rawLast.toLowerCase().replace(/[^a-z0-9]/g, '') || 'family';
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `alma-coverage-estimate-${slug}-${yyyy}-${mm}-${dd}.pdf`;
}
