const statusEl = document.querySelector("#connectionStatus");
const photoEl = document.querySelector("#photo");
const emptyEl = document.querySelector("#emptyState");
const gridEl = document.querySelector("#metadataGrid");
const requestButton = document.querySelector("#requestButton");
const shortcutLink = document.querySelector("#shortcutLink");
const pinInput = document.querySelector("#pinInput");
const apiBaseInput = document.querySelector("#apiBaseInput");

const shortcutName = "Photo Dashboard Capture";
shortcutLink.href = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;

pinInput.value = localStorage.getItem("dashboardPin") || "";
apiBaseInput.value = localStorage.getItem("dashboardApiBase") || "";

pinInput.addEventListener("input", () => {
  localStorage.setItem("dashboardPin", pinInput.value.trim());
});

apiBaseInput.addEventListener("input", () => {
  localStorage.setItem("dashboardApiBase", normalizeApiBase(apiBaseInput.value));
});

requestButton.addEventListener("click", async () => {
  requestButton.disabled = true;
  requestButton.textContent = "Opdracht klaarzetten...";

  try {
    const response = await fetch(apiUrl("/api/request-photo"), {
      method: "POST",
      headers: {
        "x-dashboard-pin": pinInput.value.trim()
      }
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error || "Opdracht kon niet worden klaargezet.");
    }

    statusEl.textContent = "Opdracht wacht op iPhone";
    await refresh();
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    requestButton.disabled = false;
    requestButton.textContent = "Foto-opdracht klaarzetten";
  }
});

async function refresh() {
  try {
    const response = await fetch(apiUrl("/api/status"), { cache: "no-store" });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Status ophalen mislukt.");
    }

    render(data);
  } catch (error) {
    statusEl.textContent = `Offline: ${error.message}`;
  }
}

function render(data) {
  const meta = data.metadata || {};

  if (data.photoUrl) {
    photoEl.src = absolutizeUrl(data.photoUrl);
    photoEl.hidden = false;
    emptyEl.hidden = true;
  } else {
    photoEl.hidden = true;
    emptyEl.hidden = false;
  }

  statusEl.textContent = data.pendingRequest
    ? "Opdracht wacht op iPhone"
    : data.hasPhoto
      ? "Live"
      : "Wacht op eerste upload";

  const location = formatLocation(meta);
  const rows = [
    ["Geupload", { text: formatDate(meta.uploadedAt) }],
    ["Gemaakt", { text: formatDate(meta.capturedAt) }],
    ["Locatie", location],
    ["Nauwkeurigheid", { text: meta.horizontalAccuracy ? `${meta.horizontalAccuracy} m` : "-" }],
    ["Batterij", { text: formatBattery(meta) }],
    ["Apparaat", { text: [meta.deviceName, meta.deviceModel].filter(Boolean).join(" / ") || "-" }],
    ["iOS", { text: meta.systemVersion || "-" }],
    ["Netwerk", { text: meta.networkType || "-" }]
  ];

  gridEl.innerHTML = rows.map(([label, value]) => `
    <article class="metric">
      <span>${escapeHtml(label)}</span>
      ${renderMetricValue(value)}
    </article>
  `).join("");
}

function formatLocation(meta) {
  if (!meta.latitude || !meta.longitude) {
    return { label: "-" };
  }

  const lat = Number(meta.latitude);
  const lon = Number(meta.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { label: `${meta.latitude}, ${meta.longitude}` };
  }

  const label = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
  return {
    label,
    link: `https://maps.apple.com/?ll=${lat},${lon}&q=iPhone%20Photo`
  };
}

function formatBattery(meta) {
  if (!meta.batteryLevel && !meta.batteryState) return "-";
  return [meta.batteryLevel, meta.batteryState].filter(Boolean).join(" / ");
}

function renderMetricValue(value) {
  if (value.link) {
    return `<a href="${escapeHtml(value.link)}" target="_blank" rel="noreferrer">${escapeHtml(value.label)}</a>`;
  }

  return `<strong>${escapeHtml(value.text || value.label || "-")}</strong>`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "medium"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function apiUrl(path) {
  const base = normalizeApiBase(apiBaseInput.value);
  return base ? `${base}${path}` : path;
}

function absolutizeUrl(value) {
  if (!value) return value;
  if (/^https?:\/\//i.test(value)) return value;
  return apiUrl(value.startsWith("/") ? value : `/${value}`);
}

function normalizeApiBase(value) {
  return value.trim().replace(/\/+$/, "");
}

refresh();
setInterval(refresh, 5000);
