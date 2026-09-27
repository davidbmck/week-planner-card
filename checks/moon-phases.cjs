const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const server = http.createServer((request, response) => {
    const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) {
        response.writeHead(404).end();
        return;
    }
    response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(fs.readFileSync(file));
});

(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
    try {
        const page = await browser.newPage({ viewport: { width: 900, height: 800 }, timezoneId: 'Australia/Melbourne' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(() => { Date.now = () => new Date('2026-09-23T12:00:00+10:00').getTime(); });
        await page.goto(`http://127.0.0.1:${server.address().port}/checks/bounded-height.html`);
        await page.waitForFunction(() => window.ready);
        await page.evaluate(() => window.createPlanner({
            dayFormat: 'd ccc',
            weather: { entity: 'weather.test', showCondition: true, showTemperature: true },
            moonPhases: { fullMoon: {
                enabled: true, previousEntity: 'sensor.previous', nextEntity: 'sensor.next',
            } },
        }, 0));
        await page.evaluate(async () => {
            card.hass = { ...card.hass, states: { ...card.hass.states,
                'sensor.previous': { state: 'unknown' },
                'sensor.next': { state: '2026-09-22T15:00:00Z' },
            } };
            await card.updateComplete;
        });
        const moon = page.locator('week-planner-card .day[data-day-key="2026-09-23"] .day-indicator.moon-phase');
        assert.equal(await moon.count(), 1);
        assert.equal(await moon.getAttribute('data-phase'), 'full-moon');
        assert.equal(await moon.getAttribute('icon'), 'mdi:moon-full');
        assert.equal(await moon.getAttribute('aria-label'), 'Full moon');
        await page.waitForFunction(() => card.shadowRoot.querySelector('.day[data-day-key="2026-09-23"] .weather'));
        const documentWidth = await page.evaluate(() => {
            document.querySelector('#mount').style.width = '380px';
            return document.querySelector('#mount').clientWidth;
        });
        assert.equal(documentWidth, 380);
        await page.waitForTimeout(100);
        const placement = await page.evaluate(() => {
            const day = card.shadowRoot.querySelector('.day[data-day-key="2026-09-23"]');
            const indicators = day.querySelector('.day-indicators');
            const icon = indicators.getBoundingClientRect();
            const weather = day.querySelector('.weather').getBoundingClientRect();
            return { hidden: indicators.hidden, clear: icon.right <= weather.left || icon.left >= weather.right };
        });
        assert.ok(placement.hidden || placement.clear, 'moon must yield to weather in narrow columns');
        assert.equal(await page.evaluate(() => card.shadowRoot.querySelector('.day[data-day-key="2026-09-23"] .date').textContent.includes('23 Wed')), true);
        await page.evaluate(async () => {
            card.hass = { ...card.hass, states: { ...card.hass.states,
                'sensor.previous': { state: 'unavailable' },
                'sensor.next': { state: 'invalid' },
            } };
            await card.updateComplete;
        });
        assert.equal(await moon.count(), 0);
        assert.deepEqual(errors, []);
        console.log('Moon phase browser checks passed.');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
