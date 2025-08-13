(() => {
  'use strict';
  
  const API_BASE = "https://hf-cover-block.stewardmcoy.workers.dev";
  const FETCH_TTL_MS = 1000 * 60 * 60 * 3;
  
  const COVER_REPLACEMENTS = [
    "covers/steward-01.png",
  ].map(p => browser.runtime.getURL(p));
  
  // I would have liked to rearrange things to make the info section look nicer instead, but
  // it's not worth my limited time. Setting a slightly higher max-with will align
  // the cover height properly at the default layout width on desktop.
  function fixCoverWidth() {
    const coverDIV = document.querySelector('.wrap-novel-details-cover');
    
    if (coverDIV) {
      coverDIV.style.maxWidth = '171px';
    }
  }
  
  function moveDetailsUp() {
    const details = document.querySelector('#tab-detail');
    const chapters = document.querySelector('#tab-chapters');
    const tabs = document.querySelector('.wrap-tabs');
    const container = document.querySelector('#wrap-chapter');
    
    if (!details || !chapters || !tabs || !container) {
      return;
    }
    
    tabs.remove();
    
    container.parentElement.insertBefore(details, container);
    container.parentElement.insertBefore(chapters, container);
    container.remove();
    
    details.classList.remove('tab-pane');
    details.classList.remove('active');
    details.classList.add('mt20');
    details.classList.add('b-radius-8');
    details.classList.add('white');
    
    chapters.classList.remove('tab-pane');
    chapters.classList.remove('active');
    chapters.classList.add('mt20');
    chapters.classList.add('b-radius-8');
    chapters.classList.add('white');
  }
  
  function moveReviewsDown() {
    const review = document.querySelector('.unit-review');
    const comments = document.querySelector('#wrap-comment-put-together');
    
    if (!review || !comments) {
      return;
    }
    
    const addReviewContainer = review.parentElement.nextSibling;
    
    comments.parentElement.insertBefore(review.parentElement, comments);
    comments.parentElement.insertBefore(addReviewContainer, comments);
  }

  async function replaceTOC() {
    let fullTocLink = document.querySelector('[data-gtm-click="link-all-chapters"]');
    let partialRoot = document.querySelector('.list-chapter');
    
    if (!fullTocLink || !partialRoot) {
      return;
    }
    
    const fullUrl = new URL(fullTocLink.getAttribute("href"), location.href).toString();
    let html;
    
    try {
      const res = await fetch(fullUrl, { credentials: "include", mode: "cors" });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      
      html = await res.text();
    } catch (e) {
      return;
    }
    
    const chaptersPage = new DOMParser().parseFromString(html, "text/html");
    const fullList = chaptersPage.querySelector('.list-chapter');
    
    if (!fullList) {
      return;
    }
    
    const imported = document.importNode(fullList, true);
    const container = partialRoot.parentElement || partialRoot;
    
    partialRoot.replaceWith(imported);
  }

  function getThumbnailAndFullURLs(rawURL) {
    const fullURL = rawURL.replace('cover_thumb_', 'cover');
    const thumbURL = rawURL.replace('cover_', 'cover_thumb_');
    
    return [fullURL, rawURL];
  }

  async function refreshBanlist() {    
    const { lastBanFetch = 0 } = await browser.storage.local.get("lastBanFetch");
    const banlist = await getBanlist();
  
    const stale = Date.now() - (lastBanFetch || 0) > FETCH_TTL_MS;
    
    if (!stale) {
      return banlist || {};
    }
  
    try {
      const r = await fetch(API_BASE + "/v1/covers", { method: "GET" });
      
      if (!r.ok) {
        return;
      }
      
      const data = await r.json();
      const urls = Array.isArray(data?.urls) ? data.urls : [];
      const allowlist = await getAllowlist();
      
      for (const rawURL of urls) {
        for (const url of getThumbnailAndFullURLs(rawURL)) {
          if ( allowlist[url] == null ) {
            banlist[url] = 1;
          }
        }
      }
  
      await browser.storage.local.set({ banlist, lastBanFetch: Date.now() });
    } catch {
      return;
    }
  }
  
  let menuMousePosition = { x: 0, y: 0 };
  window.addEventListener("contextmenu", (e) => {
    menuMousePosition = { x: e.clientX, y: e.clientY };
  }, true);
  
  function imgUnderPointer() {
    const stack = document.elementsFromPoint(menuMousePosition.x, menuMousePosition.y);
    const img = stack.find(el => el.tagName === "IMG");
    
    if (!img) {
      return null;
    }
    
    const url = img.dataset.extOrigSrc || img.currentSrc || img.src || "";
    return { img, url };
  }

  async function replaceBannedImagesOnPage() {
    const banObj = await getBanlist();
    const banSet = new Set(Object.keys(banObj));
  
    const imgs = document.images;
    for (const img of imgs) {
      const urlNow = img.currentSrc || img.src || "";
      
      if (!urlNow) {
        if (!seenLoadHandlers.has(img)) {
          seenLoadHandlers.add(img);
          img.addEventListener("load", () => {
            const u = img.currentSrc || img.src || "";
            
            if (u && banSet.has(u) && img.dataset.extReplaced !== "1") {
              replaceCoverImage(img, chooseReplacement(u));
            }
          }, { once: true });
        }
        
        continue;
      }
  
      if (banSet.has(urlNow) && img.dataset.extReplaced !== "1") {
        replaceCoverImage(img, chooseReplacement(urlNow));
      }
    }
  }
  
  async function getBanlist() {
    const { banlist = {} } = await browser.storage.local.get("banlist");
    return banlist;
  }
  
  async function getAllowlist() {
    const { banlist = {} } = await browser.storage.local.get("allowlist");
    return banlist;
  }
  
  async function ban(rawURL) {
    const urls = getThumbnailAndFullURLs(rawURL);
    const banlist = await getBanlist();
    const allowlist = await getAllowlist();
    
    for (const url of urls) {
      banlist[url] = 1;
      delete allowlist[url];
    }
    
    await browser.storage.local.set({ banlist, allowlist });
  }
  async function unban(rawURL) {
    const urls = getThumbnailAndFullURLs(rawURL);
    const banlist = await getBanlist();
    const allowlist = await getAllowlist();
    
    for (const url of urls) {
      delete banlist[url];
      allowlist[url] = 1;
    }
    
    await browser.storage.local.set({ banlist, allowlist });
  }
  
  // Long-term, I'd like to add more cover replacements and convert the URL to
  // an index in COVER_REPLACEMENTS.
  function chooseReplacement(url) {
    return COVER_REPLACEMENTS[0];
  }
  
  function findImageBySrcUrl(srcUrl) {
    const imgs = document.images;
    for (const img of imgs) {
      if ((img.dataset.extOrigSrc || img.currentSrc || img.src) === srcUrl) {
        return img;
      }
    }
    
    return null;
  }
  
  function replaceCoverImage(img, replacementUrl) {
    if (!img) {
      return;
    }
    
    if (!img.dataset.extOrigSrc) {
      img.dataset.extOrigSrc = img.currentSrc || img.src || "";
      img.dataset.extOrigSrcset = img.srcset || "";
    }
  
    const picture = img.closest("picture");
    if (picture) {
      picture.querySelectorAll("source").forEach(s => s.remove());
    }
  
    const w = img.clientWidth || img.naturalWidth || 200;
    const h = img.clientHeight || img.naturalHeight || 300;
    
    img.style.width = w + "px";
    img.style.height = h + "px";
    img.style.objectFit = "contain";
    img.removeAttribute("srcset");
    img.src = replacementUrl;
    img.alt ||= "Replacement cover";
    img.dataset.extReplaced = "1";
  }
  
  function restoreOriginal(img) {
    if (!img || !img.dataset.extOrigSrc) {
      return;
    }
    
    img.src = img.dataset.extOrigSrc;
    
    if (img.dataset.extOrigSrcset) {
      img.srcset = img.dataset.extOrigSrcset;
    }
    
    img.style.objectFit = "";
    img.dataset.extReplaced = "0";
  }
  
  async function notifyBlocked(url) {
    if (!url.includes('cover_')) {
      return;
    }
    
    await fetch(API_BASE + "/v1/cover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url })
    });
  }
  
  browser.runtime.onMessage.addListener(async (msg) => {
    if (!msg || typeof msg !== "object") {
      return;
    }
  
    const hit = imgUnderPointer();
    
    if (!hit || !hit.url) {
      return;
    }
    
    const rawURL = hit.url;
  
    if (msg.type === "blockCoverFromContext") {
      await ban(rawURL);
      
      const img = findImageBySrcUrl(rawURL);
      
      if (!img) {
        return;
      }
      
      replaceCoverImage(img, chooseReplacement(rawURL));
      
      await notifyBlocked(rawURL);
    } else if (msg.type === "unblockCoverFromContext") {
      await unban(rawURL);
      
      const img = findImageBySrcUrl(rawURL);
      
      if (!img) {
        return;
      }
      
      restoreOriginal(img);
    }
  });

  async function run() {
    fixCoverWidth();
    moveDetailsUp();
    moveReviewsDown();
    await refreshBanlist();
    await replaceBannedImagesOnPage();
    await replaceTOC();
  }

  ready(() => {
    run().catch(err => console.error("[FullTOC] Uncaught:", err));
  
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          const added = Array.from(m.addedNodes);
          
          if (added.some(n =>
            n.nodeType === 1 &&
            /toc|chapter/i.test(n.textContent || "") &&
            (n.querySelector && (n.querySelector("a[href*='chap']") || n.querySelector("a[href*='toc']")))
          )) {
            run().catch(() => {});
            break;
          }
        }
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  });

  ready(() => {
    run();
  });
})();