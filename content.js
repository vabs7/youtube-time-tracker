// YouTube Time Tracker - Content Script

let pendingSeconds = 0;
let currentCategory = 'browsing';
let currentVideoTitle = '';
let trackingInterval = null;

// Track user interactions to distinguish active browsing from idle open tabs
let lastUserInteraction = Date.now();
const USER_ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'wheel', 'touchstart'];
USER_ACTIVITY_EVENTS.forEach((evt) => {
  window.addEventListener(evt, () => {
    lastUserInteraction = Date.now();
  }, { passive: true });
});

let localSettings = {
  isPaused: false,
  trackBackgroundAudio: false
};

// Sync settings
function refreshSettings() {
  if (!chrome.runtime?.id) return;
  try {
    chrome.storage.local.get(['settings'], (res) => {
      if (chrome.runtime.lastError) return;
      if (res && res.settings) {
        localSettings.isPaused = !!res.settings.isPaused;
        localSettings.trackBackgroundAudio = !!res.settings.trackBackgroundAudio;
      }
    });
  } catch (e) {
    // Context invalidated
  }
}

refreshSettings();

if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      const newSettings = changes.settings.newValue || {};
      localSettings.isPaused = !!newSettings.isPaused;
      localSettings.trackBackgroundAudio = !!newSettings.trackBackgroundAudio;
    }
  });
}

function isShortsPage() {
  return window.location.pathname.startsWith('/shorts');
}

function isWatchPage() {
  return window.location.pathname.startsWith('/watch') || window.location.pathname.startsWith('/embed');
}

// Determines category based on page URL
function getActiveCategory() {
  if (isShortsPage()) return 'shorts';
  if (isWatchPage()) return 'videos';
  // Home, Search, Feed, Subscriptions, Channels, Trending, etc.
  return 'browsing';
}

// Get video, search, or page title
function getCurrentTitle(category) {
  try {
    if (category === 'shorts') {
      const activeShortTitle = document.querySelector('ytd-reel-video-renderer[is-active] h2, ytd-reel-video-renderer[is-active] .title');
      if (activeShortTitle && activeShortTitle.textContent.trim()) {
        return activeShortTitle.textContent.trim();
      }
    } else if (category === 'videos') {
      const mainTitle = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string');
      if (mainTitle && mainTitle.textContent.trim()) {
        return mainTitle.textContent.trim();
      }
    } else if (category === 'browsing') {
      // Check if user is hovering over a preview video on feed
      const previewTitle = document.querySelector('#inline-preview-player #video-title, ytd-video-preview #video-title, #preview #video-title');
      if (previewTitle && previewTitle.textContent.trim()) {
        return `Hovering: ${previewTitle.textContent.trim()}`;
      }

      // Check search input if on search results
      if (window.location.pathname.startsWith('/results')) {
        const searchInput = document.querySelector('input#search');
        if (searchInput && searchInput.value.trim()) {
          return `Search: "${searchInput.value.trim()}"`;
        }
      }
    }
  } catch (e) {}

  const cleanDocTitle = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
  if (cleanDocTitle && cleanDocTitle !== 'YouTube') {
    return cleanDocTitle;
  }

  if (category === 'browsing') {
    return 'Browsing YouTube Feed';
  }
  return 'Watching YouTube';
}

function isValidPlayback(video) {
  return video &&
    !video.paused &&
    !video.ended &&
    video.readyState > 0 &&
    video.duration > 0 &&
    !isNaN(video.duration);
}

// Checks if any video is playing
function detectVideoPlayback() {
  if (isShortsPage()) {
    const activeReelVideo = document.querySelector('ytd-reel-video-renderer[is-active] video');
    if (activeReelVideo && isValidPlayback(activeReelVideo)) {
      return { isPlaying: true, video: activeReelVideo };
    }
  }

  const mainVideo = document.querySelector('#movie_player video') || document.querySelector('video.html5-main-video');
  if (mainVideo && isValidPlayback(mainVideo)) {
    return { isPlaying: true, video: mainVideo };
  }

  const previewVideo = document.querySelector('#inline-preview-player video, ytd-video-preview video, #preview video');
  if (previewVideo && isValidPlayback(previewVideo)) {
    return { isPlaying: true, video: previewVideo };
  }

  const allVideos = document.querySelectorAll('video');
  for (const v of allVideos) {
    if (isValidPlayback(v)) {
      return { isPlaying: true, video: v };
    }
  }

  return { isPlaying: false, video: null };
}

// Determines if this second should be tracked and under which category
function evaluateActiveTracking() {
  if (localSettings.isPaused) return null;

  const isTabVisible = !document.hidden;
  const isPiP = document.pictureInPictureElement != null;
  const category = getActiveCategory();
  const playback = detectVideoPlayback();
  const now = Date.now();

  // If tab is in background (hidden)
  if (!isTabVisible) {
    if (isPiP && playback.isPlaying) {
      return { category, title: getCurrentTitle(category) };
    }
    if (localSettings.trackBackgroundAudio && playback.isPlaying && playback.video && !playback.video.muted && playback.video.volume > 0) {
      return { category, title: getCurrentTitle(category) };
    }
    return null;
  }

  // Tab is visible and active on screen:

  // 1. If on Watch page:
  if (category === 'videos') {
    if (playback.isPlaying) {
      // Video is playing
      return { category: 'videos', title: getCurrentTitle('videos') };
    }
    // If video is paused, only count if user is actively interacting (e.g. reading comments within last 12s)
    if (now - lastUserInteraction < 12000) {
      return { category: 'browsing', title: getCurrentTitle('browsing') };
    }
    // Paused and inactive -> do not track
    return null;
  }

  // 2. If on Shorts:
  if (category === 'shorts') {
    if (playback.isPlaying || (now - lastUserInteraction < 15000)) {
      return { category: 'shorts', title: getCurrentTitle('shorts') };
    }
    return null;
  }

  // 3. If on Feed / Browse (Home, Search, Channel, Subscriptions):
  // Count if preview is playing OR user actively browsing within last 60s
  if (category === 'browsing') {
    if (playback.isPlaying || (now - lastUserInteraction < 60000)) {
      return { category: 'browsing', title: getCurrentTitle('browsing') };
    }
    return null;
  }

  return null;
}

function flushPendingTime() {
  if (pendingSeconds <= 0) return;
  if (!chrome.runtime?.id) {
    clearInterval(trackingInterval);
    return;
  }

  const secondsToSend = pendingSeconds;
  const categoryToSend = currentCategory;
  const titleToSend = currentVideoTitle;
  pendingSeconds = 0;

  try {
    chrome.runtime.sendMessage({
      type: 'RECORD_TIME',
      seconds: secondsToSend,
      category: categoryToSend,
      title: titleToSend
    }, (response) => {
      if (chrome.runtime.lastError) {
        // If message failed (e.g. background worker sleeping), restore seconds to avoid loss
        pendingSeconds += secondsToSend;
      }
    });
  } catch (err) {
    clearInterval(trackingInterval);
  }
}

// 1-second tracking loop
trackingInterval = setInterval(() => {
  if (!chrome.runtime?.id) {
    clearInterval(trackingInterval);
    return;
  }

  try {
    const activeState = evaluateActiveTracking();

    if (activeState) {
      // If category shifted (e.g. from browsing to videos), flush previous category first
      if (currentCategory !== activeState.category && pendingSeconds > 0) {
        flushPendingTime();
      }

      pendingSeconds++;
      currentCategory = activeState.category;
      currentVideoTitle = activeState.title;

      // Flush every 3 seconds for responsive live updates
      if (pendingSeconds >= 3) {
        flushPendingTime();
      }
    } else {
      if (pendingSeconds > 0) {
        flushPendingTime();
      }
    }
  } catch (error) {
    console.error("[YouTube Tracker] Tick check error:", error);
  }
}, 1000);

// Flushes on page transitions, SPA navigation, and tab closure
window.addEventListener('beforeunload', flushPendingTime);
window.addEventListener('pagehide', flushPendingTime);
window.addEventListener('yt-navigate-finish', () => {
  flushPendingTime();
  lastUserInteraction = Date.now();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !localSettings.trackBackgroundAudio) {
    flushPendingTime();
  }
});
