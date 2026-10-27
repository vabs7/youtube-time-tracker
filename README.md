# YouTube Time Tracker (v2.0)

A lightweight, private, and smart Google Chrome extension (Manifest V3) that tracks all your active time on YouTube — including **video playback**, **thumbnail hover previews**, **Shorts**, and **scrolling/browsing the feed** — with **daily limits**, **7-day trend analytics**, and full history backup/restore.

---

## ✨ Features & Improvements

### 1. 🎯 Comprehensive Active Time Tracking
- **Active Tab Time Included**: If you are active on the YouTube tab (scrolling the homepage, searching, reading comments, browsing channels), your time is counted!
- **Thumbnail Hover Previews Counted**: Watching video previews on feed thumbnails is actively tracked under watch time.
- **Picture-in-Picture (PiP) Support**: Tracks seamlessly if a video is popped out in PiP mode even when switching tabs.
- **Optional Background Audio**: Can optionally track podcasts or music playing in background tabs when sound is active.
- **3-Way Category Breakdown**:
  - 🎬 **Videos** (Standard long-form videos & thumbnail previews)
  - ⚡ **Shorts** (`/shorts/` player)
  - 🌐 **Feed & Browsing** (Feed scrolling, search, comments)
- **Concurrency-Safe Background Queue**: Serialized background service worker updates prevent multi-tab race conditions and data overwrites.
- **Smart Idle Detection**: Pauses if the tab is left open and unattended (>90s of no interaction and no video playing), ensuring stats reflect genuine usage.

### 2. 📊 Modern Dark UI & Interactive Analytics
- **Live Ticker**: Watch time updates smoothly in real time while viewing the popup.
- **Now Watching / Browsing Banner**: Displays current video title or browsing activity in real time.
- **7-Day Trend Bar Chart**: Interactive visual breakdown of the last 7 days with hover tooltips and daily averages.
- **Historical Metrics**: Detailed stats for Past 7 Days, This Month, This Quarter, This Year, and All-Time.
- **Yesterday Comparison**: Shows whether your time increased or decreased compared to yesterday.

### 3. ⏱️ Daily Goals & Limits
- Set custom daily limits (30 min, 1h, 1.5h, 2h, 3h, 4h).
- Color-coded progress bar (Green → Amber → Red).
- Desktop notification reminder when reaching your daily threshold.

### 4. 🏷️ Real-Time Toolbar Icon Badge
- Shows your today's watch time right on the browser toolbar icon (e.g., `45m`, `1.5h`).
- Badge color automatically shifts to warning red when exceeding daily limits.

### 5. ⏸️ Quick Pause / Resume
- Instant 1-click toggle to pause tracking whenever you are studying, working, or don't want watch time counted.

### 6. 💾 Restored v1 History & Backups
- **Restored v1 History (153 days)**: All historical watch time from `youtube_watch_time_2026-10-27.txt` (216h 21m 15s) is automatically seeded and loaded.
- **1-Click Sync Button**: Dedicated button in Settings to re-sync or restore v1 history at any time.
- **Universal Importer**: Import backups from either `.txt` (v1 format) or `.json` (v2 format).
- **Export Formats**: CSV (spreadsheet ready), JSON (complete backup), and TXT (summary report).
- **Reset History**: Safe data clearing with a confirmation dialog.

### 7. 🔒 100% Private & Offline
- All data is saved strictly to your browser's `chrome.storage.local`.
- Zero external servers, analytics, or tracking scripts.

---

## 🚀 Installation / Updating Instructions

1. Open Google Chrome (or any Chromium browser like Brave, Edge, or Arc).
2. Navigate to `chrome://extensions/` in the address bar.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked** (or click the reload 🔄 icon if already loaded).
5. Select this directory (`youtube-time-tracker`).
6. Pin the extension to your toolbar and visit [YouTube](https://www.youtube.com).
7. Open the popup: your **216+ hours of history** from March to October 2026 are already loaded and ready!
