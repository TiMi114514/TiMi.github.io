'use strict';

const path = require('path');
const puppeteer = require('puppeteer-core');

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = 'http://127.0.0.1:4173';
const outDir = path.join(__dirname, '..', '.shots');

const targets = [
  { name: 'home', url: '/' },
  { name: 'papers', url: '/papers/' },
  { name: 'tutor', url: '/tutor/' },
  { name: 'login', url: '/login/' },
  { name: 'signup', url: '/signup/' },
  { name: 'verify', url: '/verify/' },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: chrome,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
  });

  for (const width of [390, 768, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 900, deviceScaleFactor: 1 });

    for (const target of targets) {
      await page.goto(base + target.url, { waitUntil: 'networkidle0', timeout: 30000 });
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      console.log(width, target.name, JSON.stringify(metrics));
      await page.screenshot({
        path: path.join(outDir, `${target.name}-${width}.png`),
        fullPage: true,
      });
    }
  }

  await browser.close();
})();
