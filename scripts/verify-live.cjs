'use strict';

const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--proxy-server=http://127.0.0.1:7890'],
  });

  const page = await browser.newPage();
  page.on('pageerror', (error) => console.log('PAGEERROR', error.message));
  await page.setViewport({ width: 1440, height: 1200 });

  await page.goto('https://timi114514.github.io/TiMi.github.io/', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  await page.screenshot({ path: '.shots/live-home.png' });

  await page.goto('https://timi114514.github.io/TiMi.github.io/papers/', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 4000));
  const archive = await page.evaluate(() => ({
    badge: Array.from(document.querySelectorAll('span'))
      .map((node) => node.textContent)
      .find((text) => text && (text.includes('Live from RAGFlow') || text.includes('Supabase archive') || text.includes('Demo data'))),
    cards: document.querySelectorAll('article').length,
    first: Array.from(document.querySelectorAll('article h3')).slice(0, 3).map((node) => node.textContent),
  }));
  console.log('archive:', JSON.stringify(archive));
  await page.screenshot({ path: '.shots/live-papers.png', fullPage: true });

  await page.goto('https://timi114514.github.io/TiMi.github.io/tutor/', { waitUntil: 'networkidle0', timeout: 60000 });
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const tutor = await page.evaluate(() => ({
    gate: document.body.innerText.includes('Sign in to ask the tutor'),
    config: document.body.innerText.includes('Not configured'),
  }));
  console.log('tutor:', JSON.stringify(tutor));
  await page.screenshot({ path: '.shots/live-tutor.png' });

  await page.goto('https://timi114514.github.io/TiMi.github.io/login/', { waitUntil: 'networkidle0', timeout: 60000 });
  await page.type('input[type="email"]', 'probe@example.com');
  await page.type('input[type="password"]', 'not-the-password');
  await page.click('button[type="submit"]');
  await new Promise((resolve) => setTimeout(resolve, 7000));
  const login = await page.evaluate(() => document.body.innerText.includes('Invalid login credentials'));
  console.log('login reaches Supabase:', login);
  await page.screenshot({ path: '.shots/live-login.png' });

  await browser.close();
})();
