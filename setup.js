// Setup script for YouTube Content Filter - API Key Configuration

document.addEventListener("DOMContentLoaded", function () {
  // DOM Elements
  const setupView = document.getElementById("setupView");
  const configuredView = document.getElementById("configuredView");
  const apiKeyInput = document.getElementById("apiKeyInput");
  const toggleVisibility = document.getElementById("toggleVisibility");
  const saveApiKey = document.getElementById("saveApiKey");
  const validationStatus = document.getElementById("validationStatus");
  const validationSpinner = document.getElementById("validationSpinner");
  const validationMessage = document.getElementById("validationMessage");
  const instructionsToggle = document.getElementById("instructionsToggle");
  const instructionsContent = document.getElementById("instructionsContent");
  const maskedApiKey = document.getElementById("maskedApiKey");
  const goToPopup = document.getElementById("goToPopup");
  const removeApiKey = document.getElementById("removeApiKey");

  // State
  let isPasswordVisible = false;

  // Initialize - check if API key exists
  checkApiKeyStatus();

  // Check if API key is already configured
  function checkApiKeyStatus() {
    chrome.storage.local.get(["youtubeApiKey"], function (result) {
      if (result.youtubeApiKey) {
        showConfiguredView(result.youtubeApiKey);
      } else {
        showSetupView();
      }
    });
  }

  // Show setup view
  function showSetupView() {
    setupView.classList.add("active");
    configuredView.classList.remove("active");
  }

  // Show configured view
  function showConfiguredView(apiKey) {
    setupView.classList.remove("active");
    configuredView.classList.add("active");
    
    // Mask the API key for display
    const masked = maskApiKey(apiKey);
    maskedApiKey.textContent = masked;
  }

  // Mask API key for display
  function maskApiKey(key) {
    if (!key || key.length < 10) return "••••••••••••••••••••";
    return key.substring(0, 8) + "••••••••••••••••••••••••" + key.substring(key.length - 4);
  }

  // Toggle password visibility
  toggleVisibility.addEventListener("click", function () {
    isPasswordVisible = !isPasswordVisible;
    apiKeyInput.type = isPasswordVisible ? "text" : "password";
    toggleVisibility.textContent = isPasswordVisible ? "HIDE" : "*";
  });

  // Enable/disable save button based on input
  apiKeyInput.addEventListener("input", function () {
    const value = this.value.trim();
    saveApiKey.disabled = value.length < 20;
    
    // Reset validation status
    hideValidationStatus();
    apiKeyInput.classList.remove("valid", "invalid");
  });

  // Toggle instructions
  instructionsToggle.addEventListener("click", function () {
    this.classList.toggle("active");
    instructionsContent.classList.toggle("active");
  });

  // Save API key
  saveApiKey.addEventListener("click", async function () {
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      showValidationStatus("error", "Please enter an API key");
      return;
    }

    // Basic format validation
    if (!apiKey.startsWith("AIza") || apiKey.length < 30) {
      showValidationStatus("error", "Invalid API key format. Keys start with 'AIza'");
      apiKeyInput.classList.add("invalid");
      return;
    }

    // Show validating status
    showValidationStatus("validating", "Validating API key...");
    saveApiKey.disabled = true;

    try {
      // Validate by making a test API call
      const isValid = await validateApiKey(apiKey);
      
      if (isValid) {
        // Store the API key securely
        await storeApiKey(apiKey);
        
        showValidationStatus("success", "API key validated and saved!");
        apiKeyInput.classList.add("valid");
        
        // Redirect to popup after short delay
        setTimeout(() => {
          showConfiguredView(apiKey);
        }, 1500);
      } else {
        showValidationStatus("error", "Invalid API key. Please check and try again.");
        apiKeyInput.classList.add("invalid");
        saveApiKey.disabled = false;
      }
    } catch (error) {
      showValidationStatus("error", error.message || "Validation failed. Please try again.");
      apiKeyInput.classList.add("invalid");
      saveApiKey.disabled = false;
    }
  });

  // Validate API key by making a test request
  async function validateApiKey(apiKey) {
    try {
      // Test with a simple, low-quota API call
      const testVideoId = "dQw4w9WgXcQ"; // A well-known video ID
      const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${testVideoId}&key=${apiKey}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (response.ok && data.items) {
        return true;
      }
      
      // Check for specific error messages
      if (data.error) {
        if (data.error.code === 400) {
          throw new Error("Invalid API key format");
        } else if (data.error.code === 403) {
          if (data.error.message.includes("API key not valid")) {
            throw new Error("API key is not valid");
          } else if (data.error.message.includes("YouTube Data API v3 has not been enabled")) {
            throw new Error("YouTube Data API v3 is not enabled for this key");
          } else if (data.error.message.includes("quota")) {
            // If quota exceeded, the key is still valid
            return true;
          }
          throw new Error("API key doesn't have permission. Enable YouTube Data API v3.");
        }
        throw new Error(data.error.message || "API validation failed");
      }
      
      return false;
    } catch (error) {
      if (error.message) {
        throw error;
      }
      throw new Error("Network error. Please check your connection.");
    }
  }

  // Store API key securely
  function storeApiKey(apiKey) {
    return new Promise((resolve, reject) => {
      // Encode the key (basic obfuscation - not encryption)
      const encodedKey = btoa(apiKey);
      
      chrome.storage.local.set({ 
        youtubeApiKey: apiKey,
        youtubeApiKeyEncoded: encodedKey,
        apiKeySetAt: Date.now()
      }, function () {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          console.log("API key stored securely");
          resolve();
        }
      });
    });
  }

  // Show validation status
  function showValidationStatus(type, message) {
    validationStatus.className = `validation-status show ${type}`;
    validationMessage.textContent = message;
    validationSpinner.style.display = type === "validating" ? "block" : "none";
  }

  // Hide validation status
  function hideValidationStatus() {
    validationStatus.classList.remove("show");
  }

  // Go to popup
  goToPopup.addEventListener("click", function () {
    window.location.href = "popup.html";
  });

  // Remove API key
  removeApiKey.addEventListener("click", function () {
    if (confirm("Are you sure you want to remove your API key? The extension will stop working until you add a new one.")) {
      chrome.storage.local.remove(["youtubeApiKey", "youtubeApiKeyEncoded", "apiKeySetAt"], function () {
        console.log("API key removed");
        apiKeyInput.value = "";
        apiKeyInput.classList.remove("valid", "invalid");
        saveApiKey.disabled = true;
        hideValidationStatus();
        showSetupView();
      });
    }
  });

  // Handle Enter key in input
  apiKeyInput.addEventListener("keypress", function (e) {
    if (e.key === "Enter" && !saveApiKey.disabled) {
      saveApiKey.click();
    }
  });
});
