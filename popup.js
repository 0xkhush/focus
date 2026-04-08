// Popup script for YouTube Content Filter

document.addEventListener("DOMContentLoaded", function () {
  // DOM Elements
  const enableToggle = document.getElementById("enableToggle");
  const statusDot = document.getElementById("statusDot");
  const statusLabel = document.getElementById("statusLabel");
  const blockedCount = document.getElementById("blockedCount");
  const allowedCount = document.getElementById("allowedCount");
  const learnedCount = document.getElementById("learnedCount");
  const clearCacheBtn = document.getElementById("clearCacheBtn");
  const viewCacheBtn = document.getElementById("viewCacheBtn");
  
  // Modal Elements
  const channelModal = document.getElementById("channelModal");
  const closeModal = document.getElementById("closeModal");
  const channelList = document.getElementById("channelList");
  const channelTabs = document.querySelectorAll(".channel-tab");
  const allCount = document.getElementById("allCount");
  const allowedTabCount = document.getElementById("allowedTabCount");
  const blockedTabCount = document.getElementById("blockedTabCount");
  
  // Confirm Dialog Elements
  const confirmDialog = document.getElementById("confirmDialog");
  const confirmCancel = document.getElementById("confirmCancel");
  const confirmClear = document.getElementById("confirmClear");
  
  // Toast Elements
  const toast = document.getElementById("toast");
  const toastIcon = document.getElementById("toastIcon");
  const toastMessage = document.getElementById("toastMessage");
  
  // API Key Elements
  const apiWarning = document.getElementById("apiWarning");
  const mainContent = document.getElementById("mainContent");
  const setupApiBtn = document.getElementById("setupApiBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  
  // State
  let currentFilter = "all";
  let channelCache = {};
  let hasApiKey = false;

  // Initialize - Check API key first
  checkApiKey();
  
  // Check if API key exists
  function checkApiKey() {
    chrome.storage.local.get(["youtubeApiKey"], function (result) {
      hasApiKey = !!result.youtubeApiKey;
      
      if (hasApiKey) {
        // API key exists - show main content
        apiWarning.classList.remove("show");
        mainContent.classList.remove("hidden");
        loadState();
      } else {
        // No API key - show warning
        apiWarning.classList.add("show");
        mainContent.classList.add("hidden");
      }
    });
  }
  
  // Load saved state
  function loadState() {
    chrome.storage.local.get(
      ["filterEnabled", "blockedCount", "allowedCount", "channelCache"],
      function (result) {
        enableToggle.checked = result.filterEnabled !== false;
        updateStatus(enableToggle.checked);
        blockedCount.textContent = result.blockedCount || 0;
        allowedCount.textContent = result.allowedCount || 0;
        
        channelCache = result.channelCache || {};
        updateLearnedCount();
      }
    );
  }

  // Update status display
  function updateStatus(enabled) {
    if (enabled) {
      statusDot.classList.remove("inactive");
      statusLabel.textContent = "Filter Active";
    } else {
      statusDot.classList.add("inactive");
      statusLabel.textContent = "Filter Disabled";
    }
  }

  // Update learned count
  function updateLearnedCount() {
    const count = Object.keys(channelCache).length;
    learnedCount.textContent = count;
    
    const allowed = Object.values(channelCache).filter(c => c.allowed).length;
    const blocked = count - allowed;
    
    allCount.textContent = count;
    allowedTabCount.textContent = allowed;
    blockedTabCount.textContent = blocked;
  }

  // Show toast notification
  function showToast(message, type = "success") {
    toastIcon.textContent = type === "success" ? "\u2713" : "\u2717";
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add("show");
    
    setTimeout(() => {
      toast.classList.remove("show");
    }, 3000);
  }

  // Get initials from channel name
  function getInitials(name) {
    if (!name) return "CH";
    const words = name.split(/\s+/);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }

  // Render channel list
  function renderChannelList(filter = "all") {
    channelList.innerHTML = "";
    
    const channels = Object.entries(channelCache);
    
    if (channels.length === 0) {
      channelList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">AI</div>
          <div class="empty-state-text">No channels learned yet</div>
          <div class="empty-state-subtext">Visit YouTube videos to start learning!</div>
        </div>
      `;
      return;
    }
    
    // Filter channels
    let filteredChannels = channels;
    if (filter === "allowed") {
      filteredChannels = channels.filter(([_, data]) => data.allowed);
    } else if (filter === "blocked") {
      filteredChannels = channels.filter(([_, data]) => !data.allowed);
    }
    
    if (filteredChannels.length === 0) {
      channelList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">${filter === "allowed" ? "\u2713" : "\u2717"}</div>
          <div class="empty-state-text">No ${filter} channels</div>
        </div>
      `;
      return;
    }
    
    // Sort by most recent
    filteredChannels.sort((a, b) => (b[1].learnedAt || 0) - (a[1].learnedAt || 0));
    
    filteredChannels.forEach(([channelId, data]) => {
      const item = document.createElement("div");
      item.className = `channel-item ${data.allowed ? "allowed" : "blocked"}`;
      
      const initials = getInitials(data.channelTitle);
      const statusIcon = data.allowed ? "\u2713" : "\u2717";
      const toggleTitle = data.allowed ? "Block this channel" : "Allow this channel";
      const toggleClass = data.allowed ? "toggle-block" : "toggle-allow";
      const toggleIcon = data.allowed ? "\u2717" : "\u2713";
      
      item.innerHTML = `
        <div class="channel-info">
          <div class="channel-avatar">${initials}</div>
          <div class="channel-details">
            <div class="channel-name" title="${data.channelTitle || channelId}">${data.channelTitle || channelId}</div>
            <div class="channel-category">${data.category || "Unknown"} ${statusIcon} ${data.allowed ? "Allowed" : "Blocked"}</div>
          </div>
        </div>
        <div class="channel-actions">
          <button class="channel-btn ${toggleClass}" title="${toggleTitle}" data-channel-id="${channelId}" data-action="toggle">
            ${toggleIcon}
          </button>
          <button class="channel-btn delete" title="Remove from learned" data-channel-id="${channelId}" data-action="delete">
            X
          </button>
        </div>
      `;
      
      channelList.appendChild(item);
    });
    
    // Add event listeners to buttons
    channelList.querySelectorAll(".channel-btn").forEach(btn => {
      btn.addEventListener("click", handleChannelAction);
    });
  }

  // Handle channel actions (toggle/delete)
  function handleChannelAction(e) {
    const channelId = e.currentTarget.dataset.channelId;
    const action = e.currentTarget.dataset.action;
    
    if (action === "toggle") {
      toggleChannelStatus(channelId);
    } else if (action === "delete") {
      deleteChannel(channelId);
    }
  }

  // Toggle channel allowed/blocked status
  function toggleChannelStatus(channelId) {
    if (!channelCache[channelId]) return;
    
    const wasAllowed = channelCache[channelId].allowed;
    channelCache[channelId].allowed = !wasAllowed;
    channelCache[channelId].learnedAt = Date.now();
    
    chrome.storage.local.set({ channelCache: channelCache }, function () {
      const channelName = channelCache[channelId].channelTitle || channelId;
      const newStatus = channelCache[channelId].allowed ? "allowed" : "blocked";
      showToast(`${channelName} is now ${newStatus}`, "success");
      
      updateLearnedCount();
      renderChannelList(currentFilter);
      
      console.log(`Channel ${channelId} toggled to ${newStatus}`);
    });
  }

  // Delete channel from cache
  function deleteChannel(channelId) {
    const channelName = channelCache[channelId]?.channelTitle || channelId;
    
    delete channelCache[channelId];
    
    chrome.storage.local.set({ channelCache: channelCache }, function () {
      showToast(`${channelName} removed`, "success");
      
      updateLearnedCount();
      renderChannelList(currentFilter);
      
      console.log(`Channel ${channelId} removed from cache`);
    });
  }

  // Event Listeners
  
  // Setup API Key button
  setupApiBtn.addEventListener("click", function () {
    window.location.href = "setup.html";
  });
  
  // Settings button
  settingsBtn.addEventListener("click", function () {
    window.location.href = "setup.html";
  });
  
  // Toggle filter
  enableToggle.addEventListener("change", function () {
    const enabled = this.checked;
    chrome.storage.local.set({ filterEnabled: enabled });
    updateStatus(enabled);
    
    showToast(enabled ? "Filter enabled" : "Filter disabled", "success");
    
    // Reload current YouTube tab if any
    chrome.tabs.query({ url: "https://www.youtube.com/*" }, function (tabs) {
      tabs.forEach((tab) => {
        chrome.tabs.reload(tab.id);
      });
    });
  });

  // View channels button
  viewCacheBtn.addEventListener("click", function () {
    // Refresh cache data before showing modal
    chrome.storage.local.get(["channelCache"], function (result) {
      channelCache = result.channelCache || {};
      updateLearnedCount();
      renderChannelList(currentFilter);
      channelModal.classList.add("active");
    });
  });

  // Close modal
  closeModal.addEventListener("click", function () {
    channelModal.classList.remove("active");
  });

  // Close modal on overlay click
  channelModal.addEventListener("click", function (e) {
    if (e.target === channelModal) {
      channelModal.classList.remove("active");
    }
  });

  // Tab switching
  channelTabs.forEach(tab => {
    tab.addEventListener("click", function () {
      channelTabs.forEach(t => t.classList.remove("active"));
      this.classList.add("active");
      currentFilter = this.dataset.filter;
      renderChannelList(currentFilter);
    });
  });

  // Clear cache button - show confirm dialog
  clearCacheBtn.addEventListener("click", function () {
    if (Object.keys(channelCache).length === 0) {
      showToast("No channels to clear", "error");
      return;
    }
    confirmDialog.classList.add("active");
  });

  // Confirm cancel
  confirmCancel.addEventListener("click", function () {
    confirmDialog.classList.remove("active");
  });

  // Confirm clear
  confirmClear.addEventListener("click", function () {
    channelCache = {};
    chrome.storage.local.set({ channelCache: {} }, function () {
      confirmDialog.classList.remove("active");
      channelModal.classList.remove("active");
      updateLearnedCount();
      showToast("All channels cleared", "success");
      console.log("Channel cache cleared");
    });
  });

  // Listen for stats updates
  chrome.storage.onChanged.addListener(function (changes, namespace) {
    if (namespace === "local") {
      if (changes.blockedCount) {
        blockedCount.textContent = changes.blockedCount.newValue;
      }
      if (changes.allowedCount) {
        allowedCount.textContent = changes.allowedCount.newValue;
      }
      if (changes.channelCache) {
        channelCache = changes.channelCache.newValue || {};
        updateLearnedCount();
      }
      // Check if API key was added/removed
      if (changes.youtubeApiKey) {
        checkApiKey();
      }
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      channelModal.classList.remove("active");
      confirmDialog.classList.remove("active");
    }
  });
});
