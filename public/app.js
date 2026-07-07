const searchForm = document.querySelector("#searchForm");
const subscriptionForm = document.querySelector("#subscriptionForm");
const searchResults = document.querySelector("#searchResults");
const subscriptionsNode = document.querySelector("#subscriptions");
const smtpStatus = document.querySelector("#smtpStatus");
const refreshButton = document.querySelector("#refreshButton");
const toast = document.querySelector("#toast");

let toastTimer;

function notify(message, type = "ok") {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.className = `toast show ${type === "error" ? "error" : ""}`;
  toastTimer = setTimeout(() => {
    toast.className = "toast";
  }, 3600);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderResults(items) {
  if (!items.length) {
    searchResults.className = "results empty";
    searchResults.textContent = "No results found.";
    return;
  }

  searchResults.className = "results";
  searchResults.innerHTML = `
    <ul class="news-list">
      ${items.map((item) => `
        <li class="news-item">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>
          <div class="meta">
            ${item.source ? `<span>${escapeHtml(item.source)}</span>` : ""}
            ${item.dateText ? `<span>${escapeHtml(item.dateText)}</span>` : ""}
          </div>
          ${item.summary ? `<p class="summary">${escapeHtml(item.summary)}</p>` : ""}
        </li>
      `).join("")}
    </ul>`;
}

function renderSubscriptions(subscriptions) {
  if (!subscriptions.length) {
    subscriptionsNode.className = "subscriptions empty";
    subscriptionsNode.textContent = "No subscriptions yet.";
    return;
  }

  subscriptionsNode.className = "subscriptions";
  subscriptionsNode.innerHTML = `
    <ul class="sub-list">
      ${subscriptions.map((item) => `
        <li class="sub-item">
          <div class="sub-top">
            <div>
              <p class="sub-title">${escapeHtml((item.keywords && item.keywords.length ? item.keywords : [item.keyword]).join(", "))}</p>
              <div class="meta">
                <span>${escapeHtml(item.email)}</span>
                <span>Daily ${escapeHtml(item.sendTime)}</span>
                <span>${item.limit} results</span>
                ${item.sentItems && item.sentItems.length ? `<span>${item.sentItems.length} sent URLs stored</span>` : ""}
                ${item.lastSentAt ? `<span>Last sent ${new Date(item.lastSentAt).toLocaleString("ko-KR")}</span>` : ""}
                ${item.lastStatus === "no_new" ? "<span>No new articles last time</span>" : ""}
              </div>
              ${item.lastError ? `<p class="summary">Last error: ${escapeHtml(item.lastError)}</p>` : ""}
            </div>
            <span class="badge ${item.active ? "" : "off"}">${item.active ? "Active" : "Paused"}</span>
          </div>
          <div class="sub-actions">
            <button class="secondary" data-action="test" data-id="${item.id}" type="button">Send test</button>
            <button class="secondary" data-action="edit" data-id="${item.id}" type="button">Edit</button>
            <button class="secondary" data-action="toggle" data-id="${item.id}" data-active="${item.active}" type="button">${item.active ? "Pause" : "Resume"}</button>
            <button class="danger" data-action="delete" data-id="${item.id}" type="button">Delete</button>
          </div>
          <form class="edit-form stack" data-edit-id="${item.id}" hidden>
            <label>
              <span>Keywords</span>
              <textarea name="keywords" rows="4" required>${escapeHtml((item.keywords && item.keywords.length ? item.keywords : [item.keyword]).join("\n"))}</textarea>
            </label>
            <label>
              <span>Email</span>
              <input name="email" type="email" value="${escapeHtml(item.email)}" required>
            </label>
            <div class="two-cols">
              <label>
                <span>Send time</span>
                <input name="sendTime" type="time" value="${escapeHtml(item.sendTime)}" required>
              </label>
              <label>
                <span>Result count</span>
                <input name="limit" type="number" min="1" max="30" value="${escapeHtml(item.limit)}" required>
              </label>
            </div>
            <div class="sub-actions">
              <button type="submit">Save changes</button>
              <button class="secondary" data-action="cancel-edit" data-id="${item.id}" type="button">Cancel</button>
            </div>
          </form>
        </li>
      `).join("")}
    </ul>`;
}

async function loadSubscriptions() {
  const data = await api("/api/subscriptions");
  smtpStatus.textContent = data.mailReady || data.smtpReady ? "Mail ready" : "Mail setup needed";
  smtpStatus.className = `status ${data.mailReady || data.smtpReady ? "ready" : "warn"}`;
  renderSubscriptions(data.subscriptions);
}

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = searchForm.querySelector("button");
  const keyword = searchForm.keyword.value.trim();
  button.disabled = true;
  searchResults.className = "results empty";
  searchResults.textContent = "Searching...";

  try {
    const data = await api("/api/search", {
      method: "POST",
      body: JSON.stringify({ keyword, limit: 10 })
    });
    renderResults(data.items);
  } catch (error) {
    searchResults.className = "results empty";
    searchResults.textContent = error.message;
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

subscriptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = subscriptionForm.querySelector("button");
  const form = new FormData(subscriptionForm);
  button.disabled = true;

  try {
    await api("/api/subscriptions", {
      method: "POST",
      body: JSON.stringify(Object.fromEntries(form))
    });
    subscriptionForm.reset();
    subscriptionForm.sendTime.value = "09:00";
    subscriptionForm.limit.value = "10";
    await loadSubscriptions();
    notify("Subscription added.");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

subscriptionsNode.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  button.disabled = true;

  try {
    if (action === "edit") {
      const form = subscriptionsNode.querySelector(`form[data-edit-id="${CSS.escape(id)}"]`);
      if (form) form.hidden = !form.hidden;
      button.disabled = false;
      return;
    }

    if (action === "cancel-edit") {
      const form = subscriptionsNode.querySelector(`form[data-edit-id="${CSS.escape(id)}"]`);
      if (form) form.hidden = true;
      button.disabled = false;
      return;
    }

    if (action === "delete") {
      await api(`/api/subscriptions/${id}`, { method: "DELETE" });
      notify("Subscription deleted.");
    }

    if (action === "toggle") {
      await api(`/api/subscriptions/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: button.dataset.active !== "true" })
      });
      notify("Subscription updated.");
    }

    if (action === "test") {
      const data = await api(`/api/subscriptions/${id}/test`, { method: "POST", body: "{}" });
      notify(data.sent ? `Test email sent with ${data.count} new results.` : "No new articles to send.");
    }

    await loadSubscriptions();
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

subscriptionsNode.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-edit-id]");
  if (!form) return;
  event.preventDefault();

  const button = form.querySelector("button[type='submit']");
  const id = form.dataset.editId;
  button.disabled = true;

  try {
    await api(`/api/subscriptions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    await loadSubscriptions();
    notify("Subscription updated.");
  } catch (error) {
    notify(error.message, "error");
  } finally {
    button.disabled = false;
  }
});

refreshButton.addEventListener("click", () => {
  loadSubscriptions().catch((error) => notify(error.message, "error"));
});

loadSubscriptions().catch((error) => notify(error.message, "error"));
