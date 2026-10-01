# QA Coaching Review Center

QA coaching follow-up app for HotelPlanner call-center quality reviews.

## Database

The live **Daily-Findings Google Sheet** is the database. A bound Google Apps Script web app (`Code.gs`) reads and writes the sheet.

Netlify database variables:
- `DATABASE_URL` = deployed Google Apps Script web-app `/exec` URL
- `DATABASE_TOKEN` = optional shared token. If used, set the same value in Apps Script Script Properties.

Firebase is not required for reviews, coaching, login management, leaderboards, presence, import, or export.

The script uses the existing tabs `Buwelo`, `Concentrix`, `WNS`, `Telus`, and `Scores`. It automatically creates `_Users`, `_Coaching-Audit`, `_TL-Disputes`, and `_Presence` when needed.

## Authentication

Original Netlify environment logins remain bootstrap/fallback accounts. Managed logins created in **Admin / Settings** are stored in `_Users` with salted SHA-256 password hashes.

Admin variables:
- `ADMIN_VALDEMIR_EMAIL` / `ADMIN_VALDEMIR_PASSWORD`
- `ADMIN_BARBARA_EMAIL` / `ADMIN_BARBARA_PASSWORD`
- `ADMIN_APRIL_EMAIL` / `ADMIN_APRIL_PASSWORD`

Center variables:
- `BUWELO_EMAIL` / `BUWELO_PASSWORD`
- `WNS_EMAIL` / `WNS_PASSWORD`
- `CONCENTRIX_EMAIL` / `CONCENTRIX_PASSWORD`
- `TELUS_EMAIL` / `TELUS_PASSWORD`

## Apps Script deployment

1. Open the Daily-Findings Google Sheet.
2. Extensions → Apps Script.
3. Replace the editor contents with the provided `Code.gs`.
4. Deploy → New deployment → Web app.
5. Execute as: **Me**.
6. Who has access: **Anyone**.
7. Deploy and copy the URL ending in `/exec`.
8. In Netlify → Environment variables, add `DATABASE_URL` with that URL.
9. Redeploy the site.

Optional security: add a Script Property called `DATABASE_TOKEN`, then add the same `DATABASE_TOKEN` value in Netlify.

## Coaching data

The app writes coaching directly into the existing `Coached?`, `Date Coached`, `Coached By`, `Coaching Response / Notes`, and `Confirmation Link` columns. Completed coaching rows are highlighted light green. TL disputes are stored in `_TL-Disputes` and the source row is highlighted orange.

## Import / export

Admin workbook upload imports directly into the Daily-Findings Google Sheet. Existing coaching fields are preserved when an existing Call ID is updated. The `Scores` tab is refreshed from the uploaded workbook. Exports are generated from live Google Sheet data.

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required minimum variables: `DATABASE_URL`, `AUTH_SECRET`, and the login environment variables you want enabled.
