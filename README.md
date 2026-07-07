# Naver News Mailer

A small Node.js web app that searches Naver News by keyword and sends a daily email digest to registered recipients.

## Run locally

```powershell
cd C:\Users\Pulmuone\Documents\Codex\2026-07-03\c\outputs\naver-news-mailer
node server.js
```

Open `http://localhost:4173`.

## Subscription storage

Subscriptions are saved as JSON on the server. By default, the file is:

```text
data/subscriptions.json
```

For Render, attach a persistent disk and set:

```text
DATA_DIR=/var/data
```

Only files under the disk mount path survive deploys and restarts on Render. If you keep the default Render filesystem without a persistent disk, subscriptions can disappear after a redeploy or instance replacement.

## Gmail API setup for Render

Render may time out when connecting to Gmail SMTP. The Gmail API path sends over HTTPS and avoids SMTP ports. Set:

```text
GMAIL_CLIENT_ID=your-google-oauth-client-id
GMAIL_CLIENT_SECRET=your-google-oauth-client-secret
GMAIL_REFRESH_TOKEN=your-refresh-token
GMAIL_USER=your-email@gmail.com
```

When `GMAIL_REFRESH_TOKEN` is present, the app sends mail through the Gmail API first. If it is absent, the app falls back to SMTP.

## SMTP fallback

SMTP can work locally or on hosts that allow outbound SMTP. Gmail app password example:

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="465"
$env:SMTP_SECURE="true"
$env:SMTP_USER="your-email@gmail.com"
$env:SMTP_PASS="your-app-password"
$env:MAIL_FROM="your-email@gmail.com"
node server.js
```

Port 587 is also supported. Set `SMTP_SECURE=false` and the app will use STARTTLS.

## Deploy

This is a server app because it needs a scheduler, mail delivery, and local subscription storage. It cannot run on GitHub Pages alone.

Recommended deployment options:

- Render: connect this GitHub repository and use the included `render.yaml` blueprint.
- Railway or Fly.io: deploy the included `Dockerfile`.

For Render, use Gmail API variables rather than SMTP because SMTP connections may time out.

If Naver requests fail because of a trusted corporate HTTPS inspection proxy, set `NAVER_TLS_REJECT_UNAUTHORIZED=0` only in that trusted environment.

## Features

- Preview latest Naver News search results.
- Register multiple keywords, recipient email, daily send time, and result count.
- Edit, pause, resume, delete, and test subscriptions from the Subscriptions menu.
- Send a test email for a subscription.
- Check every minute and send each active subscription once per day at the configured Korea time.
- Store subscriptions in `data/subscriptions.json` or the `DATA_DIR` path.
