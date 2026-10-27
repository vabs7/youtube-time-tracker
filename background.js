// YouTube Time Tracker - Background Service Worker

const DEFAULT_SETTINGS = {
  isPaused: false,
  dailyLimitMinutes: 0, // 0 = disabled
  lastNotifiedLimitDate: "",
  trackBackgroundAudio: false,
  showBadge: true
};

// Tracks active playback/browsing for the popup "Now Playing" banner
let activeSession = {
  isPlaying: false,
  title: "",
  category: "browsing", // 'videos' | 'shorts' | 'browsing'
  lastUpdated: 0
};

// Rate-limiting timestamp to prevent multi-tab concurrency from double-counting seconds
let lastRecordedWallClock = 0;

// Sequential queue to guarantee atomic storage updates across concurrent tabs
let storageQueue = Promise.resolve();

function queueTask(taskFn) {
  storageQueue = storageQueue.then(taskFn).catch((err) => {
    console.error("[YouTube Tracker BG] Queue error:", err);
  });
  return storageQueue;
}

function getTodayString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function normalizeDayData(raw) {
  if (typeof raw === 'number') {
    return { total: raw, videos: raw, shorts: 0, browsing: 0 };
  }
  if (raw && typeof raw === 'object') {
    const total = Number(raw.total) || 0;
    const videos = Number(raw.videos) || 0;
    const shorts = Number(raw.shorts) || 0;
    let browsing = typeof raw.browsing !== 'undefined' ? (Number(raw.browsing) || 0) : 0;
    
    // If browsing wasn't explicitly saved but total exceeds videos + shorts, attribute remainder to browsing
    if (typeof raw.browsing === 'undefined' && total > (videos + shorts)) {
      browsing = total - (videos + shorts);
    }
    return { total, videos, shorts, browsing };
  }
  return { total: 0, videos: 0, shorts: 0, browsing: 0 };
}

async function getSettings() {
  const result = await chrome.storage.local.get(['settings']);
  return Object.assign({}, DEFAULT_SETTINGS, result.settings || {});
}

async function updateBadge(todaySeconds = null) {
  try {
    const settings = await getSettings();
    if (!settings.showBadge) {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }

    if (settings.isPaused) {
      await chrome.action.setBadgeText({ text: "PAUS" });
      await chrome.action.setBadgeBackgroundColor({ color: "#6e6e6e" });
      return;
    }

    const todayStr = getTodayString();
    let seconds = todaySeconds;
    if (seconds === null) {
      const data = await chrome.storage.local.get([todayStr]);
      const dayData = normalizeDayData(data[todayStr]);
      seconds = dayData.total;
    }

    if (seconds <= 0) {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }

    const mins = Math.floor(seconds / 60);
    let badgeText = "";
    if (mins < 1) {
      badgeText = "<1m";
    } else if (mins < 60) {
      badgeText = `${mins}m`;
    } else {
      const hours = (seconds / 3600).toFixed(1);
      badgeText = hours.endsWith(".0") ? `${Math.floor(seconds / 3600)}h` : `${hours}h`;
    }

    await chrome.action.setBadgeText({ text: badgeText });

    // Set badge color based on limit
    if (settings.dailyLimitMinutes > 0) {
      const limitSec = settings.dailyLimitMinutes * 60;
      if (seconds >= limitSec) {
        await chrome.action.setBadgeBackgroundColor({ color: "#D32F2F" }); // Alert Red
        return;
      } else if (seconds >= limitSec * 0.85) {
        await chrome.action.setBadgeBackgroundColor({ color: "#F57C00" }); // Warning Orange
        return;
      }
    }

    // Default YouTube Red
    await chrome.action.setBadgeBackgroundColor({ color: "#CC0000" });
  } catch (err) {
    console.error("[YouTube Tracker BG] Badge update failed:", err);
  }
}

async function checkDailyLimit(todayStr, totalSeconds, settings) {
  if (settings.dailyLimitMinutes <= 0) return;

  const limitSeconds = settings.dailyLimitMinutes * 60;
  if (totalSeconds >= limitSeconds && settings.lastNotifiedLimitDate !== todayStr) {
    const limitFormatted = settings.dailyLimitMinutes >= 60
      ? `${(settings.dailyLimitMinutes / 60).toFixed(1).replace('.0', '')} hours`
      : `${settings.dailyLimitMinutes} minutes`;

    try {
      if (chrome.notifications?.create) {
        chrome.notifications.create(`limit-${todayStr}`, {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "YouTube Daily Limit Reached!",
          message: `You've reached your daily limit of ${limitFormatted} on YouTube today. Time to take a break!`,
          priority: 2
        });
      }
    } catch (e) {
      console.warn("[YouTube Tracker BG] Notification error:", e);
    }

    settings.lastNotifiedLimitDate = todayStr;
    await chrome.storage.local.set({ settings });
  }
}

// Automatically seed history from v1 backup if not already seeded
async function seedInitialHistory(force = false) {
  return queueTask(async () => {
    try {
      const flag = await chrome.storage.local.get(['initial_history_seeded']);
      if (!flag.initial_history_seeded || force) {
        const url = chrome.runtime.getURL('history_seed.json');
        const res = await fetch(url);
        const seedData = await res.json();

        const currentData = await chrome.storage.local.get(null);
        const toSave = {};

        for (const [dateStr, val] of Object.entries(seedData)) {
          if (!currentData[dateStr]) {
            toSave[dateStr] = val;
          } else {
            const cur = normalizeDayData(currentData[dateStr]);
            const seed = normalizeDayData(val);
            if (cur.total < seed.total) {
              toSave[dateStr] = seed;
            }
          }
        }

        toSave.initial_history_seeded = true;
        await chrome.storage.local.set(toSave);
        console.log(`[YouTube Tracker BG] Successfully seeded v1 watch history (${Object.keys(seedData).length} days)!`);
        await updateBadge();
        return true;
      }
    } catch (err) {
      console.warn("[YouTube Tracker BG] Seed history note:", err);
    }
    return false;
  });
}

// Handle time increments atomically and prevent multi-tab overcounting
async function recordWatchTime({ seconds, category, title }) {
  return queueTask(async () => {
    const settings = await getSettings();
    if (settings.isPaused) return;

    const now = Date.now();
    const rawSecs = Math.max(1, parseInt(seconds, 10) || 0);

    // Concurrency guard: Ensure seconds added do not exceed real-world wall clock elapsed time
    // If two tabs report simultaneously, clamp seconds to elapsed time to prevent 2x/3x clock speed
    let secsToAdd = rawSecs;
    if (lastRecordedWallClock > 0) {
      const elapsedSecs = Math.ceil((now - lastRecordedWallClock) / 1000);
      if (elapsedSecs < rawSecs) {
        secsToAdd = Math.max(0, elapsedSecs);
      }
    }
    lastRecordedWallClock = now;

    if (secsToAdd <= 0) {
      // Overlap already recorded by a concurrent tab
      return;
    }

    const today = getTodayString();
    const stored = await chrome.storage.local.get([today]);
    const dayData = normalizeDayData(stored[today]);

    dayData.total += secsToAdd;

    if (category === 'shorts') {
      dayData.shorts += secsToAdd;
    } else if (category === 'browsing') {
      dayData.browsing += secsToAdd;
    } else {
      dayData.videos += secsToAdd;
    }

    await chrome.storage.local.set({ [today]: dayData });

    // Update active session metadata
    activeSession = {
      isPlaying: true,
      title: title || "",
      category: category || "browsing",
      lastUpdated: now
    };

    // Check limit and badge
    await checkDailyLimit(today, dayData.total, settings);
    await updateBadge(dayData.total);
  });
}

// Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  switch (message.type) {
    case 'RECORD_TIME':
      recordWatchTime(message).then(() => {
        sendResponse({ success: true });
      });
      return true;

    case 'GET_LIVE_STATUS': {
      const isAlive = (Date.now() - activeSession.lastUpdated) < 7000;
      getSettings().then((settings) => {
        sendResponse({
          isPlaying: isAlive && activeSession.isPlaying,
          title: isAlive ? activeSession.title : "",
          category: isAlive ? activeSession.category : "browsing",
          isPaused: settings.isPaused,
          settings
        });
      });
      return true;
    }

    case 'TOGGLE_PAUSE': {
      queueTask(async () => {
        const settings = await getSettings();
        settings.isPaused = !settings.isPaused;
        await chrome.storage.local.set({ settings });
        await updateBadge();
        sendResponse({ isPaused: settings.isPaused });
      });
      return true;
    }

    case 'REFRESH_BADGE': {
      updateBadge().then(() => sendResponse({ success: true }));
      return true;
    }

    case 'RESTORE_SEED_HISTORY': {
      seedInitialHistory(true).then((success) => {
        sendResponse({ success });
      });
      return true;
    }
  }
});

// Periodic maintenance
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodicUpdate') {
    updateBadge();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create('periodicUpdate', { periodInMinutes: 15 });
  const settings = await getSettings();
  await chrome.storage.local.set({ settings });
  await seedInitialHistory();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await seedInitialHistory();
  await updateBadge();
});
