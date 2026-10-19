
const CONTAINER_PREFIX = "Isolated";
const MENU_ID = "open-link-isolated";
const STORAGE_KEY = "isolatedCookieStoreIds";

// cookieStoreId -> registered suppression stylesheet (or null).
// Every isolated tab gets its own throwaway container, so nothing it
// stores can be seen by any other tab or by a later session.
const containers = new Map();

// Containers created but whose tab is not open yet; sweep() must skip them.
const pending = new Set();

async function saveIds() {
  await browser.storage.local.set({ [STORAGE_KEY]: [...containers.keys()] });
}

function registerSuppression(cookieStoreId) {
  return browser.contentScripts.register({
    matches: ["<all_urls>"],
    css: [{ file: "suppress.css" }],
    allFrames: true,
    runAt: "document_start",
    cookieStoreId
  });
}

async function createContainer() {
  const identity = await browser.contextualIdentities.create({
    name: `${CONTAINER_PREFIX} ${Date.now().toString(36).slice(-4)}`,
    color: "purple",
    icon: "fingerprint"
  });

  const id = identity.cookieStoreId;
  pending.add(id);
  containers.set(id, null);
  // Persist first so the container is cleaned up even if we die right after.
  await saveIds();

  try {
    containers.set(id, await registerSuppression(id));
    console.debug("[isolate] created container + CSS:", id);
  } catch (error) {
    console.error("Could not register prompt suppression:", error);
  }

  return id;
}

async function destroyContainer(id) {
  const script = containers.get(id);
  containers.delete(id);
  pending.delete(id);
  await saveIds();

  if (script) {
    script.unregister().catch(() => {});
  }

  // Removing the container should drop its data, but wipe it explicitly
  // too. Done per type because not every type accepts cookieStoreId.
  await Promise.allSettled(
    ["cookies", "localStorage", "indexedDB", "serviceWorkers"].map(type =>
      browser.browsingData.remove({ cookieStoreId: id }, { [type]: true })
    )
  );

  try {
    await browser.contextualIdentities.remove(id);
  } catch {
    // Already removed (e.g. by the user).
  }
}

// Destroy every isolated container that no longer has an open tab.
// Serialized so overlapping tab closes cannot double-remove a container.
let sweeping = Promise.resolve();

// Firefox can still list a tab in tabs.query() while its onRemoved event is
// being handled, which used to leave the last container behind. Tab ids are
// never reused within a session, so remembering closed ones is safe.
const closedTabs = new Set();

function sweep() {
  sweeping = sweeping
    .then(async () => {
      for (const id of [...containers.keys()]) {
        if (pending.has(id)) {
          continue;
        }

        const tabs = (await browser.tabs.query({ cookieStoreId: id }))
          .filter(tab => !closedTabs.has(tab.id));
        if (tabs.length === 0) {
          await destroyContainer(id);
        }
      }
    })
    .catch(console.error);

  return sweeping;
}

async function initialize() {
  // Drop the key used by the old single-container version.
  await browser.storage.local.remove("isolatedCookieStoreId");

  const { [STORAGE_KEY]: saved = [] } =
    await browser.storage.local.get(STORAGE_KEY);
  const existing = new Set(
    (await browser.contextualIdentities.query({})).map(i => i.cookieStoreId)
  );

  for (const id of saved) {
    if (existing.has(id)) {
      containers.set(id, null);
    }
  }
  await saveIds();

  // Containers left over from a previous session are destroyed unless a
  // tab is still using them.
  await sweep();

  for (const id of containers.keys()) {
    try {
      containers.set(id, await registerSuppression(id));
    } catch (error) {
      console.error("Could not register prompt suppression:", error);
    }
  }

  console.info("Isolate ready; live containers:", [...containers.keys()]);
}

const ready = initialize().catch(console.error);

browser.contextMenus.create({
  id: MENU_ID,
  title: "Open Link in Isolated Tab",
  contexts: ["link"]
});

function isWebUrl(rawUrl) {
  try {
    return ["http:", "https:"].includes(new URL(rawUrl).protocol);
  } catch {
    return false;
  }
}

// Opens rawUrl (or a blank new tab when rawUrl is null) in a fresh container.
async function openIsolated(rawUrl, sourceTab) {
  // Only open normal web links.
  if (rawUrl !== null && !isWebUrl(rawUrl)) {
    return;
  }

  await ready;
  const cookieStoreId = await createContainer();

  try {
    if (sourceTab?.incognito) {
      // Containers cannot be used in private windows.
      const options = { cookieStoreId };
      if (rawUrl) {
        options.url = rawUrl;
      }
      const win = await browser.windows.create(options);
      rememberRequestedUrl(win.tabs?.[0], rawUrl);
    } else {
      const options = { cookieStoreId, active: true };
      if (rawUrl) {
        options.url = rawUrl;
      }
      if (sourceTab) {
        options.windowId = sourceTab.windowId;
        options.index = sourceTab.index + 1;
      }
      const tab = await browser.tabs.create(options);
      rememberRequestedUrl(tab, rawUrl);
      console.debug("[isolate] opened tab", tab.id, "in", tab.cookieStoreId);
    }
  } catch (error) {
    await destroyContainer(cookieStoreId);
    throw error;
  } finally {
    pending.delete(cookieStoreId);
  }
}

// A freshly opened tab reports about:blank until its page commits, so
// remember what each tab we opened is loading.
const requestedUrls = new Map();

function rememberRequestedUrl(tab, rawUrl) {
  if (tab && rawUrl) {
    requestedUrls.set(tab.id, rawUrl);
  }
}

function currentUrl(tab) {
  if (isWebUrl(tab.url)) {
    return tab.url;
  }
  return requestedUrls.get(tab.id) ?? null;
}

browser.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) {
    return;
  }

  openIsolated(info.linkUrl, tab).catch(error => {
    console.error("Could not open isolated tab:", error);
  });
});

// Toolbar button: reopen the current page in a brand-new container (even
// from an isolated tab, so each click is a separate isolated instance), or
// open a blank isolated tab when the page is not a web page.
// Clicks that arrive while the previous one is still opening are ignored,
// so mashing the button or shortcut does not spawn a pile of tabs.
let opening = false;

browser.browserAction.onClicked.addListener(async tab => {
  if (opening) {
    return;
  }

  opening = true;
  try {
    await openIsolated(currentUrl(tab), tab);
  } catch (error) {
    console.error("Could not open isolated tab:", error);
  } finally {
    opening = false;
  }
});

// Badge every isolated tab so it is obvious which tabs are protected.
function updateBadge(tab) {
  // Some tabs (e.g. ones not yet attached to a window) report tabs.TAB_ID_NONE.
  if (tab.id === undefined || tab.id < 0) {
    return;
  }

  const isolated = containers.has(tab.cookieStoreId);

  try {
    browser.browserAction.setBadgeText({
      tabId: tab.id,
      text: isolated ? "ISO" : ""
    }).catch(() => {});
    browser.browserAction.setTitle({
      tabId: tab.id,
      title: isolated
        ? "Isolated tab. Click to reopen this page in a new isolated tab"
        : "Reopen this page in an isolated tab"
    }).catch(() => {});
  } catch (error) {
    // Parameter validation throws synchronously; the tab is already gone.
  }
}

browser.browserAction.setBadgeBackgroundColor({ color: "#8f3fd1" });

browser.tabs.onCreated.addListener(updateBadge);
browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    updateBadge(tab);
  }
});

// Links/popups opened from an isolated tab inherit its container, so a
// container lives until its last tab closes, not just the first one.
browser.tabs.onRemoved.addListener(tabId => {
  closedTabs.add(tabId);
  requestedUrls.delete(tabId);
  sweep();
});

browser.contextualIdentities.onRemoved.addListener(({ contextualIdentity }) => {
  const id = contextualIdentity.cookieStoreId;
  if (containers.has(id)) {
    destroyContainer(id).catch(console.error);
  }
});

// Cancel Google Identity Services prompt resources in isolated containers.
browser.webRequest.onBeforeRequest.addListener(
  details => {
    console.debug(
      "[isolate] GSI request", details.type, details.url,
      "tab", details.tabId, "store", details.cookieStoreId,
      "block", containers.has(details.cookieStoreId)
    );

    if (containers.has(details.cookieStoreId)) {
      return { cancel: true };
    }

    return {};
  },
  {
    urls: [
      "*://accounts.google.com/gsi/*",
      "*://accounts.google.com/o/fedcm/*"
    ],
    types: ["script", "sub_frame", "xmlhttprequest", "other"]
  },
  ["blocking"]
);
