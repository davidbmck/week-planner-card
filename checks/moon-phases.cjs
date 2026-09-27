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

        const create = async (overrides, width) => {
            await page.evaluate(async ([overrides, width]) => {
                document.querySelector('#mount').style.width = `${width}px`;
                await window.createPlanner({
                    days: 1, startingDay: 'today',
                    columns: { extraLarge: 1, large: 1, medium: 1, small: 1, extraSmall: 1 },
                    moonPhases: { fullMoon: { enabled: true, nextEntity: 'sensor.next' } },
                    ...overrides,
                }, 0);
            }, [overrides, width]);
            await page.waitForFunction(() => card._days?.length && card.shadowRoot.querySelector('.day .date'));
        };
        const showMoon = () => page.evaluate(async () => {
            card.hass = { ...card.hass, states: { ...card.hass.states,
                'sensor.next': { state: '2026-09-22T15:00:00Z' },
            } };
            await card.updateComplete;
        });
        const headingGeometry = () => page.evaluate(() => {
            const date = card.shadowRoot.querySelector('.day .date');
            const walker = document.createTreeWalker(date, NodeFilter.SHOW_TEXT);
            const rects = [];
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent.trim() || node.parentElement.closest('.day-indicators')) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                rects.push(...Array.from(range.getClientRects(), rect => [rect.x, rect.y, rect.width, rect.height]));
            }
            return { height: date.getBoundingClientRect().height, rects };
        });
        // Preserve existing wraps in custom HTML, localized labels and bounded mode.
        for (const overrides of [
            { dayFormat: "'Wednesday 23 September 2026'" },
            { dayFormat: "'<span>Wednesday</span><br><span>September</span>'" },
            { texts: { today: 'A long localized weekday label' } },
            { height: 200, dayFormat: "'Wednesday 23 September 2026'" },
        ]) {
            await create(overrides, 170);
            const before = await headingGeometry();
            assert.ok(new Set(before.rects.map(rect => rect[1])).size > 1, 'fixture heading wraps');
            await showMoon();
            assert.equal(await page.evaluate(() => card.shadowRoot.querySelector('.day-indicators').hidden), true);
            assert.deepEqual(await headingGeometry(), before, 'moon preserves heading height and text layout');
        }

        // A first-line heading can fit while only its appended moon would wrap.
        await create({ dayFormat: "'Wednesday'" }, 170);
        await page.evaluate(() => {
            const date = card.shadowRoot.querySelector('.date');
            const range = document.createRange();
            range.selectNodeContents(date);
            date.style.width = `${range.getBoundingClientRect().width + 2}px`;
        });
        const singleLine = await headingGeometry();
        await showMoon();
        assert.equal(await page.evaluate(() => card.shadowRoot.querySelector('.day-indicators').hidden), true);
        assert.deepEqual(await headingGeometry(), singleLine, 'moon must not add a line');

        // Reproduce font-metric changes that move an icon without resizing its
        // observed date/day/weather boxes. Dispatch the browser font event in
        // the same task so a ResizeObserver cannot mask a missing font listener.
        await create({ dayFormat: "'iiiiiiiiiiii'", weather: {
            entity: 'weather.test', showCondition: true, showTemperature: true,
        } }, 190);
        await page.evaluate(() => {
            const date = card.shadowRoot.querySelector('.date');
            date.style.cssText = 'font-family: Arial; font-size: 16px; line-height: 32px;';
        });
        await showMoon();
        await page.waitForTimeout(100);
        const fonts = await page.evaluate(() => {
            const date = card.shadowRoot.querySelector('.date');
            const indicators = date.querySelector('.day-indicators');
            const initialVisible = !indicators.hidden;
            const before = date.getBoundingClientRect();
            date.style.fontFamily = 'monospace';
            const after = date.getBoundingClientRect();
            const icon = indicators.getBoundingClientRect();
            const weather = card.shadowRoot.querySelector('.weather').getBoundingClientRect();
            const collision = icon.right > weather.left && icon.left < weather.right;
            document.fonts.dispatchEvent(new Event('loadingdone'));
            const hiddenAfterFont = indicators.hidden;
            date.style.fontFamily = 'Arial';
            document.fonts.dispatchEvent(new Event('loadingdone'));
            const restored = !indicators.hidden;
            card.remove();
            date.style.fontFamily = 'monospace';
            document.fonts.dispatchEvent(new Event('loadingdone'));
            const detachedUnchanged = !indicators.hidden;
            document.querySelector('#mount').append(card);
            const hiddenOnReconnect = indicators.hidden;
            date.style.fontFamily = 'Arial';
            document.fonts.dispatchEvent(new Event('loadingdone'));
            return { initialVisible, unchangedBox: before.width === after.width && before.height === after.height,
                collision, hiddenAfterFont, restored, detachedUnchanged, hiddenOnReconnect,
                restoredOnReconnect: !indicators.hidden };
        });
        assert.ok(Object.values(fonts).every(Boolean), JSON.stringify(fonts));

        const styling = await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = '.day-indicator.moon-phase[data-phase="full-moon"] { opacity: 1; }';
            card.shadowRoot.append(style);
            return { container: getComputedStyle(card.shadowRoot.querySelector('.day-indicators')).opacity,
                moon: getComputedStyle(card.shadowRoot.querySelector('.moon-phase')).opacity };
        });
        assert.deepEqual(styling, { container: '1', moon: '1' }, 'per-phase opacity is not reduced by the container');
        assert.deepEqual(errors, []);
        console.log('Moon phase browser checks passed.');
    } finally {
        await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
