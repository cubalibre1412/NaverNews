# Naver News Mailer

A small Node.js web app that searches Naver News by keyword and sends a daily email digest to registered recipients.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/cubalibre1412/NaverNews)

## Run locally

```powershell
cd C:\Users\Pulmuone\Documents\Codex\2026-07-03\c\outputs\naver-news-mailer
node server.js
```

Open `http://localhost:4173`.

## SMTP setup

Set SMTP environment variables before running the server. Gmail app password example:

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

This is a server app because it needs a scheduler, SMTP delivery, and local subscription storage. It cannot run on GitHub Pages alone.

Recommended deployment options:

- Render: connect this GitHub repository and use the included `render.yaml` blueprint, or click the Deploy to Render button above.
- Railway or Fly.io: deploy the included `Dockerfile`.

After deployment, set these environment variables in the hosting service:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASS`
- `MAIL_FROM`

If Naver requests fail because of a trusted corporate HTTPS inspection proxy, set `NAVER_TLS_REJECT_UNAUTHORIZED=0` only in that trusted environment.

## Features

- Preview latest Naver News search results.
- Register keyword, recipient email, daily send time, and result count.
- Send a test email for a subscription.
- Check every minute and send each active subscription once per day at the configured Korea time.
- Store subscriptions in `data/subscriptions.json`.