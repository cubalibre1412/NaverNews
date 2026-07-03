const crypto = require("crypto");
const fs = require("fs/promises");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const tls = require("tls");

const PORT = Number(process.env.PORT || 4173);
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "subscriptions.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const DEFAULT_SEND_TIME = "09:00";
const DEFAULT_LIMIT = 10;

let subscriptions = [];
let schedulerBusy = false;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload)
  });
  res.end(payload);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { status: 400 });
  }
}

async function loadSubscriptions() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    subscriptions = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    subscriptions = [];
    await saveSubscriptions();
  }
}

async function saveSubscriptions() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(subscriptions, null, 2), "utf8");
}

function cleanKeyword(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value || ""));
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function stripTracking(url) {
  try {
    return new URL(decodeHtml(url)).toString();
  } catch {
    return decodeHtml(url);
  }
}

function parseNaverNews(html, limit) {
  const items = [];
  const seen = new Set();
  const patterns = [
    /<a[^>]+href="([^"]+)"[^>]+data-heatmap-target="\.tit"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>\s*<\/a>/gi,
    /<a[^>]+class="[^"]*\bnews_tit\b[^"]*"[^>]+href="([^"]+)"[^>]*title="([^"]*)"[^>]*>/gi
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(html)) && items.length < limit) {
      const url = stripTracking(match[1]);
      const title = decodeHtml(match[2]);
      if (!title || seen.has(url)) continue;
      seen.add(url);

      const before = html.slice(Math.max(0, match.index - 3000), match.index);
      const after = html.slice(match.index, Math.min(html.length, match.index + 2500));
      const nearby = `${before}${after}`;
      const sourceMatches = [...nearby.matchAll(/sds-comps-profile-info-title-text[^>]*>(?:<a[^>]*>)?(?:<span[^>]*>)?([\s\S]*?)(?:<\/span>)?(?:<\/a>)?<\/span>/gi)];
      const sourceMatch = sourceMatches[sourceMatches.length - 1]
        || nearby.match(/<a[^>]+class="[^"]*\binfo press\b[^"]*"[^>]*>(.*?)<\/a>/i)
        || nearby.match(/<span[^>]+class="[^"]*\binfo press\b[^"]*"[^>]*>(.*?)<\/span>/i);
      const summaryMatch = after.match(/data-heatmap-target="\.body"[^>]*>\s*<span[^>]*>([\s\S]*?)<\/span>/i)
        || after.match(/<a[^>]+class="[^"]*\bdsc_txt_wrap\b[^"]*"[^>]*>(.*?)<\/a>/i)
        || after.match(/<div[^>]+class="[^"]*\bnews_dsc\b[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i);
      const dateMatch = nearby.match(/<span[^>]*>([^<]*(?:\uCD08|\uBD84|\uC2DC\uAC04|\uC77C|\uC8FC|\uAC1C\uC6D4|\uB144)\s*\uC804)<\/span>/i)
        || nearby.match(/<span[^>]+class="[^"]*\binfo\b[^"]*"[^>]*>([^<]*(?:\uC804|\uBA74|\uC77C|\uC2DC\uAC04|\uBD84)[^<]*)<\/span>/i);

      items.push({
        title,
        url,
        source: sourceMatch ? decodeHtml(sourceMatch[1]).replace(/\uC5B8\uB860\uC0AC \uC120\uC815/g, "").trim() : "",
        summary: summaryMatch ? decodeHtml(summaryMatch[1]) : "",
        dateText: dateMatch ? decodeHtml(dateMatch[1]) : ""
      });
    }
    if (items.length >= limit) break;
  }

  return items;
}

async function searchNaverNews(keyword, limit = DEFAULT_LIMIT) {
  const query = cleanKeyword(keyword);
  if (!query) throw Object.assign(new Error("Enter a search keyword."), { status: 400 });

  const url = `https://search.naver.com/search.naver?where=news&sm=tab_jum&sort=1&query=${encodeURIComponent(query)}`;
  const html = await requestHtml(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
    }
  });

  return {
    keyword: query,
    fetchedAt: new Date().toISOString(),
    sourceUrl: url,
    items: parseNaverNews(html, Math.min(Math.max(Number(limit) || DEFAULT_LIMIT, 1), 30))
  };
}

function requestHtml(url, options = {}) {
  const rejectUnauthorized = process.env.NAVER_TLS_REJECT_UNAUTHORIZED !== "0";

  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "GET",
      headers: options.headers || {},
      rejectUnauthorized
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Naver News search failed. (${response.statusCode})`));
          return;
        }
        resolve(body);
      });
    });

    request.setTimeout(20000, () => request.destroy(new Error("Naver News search timed out.")));
    request.on("error", (error) => {
      if (error.code === "SELF_SIGNED_CERT_IN_CHAIN") {
        reject(new Error("Naver HTTPS certificate validation failed. If this PC uses a trusted corporate proxy, run with NAVER_TLS_REJECT_UNAUTHORIZED=0."));
        return;
      }
      reject(error);
    });
    request.end();
  });
}

function smtpConfig() {
  const port = Number(process.env.SMTP_PORT || 465);
  return {
    host: process.env.SMTP_HOST || "",
    port,
    secure: String(process.env.SMTP_SECURE || (port === 465 ? "true" : "false")).toLowerCase() === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || ""
  };
}

function requireSmtpConfig() {
  const config = smtpConfig();
  const missing = [];
  for (const key of ["host", "port", "user", "pass", "from"]) {
    if (!config[key]) missing.push(key.toUpperCase());
  }
  if (missing.length) {
    throw Object.assign(new Error(`SMTP settings are missing: ${missing.join(", ")}.`), { status: 400 });
  }
  return config;
}

function smtpRead(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines[lines.length - 1] || "";
      if (/^\d{3} /.test(last)) {
        socket.off("data", onData);
        socket.off("error", reject);
        resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function smtpCommand(socket, command, expected) {
  if (command) socket.write(`${command}\r\n`);
  const response = await smtpRead(socket);
  const code = Number(response.slice(0, 3));
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(code)) {
    throw new Error(`SMTP error: ${command || "connect"} -> ${response.trim()}`);
  }
  return response;
}

function smtpConnect(config) {
  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect({ host: config.host, port: config.port, servername: config.host }, () => resolve(socket))
      : net.connect({ host: config.host, port: config.port }, () => resolve(socket));
    socket.setTimeout(20000);
    socket.once("error", reject);
    socket.once("timeout", () => reject(new Error("SMTP connection timed out.")));
  });
}

function base64(value) {
  return Buffer.from(String(value), "utf8").toString("base64");
}

function wrapBase64(value) {
  return Buffer.from(String(value), "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trim();
}

function formatAddress(address) {
  return `<${String(address).trim()}>`;
}

function buildEmail({ from, to, subject, html }) {
  const boundary = `b_${crypto.randomBytes(12).toString("hex")}`;
  return [
    `From: ${formatAddress(from)}`,
    `To: ${formatAddress(to)}`,
    `Subject: =?UTF-8?B?${base64(subject)}?=`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    wrapBase64(html),
    "",
    `--${boundary}--`,
    ".",
    ""
  ].join("\r\n");
}

async function sendMail({ to, subject, html }) {
  const config = requireSmtpConfig();
  let socket = await smtpConnect(config);

  await smtpCommand(socket, null, 220);
  await smtpCommand(socket, `EHLO ${config.host}`, 250);

  if (!config.secure && config.port === 587) {
    await smtpCommand(socket, "STARTTLS", 220);
    socket = tls.connect({ socket, servername: config.host });
    await new Promise((resolve) => socket.once("secureConnect", resolve));
    await smtpCommand(socket, `EHLO ${config.host}`, 250);
  }

  await smtpCommand(socket, "AUTH LOGIN", 334);
  await smtpCommand(socket, base64(config.user), 334);
  await smtpCommand(socket, base64(config.pass), 235);
  await smtpCommand(socket, `MAIL FROM:${formatAddress(config.from)}`, 250);
  await smtpCommand(socket, `RCPT TO:${formatAddress(to)}`, [250, 251]);
  await smtpCommand(socket, "DATA", 354);
  socket.write(buildEmail({ from: config.from, to, subject, html }));
  await smtpCommand(socket, null, 250);
  socket.write("QUIT\r\n");
  socket.end();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildDigestHtml(subscription, result) {
  const items = result.items;
  const list = items.length
    ? items.map((item, index) => `
      <li style="margin:0 0 18px;">
        <a href="${escapeHtml(item.url)}" style="font-weight:700;color:#1558d6;text-decoration:none;">${index + 1}. ${escapeHtml(item.title)}</a>
        <div style="margin-top:5px;color:#667085;font-size:13px;">${escapeHtml([item.source, item.dateText].filter(Boolean).join(" - "))}</div>
        <p style="margin:6px 0 0;color:#344054;line-height:1.5;">${escapeHtml(item.summary)}</p>
      </li>`).join("")
    : "<li>No news results were found today.</li>";

  return `<!doctype html>
  <html lang="ko">
    <body style="font-family:Arial,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;color:#101828;">
      <h2 style="margin:0 0 8px;">Naver News results: ${escapeHtml(subscription.keyword)}</h2>
      <p style="margin:0 0 20px;color:#667085;">Fetched at: ${new Date(result.fetchedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</p>
      <ol style="padding-left:22px;">${list}</ol>
      <p style="margin-top:24px;">
        <a href="${escapeHtml(result.sourceUrl)}" style="color:#1558d6;">View all results on Naver</a>
      </p>
    </body>
  </html>`;
}

async function sendDigest(subscription) {
  const result = await searchNaverNews(subscription.keyword, subscription.limit || DEFAULT_LIMIT);
  await sendMail({
    to: subscription.email,
    subject: `[Naver News] ${subscription.keyword} results (${result.items.length})`,
    html: buildDigestHtml(subscription, result)
  });

  subscription.lastSentAt = new Date().toISOString();
  subscription.lastStatus = "sent";
  subscription.lastError = "";
  await saveSubscriptions();
  return result;
}

function todaySeoul() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function timeSeoul() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
}

async function runScheduler() {
  if (schedulerBusy) return;
  schedulerBusy = true;
  try {
    const date = todaySeoul();
    const now = timeSeoul();
    for (const subscription of subscriptions) {
      if (!subscription.active) continue;
      if ((subscription.sendTime || DEFAULT_SEND_TIME) !== now) continue;
      if (subscription.lastSentDate === date) continue;

      try {
        await sendDigest(subscription);
        subscription.lastSentDate = date;
      } catch (error) {
        subscription.lastStatus = "failed";
        subscription.lastError = error.message;
      }
      await saveSubscriptions();
    }
  } finally {
    schedulerBusy = false;
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return text(res, 403, "Forbidden");

  try {
    const body = await fs.readFile(filePath);
    text(res, 200, body, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  } catch {
    text(res, 404, "Not found");
  }
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/api/subscriptions") {
    return json(res, 200, { subscriptions, smtpReady: Boolean(smtpConfig().host && smtpConfig().user && smtpConfig().pass) });
  }

  if (req.method === "POST" && url.pathname === "/api/search") {
    const body = await readJson(req);
    const result = await searchNaverNews(body.keyword, body.limit);
    return json(res, 200, result);
  }

  if (req.method === "POST" && url.pathname === "/api/subscriptions") {
    const body = await readJson(req);
    const keyword = cleanKeyword(body.keyword);
    const email = String(body.email || "").trim();
    const sendTime = body.sendTime || DEFAULT_SEND_TIME;

    if (!keyword) throw Object.assign(new Error("Enter a keyword."), { status: 400 });
    if (!isEmail(email)) throw Object.assign(new Error("Enter a valid email address."), { status: 400 });
    if (!isTime(sendTime)) throw Object.assign(new Error("Send time must use HH:MM format."), { status: 400 });

    const subscription = {
      id: crypto.randomUUID(),
      keyword,
      email,
      sendTime,
      limit: Math.min(Math.max(Number(body.limit) || DEFAULT_LIMIT, 1), 30),
      active: true,
      createdAt: new Date().toISOString(),
      lastSentAt: "",
      lastSentDate: "",
      lastStatus: "waiting",
      lastError: ""
    };
    subscriptions.unshift(subscription);
    await saveSubscriptions();
    return json(res, 201, { subscription });
  }

  const idMatch = url.pathname.match(/^\/api\/subscriptions\/([^/]+)$/);
  if (idMatch && req.method === "DELETE") {
    subscriptions = subscriptions.filter((item) => item.id !== idMatch[1]);
    await saveSubscriptions();
    return json(res, 200, { ok: true });
  }

  if (idMatch && req.method === "PATCH") {
    const body = await readJson(req);
    const subscription = subscriptions.find((item) => item.id === idMatch[1]);
    if (!subscription) return json(res, 404, { error: "Subscription not found." });
    if (typeof body.active === "boolean") subscription.active = body.active;
    if (body.sendTime && isTime(body.sendTime)) subscription.sendTime = body.sendTime;
    await saveSubscriptions();
    return json(res, 200, { subscription });
  }

  const testMatch = url.pathname.match(/^\/api\/subscriptions\/([^/]+)\/test$/);
  if (testMatch && req.method === "POST") {
    const subscription = subscriptions.find((item) => item.id === testMatch[1]);
    if (!subscription) return json(res, 404, { error: "Subscription not found." });
    const result = await sendDigest(subscription);
    return json(res, 200, { ok: true, count: result.items.length });
  }

  return json(res, 404, { error: "API not found." });
}

async function handleRequest(req, res) {
  try {
    if (req.url.startsWith("/api/")) return await handleApi(req, res);
    return await serveStatic(req, res);
  } catch (error) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.url} failed`);
    console.error(error && error.stack ? error.stack : error);
    json(res, error.status || 500, { error: error.message || "Server error." });
  }
}

async function main() {
  await loadSubscriptions();
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Naver News Mailer is running at http://localhost:${PORT}`);
    console.log(`SMTP configured: ${smtpConfig().host ? "yes" : "no"}`);
  });
  setInterval(runScheduler, 60 * 1000);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
