# MythicFrame BEI Extension — Complete Installation & Automation Guide

This guide provides instructions for both **Humans** (manual setup and daily workflow) and **AI Agents / Automated Pipelines** (headless launch, programmatic RPC, and testing).

---

## Part 1: Human Installation & User Guide

### 1. Prerequisites
1. **Google Chrome** (or Chromium-based browser such as Brave, Edge, or Opera).
2. **MythicFrame Server** running locally (`npm run dev` or `npx tsx server.ts` at `http://localhost:3488`).
3. An active Google account logged into [Google Gemini Web](https://gemini.google.com/) (and/or [ChatGPT Web](https://chatgpt.com/)).

---

### 2. Step-by-Step Chrome Installation

1. Open Google Chrome.
2. Navigate to the Extensions manager by entering this URL in the address bar:
   ```text
   chrome://extensions/
   ```
3. Look at the top-right corner and toggle on **Developer mode**.
4. In the top-left corner, click **Load unpacked**.
5. In the file picker dialog, navigate to and select the `bei-extension` directory inside your cloned MythicFrame repository:
   ```text
   <path-to-mythicframe>/bei-extension
   ```
6. The **MythicFrame BEI** extension card will appear in your extensions list:
   * **Version:** `v1.5.2` (or higher)
   * **Permissions:** Storage, Scripting, Tabs, TabGroups
   * **Badge:** If the MythicFrame server is running, the extension icon badge will turn purple and display **ON**. If the server is offline, it will display **OFF**.

> [!TIP]
> Pin the **MythicFrame BEI** extension to your Chrome toolbar for quick one-click status inspections and tab syncing.

---

### 3. Account Preparation (Multi-Account Setup)

Google allows multiple Google accounts to be signed into the same Chrome profile simultaneously. Google assigns each account an index slot:
* **Slot 0:** `https://gemini.google.com/u/0/app` (Default account)
* **Slot 1:** `https://gemini.google.com/u/1/app` (Second account)
* **Slot 2:** `https://gemini.google.com/u/2/app` (Third account)
* **Slot 3:** `https://gemini.google.com/u/3/app` (Fourth account)

**How to add additional Google accounts:**
1. Open `https://gemini.google.com/`.
2. Click your profile avatar in the top-right corner.
3. Click **Add another account** and complete the sign-in.
4. MythicFrame's BEI extension will automatically discover your accounts and display their email addresses and real-time quotas in the UI dropdown.

---

### 4. Using BEI Mode in MythicFrame Studio

1. Open MythicFrame in your browser: `http://localhost:3488`.
2. Open the **AI Generation Engine** popover from the top header:
   * Click the Engine button (e.g., *Google API* / *Pollinations* / *BEI Mode*).
   * Click **BEI (Chrome)**.
3. **Configure Options:**
   * **Web Target:** Choose **Gemini Web** (Google Imagen 3) or **ChatGPT Web** (OpenAI DALL-E 3).
   * **Account & Quota:** Select which Google account to generate from. The dropdown displays:
     * `🟢 Ready • 5/50 reqs` (Available quota)
     * `🟡 High Usage` (Approaching daily limit)
     * `🔴 Cooldown (12m)` (Rate limited; cooldown timer)
   * **Tab Layout Mode:**
     * **Dedicated Window:** (Default & Recommended) Moves generation tabs into a separate standalone Chrome window with a purple `"MythicFrame BEI"` tab group to eliminate background tab sleeping and workspace clutter.
     * **Same Window Group:** Groups all generation tabs into a single purple tab group in your current window.
     * **Fake Active Anti-Throttling:** Built-in AudioContext & visibility spoofing prevents Chrome from throttling background tab CPU execution during long generations.
4. **Generate Artwork:**
   * Enter your prompt in the prompt panel.
   * *(Optional)* Attach reference images (sprites, pose guides, style references).
   * Click **Generate**.
   * The button will display real-time progress steps:
     1. `Connecting to Gemini Web composer...`
     2. `Transmitting reference image to Google media servers (Xs)...`
     3. `Submitting prompt directive to composer...`
     4. `Generating image in Gemini Web...`
   * The completed uncompressed image is automatically streamed directly onto your studio canvas!

---

### 5. Reloading the Extension After Code Changes

Whenever extension files (`background.js`, `gemini_content.js`, etc.) are updated:
1. Open `chrome://extensions/`.
2. Locate the **MythicFrame BEI** card.
3. Click the circular **↻ Reload** button on the card.
4. Refresh any open Gemini or ChatGPT tabs so fresh content scripts attach.

---

## Part 2: AI Agents & Automation Guide

This section is designed for **AI coding agents**, subagents, or automated testing scripts (Puppeteer, Playwright, Selenium, or headless CLI) that need to launch, control, or verify the BEI subsystem programmatically.

---

### 1. Architecture & Port Specification

| Component | Protocol | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **MythicFrame App** | HTTP | `http://localhost:3488` | Vite + Express main application server |
| **BEI Bridge REST** | HTTP | `http://127.0.0.1:58925/api/bei/*` | Control REST API for status, generation, and tabs |
| **BEI Bridge WS** | WebSocket | `ws://127.0.0.1:58925` | Bidirectional RPC bridge with Chrome extension |
| **BEI Progress SSE** | EventSource | `http://127.0.0.1:58925/api/bei/events` | Real-time Server-Sent Events stream |

> [!NOTE]
> Port `58925` is dedicated specifically to MythicFrame BEI to prevent port collisions with other tools or services.

---

### 2. Launching Chrome with the Extension Programmatically

#### Option A: Windows PowerShell CLI
```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --load-extension="$PWD\bei-extension" `
  --user-data-dir="$env:LOCALAPPDATA\Google\Chrome\User Data" `
  "https://gemini.google.com/app"
```

#### Option B: Puppeteer (Node.js)
```javascript
const puppeteer = require('puppeteer');
const path = require('path');
const os = require('os');

(async () => {
  const extensionPath = path.resolve(__dirname, 'bei-extension');
  const userDataDir = process.env.LOCALAPPDATA 
    ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
    : path.join(os.homedir(), '.config', 'google-chrome');

  const browser = await puppeteer.launch({
    headless: false, // Extensions require headful mode in Chrome MV3
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      `--user-data-dir=${userDataDir}`
    ]
  });

  const page = await browser.newPage();
  await page.goto('https://gemini.google.com/app');
  console.log('Chrome launched with MythicFrame BEI extension attached.');
})();
```

#### Option C: Playwright (Python)
```python
import os
from playwright.sync_api import sync_playwright

user_data_dir = os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\User Data") if os.name == 'nt' else os.path.expanduser("~/.config/google-chrome")

with sync_playwright() as p:
    context = p.chromium.launch_persistent_context(
        user_data_dir=user_data_dir,
        headless=False,
        args=[
            r"--disable-extensions-except=./bei-extension",
            r"--load-extension=./bei-extension",
        ]
    )
    page = context.new_page()
    page.goto("https://gemini.google.com/app")
    print("Browser running with extension.")
```

---

### 3. Programmatic API Reference (HTTP REST)

#### A. Health Check & Discovered Tabs
```http
GET http://127.0.0.1:58925/api/bei/status
```
**Response (200 OK):**
```json
{
  "ready": true,
  "connected": true,
  "port": 58925,
  "extensionVersion": "1.2.0",
  "tabs": [
    {
      "tabId": 149204,
      "url": "https://gemini.google.com/u/0/app",
      "target": "gemini",
      "accountSlot": 0,
      "email": "user@gmail.com",
      "title": "Gemini",
      "active": true
    }
  ],
  "accounts": [
    { "slot": 0, "email": "user@gmail.com", "name": "Primary User" },
    { "slot": 1, "email": "second@gmail.com", "name": "Secondary User" }
  ],
  "activeJobsCount": 0
}
```

#### B. Trigger Generation Job
```http
POST http://127.0.0.1:58925/api/bei/generate
Content-Type: application/json

{
  "target": "gemini",
  "prompt": "Create image: Cyberpunk robotic samurai with glowing katana, dark rain background",
  "fullPrompt": "Cyberpunk robotic samurai with glowing katana, dark rain background",
  "aspectRatio": "16:9",
  "accountSlot": 0,
  "timeoutSeconds": 150,
  "tabMode": "same_window_group",
  "bringTabToFront": false,
  "images": [
    {
      "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
      "roleNote": "Character pose reference"
    }
  ]
}
```
**Response (200 OK):**
```json
{
  "success": true,
  "jobId": "bei_1791546820000_abc123",
  "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "metadata": {
    "target": "gemini",
    "fullPrompt": "...",
    "aspectRatio": "16:9",
    "accountSlot": 0
  }
}
```

#### C. Cancel Active Generation
```http
POST http://127.0.0.1:58925/api/bei/cancel
Content-Type: application/json

{
  "jobId": "bei_1791546820000_abc123"
}
```

#### D. Open / Focus Tab in BEI Tab Group
```http
POST http://127.0.0.1:58925/api/bei/open-tab
Content-Type: application/json

{
  "target": "gemini",
  "accountSlot": 1,
  "tabMode": "same_window_group",
  "bringTabToFront": false
}
```

---

### 4. Direct WebSocket Protocol (`ws://127.0.0.1:58925`)

The extension communicates with the bridge server over WebSocket.

#### Extension Handshake on Connection:
```json
{
  "type": "register_extension",
  "data": {
    "version": "1.2.0",
    "tabs": [ ... ],
    "accounts": [ ... ]
  }
}
```

#### Bridge Commands Sent to Extension:
* `EXECUTE_PROMPT`: Dispatches prompt, references, and slot to the matching tab.
* `OPEN_TAB`: Creates or navigates tab into designated BEI group.
* `LIST_TABS`: Queries active tabs and Google accounts.
* `CANCEL_GENERATION`: Instructs tab content script to clear composer and abort upload.

#### Extension Events Sent to Bridge:
* `GENERATION_PROGRESS`: Real-time status update (`step`, `detail`, `jobId`).
* `GENERATION_COMPLETED`: Delivers final high-res image Data URI.
* `GENERATION_FAILED`: Reports failure error message (e.g. timeout, policy refusal).

---

### 5. Automated Verification Script (Node.js)

You can run this scratch script with `npx tsx` or `node` to verify that the BEI bridge and extension are responsive:

```javascript
// test-bei-bridge.js
async function testBEI() {
  console.log("Checking BEI bridge status on port 58925...");
  try {
    const res = await fetch("http://127.0.0.1:58925/api/bei/status");
    const data = await res.json();
    console.log("Bridge Status:", data.connected ? "CONNECTED ✅" : "WAITING FOR EXTENSION ⚠️");
    console.log("Extension Version:", data.extensionVersion || "N/A");
    console.log("Discovered Accounts:", data.accounts?.length || 0);
    console.log("Active Tabs:", data.tabs?.length || 0);
  } catch (err) {
    console.error("Bridge Error: Is server running?", err.message);
  }
}

testBEI();
```

---

## Part 3: Legal, Privacy & Compliance Transparency

### 1. Truthful Technical Architecture
* **Local Loopback Only**: The extension communicates exclusively with `ws://127.0.0.1:58925` on your personal machine. It does not connect to any external tracking or telemetry servers.
* **Assistive DOM Automation**: The extension interacts with your open browser tab purely via standard DOM operations (typing prompt text into the public input box and dispatching click events on the submit button). It does not reverse-engineer private, encrypted RPC protocols or emulate proprietary endpoints.
* **Bring Your Own Account (BYOA)**: The extension serves as an interactive workflow bridge (similar to how open-source mail clients connect to your mailbox), eliminating the friction of manual tab switching and file downloading.

### 2. Privacy & Security Guarantees
* **Zero Credential Access**: The extension does **not** read, intercept, or export your account passwords, cookies, authorization tokens, or session headers. Your authentication remains safely confined within your browser's native sandbox.
* **No Telemetry or Remote Logging**: No personal data, prompts, or generated imagery are ever transmitted to any third-party analytics or cloud server.

### 3. Terms of Service Compliance & User Responsibility
* **Respect for Platform Limits**: The extension does not crack, bypass, or circumvent rate limits, quotas, safety policies, or feature locks. When a platform returns a cooldown, daily quota exhaustion, or safety refusal, the extension detects and presents that status transparently.
* **User Responsibility**: Users are solely responsible for ensuring that their personal use of connected web services complies with each platform's respective Terms of Service and Acceptable Use Policies.
* **Independent Community Project**: MythicFrame is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Google LLC, Alphabet Inc., OpenAI Inc., or any of their affiliates.

