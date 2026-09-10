const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings, Info } = require('luxon');

const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');

function setup(config = {}) {
    const timers = new Map();
    const requests = [];
    const warnings = [];
    let nextId = 0;
    let clock = 0;
    let emitForecast;
    const timerApi = {
        setInterval: () => { throw new Error('Refresh must not poll'); },
        setTimeout: (callback, delay) => {
            timers.set(++nextId, { callback, delay, at: clock + delay });
            return nextId;
        },
        clearTimeout: id => timers.delete(id),
    };
    const context = {
        LitElement: class {}, styles: {}, DateTime, LuxonSettings: Settings, LuxonInfo: Info,
        window: timerApi, clearTimeout: timerApi.clearTimeout,
        console: { warn: (...args) => warnings.push(args) },
        html: (strings, ...values) => strings.reduce((text, part, i) => text + part + (values[i] ?? ''), ''),
        unsafeHTML: value => value,
    };
    vm.runInNewContext(cardClass, context);
    const card = new context.WeekPlannerCard();
    card.setConfig({ calendars: [{ entity: 'calendar.one' }], updateInterval: 7, ...config });
    card._loader = { style: {} };
    function request(entity) {
        let resolve, reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        requests.push({ entity, resolve, reject });
        return promise;
    }
    card.hass = {
        states: Object.fromEntries(card._calendars.map(calendar => [calendar.entity, {}])),
        callApi: (_method, url) => request(url.split('?')[0].slice('calendars/'.length)),
        callWS: options => request(options.entity_id),
        connection: { subscribeMessage: callback => { emitForecast = callback; return Promise.resolve(() => {}); } },
        formatEntityAttributeValue: (_state, attribute, value) => value ?? attribute,
        formatEntityState: (_state, value) => value,
    };
    const tick = () => new Promise(resolve => setImmediate(resolve));
    return {
        card, timers, requests, warnings, tick,
        emitForecast: temperature => emitForecast({ forecast: [{
            datetime: card._startDate.toISO(), temperature, condition: 'sunny',
        }] }),
        advance: async milliseconds => {
            await tick();
            const until = clock + milliseconds;
            while (true) {
                const next = [...timers.entries()].filter(([, timer]) => timer.at <= until)
                    .sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                const [id, timer] = next;
                clock = timer.at;
                timers.delete(id);
                timer.callback();
                await tick();
            }
            clock = until;
        },
    };
}

function event(summary, date = DateTime.now().startOf('day')) {
    return {
        summary,
        start: { dateTime: date.plus({ hours: 12 }).toISO() },
        end: { dateTime: date.plus({ hours: 13 }).toISO() },
    };
}

function summaries(card) {
    return Array.from(card._days ?? [], day => Array.from(day.events, key => card._calendarEvents[key].summary))
        .flat().sort();
}

function idle(run) {
    assert.equal(run.card._refreshing, false);
    assert.equal(run.card._loader.style.display, 'none');
    assert.equal(run.timers.size, 1, 'clear request deadlines and retain one retry timer');
    assert.equal([...run.timers.values()][0].delay, 7000);
}

async function seed(run, responses) {
    const refresh = run.card._updateEvents();
    responses.forEach((response, index) => run.requests[index].resolve(response));
    await refresh;
    idle(run);
}

for (const reason of [{ error: 'offline' }, new Error('offline'), null, undefined]) {
    test(`rejection (${String(reason)}) keeps rendered events and automatically recovers`, async () => {
        const run = setup();
        await seed(run, [[event('Keep me')]]);
        const events = run.card._calendarEvents;
        await run.advance(7000);
        assert.equal(run.card._calendarEvents, events, 'fetching must not clear the displayed event lookup');
        assert.match(run.card._renderEvents(run.card._days[0]), /Keep me/, 'an intervening render still shows old events');
        run.requests[1].reject(reason);
        await run.tick();
        assert.deepEqual(summaries(run.card), ['Keep me']);
        assert.match(run.card._error, /Error while fetching calendar/);
        idle(run);
        await run.advance(7000);
        run.requests[2].resolve([event('Recovered')]);
        await run.tick();
        assert.deepEqual(summaries(run.card), ['Recovered']);
        assert.equal(run.card._error, '');
        idle(run);
    });
}

test('partial failures preserve each failed calendar while successful and empty responses replace their data', async () => {
    const run = setup({ calendars: [{ entity: 'calendar.one' }, { entity: 'calendar.two' }] });
    await seed(run, [[event('Old one')], [event('Old two')]]);
    await run.advance(7000);
    run.requests[2].resolve([event('New one')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Old one', 'Old two'], 'publish a complete snapshot');
    run.requests[3].reject({ error: 'offline' });
    await run.tick();
    assert.deepEqual(summaries(run.card), ['New one', 'Old two']);
    idle(run);
    await run.advance(7000);
    run.requests[4].resolve([]);
    run.requests[5].reject({ error: 'offline' });
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Old two']);
    await run.advance(7000);
    run.requests[6].reject({ error: 'offline' });
    run.requests[7].resolve([]);
    await run.tick();
    assert.deepEqual(summaries(run.card), [], 'successful empty responses must not resurrect older events');
    idle(run);
});

for (const domain of ['calendar', 'todo']) {
    for (const late of ['resolve', 'reject']) {
        test(`${domain} timeout retains data, retries, and ignores late ${late} after recovery`, async () => {
            const run = setup({ calendars: [{ entity: `${domain}.one` }] });
            const response = title => domain === 'todo' ? { items: [{
                summary: title, due: run.card._startDate.toISODate(), uid: title, status: 'needs_action',
            }] } : [event(title)];
            await seed(run, [response('Keep me')]);
            await run.advance(7000);
            const timedOut = run.requests[1];
            await run.advance(29999);
            assert.equal(run.card._refreshing, true);
            assert.equal(run.requests.length, 2);
            assert.deepEqual(summaries(run.card), ['Keep me']);
            await run.advance(1);
            assert.match(run.card._error, /timed out after 30 seconds/);
            assert.deepEqual(summaries(run.card), ['Keep me']);
            idle(run);
            await run.advance(7000);
            run.requests[2].resolve(response('Recovered'));
            await run.tick();
            const events = run.card._calendarEvents;
            if (late === 'resolve') timedOut.resolve(response('Stale'));
            else timedOut.reject({ error: 'late error' });
            await run.tick();
            assert.equal(run.card._calendarEvents, events);
            assert.deepEqual(summaries(run.card), ['Recovered']);
            assert.equal(run.card._error, '');
            idle(run);
        });
    }
}

test('a timed-out source does not discard a successful calendar in the same refresh', async () => {
    const run = setup({ calendars: [{ entity: 'calendar.one' }, { entity: 'calendar.two' }] });
    await seed(run, [[event('Old one')], [event('Old two')]]);
    await run.advance(7000);
    run.requests[2].resolve([event('New one')]);
    await run.advance(30000);
    assert.deepEqual(summaries(run.card), ['New one', 'Old two']);
    assert.match(run.card._error, /calendar.two.*timed out/);
    idle(run);
});

test('first-load timeout renders safely and recovers on the scheduled retry', async () => {
    const run = setup();
    run.card._updateEvents();
    await run.advance(30000);
    assert.deepEqual(summaries(run.card), []);
    assert.match(run.card._error, /timed out/);
    idle(run);
    await run.advance(7000);
    run.requests[1].resolve([event('First success')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['First success']);
    idle(run);
});

test('a malformed calendar response cannot publish partial data or poison its last-good cache', async () => {
    const run = setup({ calendars: [{ entity: 'calendar.one' }, { entity: 'calendar.two' }] });
    await seed(run, [[event('Keep one')], [event('Old two')]]);
    await run.advance(7000);
    run.requests[2].resolve([event('Incomplete replacement'), { summary: 'Invalid dates' }]);
    run.requests[3].resolve([event('New two')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Keep one', 'New two']);
    assert.match(run.card._error, /Invalid calendar event dates/);
    idle(run);
    await run.advance(7000);
    run.requests[4].reject({ error: 'offline' });
    run.requests[5].resolve([]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Keep one']);
    idle(run);
});

test('a temporarily missing entity retains cached events alongside successful calendars', async () => {
    const run = setup({ calendars: [{ entity: 'calendar.one' }, { entity: 'calendar.two' }] });
    await seed(run, [[event('Keep one')], [event('Old two')]]);
    delete run.card.hass.states['calendar.one'];
    await run.advance(7000);
    assert.equal(run.requests.length, 3);
    run.requests[2].resolve([event('New two')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Keep one', 'New two']);
    assert.match(run.card._error, /calendar.one.*unavailable/);
    idle(run);
});

for (const domain of ['calendar', 'todo']) {
    test(`synchronous ${domain} request exceptions release the loader and schedule recovery`, async () => {
        const run = setup({ calendars: [{ entity: `${domain}.one` }] });
        const method = domain === 'todo' ? 'callWS' : 'callApi';
        const request = run.card.hass[method];
        run.card.hass[method] = () => { throw new Error('offline'); };
        await run.card._updateEvents();
        assert.match(run.card._error, /offline/);
        idle(run);
        run.card.hass[method] = request;
        await run.advance(7000);
        run.requests[0].resolve(domain === 'todo' ? { items: [] } : []);
        await run.tick();
        assert.equal(run.card._error, '');
        idle(run);
    });
}

test('refresh setup and render exceptions preserve the display and still schedule recovery', async () => {
    const run = setup();
    await seed(run, [[event('Keep me')]]);
    const getStartDate = run.card._getStartDate;
    run.card._getStartDate = () => { throw new Error('setup failed'); };
    await run.advance(7000);
    assert.deepEqual(summaries(run.card), ['Keep me']);
    idle(run);
    run.card._getStartDate = getStartDate;
    const updateCard = run.card._updateCard;
    run.card._updateCard = () => { throw new Error('render failed'); };
    await run.advance(7000);
    run.requests[1].resolve([event('Unrenderable replacement')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Keep me']);
    assert.match(run.card._error, /render failed/);
    idle(run);
    run.card._updateCard = updateCard;
    await run.advance(7000);
    run.requests[2].reject({ error: 'offline' });
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Keep me'], 'failed render must not replace the cache');
    await run.advance(7000);
    run.requests[3].resolve([event('Recovered')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Recovered']);
    idle(run);
});

test('configuration changes invalidate in-flight results even when the requested dates match', async () => {
    const run = setup();
    await seed(run, [[event('Displayed')]]);
    await run.advance(7000);
    run.card.setConfig({ ...run.card._config, calendars: [{ entity: 'calendar.two' }] });
    run.card.hass.states['calendar.two'] = {};
    run.requests[1].resolve([event('Stale config')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Displayed']);
    idle(run);
    await run.advance(7000);
    assert.equal(run.requests[2].entity, 'calendar.two');
    run.requests[2].resolve([event('New config')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['New config']);
    idle(run);
});

test('navigation discards in-flight results and a failed new range keeps the old displayed range', async () => {
    const run = setup();
    await seed(run, [[event('Displayed')]]);
    const originalDate = run.card._startDate;
    await run.advance(7000);
    run.card._handleNavigationNextClick();
    run.requests[1].resolve([event('Stale range')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Displayed']);
    assert.equal(run.card._startDate.toISO(), originalDate.toISO());
    idle(run);
    await run.advance(7000);
    run.requests[2].reject({ error: 'offline' });
    await run.tick();
    assert.deepEqual(summaries(run.card), ['Displayed']);
    assert.equal(run.card._startDate.toISO(), originalDate.toISO());
    await run.advance(7000);
    const nextDate = originalDate.plus({ days: 7 });
    run.requests[3].resolve([event('Next week', nextDate)]);
    await run.tick();
    assert.equal(run.card._startDate.toISO(), nextDate.toISO());
    assert.deepEqual(summaries(run.card), ['Next week']);
    idle(run);
});

test('combining multi-day events preserves cached calendar associations without accumulating duplicates', async () => {
    const run = setup({
        combineSimilarEvents: true,
        calendars: [{ entity: 'calendar.one', name: 'One', color: 'red' }, { entity: 'calendar.two', name: 'Two', color: 'blue' }],
    });
    const multiDay = event('Shared');
    multiDay.end.dateTime = run.card._startDate.plus({ days: 1, hours: 13 }).toISO();
    await seed(run, [[multiDay], [multiDay]]);
    for (let cycle = 0; cycle < 2; cycle++) {
        await run.advance(7000);
        run.requests[2 + cycle * 2].reject({ error: 'offline' });
        run.requests[3 + cycle * 2].resolve([multiDay]);
        await run.tick();
        assert.deepEqual(summaries(run.card), ['Shared', 'Shared']);
        for (const entry of Object.values(run.card._calendarEvents)) {
            assert.deepEqual(Array.from(entry.calendars), ['calendar.one', 'calendar.two']);
            assert.deepEqual(Array.from(entry.colors), ['red', 'blue']);
            assert.deepEqual(Array.from(entry.calendarNames), ['One', 'Two']);
        }
        idle(run);
    }
});

test('weather arriving during a calendar timeout renders with retained events and stays independent', async () => {
    const run = setup({ weather: { entity: 'weather.test', showTemperature: true } });
    run.card.hass.states['weather.test'] = {};
    await seed(run, [[event('Keep me')]]);
    await run.advance(7000);
    run.emitForecast(20);
    await run.advance(30000);
    assert.deepEqual(summaries(run.card), ['Keep me']);
    assert.equal(run.card._days[0].weather.temperature, 20);
    run.emitForecast(21);
    assert.deepEqual(summaries(run.card), ['Keep me']);
    assert.equal(run.card._days[0].weather.temperature, 21);
    idle(run);
});

test('duplicate calendar entries keep independent last-good data for their YAML filters and colors', async () => {
    const run = setup({ calendars: [
        { entity: 'calendar.one', filter: '^B', color: 'red' },
        { entity: 'calendar.one', filter: '^A', color: 'blue' },
    ] });
    await seed(run, [[event('A old'), event('B old')], [event('A old'), event('B old')]]);
    await run.advance(7000);
    run.requests[2].reject({ error: 'offline' });
    run.requests[3].resolve([event('A new'), event('B new')]);
    await run.tick();
    assert.deepEqual(summaries(run.card), ['A old', 'B new']);
    const entries = Object.values(run.card._calendarEvents);
    assert.equal(entries.find(e => e.summary === 'A old').colors[0], 'red');
    assert.equal(entries.find(e => e.summary === 'B new').colors[0], 'blue');
    idle(run);
});
