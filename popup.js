const DEFAULTS = {
  accountId: "",
  apiToken: "",
  watchActive: false,
  timeoutMinutes: 10,
  lastStatus: "idle",
  activeCount: 0,
  failedCount: 0,
  successCount: 0,
  lastCheckedAt: 0,
  lastError: "",
  projects: []
};

const $ = (id) => document.getElementById(id);

const accountId = $("accountId");
const apiToken = $("apiToken");
const timeoutSlider = $("timeoutSlider");
const timeoutValue = $("timeoutValue");
const settingsPanel = $("settingsPanel");

$("saveSettings").addEventListener("click", saveSettings);
$("startWatch").addEventListener("click", () => send("START_WATCH"));
$("stopWatch").addEventListener("click", () => send("STOP_WATCH"));
$("checkNow").addEventListener("click", () => send("CHECK_NOW"));

timeoutSlider.addEventListener("input", async () => {
  const timeoutMinutes = Number(timeoutSlider.value);
  timeoutValue.textContent = `${timeoutMinutes} minutes`;
  updateSettingsSummary({ timeoutMinutes });
  await chrome.storage.local.set({ timeoutMinutes });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") loadState();
});

loadState();

async function loadState() {
  const state = await chrome.storage.local.get(DEFAULTS);
  accountId.value = state.accountId || "";
  apiToken.value = state.apiToken || "";
  const timeoutMinutes = state.timeoutMinutes || 10;
  timeoutSlider.value = timeoutMinutes;
  timeoutValue.textContent = `${timeoutMinutes} minutes`;
  const hasCredentials = Boolean(state.accountId && state.apiToken);
  updateSettingsSummary({ hasCredentials, timeoutMinutes });
  if (!hasCredentials) settingsPanel.open = true;

  $("statusText").textContent = statusLine(state);
  $("activeCount").textContent = state.activeCount || 0;
  $("failedCount").textContent = state.failedCount || 0;
  $("successCount").textContent = state.successCount || 0;
  $("lastChecked").textContent = state.lastCheckedAt
    ? `Last checked: ${new Date(state.lastCheckedAt).toLocaleTimeString()}`
    : "Never checked";
  $("lastError").textContent = state.lastError ? `Error: ${state.lastError}` : "";

  renderProjects(state.projects || []);
}

async function saveSettings() {
  const savedAccountId = accountId.value.trim();
  const savedApiToken = apiToken.value.trim();
  await chrome.storage.local.set({
    accountId: savedAccountId,
    apiToken: savedApiToken
  });
  updateSettingsSummary({
    hasCredentials: Boolean(savedAccountId && savedApiToken),
    timeoutMinutes: Number(timeoutSlider.value) || 10
  });
  if (savedAccountId && savedApiToken) settingsPanel.open = false;
  flashStatus("Settings saved.");
}

async function send(type) {
  const response = await chrome.runtime.sendMessage({ type });
  if (!response?.ok) {
    flashStatus(response?.error || "Something went wrong.");
  }
}

function updateSettingsSummary({ hasCredentials, timeoutMinutes } = {}) {
  const configuredText = hasCredentials === undefined
    ? ($("accountId").value.trim() && $("apiToken").value.trim() ? "Configured" : "Not configured")
    : (hasCredentials ? "Configured" : "Not configured");

  const minutes = timeoutMinutes || Number(timeoutSlider.value) || 10;
  $("settingsSummary").textContent = `${configuredText} • Sleep after ${minutes} minutes`;
}

function statusLine(state) {
  const prefix = state.watchActive ? "Watching" : "Sleeping";
  const status = state.lastStatus || "idle";

  if (status === "building") return `${prefix}: build in progress`;
  if (status === "checking") return `${prefix}: checking Cloudflare…`;
  if (status === "failed") return `${prefix}: latest result failed`;
  if (status === "success") return `${prefix}: latest result succeeded`;
  if (status === "error") return `${prefix}: error`;
  return `${prefix}: idle`;
}

function renderProjects(projects) {
  const list = $("projectsList");
  if (!projects.length) {
    list.className = "projects empty";
    list.textContent = "No projects checked yet.";
    return;
  }

  list.className = "projects";
  list.innerHTML = "";

  for (const project of projects) {
    const row = document.createElement("div");
    row.className = "project";

    const title = document.createElement("div");
    title.className = "project-title";

    const name = document.createElement("span");
    name.textContent = project.name || "Unnamed project";

    const status = document.createElement("span");
    status.className = `status-pill status-${project.status || "unknown"}`;
    status.textContent = project.status || "unknown";

    title.append(name, status);
    row.append(title);

    const meta = document.createElement("div");
    meta.className = "project-meta";
    const bits = [project.branch, project.commitMessage, project.error].filter(Boolean);
    meta.textContent = bits.join(" • ") || "Latest deployment checked.";
    row.append(meta);

    const links = document.createElement("div");
    links.className = "project-links";

    if (project.dashboardUrl) {
      const buildLink = document.createElement("a");
      buildLink.href = project.dashboardUrl;
      buildLink.target = "_blank";
      buildLink.rel = "noopener noreferrer";
      buildLink.textContent = project.deploymentId ? "Open build" : "Open project";
      links.append(buildLink);
    }

    if (project.url) {
      const siteLink = document.createElement("a");
      siteLink.href = normaliseHttpsUrl(project.url);
      siteLink.target = "_blank";
      siteLink.rel = "noopener noreferrer";
      siteLink.textContent = "Open site";
      links.append(siteLink);
    }

    if (links.children.length) {
      row.append(links);
    }

    list.append(row);
  }
}

function normaliseHttpsUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function flashStatus(message) {
  const el = $("statusText");
  const old = el.textContent;
  el.textContent = message;
  setTimeout(loadState, 1200);
}
