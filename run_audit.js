import { chromium } from 'playwright';

async function run() {
  console.log('Launching browser for deep site exploration...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  console.log('1. Navigating to http://otzaria.duckdns.org/...');
  await page.goto('http://otzaria.duckdns.org/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'shot_1_library.png' });

  // 2. Explore Library Category Navigation
  console.log('2. Clicking on Tanakh category...');
  const tanakhBtn = page.locator('button:has-text("תנ\"ך")').first();
  if (await tanakhBtn.count() > 0) {
    await tanakhBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'shot_2_tanakh_category.png' });
  }

  // Open Bereshit book
  console.log('3. Opening Bereshit book...');
  const bereshitCard = page.locator('div:has-text("בראשית")').first();
  if (await bereshitCard.count() > 0) {
    await bereshitCard.dblclick();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'shot_3_bereshit_reader.png' });
  }

  // Test line click & commentary panel
  console.log('4. Clicking line 10 in Bereshit...');
  const line10 = page.locator('div[id="reader-line-10"]');
  if (await line10.count() > 0) {
    await line10.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'shot_4_bereshit_commentary.png' });
  }

  // Test In-Book Search
  console.log('5. Testing in-book search...');
  const searchInBookBtn = page.locator('button[title*="חיפוש בתוך הספר"]');
  if (await searchInBookBtn.count() > 0) {
    await searchInBookBtn.click();
    await page.waitForTimeout(500);
    await page.fill('input[placeholder*="חפש מילה"]', 'נח');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'shot_5_in_book_search.png' });
  }

  // Test Global Search
  console.log('6. Testing global database search...');
  await page.click('button[title*="חיפוש במאגר"]');
  await page.waitForTimeout(1000);
  await page.fill('input[placeholder*="הקלד מילה"]', 'ואהבת לרעך כמוך');
  await page.click('button:has-text("חפש")');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shot_6_global_search.png' });

  // Test FindRef
  console.log('7. Testing FindRef view...');
  await page.click('button[title*="איתור מקור"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shot_7_findref.png' });

  // Test Tools
  console.log('8. Testing Tools & Daily Study...');
  await page.click('button[title*="כלים ועזרים"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shot_8_tools.png' });

  // Test Settings Modal
  console.log('9. Testing Settings Modal...');
  await page.click('button[title*="הגדרות"]');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'shot_9_settings.png' });

  await browser.close();
  console.log('DONE! All screenshots captured.');
}

run().catch(console.error);
