const {Builder, By, until} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const fs = require('fs');
const SHOTS = '/tmp/molgang-shots';
fs.mkdirSync(SHOTS, {recursive:true});

(async () => {
  const opts = new chrome.Options();
  opts.setChromeBinaryPath('/snap/bin/chromium');
  // VISIBLE (not headless) on DISPLAY=:0
  opts.addArguments('--no-sandbox','--disable-dev-shm-usage','--window-size=1600,1000',
                    '--window-position=60,40','--disable-gpu-sandbox');
  const service = new chrome.ServiceBuilder('/snap/chromium/current/usr/lib/chromium-browser/chromedriver');
  const driver = await new Builder().forBrowser('chrome').setChromeOptions(opts).setChromeService(service).build();

  async function shot(name){
    const png = await driver.takeScreenshot();
    const f = `${SHOTS}/${name}.png`;
    fs.writeFileSync(f, png, 'base64');
    console.log('SHOT', f);
  }
  async function clickByText(text){
    try {
      const el = await driver.findElement(By.xpath(`//button[contains(normalize-space(.), ${JSON.stringify(text)})]`));
      await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', el);
      await el.click();
      return true;
    } catch(e){ console.log('  (no button:', text, ')'); return false; }
  }

  try {
    console.log('== loading game ==');
    await driver.get('http://localhost:3000/');
    await driver.wait(until.elementLocated(By.css('h1')), 15000);
    await driver.sleep(1500);
    await shot('01-home');

    // Visit key chemistry-rich routes directly + screenshot
    const routes = [
      ['game','/game'], ['chem-lab','/chem-lab'], ['steel','/steel'],
      ['mining','/mining'], ['fertilizer','/fertilizer'], ['periodic-table','/periodic-table'],
      ['research','/research'], ['mahjong','/mahjong'], ['bubble-tea','/bubble-tea'],
      ['world','/world'], ['profile','/profile']
    ];
    let i = 2;
    for (const [name, path] of routes){
      console.log('== visiting', path, '==');
      await driver.get('http://localhost:3000'+path);
      await driver.sleep(2500);
      // try to interact: click first 1-2 primary buttons to trigger reactions/animations
      try {
        const btns = await driver.findElements(By.css('button'));
        if (btns.length){ await driver.executeScript('arguments[0].scrollIntoView({block:"center"})', btns[0]); await btns[0].click(); await driver.sleep(1200); }
      } catch(e){}
      await shot(String(i).padStart(2,'0')+'-'+name);
      i++;
    }
    console.log('== done, leaving window open 8s ==');
    await driver.sleep(8000);
  } catch(e){
    console.error('ERR', e.message);
  } finally {
    await driver.quit();
  }
})();
