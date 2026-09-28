# QA Coaching Review Center

QA coaching follow-up app for HotelPlanner call-center quality reviews. It reads and writes the existing **Daily-Findings** Google Sheet and keeps QA findings read-only while allowing coaching confirmation fields to be updated.

## Architecture

- Next.js App Router + React + TypeScript + Tailwind CSS
- Netlify deployment using the official Next.js/OpenNext integration
- Server-side Google Sheets API only; no separate database
- Server-side authentication with signed HTTP-only session cookies
- Roles: Super Admin (Valdemir / Barbara) and one isolated account per center (Buwelo, WNS, Concentrix, Telus)
- Call ID is the primary review identifier and ownership is rechecked before every write
- `Coaching-Audit` is created inside the same spreadsheet on the first coaching write if it does not already exist
- The supplied QA Control artwork is stored locally at `public/images/qa-control-background.jpg` and is used as the application background

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Live review data requires the Google service-account environment variables.

## Environment variables

Copy `.env.example`. Never commit real values.

Required in Netlify: `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `AUTH_SECRET`, `ADMIN_VALDEMIR_EMAIL`, `ADMIN_VALDEMIR_PASSWORD`, `ADMIN_BARBARA_EMAIL`, `ADMIN_BARBARA_PASSWORD`, `BUWELO_EMAIL`, `BUWELO_PASSWORD`, `WNS_EMAIL`, `WNS_PASSWORD`, `CONCENTRIX_EMAIL`, `CONCENTRIX_PASSWORD`, `TELUS_EMAIL`, `TELUS_PASSWORD`. `APP_BASE_URL` is optional for future confirmation-link features.

Use separate center credentials. For example, WNS can be configured as `WNS@HP.COM` with its password stored only in Netlify. Do not commit the real password.

## Google service account setup

Create or use a Google Cloud project, enable the **Google Sheets API**, create a service account, and generate credentials. Store the service-account email and private key only as Netlify environment variables. Share the **Daily-Findings** Google Sheet with the service-account email as **Editor**. Never commit the downloaded JSON credential file.

The app expects these tabs: `Buwelo`, `Concentrix`, `WNS`, `Telus`. It does not use `Scores` for coaching. Header rows are detected by finding `Call ID`, so moving the QA header row does not require changing hard-coded column numbers.

Expected QA/coaching headers include: `Date`, `Booking Itinerary number`, `Call center`, `Agent's name`, `Call ID`, `What guest needed?`, `What happened?`, `The Correct Matrix Process`, `Business impact`, `Quick Coaching`, `Call Lenght`, `Date-of-the-call`, `Call Month`, `Coached?`, `Date Coached`, `Coached By`, `Coaching Response / Notes`, `Confirmation Link`.

Google Apps Script is not required. The deployed Next.js server routes communicate directly with the Google Sheets API.

## Authentication and permissions

Passwords are never sent as a list to the browser and are never stored in frontend code. Login comparison runs server-side and sessions use signed HTTP-only cookies with SameSite protection, expiration, and `Secure` in production. Center routes re-check the session. A WNS user cannot access or write Buwelo data by changing the URL. Admins can view all centers, edit coaching submissions, correct coaching details, and reopen coaching.

## Coaching SLA

Default overdue threshold is **2 business days**. Change `OVERDUE_BUSINESS_DAYS` in `lib/date.ts` later if the SLA changes.

## Netlify

Connect this repository to Netlify. Build command is `npm run build`, publish directory is `.next`, Node is set to 22 in `netlify.toml`. Modern Next.js App Router/SSR/API route handlers are deployed as one Netlify project; no separate backend server is required.

Add the environment variables in **Netlify → Site configuration → Environment variables**, then deploy.

## Tests

The repository contains automated tests for the business-day overdue rule, center isolation, and combined filters, plus a GitHub Actions workflow that runs:

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

## Adding another center

Add the center name to `Center` in `lib/types.ts`, add it to `CENTERS` in `lib/googleSheets.ts`, add its login environment variables in `lib/auth.ts` and `.env.example`, and create a matching Google Sheet tab with the same headers.

## Troubleshooting

**Google Sheet unavailable:** verify the spreadsheet ID, service-account email/key, Sheets API, and that the sheet is shared with the service account as Editor.

**Invalid login:** confirm the center/admin environment variables are set on the same Netlify deploy context.

**Missing or duplicate Call ID:** the app refuses to write if the target review cannot be identified uniquely.

**Private key errors:** Netlify may store newlines escaped. The app normalizes `\\n` to real line breaks before Google authentication.
