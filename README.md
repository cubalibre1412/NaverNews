# Naver News Mailer

A small Node.js web app that searches Naver News by keyword and sends a daily email digest to registered recipients.

## Run locally

```powershell
cd C:\Users\Pulmuone\Documents\Codex\2026-07-03\c\outputs\naver-news-mailer
node server.js
```

Open `http://localhost:4173`.

## Subscription storage

Subscriptions and sent article URLs are saved as JSON. For Render Free, use GitHub-backed storage so the data survives deploys, restarts, and instance replacement:

```text
GITHUB_STORAGE_REPO=cubalibre1412/navernews-private-data
GITHUB_STORAGE_PATH=data/subscriptions.json
GITHUB_STORAGE_BRANCH=main
GITHUB_STORAGE_TOKEN=your-github-token
SCHEDULER_TOKEN=your-random-scheduler-token
ADMIN_TOKEN=your-random-admin-token
```

Use a private repository for `GITHUB_STORAGE_REPO` because the JSON file contains recipient emails, keywords, and sent-article history. The token needs repository contents read/write access for that private repository. The app reads and writes the JSON file through the GitHub Contents API.

Set `ADMIN_TOKEN` to protect subscription listing, editing, deleting, and test email sending. The browser asks for this token the first time the admin screen loads and stores it locally.

If GitHub storage is not configured, the app falls back to local server storage. By default, the local file is:

```text
data/subscriptions.json
```

For paid Render services, you can attach a persistent disk and set:

```text
DATA_DIR=/var/data
```

Only files under the disk mount path survive deploys and restarts on paid Render services. If you use Render Free without GitHub storage, subscriptions can disappear after a redeploy, restart, or instance replacement.

Each subscription stores recently sent article URLs. After the first email, matching URLs are skipped in later emails so the same article is not sent again. If there are no new articles, the app does not send an empty email.

One subscription can include multiple recipient emails. Emails are sent separately to each recipient.

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

For Render, use Gmail API variables rather than SMTP because SMTP connections may time out. To move an existing paid Render service with a disk to Render Free, copy the current `/var/data/subscriptions.json` contents into `data/subscriptions.json` in a private storage repository, set the GitHub storage variables above, deploy, confirm `/api/subscriptions` reports `github:...` as the storage path, then remove the disk and switch the instance type to Free.

If Naver requests fail because of a trusted corporate HTTPS inspection proxy, set `NAVER_TLS_REJECT_UNAUTHORIZED=0` only in that trusted environment.

## Features

- Preview latest Naver News search results.
- Register multiple keywords, recipient emails, daily send time, and result count.
- Edit, pause, resume, delete, and test subscriptions from the Subscriptions menu.
- Skip articles that were already sent for the same subscription.
- Send a test email for a subscription.
- Check every minute and send each active subscription once per day at the configured Korea time.
- Store subscriptions in `data/subscriptions.json` or the `DATA_DIR` path.

## Render Free scheduler

Render Free services can sleep when they are idle, so the in-process minute-by-minute scheduler may not be awake at the exact send time. Configure an external scheduler to call:

```text
POST https://navernews-5c32.onrender.com/api/scheduler/run
Authorization: Bearer your-random-scheduler-token
```

The endpoint runs the same due-subscription check as the internal scheduler. Call it at least once per minute around the expected send time, or run it every minute during the morning send window.

This repository includes `.github/workflows/render-free-scheduler.yml`, which calls the endpoint every five minutes from 09:00 to 11:55 Korea time. Add these repository secrets before enabling Render Free:

```text
SCHEDULER_TOKEN=the same value configured in Render
NAVERNEWS_SCHEDULER_URL=https://navernews-5c32.onrender.com/api/scheduler/run
```
