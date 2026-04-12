// Content script for YouTube Content Filter
let currentVideoId = null;
let currentChannelId = null;
let checkTimeout = null;
let isChecking = false;

// Check if URL is a YouTube Short
function isYouTubeShort(url) {
  return url.includes("/shorts/");
}

// Extract video ID from URL (works for regular videos and shorts)
function getVideoIdFromUrl(url) {
  try {
    // Check for Shorts URL pattern: /shorts/VIDEO_ID
    const shortsMatch = url.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
    if (shortsMatch) {
      return shortsMatch[1];
    }
    
    // Regular video URL pattern: ?v=VIDEO_ID
    const urlParams = new URLSearchParams(new URL(url).search);
    return urlParams.get("v");
  } catch (e) {
    return null;
  }
}

// Extract channel ID from page - multiple methods for reliability
function getChannelIdFromPage() {
  // Method 1: Try ytInitialData (most reliable for initial load)
  try {
    if (window.ytInitialData) {
      // Try multiple paths in ytInitialData
      const paths = [
        window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer,
        window.ytInitialData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer?.owner?.videoOwnerRenderer,
      ];
      
      for (const renderer of paths) {
        if (renderer?.navigationEndpoint?.browseEndpoint?.browseId) {
          const channelId = renderer.navigationEndpoint.browseEndpoint.browseId;
          console.log("[YT Filter] Found channel ID from ytInitialData:", channelId);
          return channelId;
        }
      }
    }
  } catch (e) {
    console.log("[YT Filter] Failed to get channel from ytInitialData");
  }

  // Method 2: Try channel link elements in DOM
  const selectors = [
    "ytd-video-owner-renderer a.yt-simple-endpoint",
    "ytd-channel-name a",
    "#owner a",
    "#channel-name a",
    'a[href*="/channel/"]',
    'a[href*="/@"]'
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.href) {
      // Handle /channel/UC... format
      const channelMatch = element.href.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/);
      if (channelMatch) {
        console.log("[YT Filter] Found channel ID from DOM:", channelMatch[1]);
        return channelMatch[1];
      }
      
      // Handle /@username format - convert to a consistent ID
      const usernameMatch = element.href.match(/\/@([^\/\?]+)/);
      if (usernameMatch) {
        const username = usernameMatch[1];
        console.log("[YT Filter] Found channel username from DOM:", username);
        return `@${username}`; // Use @username as identifier
      }
    }
  }

  // Method 3: Try meta tags
  const metaTag = document.querySelector('link[itemprop="url"]');
  if (metaTag && metaTag.href) {
    const match = metaTag.href.match(/\/(channel|c|user)\/([^\/\?]+)/);
    if (match) {
      console.log("[YT Filter] Found channel ID from meta:", match[2]);
      return match[2];
    }
  }

  // Method 4: Try to get from video element data
  try {
    const ytPlayer = document.getElementById("movie_player");
    if (ytPlayer && ytPlayer.getVideoData) {
      const videoData = ytPlayer.getVideoData();
      if (videoData && videoData.author) {
        console.log("[YT Filter] Found channel from player:", videoData.author);
        return `@${videoData.author.replace(/\s+/g, '')}`;
      }
    }
  } catch (e) {
    // Player API not available
  }

  console.log("[YT Filter] Could not find channel ID from page");
  return null;
}

// Wait for channel ID to be available
async function waitForChannelId(maxAttempts = 10, delay = 300) {
  for (let i = 0; i < maxAttempts; i++) {
    const channelId = getChannelIdFromPage();
    if (channelId) {
      return channelId;
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return null;
}

// Block video with overlay
function blockVideo(reason, title, category, channelTitle) {
  // For Shorts, the player structure is different
  const isShort = isYouTubeShort(window.location.href);
  
  const player = isShort
    ? document.querySelector("ytd-shorts-player-manager") ||
      document.querySelector("#shorts-player") ||
      document.querySelector("ytd-reel-video-renderer[is-active]") ||
      document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player")
    : document.querySelector("#movie_player") ||
      document.querySelector(".html5-video-player");

  // For Shorts, also try to block the entire shorts container
  const shortsContainer = isShort 
    ? document.querySelector("ytd-shorts") || 
      document.querySelector("#shorts-container") ||
      document.querySelector("ytd-reel-video-renderer[is-active]")
    : null;

  const targetElement = player || shortsContainer || document.querySelector("#content");

  if (targetElement) {
    // Pause all videos
    const videos = document.querySelectorAll("video");
    videos.forEach(video => {
      video.pause();
      video.currentTime = 0;
      video.muted = true;
    });

    // Create overlay if it doesn't exist
    let overlay = document.getElementById("content-filter-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "content-filter-overlay";
      overlay.style.cssText = `
        position: ${isShort ? 'fixed' : 'absolute'};
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: linear-gradient(145deg, rgba(15, 15, 35, 0.98), rgba(20, 20, 50, 0.98));
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        z-index: 99999;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        text-align: center;
        padding: 20px;
        box-sizing: border-box;
      `;

      const shortsMessage = isShort ? `
        <div style="margin-top: 24px; padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.3);">
          <p style="font-size: 13px; color: #ef4444; margin: 0;">All YouTube Shorts are blocked to help you stay focused</p>
        </div>
      ` : `
        <div style="margin-top: 24px; padding: 16px; background: rgba(74, 222, 128, 0.1); border-radius: 10px; border: 1px solid rgba(74, 222, 128, 0.2);">
          <p style="font-size: 13px; color: #4ade80; margin: 0;">Allowed: Education, Music, Study, News, Science & Tech</p>
        </div>
      `;

      overlay.innerHTML = `
        <div style="max-width: 500px;">
          <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 40px;">${isShort ? '!' : 'X'}</div>
          <h1 style="font-size: 28px; margin-bottom: 12px; font-weight: 700;">${isShort ? 'Shorts Blocked' : 'Video Blocked'}</h1>
          <p style="font-size: 16px; margin-bottom: 20px; opacity: 0.8;">${isShort ? 'YouTube Shorts are not allowed.' : 'This content has been identified as non-constructive.'}</p>
          <div style="margin: 20px 0; padding: 20px; background: rgba(255,255,255,0.08); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
            <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Channel:</span> <strong>${channelTitle || "Unknown"}</strong></p>
            <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Category:</span> <strong>${category || "Unknown"}</strong></p>
            <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Reason:</span> <strong>${reason}</strong></p>
          </div>
          ${shortsMessage}
          <p style="font-size: 12px; margin-top: 16px; opacity: 0.5;">You can change this in the extension settings</p>
        </div>
      `;

      if (isShort) {
        document.body.appendChild(overlay);
      } else {
        targetElement.appendChild(overlay);
      }
    } else {
      // Update existing overlay content
      const shortsMessage = isShort ? `
        <div style="margin-top: 24px; padding: 16px; background: rgba(239, 68, 68, 0.1); border-radius: 10px; border: 1px solid rgba(239, 68, 68, 0.3);">
          <p style="font-size: 13px; color: #ef4444; margin: 0;">All YouTube Shorts are blocked to help you stay focused</p>
        </div>
      ` : `
        <div style="margin-top: 24px; padding: 16px; background: rgba(74, 222, 128, 0.1); border-radius: 10px; border: 1px solid rgba(74, 222, 128, 0.2);">
          <p style="font-size: 13px; color: #4ade80; margin: 0;">Allowed: Education, Music, Study, News, Science & Tech</p>
        </div>
      `;

      overlay.querySelector("div").innerHTML = `
        <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #ef4444, #dc2626); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 24px; font-size: 40px;">${isShort ? '!' : 'X'}</div>
        <h1 style="font-size: 28px; margin-bottom: 12px; font-weight: 700;">${isShort ? 'Shorts Blocked' : 'Video Blocked'}</h1>
        <p style="font-size: 16px; margin-bottom: 20px; opacity: 0.8;">${isShort ? 'YouTube Shorts are not allowed.' : 'This content has been identified as non-constructive.'}</p>
        <div style="margin: 20px 0; padding: 20px; background: rgba(255,255,255,0.08); border-radius: 12px; border: 1px solid rgba(255,255,255,0.1);">
          <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Channel:</span> <strong>${channelTitle || "Unknown"}</strong></p>
          <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Category:</span> <strong>${category || "Unknown"}</strong></p>
          <p style="margin: 8px 0; font-size: 14px; text-align: left;"><span style="opacity: 0.6;">Reason:</span> <strong>${reason}</strong></p>
        </div>
        ${shortsMessage}
        <p style="font-size: 12px; margin-top: 16px; opacity: 0.5;">You can change this in the extension settings</p>
      `;
      
      // For Shorts, ensure overlay is on body and fixed position
      if (isShort && overlay.parentElement !== document.body) {
        overlay.remove();
        overlay.style.position = 'fixed';
        document.body.appendChild(overlay);
      }
    }

    overlay.style.display = "flex";
  }
}

// Remove block overlay
function unblockVideo() {
  const overlay = document.getElementById("content-filter-overlay");
  if (overlay) {
    overlay.remove();
  }
}

// Check current video - Main function
async function checkCurrentVideo() {
  // Prevent multiple simultaneous checks
  if (isChecking) return;
  
  const currentUrl = window.location.href;
  const videoId = getVideoIdFromUrl(currentUrl);
  
  // Not on a video page
  if (!videoId) {
    unblockVideo();
    return;
  }
  
  // Same video already checked
  if (videoId === currentVideoId) {
    return;
  }

  isChecking = true;
  currentVideoId = videoId;
  
  console.log(`[YT Filter] Checking video: ${videoId}`);

  try {
    // Check if filter is enabled
    const settings = await new Promise(resolve => {
      chrome.storage.local.get(["filterEnabled"], resolve);
    });
    
    if (settings.filterEnabled === false) {
      console.log("[YT Filter] Filter is disabled");
      unblockVideo();
      isChecking = false;
      return;
    }

    // BLOCK ALL YOUTUBE SHORTS - No exceptions
    if (isYouTubeShort(currentUrl)) {
      console.log("[YT Filter] YouTube Short detected - BLOCKING");
      blockVideo(
        "YouTube Shorts are blocked",
        "Short Video",
        "Shorts",
        "YouTube Shorts"
      );
      
      // Update blocked count
      chrome.storage.local.get(["blockedCount"], function (data) {
        chrome.storage.local.set({
          blockedCount: (data.blockedCount || 0) + 1,
        });
      });
      
      isChecking = false;
      return;
    }

    // Wait for channel ID to be available (important for cache lookup)
    console.log("[YT Filter] Waiting for channel ID...");
    const channelId = await waitForChannelId(15, 200); // Wait up to 3 seconds
    currentChannelId = channelId;
    
    if (channelId) {
      console.log(`[YT Filter] Got channel ID: ${channelId}`);
    } else {
      console.log("[YT Filter] No channel ID found, will rely on API");
    }

    // Send to background script for checking
    // Background will: 1) Check cache first, 2) Call API if not cached, 3) Save to cache
    chrome.runtime.sendMessage(
      { 
        action: "checkVideo", 
        videoId: videoId, 
        channelId: channelId 
      },
      (response) => {
        isChecking = false;
        
        // Handle chrome runtime errors
        if (chrome.runtime.lastError) {
          console.error("[YT Filter] Message error:", chrome.runtime.lastError.message);
          unblockVideo();
          return;
        }

        if (!response) {
          console.log("[YT Filter] No response from background");
          unblockVideo();
          return;
        }

        // Log the decision source
        if (response.fromCache) {
          console.log(`[YT Filter] CACHE HIT - Channel "${response.channelTitle}" is ${response.allowed ? "ALLOWED" : "BLOCKED"}`);
        } else if (response.error) {
          console.log(`[YT Filter] Error: ${response.error}`);
        } else {
          console.log(`[YT Filter] API CALL - Channel "${response.channelTitle}" is ${response.allowed ? "ALLOWED" : "BLOCKED"} (now cached)`);
        }

        if (response.allowed === false) {
          const cacheIndicator = response.fromCache ? " (Learned)" : "";
          blockVideo(
            response.reason + cacheIndicator,
            response.title,
            response.category,
            response.channelTitle
          );
          
          // Update blocked count
          chrome.storage.local.get(["blockedCount"], function (data) {
            chrome.storage.local.set({
              blockedCount: (data.blockedCount || 0) + 1,
            });
          });
        } else {
          unblockVideo();
          
          // Update allowed count (only if not an error)
          if (!response.error) {
            chrome.storage.local.get(["allowedCount"], function (data) {
              chrome.storage.local.set({
                allowedCount: (data.allowedCount || 0) + 1,
              });
            });
          }
        }
      }
    );
  } catch (error) {
    console.error("[YT Filter] Error in checkCurrentVideo:", error);
    isChecking = false;
    unblockVideo();
  }
}

// Watch for URL changes (YouTube is a single-page application)
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    currentVideoId = null;
    currentChannelId = null;
    isChecking = false;
    unblockVideo();

    // Delay check to allow YouTube to load video info
    if (checkTimeout) clearTimeout(checkTimeout);
    checkTimeout = setTimeout(checkCurrentVideo, 800);
  }
});

urlObserver.observe(document, { subtree: true, childList: true });

// Initial check with delay for page load
setTimeout(checkCurrentVideo, 1000);

// Also check when YouTube's navigation event fires
document.addEventListener("yt-navigate-finish", () => {
  console.log("[YT Filter] YouTube navigation finished");
  currentVideoId = null;
  currentChannelId = null;
  isChecking = false;
  unblockVideo();
  
  if (checkTimeout) clearTimeout(checkTimeout);
  checkTimeout = setTimeout(checkCurrentVideo, 500);
});

// Prevent video from playing if blocked
setInterval(() => {
  const overlay = document.getElementById("content-filter-overlay");
  if (overlay && overlay.style.display !== "none") {
    const video = document.querySelector("video");
    if (video && !video.paused) {
      video.pause();
      video.currentTime = 0;
    }
  }
}, 500);

// Listen for storage changes (e.g., when user edits channel status in popup)
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.channelCache) {
    // Channel cache was updated, recheck current video
    console.log("[YT Filter] Channel cache updated, rechecking...");
    currentVideoId = null; // Force recheck
    setTimeout(checkCurrentVideo, 300);
  }
});

// Hide YouTube Shorts from feed, sidebar, and recommendations
function hideShortsFromFeed() {
  const style = document.createElement("style");
  style.id = "yt-filter-hide-shorts";
  style.textContent = `
    /* Hide Shorts shelf on homepage */
    ytd-rich-shelf-renderer[is-shorts],
    ytd-reel-shelf-renderer,
    ytd-shorts-shelf-renderer {
      display: none !important;
    }
    
    /* Hide Shorts in search results */
    ytd-video-renderer[is-shorts],
    ytd-grid-video-renderer[is-shorts] {
      display: none !important;
    }
    
    /* Hide Shorts tab in navigation */
    ytd-mini-guide-entry-renderer[aria-label="Shorts"],
    ytd-guide-entry-renderer:has(a[title="Shorts"]) {
      display: none !important;
    }
    
    /* Hide Shorts in sidebar recommendations */
    ytd-compact-video-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }
    
    /* Hide Shorts thumbnails in video grid */
    ytd-rich-item-renderer:has(a[href*="/shorts/"]) {
      display: none !important;
    }
    
    /* Hide Shorts in channel pages */
    ytd-rich-grid-row:has(ytd-rich-item-renderer[is-shorts]) {
      display: none !important;
    }
    
    /* Hide individual Shorts links */
    a[href*="/shorts/"] {
      display: none !important;
    }
    
    /* Ensure Shorts section headers are hidden */
    #title-container:has(a[href*="/shorts/"]) {
      display: none !important;
    }
  `;
  
  // Only add if not already added
  if (!document.getElementById("yt-filter-hide-shorts")) {
    document.head.appendChild(style);
    console.log("[YT Filter] Shorts hiding CSS injected");
  }
}

// Apply Shorts hiding based on filter state
async function applyShortsHiding() {
  const settings = await new Promise(resolve => {
    chrome.storage.local.get(["filterEnabled"], resolve);
  });
  
  if (settings.filterEnabled !== false) {
    hideShortsFromFeed();
  } else {
    // Remove hiding CSS if filter is disabled
    const style = document.getElementById("yt-filter-hide-shorts");
    if (style) {
      style.remove();
    }
  }
}

// Disable YouTube video hover to play feature
function disableHoverToPlay() {
  const style = document.createElement("style");
  style.id = "yt-filter-disable-hover";
  style.textContent = `
    /* Disable YouTube inline preview on thumbnail hover */
    #mouseover-overlay,
    ytd-video-preview,
    #inline-preview-player {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  
  if (!document.getElementById("yt-filter-disable-hover")) {
    document.head.appendChild(style);
    console.log("[YT Filter] Hover-to-play disabling CSS injected");
  }
}

// Apply Shorts hiding on load
applyShortsHiding();

// Apply hover-to-play disabling on load
disableHoverToPlay();

// Re-apply when filter state changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === "local" && changes.filterEnabled) {
    applyShortsHiding();
  }
});

console.log("[YT Filter] Content script loaded");
