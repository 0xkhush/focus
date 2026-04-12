// Background service worker for YouTube Content Filter

// Get API key from storage (no hardcoded key)
async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["youtubeApiKey"], (result) => {
      resolve(result.youtubeApiKey || null);
    });
  });
}

// Clean up duplicate channels from cache (run on startup)
async function cleanupDuplicateChannels() {
  const channelCache = await getChannelCache();
  const channelsByTitle = {};
  const cleanedCache = {};
  let duplicatesRemoved = 0;

  // Group channels by title (normalized)
  for (const [channelId, data] of Object.entries(channelCache)) {
    if (!data.channelTitle) {
      // Keep entries without title but with valid UC ID
      if (channelId.startsWith("UC")) {
        cleanedCache[channelId] = data;
      }
      continue;
    }

    const normalizedTitle = data.channelTitle.toLowerCase().trim();
    
    if (!channelsByTitle[normalizedTitle]) {
      channelsByTitle[normalizedTitle] = [];
    }
    channelsByTitle[normalizedTitle].push({ id: channelId, data: data });
  }

  // For each channel title, keep only the best entry
  for (const [title, entries] of Object.entries(channelsByTitle)) {
    if (entries.length === 1) {
      // No duplicates, keep as is
      cleanedCache[entries[0].id] = entries[0].data;
    } else {
      // Multiple entries - pick the best one
      // Priority: 1) manuallySet, 2) UC channel ID, 3) most recent
      duplicatesRemoved += entries.length - 1;
      
      const best = entries.reduce((best, current) => {
        // Prefer manually set
        if (current.data.manuallySet && !best.data.manuallySet) return current;
        if (best.data.manuallySet && !current.data.manuallySet) return best;
        
        // Prefer UC channel ID (real YouTube channel ID)
        if (current.id.startsWith("UC") && !best.id.startsWith("UC")) return current;
        if (best.id.startsWith("UC") && !current.id.startsWith("UC")) return best;
        
        // Prefer most recent
        return (current.data.learnedAt || 0) > (best.data.learnedAt || 0) ? current : best;
      });
      
      cleanedCache[best.id] = best.data;
    }
  }

  // Save cleaned cache if duplicates were removed
  if (duplicatesRemoved > 0) {
    console.log(`[YT Filter BG] Removed ${duplicatesRemoved} duplicate channel entries`);
    await new Promise((resolve) => {
      chrome.storage.local.set({ channelCache: cleanedCache }, resolve);
    });
  }

  return cleanedCache;
}

// Run cleanup on extension startup
cleanupDuplicateChannels();

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "checkVideo") {
    checkVideoCategory(request.videoId, request.channelId)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ allowed: true, error: error.message }));
    return true; // Keep the message channel open for async response
  }

  if (request.action === "clearChannelCache") {
    chrome.storage.local.set({ channelCache: {} }, () => {
      console.log("Channel cache cleared");
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === "getChannelCache") {
    chrome.storage.local.get(["channelCache"], (result) => {
      sendResponse({ cache: result.channelCache || {} });
    });
    return true;
  }

  if (request.action === "updateChannelStatus") {
    updateChannelStatus(request.channelId, request.allowed)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "deleteChannel") {
    deleteChannelFromCache(request.channelId)
      .then(() => sendResponse({ success: true }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === "checkApiKey") {
    getApiKey()
      .then((apiKey) => sendResponse({ hasKey: !!apiKey }))
      .catch(() => sendResponse({ hasKey: false }));
    return true;
  }

  if (request.action === "cleanupDuplicates") {
    cleanupDuplicateChannels()
      .then((cleanedCache) => sendResponse({ success: true, count: Object.keys(cleanedCache).length }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Check if video category is allowed with channel learning
async function checkVideoCategory(videoId, channelId) {
  try {
    console.log(`[YT Filter BG] ========== Checking video: ${videoId} ==========`);
    console.log(`[YT Filter BG] Channel ID from page: ${channelId || "NOT PROVIDED"}`);

    // STEP 1: Check cache FIRST (before even checking API key)
    const channelCache = await getChannelCache();
    const cacheSize = Object.keys(channelCache).length;
    console.log(`[YT Filter BG] Cache size: ${cacheSize} channels`);

    if (channelId && cacheSize > 0) {
      // Try exact match first
      if (channelCache[channelId] !== undefined) {
        console.log(`[YT Filter BG] CACHE HIT (exact): ${channelId}`);
        const cached = channelCache[channelId];
        return {
          allowed: cached.allowed,
          reason: cached.allowed
            ? "Channel whitelisted (learned)"
            : "Channel blacklisted (learned)",
          title: cached.channelTitle || "Cached decision",
          category: cached.category,
          channelTitle: cached.channelTitle,
          channelId: channelId,
          fromCache: true,
        };
      }
      
      // Try to find by channel title or username match
      for (const [cachedId, data] of Object.entries(channelCache)) {
        // Check if username matches (@username format)
        if (channelId.startsWith("@") && data.channelTitle) {
          const normalizedTitle = data.channelTitle.toLowerCase().replace(/\s+/g, '');
          const normalizedInput = channelId.substring(1).toLowerCase();
          if (normalizedTitle === normalizedInput || cachedId.includes(normalizedInput)) {
            console.log(`[YT Filter BG] CACHE HIT (username match): ${channelId} -> ${cachedId}`);
            return {
              allowed: data.allowed,
              reason: data.allowed
                ? "Channel whitelisted (learned)"
                : "Channel blacklisted (learned)",
              title: data.channelTitle || "Cached decision",
              category: data.category,
              channelTitle: data.channelTitle,
              channelId: cachedId,
              fromCache: true,
            };
          }
        }
      }
      
      console.log(`[YT Filter BG] CACHE MISS: ${channelId} not found in cache`);
    }

    // STEP 2: Check if we have an API key
    const API_KEY = await getApiKey();
    
    if (!API_KEY) {
      console.log("[YT Filter BG] No API key configured");
      return { 
        allowed: true, 
        error: "No API key configured. Please set up your API key in the extension settings.",
        needsApiKey: true
      };
    }

    // STEP 3: Make API call (cache miss)
    console.log(`[YT Filter BG] Making API call for video: ${videoId}`);
    const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(API_KEY.trim())}`;

    let response;
    try {
      response = await fetch(url);
    } catch (fetchError) {
      console.error("[YT Filter BG] Network Error (Failed to fetch):", fetchError);
      return { 
        allowed: true, 
        error: "Network error: Failed to fetch API. Please check your connection or ad-blocker."
      };
    }
    const data = await response.json();

    // Handle API errors
    if (data.error) {
      console.error("[YT Filter BG] API Error:", data.error.message);
      return { 
        allowed: true, 
        error: data.error.message 
      };
    }

    if (!data.items || data.items.length === 0) {
      console.log("[YT Filter BG] Video not found in API");
      return { allowed: true, reason: "Video not found" };
    }

    const video = data.items[0];
    const title = video.snippet.title.toLowerCase();
    const description = video.snippet.description.toLowerCase();
    const tags = video.snippet.tags
      ? video.snippet.tags.join(" ").toLowerCase()
      : "";
    const categoryId = video.snippet.categoryId;
    const videoChannelId = video.snippet.channelId; // This is the real channel ID from API
    const channelTitle = video.snippet.channelTitle;

    // Combine all text for analysis
    const content = `${title} ${description} ${tags}`;

    // STEP 4: Analyze if video is constructive
    const isConstructive = isVideoConstructive(content, categoryId);
    console.log(
      `[YT Filter BG] Analysis result: ${isConstructive ? "CONSTRUCTIVE" : "NON-CONSTRUCTIVE"}`,
    );

    // STEP 5: Save to cache using the REAL channel ID from API
    // This ensures consistent cache keys
    if (videoChannelId) {
      console.log(
        `[YT Filter BG] Saving to cache: ${channelTitle} (${videoChannelId}) = ${isConstructive ? "ALLOWED" : "BLOCKED"}`,
      );
      await learnChannel(
        videoChannelId,
        isConstructive,
        categoryId,
        channelTitle,
      );
      
      // Also cache the username format if we had one from the page
      if (channelId && channelId !== videoChannelId && channelId.startsWith("@")) {
        console.log(`[YT Filter BG] Also caching username mapping: ${channelId} -> ${videoChannelId}`);
        await learnChannel(
          channelId,
          isConstructive,
          categoryId,
          channelTitle,
        );
      }
    }

    console.log(
      `[YT Filter BG] Decision: ${channelTitle} is ${isConstructive ? "ALLOWED" : "BLOCKED"}`,
    );

    return {
      allowed: isConstructive,
      reason: isConstructive
        ? "Constructive content"
        : "Non-constructive content",
      title: video.snippet.title,
      category: getCategoryName(categoryId),
      channelId: videoChannelId,
      channelTitle: channelTitle,
      fromCache: false,
    };
  } catch (error) {
    console.error("[YT Filter BG] Error checking video:", error);
    return { allowed: true, error: error.message };
  }
}

// Get channel cache from storage
async function getChannelCache() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["channelCache"], (result) => {
      resolve(result.channelCache || {});
    });
  });
}

// Learn from channel decision and cache it
async function learnChannel(channelId, allowed, categoryId, channelTitle) {
  if (!channelId) {
    console.log("[YT Filter BG] Cannot learn: No channel ID provided");
    return;
  }

  const channelCache = await getChannelCache();
  
  // Check if this channel was manually set by user - don't override
  if (channelCache[channelId]?.manuallySet) {
    console.log(`[YT Filter BG] Channel ${channelId} was manually set, not overriding`);
    return;
  }

  channelCache[channelId] = {
    allowed: allowed,
    category: getCategoryName(categoryId),
    channelTitle: channelTitle,
    learnedAt: Date.now(),
    count: (channelCache[channelId]?.count || 0) + 1,
    manuallySet: false,
  };

  // Save to storage
  return new Promise((resolve) => {
    chrome.storage.local.set({ channelCache: channelCache }, () => {
      if (chrome.runtime.lastError) {
        console.error("[YT Filter BG] Error saving to cache:", chrome.runtime.lastError);
        resolve();
        return;
      }
      console.log(
        `[YT Filter BG] CACHED: ${channelTitle} (${channelId}) = ${allowed ? "ALLOWED" : "BLOCKED"}`,
      );
      console.log(
        `[YT Filter BG] Total cached channels: ${Object.keys(channelCache).length}`,
      );
      resolve();
    });
  });
}

// Determine if video is constructive based on content and category
function isVideoConstructive(content, categoryId) {
  // YouTube category IDs:
  // ALLOWED CATEGORIES (always pass):
  // 10: Music
  // 27: Education
  // 25: News & Politics
  // 28: Science & Technology
  
  // BLOCKED CATEGORIES (always fail unless heavily educational):
  // 20: Gaming
  // 23: Comedy
  // 24: Entertainment
  // 22: People & Blogs

  const allowedCategories = ["10", "27", "25", "28"];
  const blockedCategories = ["20", "23", "24", "22"];

  // If it's an allowed category, automatically allow
  if (allowedCategories.includes(categoryId)) {
    return true;
  }

  // If it's a blocked category, automatically block (no keyword analysis)
  if (blockedCategories.includes(categoryId)) {
    console.log(`[YT Filter BG] Category ${categoryId} is in blocked list - BLOCKED`);
    return false;
  }

  // For other categories, use keyword analysis
  const constructiveKeywords = [
    "tutorial",
    "learn",
    "learning",
    "education",
    "educational",
    "study",
    "studying",
    "course",
    "lesson",
    "lecture",
    "how to",
    "guide",
    "explained",
    "explain",
    "music",
    "classical",
    "piano",
    "guitar",
    "instrumental",
    "news",
    "documentary",
    "science",
    "technology",
    "programming",
    "coding",
    "math",
    "mathematics",
    "physics",
    "chemistry",
    "biology",
    "history",
    "language",
    "book",
    "reading",
    "writing",
    "productivity",
    "focus",
    "concentration",
  ];

  // Check for non-constructive keywords
  const nonConstructiveKeywords = [
    "vlog",
    "prank",
    "funny moments",
    "compilation",
    "reaction",
    "challenge",
    "drama",
    "gossip",
    "gaming",
    "gameplay",
    "let's play",
    "fortnite",
    "tiktok",
    "meme",
    "fail",
    "roast",
    "entertainment",
    "funny",
    "comedy",
    "skit",
    "parody",
  ];

  // Count constructive matches
  let constructiveScore = 0;
  for (const keyword of constructiveKeywords) {
    if (content.includes(keyword)) {
      constructiveScore++;
    }
  }

  // Count non-constructive matches
  let nonConstructiveScore = 0;
  for (const keyword of nonConstructiveKeywords) {
    if (content.includes(keyword)) {
      nonConstructiveScore++;
    }
  }

  // Default to BLOCKED unless constructive score is clearly higher
  // Require at least 2 more constructive keywords than non-constructive
  return constructiveScore >= nonConstructiveScore + 2;
}

// Get category name from ID
function getCategoryName(categoryId) {
  const categories = {
    1: "Film & Animation",
    2: "Autos & Vehicles",
    10: "Music",
    15: "Pets & Animals",
    17: "Sports",
    19: "Travel & Events",
    20: "Gaming",
    22: "People & Blogs",
    23: "Comedy",
    24: "Entertainment",
    25: "News & Politics",
    26: "Howto & Style",
    27: "Education",
    28: "Science & Technology",
    29: "Nonprofits & Activism",
  };

  return categories[categoryId] || "Unknown";
}

// Update channel status (allow/block)
async function updateChannelStatus(channelId, allowed) {
  if (!channelId) {
    throw new Error("No channel ID provided");
  }

  const channelCache = await getChannelCache();
  
  if (channelCache[channelId]) {
    channelCache[channelId].allowed = allowed;
    channelCache[channelId].learnedAt = Date.now();
    channelCache[channelId].manuallySet = true;
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ channelCache: channelCache }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error updating channel:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        console.log(`Channel ${channelId} updated to ${allowed ? "ALLOWED" : "BLOCKED"}`);
        resolve();
      });
    });
  } else {
    throw new Error("Channel not found in cache");
  }
}

// Delete channel from cache
async function deleteChannelFromCache(channelId) {
  if (!channelId) {
    throw new Error("No channel ID provided");
  }

  const channelCache = await getChannelCache();
  
  if (channelCache[channelId]) {
    delete channelCache[channelId];
    
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ channelCache: channelCache }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error deleting channel:", chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        console.log(`Channel ${channelId} deleted from cache`);
        resolve();
      });
    });
  } else {
    throw new Error("Channel not found in cache");
  }
}
