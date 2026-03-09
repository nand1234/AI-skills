---
name: locator-map
description: >
  An agentic 3-step workflow to map all interactive elements on a webpage to unique CSS selectors
  and save them as a local JSON file. Use this skill whenever the user wants to: map page elements,
  generate locators for test automation, extract element identifiers from a URL, scan a webpage for
  interactive elements, or build a selector reference for Playwright / Cypress / Selenium / Puppeteer.
  Trigger even if the user says "get me the locators for this page", "map the elements on X", or
  "I need selectors for Y website".
  Two-layer architecture: extract.js (Playwright) greedily fetches ALL raw element attributes
  from the page — no filtering, no interpretation. The AI model receives that raw data and does
  all the thinking: naming elements from their own text, picking stable CSS selectors, handling
  overlays and iframes. Outputs a clean JSON locator map.
---

# Locator Map Skill

Two-layer architecture:

| Layer | Tool | Job |
|---|---|---|
| **Extract** | `extract.js` (Playwright) | Greedy raw HTML scrape — fetch everything, interpret nothing |
| **Map** | AI model | Read raw attributes, name elements from their text, pick best CSS selector |

---

## Workflow

### Step 1 — Ask for the URL
> "create a new DIR and install project into it"
> "cd dir"
> "Please provide the URL you'd like to map."

Wait. Do not assume.

---

### Step 2 — Navigate and extract
```bash
node extract.js https://myaccount.smartbox.com/en/login
```

Script outputs raw JSON of ALL interactive elements from:
- Main page
- iFrames
- Hidden overlays (already in DOM)
- Triggered overlays (dynamically opened)

Tell the user:
> "✓ Navigated to `<url>`. Extracted X raw elements across Y contexts."

---

### Step 3 — AI maps and saves
AI receives the raw JSON, applies naming + selector rules, writes:
```bash
myaccount.smartbox.com.locators.json
```

Tell the user:
> "✓ Saved `myaccount.smartbox.com.locators.json` — N elements mapped."

---

## extract.js

The script is intentionally **dumb and greedy**. It fetches ALL attributes of ALL interactive
elements. Zero filtering. Zero interpretation. That is the AI's job.

```js
#!/usr/bin/env node
import { chromium } from "playwright";
import { writeFileSync } from "fs";

const url = process.argv[2];
const outFile = process.argv[3]; // optional: path to save raw JSON

if (!url) {
  console.error("Usage: node extract.js <url> [output.json]");
  process.exit(1);
}

const data = await scrapeAll(url);
const json = JSON.stringify(data, null, 2);

if (outFile) writeFileSync(outFile, json);
else console.log(json);

// ── Main scraper ──────────────────────────────────────────────────────────────

async function scrapeAll(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on("dialog", (d) => d.dismiss());

  await page.goto(url, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  const result = {
    url,
    contexts: [],
  };

  // 1. Main page
  result.contexts.push({
    context: "main",
    frameSelector: null,
    elements: await scrapeElements(page),
  });

  // 2. iFrames
  for (const frame of page.frames().slice(1)) {
    try {
      const frameUrl = frame.url();
      if (!frameUrl || frameUrl === "about:blank") continue;
      await frame.waitForLoadState("domcontentloaded").catch(() => {});
      const frameSelector = await resolveIframeSelector(page, frame);
      result.contexts.push({
        context: "iframe",
        url: frameUrl,
        frameSelector,
        elements: await scrapeElements(frame),
      });
    } catch { /* cross-origin — skip */ }
  }

  // 3. Hidden overlays already in DOM
  const hiddenEls = await scrapeHiddenOverlays(page);
  if (hiddenEls.length)
    result.contexts.push({ context: "hidden-overlay", frameSelector: null, elements: hiddenEls });

  // 4. Dynamically triggered overlays
  const triggered = await scrapeTriggeredOverlays(page);
  result.contexts.push(...triggered);

  await browser.close();
  return result;
}

// ── Scrape ALL attributes from ALL interactive elements in a frame/page ───────
// No filtering. No interpretation. Grab everything.

async function scrapeElements(frame) {
  return frame.evaluate(() => {
    const TAGS = ["a","button","input","select","textarea","label",
                  "nav","header","footer","form","h1","h2","h3","h4","h5","h6",
                  "[role='button']","[role='link']","[role='checkbox']",
                  "[role='radio']","[role='combobox']","[role='menuitem']",
                  "[role='tab']","[role='switch']","[tabindex]"];

    const seen = new Set();
    const results = [];

    for (const selector of TAGS) {
      for (const el of document.querySelectorAll(selector)) {
        if (seen.has(el)) continue;
        seen.add(el);

        // Grab every potentially useful attribute raw
        const attrs = {};
        for (const attr of el.attributes)
          attrs[attr.name] = attr.value;

        results.push({
          tag:         el.tagName.toLowerCase(),
          text:        el.innerText?.trim().slice(0, 120) || null,
          value:       el.value || null,
          visible:     el.offsetParent !== null,
          attrs,       // ALL raw attributes
        });
      }
    }

    return results;
  });
}

// ── Scrape hidden overlay elements from DOM ───────────────────────────────────

async function scrapeHiddenOverlays(page) {
  return page.evaluate(() => {
    const selectors = [
      '[role="dialog"]','[role="alertdialog"]','[aria-modal="true"]',
      '[role="tooltip"]','.modal','.dialog','.overlay','.popup',
      '.drawer','.sheet','.toast','[class*="modal"]','[class*="dialog"]',
      '[class*="overlay"]','[class*="popup"]','[class*="drawer"]',
    ];

    const INTERACTIVE = ["a","button","input","select","textarea","[role='button']","[tabindex]"];
    const found = new Set();
    const results = [];

    for (const sel of selectors) {
      for (const container of document.querySelectorAll(sel)) {
        for (const iSel of INTERACTIVE) {
          for (const el of container.querySelectorAll(iSel)) {
            if (found.has(el)) continue;
            found.add(el);
            const attrs = {};
            for (const attr of el.attributes) attrs[attr.name] = attr.value;
            results.push({
              tag:     el.tagName.toLowerCase(),
              text:    el.innerText?.trim().slice(0, 120) || null,
              visible: el.offsetParent !== null,
              attrs,
            });
          }
        }
      }
    }
    return results;
  });
}

// ── Click likely triggers, capture newly appearing overlays ───────────────────

async function scrapeTriggeredOverlays(page) {
  const results = [];

  const visibleDialogCount = () => page.evaluate(() =>
    document.querySelectorAll(
      '[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal.show,.modal.active'
    ).length
  );

  const before = await visibleDialogCount();

  const triggers = await page.evaluate(() => {
    const kw = /modal|dialog|popup|overlay|open|toggle|menu|dropdown|cookie|consent|chat|help|support/i;
    const seen = new Set();
    return [...document.querySelectorAll("button,a,[role='button']")]
      .filter(el => {
        const sig = el.textContent + [...el.attributes].map(a => a.value).join(" ");
        return kw.test(sig);
      })
      .map(el => {
        if (el.id) return `#${el.id}`;
        const tid = el.getAttribute("data-testid");
        if (tid) return `[data-testid='${tid}']`;
        if (el.className) return `${el.tagName.toLowerCase()}.${el.className.trim().split(" ")[0]}`;
        return null;
      })
      .filter(s => s && !seen.has(s) && seen.add(s))
      .slice(0, 10);
  });

  for (const trigger of triggers) {
    try {
      await page.click(trigger, { timeout: 2000 });
      await page.waitForTimeout(800);

      if (await visibleDialogCount() > before) {
        const elements = await page.evaluate(() => {
          const dialog = document.querySelector(
            '[role="dialog"],[role="alertdialog"],[aria-modal="true"],.modal.show,.modal.active'
          );
          if (!dialog) return [];
          const INTERACTIVE = ["a","button","input","select","textarea","[role='button']"];
          const results = [];
          for (const sel of INTERACTIVE) {
            for (const el of dialog.querySelectorAll(sel)) {
              const attrs = {};
              for (const attr of el.attributes) attrs[attr.name] = attr.value;
              results.push({
                tag: el.tagName.toLowerCase(),
                text: el.innerText?.trim().slice(0, 120) || null,
                visible: el.offsetParent !== null,
                attrs,
              });
            }
          }
          return results;
        });

        if (elements.length)
          results.push({ context: `triggered-overlay`, trigger, frameSelector: null, elements });

        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(400);
      }
    } catch { /* not clickable — skip */ }
  }

  return results;
}

// ── Resolve a CSS selector for an iframe element ─────────────────────────────

async function resolveIframeSelector(page, frame) {
  try {
    const el = await frame.frameElement();
    return await page.evaluate((el) => {
      if (el.id)    return `iframe#${el.id}`;
      if (el.name)  return `iframe[name='${el.name}']`;
      if (el.title) return `iframe[title='${el.title}']`;
      if (el.src)   return `iframe[src*='${new URL(el.src).pathname.split("/").pop()}']`;
      return "iframe";
    }, el);
  } catch { return "iframe"; }
}
```

---

## package.json

```json
{
  "name": "locator-map",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "playwright": "^1.50.0"
  }
}
```

---

## Raw Output Shape (what extract.js produces)

```json
{
  "url": "https://myaccount.smartbox.com/en/login",
  "contexts": [
    {
      "context": "main",
      "frameSelector": null,
      "elements": [
        {
          "tag": "input",
          "text": null,
          "value": "",
          "visible": true,
          "attrs": {
            "type": "email",
            "name": "email",
            "placeholder": "Email address",
            "class": "form-control",
            "autocomplete": "email"
          }
        },
        {
          "tag": "input",
          "text": null,
          "value": "",
          "visible": true,
          "attrs": {
            "type": "password",
            "name": "password",
            "placeholder": "Password",
            "class": "form-control"
          }
        },
        {
          "tag": "button",
          "text": "Sign in",
          "visible": true,
          "attrs": {
            "type": "submit",
            "class": "btn btn-primary"
          }
        }
      ]
    },
    {
      "context": "hidden-overlay",
      "elements": [
        {
          "tag": "button",
          "text": "Accept all cookies",
          "visible": false,
          "attrs": { "id": "accept-cookies", "class": "btn-accept" }
        }
      ]
    }
  ]
}
```

---

## AI Instructions — Producing the Locator Map

The AI receives the raw JSON from `extract.js` and produces a flat locator map JSON file.

### Naming — use the element's own text, in this order:
1. `attrs["aria-label"]`
2. `attrs["placeholder"]`
3. `text` (visible innerText)
4. `attrs["name"]`
5. `attrs["type"]`
6. `attrs["id"]`
7. Fallback: `tag + index` (e.g. `"button-3"`)

Prepend context for non-main elements:
- Hidden overlay → `"Cookie Banner - Accept all cookies"`
- iFrame → `"Payment iFrame - Card number"`
- Triggered overlay → `"Help Widget - Send message"`

### Selector — pick the most stable, unique CSS selector:
1. `#id` if present
2. `[data-testid]` / `[data-cy]` / `[data-qa]`
3. `input[type='email']` / `input[type='password']` etc.
4. `tag[name='value']`
5. `tag[placeholder='value']`
6. `tag.class` — only if class looks semantic (not `css-abc123`, `sc-x`, `_3xK`)
7. `[aria-label='value']`
8. `a[href*='keyword']` for links

For iFrame elements prefix with frame selector:
`"iframe#payment >>> input[name='cardNumber']"`

### Output format:
```json
{
  "Email address":                  "input[type='email']",
  "Password":                       "input[type='password']",
  "Sign in":                        "button[type='submit']",
  "Cookie Banner - Accept all cookies": "button#accept-cookies",
  "Payment iFrame - Card number":   "iframe#payment >>> input[name='cardNumber']"
}
```

**Rules:**
- One entry per unique interactive element
- Skip decorative/structural elements (no name derivable, no stable selector)
- Skip duplicate entries
- Output valid JSON only — no markdown, no explanation

---

## Tool Compatibility

| Tool | How to use the selector |
|---|---|
| **Playwright** | `page.locator("input[type='email']")` |
| **Playwright iFrame** | `page.frameLocator("iframe#payment").locator("input[name='cardNumber']")` |
| **Cypress** | `cy.get("input[type='email']")` |
| **Selenium** | `driver.find_element(By.CSS_SELECTOR, "input[type='email']")` |
| **Puppeteer** | `page.$("input[type='email']")` |

---

## Common Issues

| Problem | Fix |
|---|---|
| Empty elements list | Increase `waitForTimeout` to 3000ms |
| Missing modal | Needs auth or specific action before modal appears |
| Cross-origin iFrame empty | Expected — browser security, cannot be bypassed |
| Too many elements | Scope to a specific URL hash or section |
| Bot detection / blank page | Set a real User-Agent in Playwright launch options |
