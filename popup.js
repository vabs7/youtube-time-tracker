// YouTube Time Tracker - Popup Script

function formatTime(totalSeconds, includeSeconds = true) {
  const total = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return includeSeconds ? `${h}h ${m}m ${s}s` : `${h}h ${m}m`;
  }
  if (m > 0) {
    return includeSeconds ? `${m}m ${s}s` : `${m}m`;
  }
  return includeSeconds ? `${s}s` : `0m`;
}

// Compact format for category boxes: shows exact seconds under an hour so live updates are visible
function formatBoxTime(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m ${s}s`;
  }
  return `${s}s`;
}

function formatShort(totalSeconds) {
  const total = Math.max(0, Math.floor(totalSeconds || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}h ${m}m`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return total > 0 ? `${s}s` : `0m`;
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
    if (typeof raw.browsing === 'undefined' && total > (videos + shorts)) {
      browsing = total - (videos + shorts);
    }
    return { total, videos, shorts, browsing };
  }
  return { total: 0, videos: 0, shorts: 0, browsing: 0 };
}

// Show Toast
let toastTimeout = null;
function showToast(message) {
  const toast = document.getElementById('toastMessage');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2800);
}

// Global State
let cachedData = {};
let cachedSettings = {
  isPaused: false,
  dailyLimitMinutes: 0,
  lastNotifiedLimitDate: "",
  trackBackgroundAudio: false,
  showBadge: true
};
let currentActiveTab = 'tab-dashboard';

// Tab Switching
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const target = btn.getAttribute('data-tab');
    currentActiveTab = target;
    const panel = document.getElementById(target);
    if (panel) panel.classList.add('active');

    if (target === 'tab-analytics') {
      renderAnalytics();
    }
  });
});

// Load & Render Full View
async function loadAndRender() {
  try {
    const data = await chrome.storage.local.get(null);

    // Auto-seed v1 backup if not already seeded
    if (!data.initial_history_seeded) {
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'RESTORE_SEED_HISTORY' }, () => resolve());
      });
      const freshData = await chrome.storage.local.get(null);
      cachedData = freshData || {};
      cachedSettings = Object.assign(cachedSettings, freshData.settings || {});
    } else {
      cachedData = data || {};
      cachedSettings = Object.assign(cachedSettings, data.settings || {});
    }

    renderHeader();
    renderDashboard();
    if (currentActiveTab === 'tab-analytics') {
      renderAnalytics();
    }
    renderSettings();
  } catch (err) {
    console.error("[YouTube Tracker Popup] Load error:", err);
  }
}

// Render Header & Pause Toggle
function renderHeader() {
  const pauseToggle = document.getElementById('headerPauseToggle');
  const pauseStatusText = document.getElementById('pauseStatusText');

  if (pauseToggle && pauseStatusText) {
    pauseToggle.checked = !!cachedSettings.isPaused;
    pauseStatusText.textContent = cachedSettings.isPaused ? 'Paused' : 'Active';
    pauseStatusText.style.color = cachedSettings.isPaused ? 'var(--text-muted)' : 'var(--accent-green)';
  }
}

// Render Dashboard
function renderDashboard() {
  const todayStr = getTodayString();
  const todayData = normalizeDayData(cachedData[todayStr]);

  // Today Total Watch Time
  const todayTotalEl = document.getElementById('todayTotal');
  if (todayTotalEl) {
    todayTotalEl.textContent = formatTime(todayData.total, true);
  }

  // 3-Way Breakdown: Videos, Shorts, Browsing
  const videosEl = document.getElementById('videosTime');
  const shortsEl = document.getElementById('shortsTime');
  const browsingEl = document.getElementById('browsingTime');

  const videosPercentEl = document.getElementById('videosPercent');
  const shortsPercentEl = document.getElementById('shortsPercent');
  const browsingPercentEl = document.getElementById('browsingPercent');

  const total = todayData.total;
  const vPercent = total > 0 ? Math.round((todayData.videos / total) * 100) : 0;
  const sPercent = total > 0 ? Math.round((todayData.shorts / total) * 100) : 0;
  const bPercent = total > 0 ? Math.max(0, 100 - (vPercent + sPercent)) : 0;

  // Use formatBoxTime so seconds are visible immediately
  if (videosEl) videosEl.textContent = formatBoxTime(todayData.videos);
  if (shortsEl) shortsEl.textContent = formatBoxTime(todayData.shorts);
  if (browsingEl) browsingEl.textContent = formatBoxTime(todayData.browsing);

  if (videosPercentEl) videosPercentEl.textContent = `${vPercent}%`;
  if (shortsPercentEl) shortsPercentEl.textContent = `${sPercent}%`;
  if (browsingPercentEl) browsingPercentEl.textContent = `${bPercent}%`;

  // Daily Goal Progress
  const goalLabel = document.getElementById('goalLabel');
  const goalPercent = document.getElementById('goalPercent');
  const goalBarFill = document.getElementById('goalBarFill');

  const limitMins = Number(cachedSettings.dailyLimitMinutes) || 0;
  if (limitMins > 0) {
    const limitSecs = limitMins * 60;
    const pct = Math.min(100, Math.round((todayData.total / limitSecs) * 100));

    if (goalLabel) goalLabel.textContent = `Goal: ${formatShort(todayData.total)} / ${formatShort(limitSecs)}`;
    if (goalPercent) {
      goalPercent.textContent = `${pct}%`;
      if (pct >= 100) {
        goalPercent.style.color = 'var(--yt-red)';
      } else if (pct >= 75) {
        goalPercent.style.color = 'var(--accent-amber)';
      } else {
        goalPercent.style.color = 'var(--accent-green)';
      }
    }
    if (goalBarFill) {
      goalBarFill.style.width = `${pct}%`;
      if (pct >= 100) {
        goalBarFill.style.backgroundColor = 'var(--yt-red)';
      } else if (pct >= 75) {
        goalBarFill.style.backgroundColor = 'var(--accent-amber)';
      } else {
        goalBarFill.style.backgroundColor = 'var(--accent-green)';
      }
    }
  } else {
    if (goalLabel) goalLabel.textContent = 'Daily Limit: None';
    if (goalPercent) {
      goalPercent.textContent = '--';
      goalPercent.style.color = 'var(--text-muted)';
    }
    if (goalBarFill) {
      goalBarFill.style.width = '0%';
    }
  }

  // Yesterday Comparison
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getTodayString(yesterday);
  const yesterdayData = normalizeDayData(cachedData[yesterdayStr]);

  const compEl = document.getElementById('comparisonText');
  if (compEl) {
    if (yesterdayData.total > 0) {
      const diffSecs = todayData.total - yesterdayData.total;
      const diffMins = Math.round(Math.abs(diffSecs) / 60);
      if (diffSecs > 0) {
        compEl.textContent = `+${diffMins}m vs Yesterday`;
        compEl.style.color = 'var(--accent-amber)';
      } else if (diffSecs < 0) {
        compEl.textContent = `-${diffMins}m vs Yesterday`;
        compEl.style.color = 'var(--accent-green)';
      } else {
        compEl.textContent = `Same as Yesterday`;
        compEl.style.color = 'var(--text-secondary)';
      }
    } else {
      compEl.textContent = 'Yesterday: 0m';
      compEl.style.color = 'var(--text-secondary)';
    }
  }
}

// Render Analytics & 7-Day Chart
function renderAnalytics() {
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth();
  const currentQuarter = Math.floor(currentMonth / 3);

  let past7Total = 0;
  let monthlyTotal = 0;
  let quarterlyTotal = 0;
  let yearlyTotal = 0;
  let grandTotal = 0;

  // Build the 7-day array
  const last7Days = [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dStr = getTodayString(d);
    const dayData = normalizeDayData(cachedData[dStr]);
    const isToday = i === 0;

    last7Days.push({
      dateStr: dStr,
      dayName: isToday ? 'Today' : dayNames[d.getDay()],
      total: dayData.total,
      isToday
    });
    past7Total += dayData.total;
  }

  // Parse all stored dates for monthly, quarterly, yearly, all-time
  for (const [key, val] of Object.entries(cachedData)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;

    const dayData = normalizeDayData(val);
    grandTotal += dayData.total;

    const parts = key.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const quarter = Math.floor(month / 3);

    if (year === currentYear) {
      yearlyTotal += dayData.total;
      if (quarter === currentQuarter) quarterlyTotal += dayData.total;
      if (month === currentMonth) monthlyTotal += dayData.total;
    }
  }

  // Update summary cards
  const weeklyEl = document.getElementById('weekly');
  const monthlyEl = document.getElementById('monthly');
  const quarterlyEl = document.getElementById('quarterly');
  const yearlyEl = document.getElementById('yearly');
  const allTimeEl = document.getElementById('allTimeTotal');
  const avgEl = document.getElementById('dailyAvgLabel');

  if (weeklyEl) weeklyEl.textContent = formatShort(past7Total);
  if (monthlyEl) monthlyEl.textContent = formatShort(monthlyTotal);
  if (quarterlyEl) quarterlyEl.textContent = formatShort(quarterlyTotal);
  if (yearlyEl) yearlyEl.textContent = formatShort(yearlyTotal);
  if (allTimeEl) allTimeEl.textContent = formatTime(grandTotal, true);

  const dailyAvg = Math.round(past7Total / 7);
  if (avgEl) avgEl.textContent = `Avg: ${formatShort(dailyAvg)}/day`;

  // Render Bar Chart
  const chartEl = document.getElementById('weekBarChart');
  if (chartEl) {
    chartEl.innerHTML = '';
    const maxVal = Math.max(...last7Days.map(d => d.total), 1);

    last7Days.forEach((item) => {
      const col = document.createElement('div');
      col.className = `chart-col${item.isToday ? ' is-today' : ''}`;

      const heightPercent = item.total > 0 ? Math.max(8, Math.round((item.total / maxVal) * 90)) : 5;

      const tooltip = document.createElement('div');
      tooltip.className = 'tooltip';
      tooltip.textContent = `${item.dateStr}: ${formatShort(item.total)}`;

      const bar = document.createElement('div');
      bar.className = 'chart-bar';
      bar.style.height = `${heightPercent}%`;

      const label = document.createElement('div');
      label.className = 'chart-day-label';
      label.textContent = item.dayName;

      col.appendChild(tooltip);
      col.appendChild(bar);
      col.appendChild(label);
      chartEl.appendChild(col);
    });
  }
}

// Render Settings
function renderSettings() {
  const dailyLimitSelect = document.getElementById('dailyLimitSelect');
  const bgAudioToggle = document.getElementById('bgAudioToggle');
  const badgeToggle = document.getElementById('badgeToggle');

  if (dailyLimitSelect) {
    dailyLimitSelect.value = String(cachedSettings.dailyLimitMinutes || 0);
  }
  if (bgAudioToggle) {
    bgAudioToggle.checked = !!cachedSettings.trackBackgroundAudio;
  }
  if (badgeToggle) {
    badgeToggle.checked = cachedSettings.showBadge !== false;
  }
}

// Check Live Status
function checkLiveStatus() {
  if (!chrome.runtime?.id) return;

  chrome.runtime.sendMessage({ type: 'GET_LIVE_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response) return;

    if (cachedSettings.isPaused !== response.isPaused) {
      cachedSettings.isPaused = response.isPaused;
      renderHeader();
    }

    const nowPlayingCard = document.getElementById('nowPlayingCard');
    const nowPlayingTitle = document.getElementById('nowPlayingTitle');
    const nowPlayingCategory = document.getElementById('nowPlayingCategory');

    if (response.isPlaying && response.title) {
      nowPlayingCard.classList.add('visible');
      nowPlayingTitle.textContent = response.title;
      if (response.category === 'shorts') {
        nowPlayingCategory.textContent = '⚡ Watching Shorts';
      } else if (response.category === 'browsing') {
        nowPlayingCategory.textContent = '🌐 Browsing YouTube';
      } else {
        nowPlayingCategory.textContent = '🎬 Watching Video';
      }
    } else {
      nowPlayingCard.classList.remove('visible');
    }
  });
}

// Storage change listener for live real-time UI updates
if (chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local') {
      let shouldRerender = false;
      for (const key of Object.keys(changes)) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(key) || key === 'settings') {
          cachedData[key] = changes[key].newValue;
          if (key === 'settings') {
            cachedSettings = Object.assign(cachedSettings, changes[key].newValue || {});
          }
          shouldRerender = true;
        }
      }
      if (shouldRerender) {
        renderHeader();
        renderDashboard();
        if (currentActiveTab === 'tab-analytics') {
          renderAnalytics();
        }
      }
    }
  });
}

// User Action Event Listeners

// 1. Header Pause Toggle
document.getElementById('headerPauseToggle').addEventListener('change', () => {
  chrome.runtime.sendMessage({ type: 'TOGGLE_PAUSE' }, (res) => {
    if (res && typeof res.isPaused !== 'undefined') {
      cachedSettings.isPaused = res.isPaused;
      renderHeader();
      showToast(cachedSettings.isPaused ? "Tracking Paused" : "Tracking Resumed");
    }
  });
});

// 2. Settings: Daily Limit
document.getElementById('dailyLimitSelect').addEventListener('change', async (e) => {
  const limit = parseInt(e.target.value, 10) || 0;
  cachedSettings.dailyLimitMinutes = limit;
  cachedSettings.lastNotifiedLimitDate = ""; // Reset limit notification state on threshold change
  await chrome.storage.local.set({ settings: cachedSettings });
  chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' });
  renderDashboard();
  showToast("Daily limit updated");
});

// 3. Settings: Background Audio Toggle
document.getElementById('bgAudioToggle').addEventListener('change', async (e) => {
  cachedSettings.trackBackgroundAudio = e.target.checked;
  await chrome.storage.local.set({ settings: cachedSettings });
  showToast(e.target.checked ? "Background audio tracking enabled" : "Background audio tracking disabled");
});

// 4. Settings: Badge Toggle
document.getElementById('badgeToggle').addEventListener('change', async (e) => {
  cachedSettings.showBadge = e.target.checked;
  await chrome.storage.local.set({ settings: cachedSettings });
  chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' });
  showToast(e.target.checked ? "Badge enabled" : "Badge hidden");
});

// 5. Restore v1 History Button
document.getElementById('restoreV1Btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESTORE_SEED_HISTORY' }, (res) => {
    if (res && res.success) {
      loadAndRender();
      showToast("Restored 153 days of history from v1 backup!");
    } else {
      showToast("v1 history is already synced!");
    }
  });
});

// 6. Export CSV
document.getElementById('exportCsvBtn').addEventListener('click', () => {
  const sortedDates = Object.keys(cachedData)
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();

  if (sortedDates.length === 0) {
    showToast("No data to export");
    return;
  }

  let csv = "Date,Total_Seconds,Total_Formatted,Videos_Seconds,Shorts_Seconds,Browsing_Seconds\n";
  for (const date of sortedDates) {
    const d = normalizeDayData(cachedData[date]);
    csv += `"${date}",${d.total},"${formatTime(d.total, false)}",${d.videos},${d.shorts},${d.browsing}\n`;
  }

  downloadFile(csv, `youtube_watch_time_${getTodayString()}.csv`, 'text/csv;charset=utf-8;');
  showToast("CSV export downloaded");
});

// 7. Export JSON
document.getElementById('exportJsonBtn').addEventListener('click', () => {
  const exportPayload = {
    version: "2.0.0",
    exportDate: new Date().toISOString(),
    data: cachedData
  };
  const jsonStr = JSON.stringify(exportPayload, null, 2);
  downloadFile(jsonStr, `youtube_tracker_backup_${getTodayString()}.json`, 'application/json');
  showToast("JSON backup downloaded");
});

// 8. Export TXT
document.getElementById('exportTxtBtn').addEventListener('click', () => {
  const sortedDates = Object.keys(cachedData)
    .filter(key => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort();

  let text = "YouTube Watch Time Summary\n";
  text += "========================================\n\n";

  let totalAll = 0;
  for (const date of sortedDates) {
    const d = normalizeDayData(cachedData[date]);
    text += `${date}: ${formatTime(d.total, true)} (Videos: ${formatTime(d.videos, false)}, Shorts: ${formatTime(d.shorts, false)}, Browsing: ${formatTime(d.browsing, false)})\n`;
    totalAll += d.total;
  }

  text += "\n========================================\n";
  text += `Total All-Time: ${formatTime(totalAll, true)}\n`;

  downloadFile(text, `youtube_watch_time_${getTodayString()}.txt`, 'text/plain');
  showToast("TXT export downloaded");
});

// 9. Import File (.txt or .json)
const fileInput = document.getElementById('importFileInput');
document.getElementById('importFileBtn').addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    const content = event.target.result;
    const isTxt = file.name.endsWith('.txt');

    try {
      const toSet = {};
      let count = 0;

      if (isTxt) {
        // Parse v1/v2 text format
        const lines = content.split('\n');
        for (const line of lines) {
          const match = line.match(/^(\d{4}-\d{2}-\d{2}):\s*(?:(\d+)h\s*)?(?:(\d+)m\s*)?(?:(\d+)s)?/);
          if (match) {
            const dateStr = match[1];
            const h = parseInt(match[2] || 0, 10);
            const m = parseInt(match[3] || 0, 10);
            const s = parseInt(match[4] || 0, 10);
            const totalSecs = h * 3600 + m * 60 + s;
            toSet[dateStr] = {
              total: totalSecs,
              videos: totalSecs,
              shorts: 0,
              browsing: 0
            };
            count++;
          }
        }
      } else {
        // Parse JSON format
        const parsed = JSON.parse(content);
        const incoming = parsed.data || parsed;
        for (const [key, val] of Object.entries(incoming)) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
            toSet[key] = normalizeDayData(val);
            count++;
          }
        }
        if (incoming.settings && typeof incoming.settings === 'object') {
          toSet.settings = Object.assign({}, cachedSettings, incoming.settings);
        }
      }

      if (count > 0) {
        await chrome.storage.local.set(toSet);
        showToast(`Successfully imported ${count} days of history!`);
        await loadAndRender();
        chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' });
      } else {
        showToast("No valid date records found in file");
      }
    } catch (err) {
      showToast("Failed to parse file");
      console.error("[YouTube Tracker] Import error:", err);
    }
    fileInput.value = '';
  };
  reader.readAsText(file);
});

// 10. Reset All Data Modal
const confirmModal = document.getElementById('confirmModal');
document.getElementById('clearDataBtn').addEventListener('click', () => {
  confirmModal.classList.add('active');
});

document.getElementById('modalCancelBtn').addEventListener('click', () => {
  confirmModal.classList.remove('active');
});

document.getElementById('modalConfirmBtn').addEventListener('click', async () => {
  confirmModal.classList.remove('active');
  const currentSettings = cachedSettings;
  await chrome.storage.local.clear();
  await chrome.storage.local.set({ settings: currentSettings, initial_history_seeded: true });
  chrome.runtime.sendMessage({ type: 'REFRESH_BADGE' });
  await loadAndRender();
  showToast("All history reset successfully");
});

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Initial Load & Intervals
loadAndRender();
checkLiveStatus();
setInterval(checkLiveStatus, 1500);
