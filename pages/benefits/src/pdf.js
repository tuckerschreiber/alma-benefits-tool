// Alma Care BEAT — insurer coverage estimate PDF builder.
// Pure functions only. Returns a pdfmake-compatible doc definition object
// (or null when no estimate is warranted). Caller passes the object to
// `pdfmake.createPdf(doc)` to render.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

// Canadian postal-code first-letter → province. Some letters span multiple
// provinces in reality; these are the dominant CRM-style assignments.
// X covers NT/NU — we collapse to NT for simplicity.
const POSTAL_PROVINCE = {
  A: 'NL', B: 'NS', C: 'PE', E: 'NB', G: 'QC', H: 'QC', J: 'QC',
  K: 'ON', L: 'ON', M: 'ON', N: 'ON', P: 'ON',
  R: 'MB', S: 'SK', T: 'AB', V: 'BC', X: 'NT', Y: 'YT'
};

function formatLongDate(d) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function formatCurrency(n) {
  return '$' + n.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildPreparedFor(lead) {
  const name = `${(lead.firstName || '').trim()} ${(lead.lastName || '').trim()}`.trim() || '—';
  const street = (lead.streetAddress || '').trim();
  const city = (lead.city || '').trim();
  const postal = (lead.postalCode || '').trim().toUpperCase();
  const province = postal ? POSTAL_PROVINCE[postal.charAt(0)] : '';
  const cityWithProv = [city, province].filter(Boolean).join(', ');
  const cityLine = [cityWithProv, postal].filter(Boolean).join(' · ');

  const lines = [{ text: `Prepared for: ${name}`, fontSize: 12, margin: [0, 4, 0, 0] }];
  if (street) lines.push({ text: street, fontSize: 10, color: '#555' });
  if (cityLine) lines.push({ text: cityLine, fontSize: 10, color: '#555' });
  return lines;
}

/**
 * Build a pdfmake doc-definition object for the insurer coverage estimate.
 * Renders one row per eligible pathway (RN, PSW) with a Total row when both
 * are present. Returns null when no rows would render.
 *
 * @param {{lead: object}} state
 * @param {{nursing?: {eligibleAmount: number}, psw?: {eligibleAmount: number}}} results
 * @param {{rnHourlyRate: number|null, pswHourlyRate: number|null, today: Date}} opts
 */
export function buildEstimateDocDefinition(state, results, opts) {
  const today = (opts && opts.today) || new Date();
  const rnAmount = results && results.nursing && results.nursing.eligibleAmount;
  const pswAmount = results && results.psw && results.psw.eligibleAmount;
  const rnRate = opts && opts.rnHourlyRate;
  const pswRate = opts && opts.pswHourlyRate;

  const rows = [];
  if (rnAmount > 0 && rnRate > 0) {
    const hours = Math.floor(rnAmount / rnRate);
    rows.push({
      service: 'Private Duty Nursing (RN)',
      rate: rnRate,
      amount: rnAmount,
      hours
    });
  }
  if (pswAmount > 0 && pswRate > 0) {
    const hours = Math.floor(pswAmount / pswRate);
    rows.push({
      service: 'Personal Support Worker (PSW)',
      rate: pswRate,
      amount: pswAmount,
      hours
    });
  }
  if (rows.length === 0) return null;

  const tableBody = [
    [
      { text: 'Service', bold: true },
      { text: 'Hourly rate', bold: true },
      { text: 'Eligible amount', bold: true },
      { text: 'Estimated hours', bold: true }
    ],
    ...rows.map((r) => [
      r.service,
      formatCurrency(r.rate),
      formatCurrency(r.amount),
      `${r.hours} hours`
    ])
  ];

  if (rows.length > 1) {
    const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
    const totalHours = rows.reduce((s, r) => s + r.hours, 0);
    tableBody.push([
      { text: 'Total', bold: true },
      '',
      { text: formatCurrency(totalAmount), bold: true },
      { text: `${totalHours} hours`, bold: true }
    ]);
  }

  return {
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { font: 'Roboto', fontSize: 10, color: '#222' },
    content: [
      { text: 'POSTPARTUM SUPPORT COVERAGE ESTIMATE', fontSize: 16, bold: true, color: '#032215' },
      { text: 'Alma Care', fontSize: 10, color: '#555', margin: [0, 2, 0, 8] },

      ...buildPreparedFor(state.lead || {}),
      { text: `Generated: ${formatLongDate(today)}`, fontSize: 10, color: '#555', margin: [0, 2, 0, 16] },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      { text: 'Purpose', fontSize: 11, bold: true, margin: [0, 14, 0, 4] },
      {
        text: 'This estimate is intended to support insurance coverage inquiry or pre-determination requests. Coverage approval remains subject to insurer policies and eligibility requirements.',
        fontSize: 10, margin: [0, 0, 0, 14]
      },

      { text: 'Service Estimate', fontSize: 11, bold: true, margin: [0, 0, 0, 6] },
      {
        table: { widths: [160, 70, '*', 80], body: tableBody },
        layout: {
          hLineColor: () => '#ddd',
          vLineColor: () => '#ddd',
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          paddingTop: () => 6,
          paddingBottom: () => 6,
          paddingLeft: () => 10,
          paddingRight: () => 10
        }
      },
      {
        text: 'Final care plans are customized based on family needs and coverage requirements.',
        fontSize: 9, italics: true, color: '#555', margin: [0, 8, 0, 14]
      },

      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.5, lineColor: '#999' }] },

      {
        text: 'This document is an estimate only and does not guarantee reimbursement or insurer approval.',
        fontSize: 8, italics: true, color: '#777', margin: [0, 10, 0, 0]
      }
    ],
    footer: {
      text: 'Questions? Speak with an Alma Postnatal Care Concierge · almacare.ca',
      alignment: 'center',
      fontSize: 8,
      color: '#777',
      margin: [0, 20, 0, 0]
    }
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
