try { importScripts("vendor/browser-polyfill.min.js"); } catch (_) {}

const browserAPI = typeof browser !== "undefined" ? browser : chrome;

const SITE_PATTERNS = ["https://*.honeyfeed.fm/*"];
const MENU_BLOCK = "cover-block";
const MENU_UNBLOCK = "cover-unblock";

let banCache = Object.create(null);

async function loadBanlist() {
  const { banlist = {} } = await browserAPI.storage.local.get("banlist");
  banCache = banlist || {};
}

browserAPI.runtime.onInstalled.addListener(loadBanlist);

if (browserAPI.runtime.onStartup) {
	browserAPI.runtime.onStartup.addListener(loadBanlist);
}

loadBanlist();

browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.banlist) {
	  return;
  }
  
  banCache = changes.banlist.newValue || {};
});

async function createMenus() {
  const menus = browserAPI.menus || browserAPI.contextMenus;
  
  try {
	await menus.create({
	  id: MENU_BLOCK,
	  title: "Block AI Cover",
	  contexts: ["all"],
	  documentUrlPatterns: SITE_PATTERNS
	});
  } catch {}
  
  try {
	await menus.create({
	  id: MENU_UNBLOCK,
	  title: "Unblock AI Cover",
	  contexts: ["all"],
	  documentUrlPatterns: SITE_PATTERNS
	});
  } catch {}

  menus.onClicked.addListener((info, tab) => {
	if (!tab?.id) {
		return;
	}
	
	if (info.menuItemId === MENU_BLOCK) {
	  browserAPI.tabs.sendMessage(tab.id, { type: "blockCoverFromContext" })
		.catch(() => {});
	} else if (info.menuItemId === MENU_UNBLOCK) {
	  browserAPI.tabs.sendMessage(tab.id, { type: "unblockCoverFromContext" })
		.catch(() => {});
	}
  });
}

createMenus();