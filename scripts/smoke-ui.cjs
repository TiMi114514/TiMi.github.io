'use strict';

const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox'],
  });

  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  await page.setViewport({ width: 1280, height: 900 });

  const routes = ['/', '/papers/', '/login/', '/signup/', '/verify/', '/tutor/', '/account/', '/auth/callback/'];
  for (const route of routes) {
    await page.goto(`http://127.0.0.1:4173${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
    console.log(route, '->', page.url().replace('http://127.0.0.1:4173', ''));
  }

  // Archive search + gating
  await page.goto('http://127.0.0.1:4173/papers/', { waitUntil: 'networkidle0' });
  await page.type('input[aria-label="Search papers"]', '9700');
  await new Promise((resolve) => setTimeout(resolve, 400));
  const searchResult = await page.evaluate(() => ({
    cards: document.querySelectorAll('article').length,
    allMatch: Array.from(document.querySelectorAll('article h3')).every((node) =>
      node.textContent.includes('9700'),
    ),
  }));
  console.log('search:', JSON.stringify(searchResult));

  await page.evaluate(() => {
    const button = document.querySelector('article button');
    button?.click();
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const gateNotice = await page.evaluate(() =>
    document.body.innerText.includes('Sign in to download papers from the archive'),
  );
  console.log('download gate notice:', gateNotice);

  console.log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})();
