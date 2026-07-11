import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { preview } from "vite";

const outputDirectory = new URL("../output/verify/", import.meta.url);
await fs.mkdir(outputDirectory, { recursive: true });

const baseUrl = "http://127.0.0.1:4187/Special2/";
const consoleProblems = [];
const artifactPath = (name) => fileURLToPath(new URL(name, outputDirectory));
let server = null;
let browser = null;
let page = null;

function check(condition, message) {
  if (!condition) throw new Error(message);
}

async function state() {
  if (!page) throw new Error("browser page is not initialized");
  return JSON.parse(await page.evaluate(() => window.render_game_to_text()));
}

try {
  server = await preview({
    preview: {
      host: "127.0.0.1",
      port: 4187,
      strictPort: true,
    },
  });
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      const text = message.text();
      // Chromium emits this driver diagnostic when Playwright reads WebGL pixels
      // for screenshots/download verification; it is not an application warning.
      if (!text.includes("GPU stall due to ReadPixels")) {
        consoleProblems.push(`${message.type()}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => consoleProblems.push(`pageerror: ${error.message}`));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.screenshot({ path: artifactPath("intro-desktop.png") });

  check(await page.locator("#word-form").isVisible(), "word form is not visible on the intro screen");
  check((await page.locator("#intro-title").innerText()).includes("ことば"), "Japanese intro copy is missing");
  check(await page.locator(".specimen-sheet").evaluate((element) => getComputedStyle(element).visibility === "hidden"), "intro controls remain keyboard-visible");
  check((await page.locator(".tool-button[aria-pressed]").count()) === 2, "non-toggle tools expose aria-pressed");
  await page.locator(".experience").evaluate((element) => {
    element.style.transform = "translate3d(-23px, -47px, 0)";
    element.scrollTop = 120;
    element.scrollLeft = 40;
  });
  await page.waitForTimeout(120);
  const pinnedOrigin = await page.locator(".experience").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, scrollTop: element.scrollTop, scrollLeft: element.scrollLeft };
  });
  check(
    Math.abs(pinnedOrigin.x) < 1
      && Math.abs(pinnedOrigin.y) < 1
      && pinnedOrigin.scrollTop === 0
      && pinnedOrigin.scrollLeft === 0,
    `viewport pin did not self-heal: ${JSON.stringify(pinnedOrigin)}`,
  );

  await page.locator("#suggestions button").first().click();
  check((await state()).mode === "intro", "a suggestion unexpectedly started birth");
  check((await page.locator("#word-input").inputValue()).length > 0, "a suggestion did not fill the input");

  await page.locator("#word-input").fill("未来");
  await page.locator(".birth-button").click();
  await page.evaluate(() => window.advanceTime(6_200));

  const born = await state();
  check(born.word === "未来", `unexpected generated word: ${born.word}`);
  check(born.stage === "life" && born.evolution > 0.99, "birth sequence did not reach LIFE");
  check(born.mode === "observe", "birth sequence did not settle into observe mode");
  check(new URL(page.url()).search === "" && new URL(page.url()).hash.startsWith("#w="), "share state was not stored in a private URL fragment");

  await page.locator('[data-action="audio"]').click();
  await page.waitForTimeout(120);
  check((await state()).audioEnabled, "generative audio did not start from a user gesture");
  await page.locator('[data-action="audio"]').click();
  await page.waitForTimeout(80);
  check(!(await state()).audioEnabled, "generative audio did not stop");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(80);
  check((await state()).visual.reducedMotion, "runtime reduced-motion change did not reach WebGL");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.waitForTimeout(80);
  check(!(await state()).visual.reducedMotion, "runtime reduced-motion reset did not reach WebGL");
  await page.screenshot({ path: artifactPath("life-desktop.png") });

  await page.locator(".organism-canvas").focus();
  await page.keyboard.press("Space");
  await page.evaluate(() => window.advanceTime(500));
  check((await state()).pulseCount === 1, "Space did not trigger exactly one echo");

  await page.locator("#evolution-input").evaluate((element) => {
    element.value = "8";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(() => window.advanceTime(1_800));
  check((await state()).stage === "signal", "timeline did not move to SIGNAL");
  await page.screenshot({ path: artifactPath("signal-desktop.png") });

  await page.locator("#evolution-input").evaluate((element) => {
    element.value = "52";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  check((await state()).stage === "seed", "timeline did not move to SEED");

  await page.locator('[data-action="mutate"]').click();
  await page.evaluate(() => window.advanceTime(6_200));
  check((await state()).mutation === 1, "mutation did not increment");

  await page.locator('[data-action="language"]').focus();
  await page.keyboard.press("Space");
  check((await page.locator("html").getAttribute("lang")) === "en", "language toggle did not switch to English");

  await page.locator('[data-action="about"]').click();
  check(await page.locator("#about-dialog").isVisible(), "about dialog did not open");
  check((await page.locator("#about-dialog").getAttribute("aria-labelledby")) === "about-title", "about dialog has no accessible name");
  await page.locator("#about-dialog .dialog-close").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="save"]').click();
  const download = await downloadPromise;
  check(download.suggestedFilename().endsWith(".png"), "save did not produce a PNG");
  await download.saveAs(artifactPath("specimen-export.png"));

  await page.evaluate(() => {
    window.__kotodamaFakeMicStopped = false;
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: {} });
    }
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () => new Promise((resolve) => {
        window.setTimeout(() => resolve({
          getTracks: () => [{ stop: () => { window.__kotodamaFakeMicStopped = true; } }],
        }), 180);
      }),
    });
  });
  await page.locator('[data-action="mic"]').click();
  await page.locator('[data-action="reset"]').click();
  await page.waitForTimeout(260);
  check(await page.evaluate(() => window.__kotodamaFakeMicStopped === true), "a late microphone stream was not stopped after reset");
  check(!(await state()).microphoneEnabled, "microphone became active after reset");

  await page.goto("about:blank");
  await page.setViewportSize({ width: 390, height: 844 });
  const fragment = new URLSearchParams({ w: "ひかり", m: "2", lang: "ja" });
  await page.goto(`${baseUrl}#${fragment.toString()}`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => typeof window.render_game_to_text === "function");
  await page.waitForTimeout(900);
  const restored = await state();
  check(restored.word === "ひかり" && restored.mutation === 2, "shared fragment did not restore the specimen");
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(mobileOverflow <= 1, `mobile layout overflows by ${mobileOverflow}px`);
  const sheet = await page.locator(".specimen-sheet").boundingBox();
  check(sheet !== null && sheet.x >= 0 && sheet.x + sheet.width <= 391, "specimen sheet is outside the mobile viewport");
  const unnamedTools = await page.locator(".tool-button").evaluateAll((buttons) =>
    buttons.filter((button) => !button.getAttribute("aria-label")?.trim()).length,
  );
  check(unnamedTools === 0, `${unnamedTools} mobile tools have no accessible name`);
  check(await page.locator('[data-action="about"]').isVisible(), "About is unavailable on portrait mobile");
  await page.screenshot({ path: artifactPath("life-mobile.png") });

  await page.locator('[data-action="reset"]').click();
  await page.waitForTimeout(500);
  const resetLayout = await page.evaluate(() => ({
    scrollY: window.scrollY,
    brandY: document.querySelector(".brand")?.getBoundingClientRect().y ?? -1,
    introY: document.querySelector("#intro-title")?.getBoundingClientRect().y ?? -1,
  }));
  check(resetLayout.scrollY === 0 && resetLayout.brandY >= 0 && resetLayout.introY >= 0, `mobile reset shifted the viewport: ${JSON.stringify(resetLayout)}`);
  await page.locator("#suggestions button").first().click();
  await page.locator(".birth-button").click();
  await page.evaluate(() => window.advanceTime(6_200));
  await page.locator('[data-action="reset"]').click();
  await page.waitForTimeout(500);
  check((await page.evaluate(() => window.scrollY)) === 0, "repeated mobile birth/reset left the viewport scrolled");

  await page.goto("about:blank");
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  const landscapeInput = await page.locator("#word-input").boundingBox();
  check(landscapeInput !== null && landscapeInput.y >= 0 && landscapeInput.y + landscapeInput.height <= 390, "input is clipped on short landscape");
  check((await page.evaluate(() => window.scrollY)) === 0, "short landscape starts scrolled");
  await page.screenshot({ path: artifactPath("intro-landscape.png") });

  await page.goto("about:blank");
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`${baseUrl}#w=small&m=0&lang=en`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const narrowOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(narrowOverflow <= 1, `320px layout overflows by ${narrowOverflow}px`);
  await page.screenshot({ path: artifactPath("life-narrow.png") });

  check(consoleProblems.length === 0, `browser console problems:\n${consoleProblems.join("\n")}`);
  console.log("KOTODAMA acceptance checks passed");
  console.log(JSON.stringify(await state(), null, 2));
} finally {
  if (page) await page.close();
  if (browser) await browser.close();
  if (server) {
    await new Promise((resolve, reject) => {
      server.httpServer.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
