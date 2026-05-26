const API_BASE = "https://api.cloudflare.com/client/v4";
const POLL_ALARM = "cfbm-poll";
const POLL_EVERY_MINUTES = 0.5; // 30 seconds

const DEFAULTS = {
  accountId: "",
  apiToken: "",
  watchActive: false,
  timeoutMinutes: 10,
  lastActiveBuildSeenAt: 0,
  lastCheckedAt: 0,
  lastStatus: "idle",
  activeCount: 0,
  failedCount: 0,
  successCount: 0,
  lastError: "",
  projects: []
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(DEFAULTS);
  await chrome.storage.local.set({ ...DEFAULTS, ...existing });
  await renderStatus(existing.lastStatus || "idle", existing.activeCount || 0);
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === POLL_ALARM) {
    await checkCloudflareBuilds();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "START_WATCH") {
        await startWatchMode();
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "STOP_WATCH") {
        await stopWatchMode("idle");
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "CHECK_NOW") {
        await checkCloudflareBuilds();
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (error) {
      await setError(error);
      sendResponse({ ok: false, error: error.message || String(error) });
    }
  })();

  return true;
});

async function startWatchMode() {
  const now = Date.now();
  await chrome.storage.local.set({
    watchActive: true,
    lastActiveBuildSeenAt: now,
    lastStatus: "checking",
    lastError: ""
  });

  chrome.alarms.create(POLL_ALARM, { periodInMinutes: POLL_EVERY_MINUTES });
  await renderStatus("checking", 0);
  await checkCloudflareBuilds();
}

async function stopWatchMode(finalStatus = "idle") {
  await chrome.alarms.clear(POLL_ALARM);
  await chrome.storage.local.set({
    watchActive: false,
    lastStatus: finalStatus,
    activeCount: 0
  });
  await renderStatus(finalStatus, 0);
}

async function checkCloudflareBuilds() {
  const state = await chrome.storage.local.get(DEFAULTS);

  if (!state.watchActive) {
    await chrome.alarms.clear(POLL_ALARM);
    await renderStatus(state.lastStatus || "idle", state.activeCount || 0);
    return;
  }

  if (!state.accountId || !state.apiToken) {
    throw new Error("Add your Cloudflare Account ID and API token first.");
  }

  await chrome.storage.local.set({ lastStatus: "checking", lastError: "" });
  await renderStatus("checking", 0);

  const summary = await getAccountBuildStatus(state.accountId, state.apiToken);
  const now = Date.now();
  const hasActiveBuild = summary.activeCount > 0;

  let nextStatus = "success";
  if (hasActiveBuild) nextStatus = "building";
  else if (summary.failedCount > 0) nextStatus = "failed";
  else if (summary.projects.length === 0) nextStatus = "idle";

  const update = {
    lastCheckedAt: now,
    lastStatus: nextStatus,
    activeCount: summary.activeCount,
    failedCount: summary.failedCount,
    successCount: summary.successCount,
    projects: summary.projects,
    lastError: ""
  };

  if (hasActiveBuild) {
    update.lastActiveBuildSeenAt = now;
  }

  await chrome.storage.local.set(update);
  await renderStatus(nextStatus, summary.activeCount);

  if (!hasActiveBuild) {
    const lastActive = state.lastActiveBuildSeenAt || now;
    const timeoutMs = Number(state.timeoutMinutes || 10) * 60 * 1000;
    const idleForMs = now - lastActive;

    if (idleForMs >= timeoutMs) {
      await stopWatchMode(nextStatus);
    }
  }
}

async function getAccountBuildStatus(accountId, apiToken) {
  const projectResults = await listAllPagesProjects(accountId, apiToken);

  const summaries = await Promise.all(
    projectResults.map(async (project) => {
      try {
        // The Pages deployments endpoint rejects page/per_page query parameters.
        // Fetch the default list and select the newest deployment client-side.
        const deployments = await fetchJson(
          `${API_BASE}/accounts/${encodeURIComponent(cleanCloudflareId(accountId))}/pages/projects/${encodeURIComponent(project.name)}/deployments`,
          apiToken
        );

        const latest = getLatestDeployment(deployments.result || []);
        const status = normaliseDeploymentStatus(latest);

        return {
          name: project.name,
          status,
          deploymentId: latest?.id || "",
          branch: latest?.deployment_trigger?.metadata?.branch || latest?.source?.branch || "",
          commitMessage: latest?.deployment_trigger?.metadata?.commit_message || "",
          url: latest?.url || latest?.aliases?.[0] || "",
          dashboardUrl: buildPagesDeploymentDashboardUrl(accountId, project.name, latest?.id),
          createdOn: latest?.created_on || "",
          modifiedOn: latest?.modified_on || ""
        };
      } catch (error) {
        return {
          name: project.name,
          status: "error",
          error: error.message || String(error)
        };
      }
    })
  );

  const activeStatuses = new Set(["queued", "active", "building", "deploying", "initializing"]);
  const failedStatuses = new Set(["failure", "failed", "canceled", "cancelled", "error"]);
  const successStatuses = new Set(["success", "succeeded"]);

  return {
    projects: summaries,
    activeCount: summaries.filter((p) => activeStatuses.has(p.status)).length,
    failedCount: summaries.filter((p) => failedStatuses.has(p.status)).length,
    successCount: summaries.filter((p) => successStatuses.has(p.status)).length
  };
}

async function listAllPagesProjects(accountId, apiToken) {
  // v1.3: No page/per_page query parameters are sent here.
  const cleanAccountId = cleanCloudflareId(accountId);
  const url = `${API_BASE}/accounts/${encodeURIComponent(cleanAccountId)}/pages/projects`;
  const data = await fetchJson(url, apiToken);

  return data.result || [];
}

function cleanCloudflareId(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/dash\.cloudflare\.com\//, "")
    .split(/[/?#]/)[0]
    .trim();
}

function buildPagesDeploymentDashboardUrl(accountId, projectName, deploymentId) {
  const cleanAccountId = cleanCloudflareId(accountId);
  const cleanProjectName = String(projectName || "").trim();
  const cleanDeploymentId = String(deploymentId || "").trim();

  if (!cleanAccountId || !cleanProjectName) return "";

  const base = `https://dash.cloudflare.com/${encodeURIComponent(cleanAccountId)}/pages/view/${encodeURIComponent(cleanProjectName)}`;

  // Cloudflare dashboard URLs can shift over time. If a deployment id is present,
  // this deep link normally opens the specific deployment; otherwise project page.
  if (cleanDeploymentId) {
    return `${base}/${encodeURIComponent(cleanDeploymentId)}`;
  }

  return base;
}

function getLatestDeployment(deployments) {
  if (!deployments.length) return null;

  return [...deployments].sort((a, b) => {
    const aTime = Date.parse(a?.created_on || a?.modified_on || 0) || 0;
    const bTime = Date.parse(b?.created_on || b?.modified_on || 0) || 0;
    return bTime - aTime;
  })[0];
}

function normaliseDeploymentStatus(deployment) {
  if (!deployment) return "unknown";

  // Cloudflare Pages deployments expose latest_stage.status in examples/docs.
  const candidates = [
    deployment.latest_stage?.status,
    deployment.stage?.status,
    deployment.status,
    deployment.build_config?.status
  ].filter(Boolean);

  const status = String(candidates[0] || "unknown").toLowerCase();
  return status;
}

async function fetchJson(url, apiToken) {
  console.debug("Cloudflare Build Monitor request", url);

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Authorization": `Bearer ${apiToken}`,
      "Content-Type": "application/json"
    }
  });

  const data = await response.json().catch(() => null);

  if (!response.ok || data?.success === false) {
    const message = data?.errors?.[0]?.message || `${response.status} ${response.statusText}`;
    throw new Error(`${message} | URL: ${url}`);
  }

  return data;
}

async function renderStatus(status, activeCount = 0) {
  const iconState = statusToIconState(status);
  await chrome.action.setIcon({
    path: {
      16: `icons/${iconState}-16.png`,
      32: `icons/${iconState}-32.png`,
      48: `icons/${iconState}-48.png`,
      128: `icons/${iconState}-128.png`
    }
  });

  if (status === "building" && activeCount > 0) {
    await chrome.action.setBadgeText({ text: String(activeCount) });
    await chrome.action.setBadgeBackgroundColor({ color: "#f97316" });
  } else if (status === "failed" || status === "error") {
    await chrome.action.setBadgeText({ text: "!" });
    await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

function statusToIconState(status) {
  if (["checking", "building"].includes(status)) return "building";
  if (["failed", "failure", "error"].includes(status)) return "failed";
  if (["success", "succeeded"].includes(status)) return "success";
  return "idle";
}

async function setError(error) {
  const message = error?.message || String(error);
  await chrome.storage.local.set({
    lastStatus: "error",
    lastError: message,
    lastCheckedAt: Date.now()
  });
  await renderStatus("error", 0);
}
