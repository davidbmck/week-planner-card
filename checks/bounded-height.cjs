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
        const page = await browser.newPage({ viewport: { width: 1300, height: 1000 }, timezoneId: 'Australia/Melbourne' });
        const errors = [];
        page.on('pageerror', error => { errors.push(error.message); console.error(error.message); });
        // Stable Wednesday, so today/tomorrow share a row for the first fixture.
        await page.addInitScript(() => { Date.now = () => new Date('2026-09-23T12:00:00+10:00').getTime(); });
        await page.goto(`http://127.0.0.1:${server.address().port}/checks/bounded-height.html`);
        await page.waitForFunction(() => window.ready);
        const settle = async () => {
            await page.waitForFunction(() => window.card?._days?.length && window.card._boundedFrame === null);
            await page.waitForTimeout(100);
        };
        const create = async (config, count) => {
            await page.evaluate(([config, count]) => window.createPlanner(config, count), [config, count]);
            await settle();
        };
        const geometry = () => page.evaluate(() => {
            const root = card.shadowRoot;
            const box = root.querySelector('ha-card').getBoundingClientRect();
            const days = [...root.querySelectorAll('.planner > .day:not(.header)')];
            return {
                height: box.height,
                containerBottom: root.querySelector('.planner').getBoundingClientRect().bottom,
                lastRowBottom: days.at(-1)?.getBoundingClientRect().bottom,
                tooSmall: root.querySelector('ha-card').classList.contains('height-too-small'),
                passes: card.layoutPasses || 0,
                days: days.map(day => {
                    const rect = day.getBoundingClientRect();
                    const events = [...day.querySelectorAll('.event:not([data-bounded-hidden])')];
                    const indicator = day.querySelector('.bounded-more');
                    return { key: day.dataset.dayKey, density: day.dataset.density, height: rect.height, top: rect.top,
                        shown: events.length, total: Number(indicator?.dataset.total),
                        more: indicator && !indicator.hidden ? indicator.textContent.trim() : null,
                        button: indicator?.tagName === 'BUTTON',
                        escaped: [...events, ...(indicator && !indicator.hidden ? [indicator] : [])].some(event => {
                            const eventRect = event.getBoundingClientRect();
                            return eventRect.bottom > Math.min(rect.bottom, box.bottom) + 0.1 || eventRect.right > rect.right + 0.1;
                        }),
                    };
                }),
            };
        });
        const checkBounded = async height => {
            const result = await geometry();
            assert.equal(result.height, height);
            if (!result.tooSmall && result.days.length) {
                assert.ok(Math.abs(result.containerBottom - result.lastRowBottom) < 1, 'rows share spare height and fill the planner');
            }
            if (!result.tooSmall) for (const day of result.days) {
                assert.equal(day.escaped, false, JSON.stringify(day));
                assert.equal(day.more, day.shown < day.total ? `+${day.total - day.shown}` : null);
            }
            return result;
        };

        await create({}, 6);
        assert.ok((await geometry()).height > 405, 'default layout still grows');
        assert.ok((await geometry()).days.every(day => day.density === undefined));
        await create({ maxDayEvents: 2 }, 6);
        assert.equal(await page.locator('week-planner-card .more').first().innerText(), 'More events');

        // Reuse the height at which unbounded content fits, with collapsing margins
        // like the live kiosk. It must not compact anything just by opting in.
        await create({ showDescription: false, showLocation: false }, 10);
        const naturalHeight = await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = 'div.event { margin: 1px !important; font-size: 8pt !important; line-height: 1 !important; } div.time { margin: 0 !important; }';
            card.shadowRoot.append(style);
            return Math.ceil(card.shadowRoot.querySelector('ha-card').getBoundingClientRect().height);
        });
        await page.evaluate(height => card.setConfig({ ...card._config, height }), naturalHeight);
        await settle();
        assert.ok((await checkBounded(naturalHeight)).days.every(day => day.density === '0'), 'already-fitting content must not compact');

        await create({ height: 405 }, 6);
        let result = await checkBounded(405);
        assert.equal(result.tooSmall, false);
        assert.ok(new Set(result.days.map(day => day.height)).size > 1, 'rows have variable heights');
        assert.ok(result.days.every(day => !day.button), 'kiosk overflow is passive');
        const today = result.days.find(day => day.key === '2026-09-23');
        const later = result.days.find(day => day.key === '2026-10-05');
        assert.ok(today.height > later.height, 'today gets priority over distant rows');
        assert.ok(today.shown >= later.shown);
        const passes = result.passes;
        await page.waitForTimeout(250);
        assert.equal((await geometry()).passes, passes, 'ResizeObserver settles without a render loop');

        await page.evaluate(() => { document.querySelector('#mount').style.width = '550px'; });
        await settle();
        await checkBounded(405);
        await page.evaluate(() => { document.querySelector('#mount').style.width = '1100px'; });
        await create({ height: 405, maxDayEvents: 2, overflowClickable: true }, 6);
        await checkBounded(405);
        await page.locator('week-planner-card button.bounded-more:not([hidden])').first().click();
        assert.equal(await page.locator('week-planner-card .overflow-list .event').count(), 6);

        await create({ height: 405, showLegend: true, showNavigation: true, title: 'Calendar', showWeekDayText: false }, 4);
        await checkBounded(405);
        await create({ height: 405, days: 'month', startingDay: 'monday' }, 10);
        await checkBounded(405);
        await create({ height: 405, days: 7, startingDay: 'today' }, 100);
        await checkBounded(405);
        await create({ height: 405, weather: { entity: 'weather.test', showTemperature: true } }, 6);
        await checkBounded(405);
        assert.ok(await page.locator('week-planner-card .weather').count());
        // Kiosk-style overrides: margins on both sides, smaller font and line height.
        await page.evaluate(() => {
            const style = document.createElement('style');
            style.textContent = 'div.event { font-size: 8pt !important; margin: 1px !important; line-height: 1 !important; } div.time { margin: 0 !important; }';
            card.shadowRoot.append(style);
        });
        await settle();
        await checkBounded(405);
        await create({ height: 405, showLegend: true, legendToggle: true }, 6);
        await page.locator('week-planner-card .legend li').click();
        await settle();
        result = await checkBounded(405);
        assert.ok(result.days.every(day => day.shown === 0 && day.more === null));
        await page.locator('week-planner-card .legend li').click();
        await settle();
        await checkBounded(405);
        await page.evaluate(async () => { card.hass.callApi = async () => []; await card._updateEvents(); });
        await settle();
        result = await checkBounded(405);
        assert.ok(result.days.every(day => day.shown === 0 && day.more === null));
        await create({ height: 80, title: 'Calendar', showLegend: true }, 6);
        assert.equal((await checkBounded(80)).tooSmall, true);
        assert.ok(await page.locator('week-planner-card .height-warning').isVisible());

        await create({ height: 405 }, 1);
        await page.evaluate(() => card.setConfig({ ...card._config, height: undefined }));
        await settle();
        assert.ok((await geometry()).days.every(day => day.density === undefined));
        await page.evaluate(() => card.setConfig({ ...card._config, height: 405 }));
        await settle();
        await checkBounded(405);
        await page.evaluate(() => card.remove());
        assert.ok(await page.evaluate(() => card._boundedObserver === null && card._boundedFrame === null));
        await page.evaluate(() => card.setConfig({ ...card._config, height: undefined }));
        await page.evaluate(() => document.querySelector('#mount').append(card));
        await settle();
        assert.ok((await geometry()).days.every(day => day.density === undefined), 'detached config changes clear layout state');
        await page.evaluate(() => { document.querySelector('#mount').style.display = 'none'; });
        await create({ height: 405 }, 6);
        await page.evaluate(() => { document.querySelector('#mount').style.display = ''; });
        await settle();
        await checkBounded(405);
        assert.deepEqual(errors, []);
        console.log('Browser layout checks passed: defaults, priority, row allocation, overflow counts, resize, dialogs, headers, month view, dense days, weather, custom styling, legend toggles, refresh, fallback, configuration changes and reconnect.');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
