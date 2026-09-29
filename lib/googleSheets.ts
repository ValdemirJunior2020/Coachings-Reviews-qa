import { google } from 'googleapis';
import type { Center, Review } from './types';
import { businessDaysOld, isOverdue } from './date';

const CENTERS: Center[] = ['Buwelo', 'WNS', 'Concentrix', 'Telus'];
const COACHING_HEADERS = [
  'Coached?',
  'Date Coached',
  'Coached By',
  'Coaching Response / Notes',
  'Confirmation Link',
];

function spreadsheetId() {
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  if (!id) throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not configured');
  return id;
}

function sheets() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google Sheets service account is not configured');

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function norm(s: unknown) {
  return String(s ?? '').trim();
}

function truthy(v: unknown) {
  return ['true', 'yes', '1', 'coached', 'completed'].includes(norm(v).toLowerCase());
}

function excelishDate(v: unknown) {
  const s = norm(v);
  if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toISOString().slice(0, 10);
}

async function readCenter(center: Center): Promise<Review[]> {
  const api = sheets();
  const id = spreadsheetId();

  const head = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${center}'!1:10`,
  });
  const top = head.data.values ?? [];
  const headerOffset = top.findIndex((r) =>
    r.some((c) => norm(c).toLowerCase() === 'call id')
  );
  if (headerOffset < 0) throw new Error(`Could not find Call ID header in ${center}`);

  const headerRow = headerOffset + 1;
  const headers = top[headerOffset].map(norm);
  const col = (name: string) =>
    headers.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  const missing = COACHING_HEADERS.filter((h) => col(h) < 0);
  if (missing.length) {
    throw new Error(`${center} is missing coaching columns: ${missing.join(', ')}`);
  }

  const data = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${center}'!${headerRow + 1}:10000`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  return (data.data.values ?? [])
    .map((r, idx) => {
      const g = (h: string) => r[col(h)];
      const coached = truthy(g('Coached?'));
      const qaDate = excelishDate(g('Date'));

      return {
        center,
        rowNumber: headerRow + 1 + idx,
        qaDate,
        itinerary: norm(g('Booking Itinerary number')),
        agent: norm(g("Agent's name")),
        callId: norm(g('Call ID')),
        guestNeeded: norm(g('What guest needed?')),
        happened: norm(g('What happened?')),
        matrixProcess: norm(g('The Correct Matrix Process')),
        businessImpact: norm(g('Business impact')),
        quickCoaching: norm(g('Quick Coaching')),
        callLength: norm(g('Call Lenght')),
        callDate: excelishDate(g('Date-of-the-call')),
        callMonth: norm(g('Call Month')),
        coached,
        dateCoached: excelishDate(g('Date Coached')),
        coachedBy: norm(g('Coached By')),
        coachingNotes: norm(g('Coaching Response / Notes')),
        confirmationLink: norm(g('Confirmation Link')),
        status: coached ? 'Completed' : isOverdue(qaDate, coached) ? 'Overdue' : 'Pending',
        ageBusinessDays: businessDaysOld(qaDate),
        positive: /good job|positive/i.test(
          norm(g('Quick Coaching')) + ' ' + norm(g('Business impact'))
        ),
      } satisfies Review;
    })
    .filter((r) => r.callId);
}

export async function getReviews(center?: Center) {
  return center
    ? readCenter(center)
    : (await Promise.all(CENTERS.map(readCenter))).flat();
}

async function findRow(center: Center, callId: string) {
  const reviews = await readCenter(center);
  const matches = reviews.filter((r) => r.callId === callId);
  if (matches.length === 0) throw new Error('Review no longer exists');
  if (matches.length > 1) throw new Error('Duplicate Call ID found');
  return matches[0];
}

function colLetter(n: number) {
  let s = '';
  for (n++; n; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

async function headerMap(center: Center) {
  const api = sheets();
  const id = spreadsheetId();
  const head = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${center}'!1:10`,
  });
  const top = head.data.values ?? [];
  const i = top.findIndex((r) =>
    r.some((c) => norm(c).toLowerCase() === 'call id')
  );
  if (i < 0) throw new Error('Header row not found');
  return { api, id, row: i + 1, headers: top[i].map(norm) };
}

export async function updateCoaching(args: {
  center: Center;
  callId: string;
  coached: boolean;
  dateCoached?: string;
  coachedBy?: string;
  notes?: string;
  actor: string;
  role: string;
}) {
  const existing = await findRow(args.center, args.callId);
  const { api, id, headers } = await headerMap(args.center);
  const ix = (h: string) =>
    headers.findIndex((x) => x.toLowerCase() === h.toLowerCase());

  const updates = [
    {
      range: `'${args.center}'!${colLetter(ix('Coached?'))}${existing.rowNumber}`,
      values: [[args.coached ? 'TRUE' : 'FALSE']],
    },
    {
      range: `'${args.center}'!${colLetter(ix('Date Coached'))}${existing.rowNumber}`,
      values: [[args.coached ? (args.dateCoached || new Date().toISOString().slice(0, 10)) : '']],
    },
    {
      range: `'${args.center}'!${colLetter(ix('Coached By'))}${existing.rowNumber}`,
      values: [[args.coached ? (args.coachedBy || '') : '']],
    },
    {
      range: `'${args.center}'!${colLetter(ix('Coaching Response / Notes'))}${existing.rowNumber}`,
      values: [[args.coached ? (args.notes || '') : '']],
    },
  ];

  await api.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
  });

  await appendAudit({
    actor: args.actor,
    role: args.role,
    center: args.center,
    callId: args.callId,
    action: args.coached
      ? existing.coached
        ? 'COACHING_EDITED'
        : 'COACHING_COMPLETED'
      : 'COACHING_REOPENED',
    oldValue: JSON.stringify({
      coached: existing.coached,
      dateCoached: existing.dateCoached,
      coachedBy: existing.coachedBy,
      notes: existing.coachingNotes,
    }),
    newValue: JSON.stringify({
      coached: args.coached,
      dateCoached: args.dateCoached,
      coachedBy: args.coachedBy,
      notes: args.notes,
    }),
  });

  return findRow(args.center, args.callId);
}

async function ensureAuditSheet() {
  const api = sheets();
  const id = spreadsheetId();

  const meta = await api.spreadsheets.get({
    spreadsheetId: id,
    fields: 'sheets.properties.title',
  });

  const exists = (meta.data.sheets ?? []).some(
    (s) => s.properties?.title === 'Coaching-Audit'
  );

  if (!exists) {
    await api.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'Coaching-Audit' } } }],
      },
    });
  }

  const h = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: "'Coaching-Audit'!1:1",
  });

  if (!(h.data.values?.[0]?.length)) {
    await api.spreadsheets.values.update({
      spreadsheetId: id,
      range: "'Coaching-Audit'!A1:H1",
      valueInputOption: 'RAW',
      requestBody: {
        values: [[
          'timestamp', 'user', 'role', 'center',
          'Call ID', 'action', 'old value', 'new value',
        ]],
      },
    });
  }

  return { api, id };
}

async function appendAudit(a: {
  actor: string;
  role: string;
  center: Center;
  callId: string;
  action: string;
  oldValue: string;
  newValue: string;
}) {
  const { api, id } = await ensureAuditSheet();
  await api.spreadsheets.values.append({
    spreadsheetId: id,
    range: "'Coaching-Audit'!A:H",
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: {
      values: [[
        new Date().toISOString(),
        a.actor,
        a.role,
        a.center,
        a.callId,
        a.action,
        a.oldValue,
        a.newValue,
      ]],
    },
  });
}


const DAILY_FINDINGS_SPREADSHEET_ID = '1YD6wgQqaV-luNexAv_fiTg-AhXcH_DoJKt5HubJsbWg';

function coachingSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL;
  const key = (process.env.GOOGLE_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY)?.replace(/\\n/g, '\n');
  if (!email || !key) throw new Error('Google Sheets credentials are not configured');
  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

/**
 * Finds a review by Call ID on the center tab and colors the entire source row.
 * Light green = coached. White = reopened.
 */
export async function setReviewRowColor(center: Center, callId: string, state: 'coached'|'disputed'|'normal') {
  const api = coachingSheetsClient();
  const id = process.env.GOOGLE_SHEETS_SPREADSHEET_ID || DAILY_FINDINGS_SPREADSHEET_ID;

  const meta = await api.spreadsheets.get({
    spreadsheetId: id,
    fields: 'sheets.properties(sheetId,title,gridProperties.columnCount)',
  });
  const sheet = (meta.data.sheets ?? []).find(x => x.properties?.title === center);
  const sheetId = sheet?.properties?.sheetId;
  const columnCount = sheet?.properties?.gridProperties?.columnCount ?? 18;
  if (sheetId === undefined || sheetId === null) throw new Error(`Google Sheet tab not found: ${center}`);

  const head = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${center}'!1:10`,
  });
  const top = head.data.values ?? [];
  const headerOffset = top.findIndex(r => r.some(c => norm(c).toLowerCase() === 'call id'));
  if (headerOffset < 0) throw new Error(`Could not find Call ID header in ${center}`);
  const callIdCol = top[headerOffset].findIndex(c => norm(c).toLowerCase() === 'call id');
  const headerRow = headerOffset + 1;
  const letter = colLetter(callIdCol);

  const values = await api.spreadsheets.values.get({
    spreadsheetId: id,
    range: `'${center}'!${letter}${headerRow + 1}:${letter}10000`,
    valueRenderOption: 'FORMATTED_VALUE',
  });
  const rows = values.data.values ?? [];
  const matches:number[] = [];
  rows.forEach((r, i) => {
    if (norm(r[0]) === callId) matches.push(headerRow + 1 + i);
  });
  if (matches.length === 0) throw new Error(`Call ID ${callId} was not found in Google Sheet tab ${center}`);
  if (matches.length > 1) throw new Error(`Duplicate Call ID ${callId} found in Google Sheet tab ${center}`);

  const rowNumber = matches[0];
  const backgroundColor = state === 'disputed' ? { red: 1.0, green: 0.92, blue: 0.78 } : state === 'coached' ? { red: 0.88, green: 0.96, blue: 0.88 } : { red: 1, green: 1, blue: 1 };

  await api.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [{
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: rowNumber - 1,
            endRowIndex: rowNumber,
            startColumnIndex: 0,
            endColumnIndex: columnCount,
          },
          cell: { userEnteredFormat: { backgroundColor } },
          fields: 'userEnteredFormat.backgroundColor',
        },
      }],
    },
  });
}

export async function setCoachedRowHighlight(center: Center, callId: string, coached: boolean) {
  return setReviewRowColor(center, callId, coached ? 'coached' : 'normal');
}
