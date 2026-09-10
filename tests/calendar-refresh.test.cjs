const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings, Info } = require('luxon');

// Run the real refresh and event processing methods with controllable HA requests/timers.
const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

function event(summary, date = DateTime.now().startOf('day')) {
    return {
        summary,
        start: { dateTime: date.plus({ hours: 12 }).toISO() },
        end: { dateTime: date.plus({ hours: 13 }).toISO() },
    };
}

function setup(calendars = [{ entity: 'calendar.one' }]) {
    const timeouts = new Map();
    const requests = [];
    let nextId = 0;
    const timers = {
        setInterval: () => { throw new Error('Calendar refresh must not poll'); },
        setTimeout: (callback, delay) => { timeouts.set(++nextId, { callback, delay }); return nextId; },
        clearTimeout: id => timeouts.delete(id),
    };
    const context = {
        LitElement: class {}, styles: {}, DateTime, LuxonSettings: Settings, LuxonInfo: Info,
        window: timers, clearTimeout: timers.clearTimeout, console,
    };
    vm.runInNewContext(cardClass, context);
    const card = new context.WeekPlannerCard();
    card.setConfig({ calendars, updateInterval: 7 });
    card._loader = { style: {} };
    card.hass = {
        states: Object.fromEntries(calendars.filter(c => c.entity).map(c => [c.entity, {}])),
        formatEntityAttributeValue: () => 'Calendar name',
        callApi: (...args) => request('rest', args),
        callWS: (...args) => request('ws', args),
    };
    function request(type, args) {
        const response = deferred();
        requests.push({ type, args, ...response });
        return response.promise;
    }
    return {
        card, timeouts, requests,
        refreshTimers: () => [...timeouts.values()].filter(timer => timer.delay === 7000),
        tick: () => new Promise(resolve => setImmediate(resolve)),
        nextRefresh: () => {
            assert.equal(timeouts.size, 1);
            const [id, timer] = timeouts.entries().next().value;
            assert.equal(timer.delay, 7000, 'use updateInterval seconds after completion');
            timeouts.delete(id);
            timer.callback();
        },
    };
}

test('initial load and repeated periodic refreshes complete without polling', async () => {
    const run = setup();
    run.card._waitForHassAndConfig();
    for (let cycle = 0; cycle < 3; cycle++) {
        assert.equal(run.requests.length, cycle + 1);
        assert.equal(run.refreshTimers().length, 0, 'do not schedule the next refresh until requests settle');
        assert.equal(run.card._loader.style.display, 'inherit');
        const request = run.requests[cycle];
        assert.equal(request.args[0], 'get');
        const url = new URL(request.args[1], 'https://ha.test/');
        assert.equal(url.pathname, '/calendars/calendar.one');
        assert.equal(url.searchParams.get('start'), run.card._startDate.toISO());
        assert.equal(url.searchParams.get('end'), run.card._startDate.plus({ days: 7 }).toISO());
        request.resolve([event(`Cycle ${cycle}`)]);
        await run.tick();
        assert.equal(run.card._loader.style.display, 'none');
        assert.equal(run.card._days[0].events.length, 1);
        assert.equal(Object.values(run.card._calendarEvents)[0].summary, `Cycle ${cycle}`);
        assert.equal(run.timeouts.size, 1);
        if (cycle < 2) run.nextRefresh();
    }
});

test('calendars start concurrently and settle independently, retaining per-calendar errors and sorting', async () => {
    const run = setup(['one', 'two', 'three'].map(name => ({ entity: `calendar.${name}` })));
    const refresh = run.card._updateEvents();
    assert.equal(run.requests.length, 3);
    run.requests[1].reject({ error: 'offline' });
    run.requests[2].resolve([event('Third')]);
    await run.tick();
    assert.equal(run.card._days, undefined, 'wait for all requests before rendering');
    assert.equal(run.refreshTimers().length, 0);
    run.requests[0].resolve([event('First')]);
    await refresh;
    const rendered = Array.from(run.card._days[0].events, key => run.card._calendarEvents[key]);
    assert.deepEqual(rendered.map(e => [e.summary, e.calendarSorting]), [['Third', 2], ['First', 0]]);
    assert.equal(run.card._error, 'Error while fetching calendar "calendar.two": offline');
    assert.equal(run.card._loader.style.display, 'none');
    run.nextRefresh();
    assert.equal(run.requests.length, 6);
    run.requests.slice(3).forEach(request => request.resolve([]));
    await run.tick();
    assert.equal(run.card._error, '');
    assert.equal(run.card._days[0].events.length, 0);
    assert.equal(run.timeouts.size, 1);
});

for (const fails of [false, true]) {
    test(`todo ${fails ? 'rejection' : 'success'} settles alongside a calendar request`, async () => {
        const run = setup([{ entity: 'todo.list' }, { entity: 'calendar.one' }]);
        const refresh = run.card._updateEvents();
        assert.equal(run.requests.length, 2);
        assert.equal(run.requests[0].type, 'ws');
        assert.equal(run.requests[0].args[0].type, 'todo/item/list');
        assert.equal(run.requests[0].args[0].entity_id, 'todo.list');
        run.requests[1].resolve([event('Calendar')]);
        await run.tick();
        assert.equal(run.refreshTimers().length, 0);
        if (fails) {
            run.requests[0].reject({ error: 'offline' });
        } else {
            run.requests[0].resolve({ items: [{
                uid: 'task-1', summary: 'Task', status: 'needs_action',
                due: run.card._startDate.toISODate(),
            }] });
        }
        await refresh;
        assert.equal(run.card._days[0].events.length, fails ? 1 : 2);
        assert.equal(run.card._error, fails ? 'Error while fetching todo list "todo.list": offline' : '');
        if (!fails) {
            const todo = Object.values(run.card._calendarEvents).find(e => e.isTodoItem);
            assert.equal(todo.todoUid, 'task-1');
            assert.equal(todo.fullDay, true);
        }
        assert.equal(run.card._loader.style.display, 'none');
        assert.equal(run.timeouts.size, 1);
    });
}

test('navigation replaces the pending refresh timer and in-flight refresh calls do not overlap', async () => {
    const run = setup();
    const refresh = run.card._updateEvents();
    await run.card._updateEvents();
    assert.equal(run.requests.length, 1);
    run.requests[0].resolve([]);
    await refresh;
    const oldTimer = run.timeouts.keys().next().value;
    const originalDate = run.card._startDate;
    run.card._handleNavigationNextClick();
    assert.equal(run.requests.length, 2);
    assert.equal(run.timeouts.has(oldTimer), false);
    assert.equal(run.refreshTimers().length, 0);
    const nextDate = originalDate.plus({ days: 7 });
    assert.equal(new URL(run.requests[1].args[1], 'https://ha.test/').searchParams.get('start'), nextDate.toISO());
    assert.equal(run.card._startDate.toISO(), originalDate.toISO(), 'keep the displayed range until completion');
    await run.card._updateEvents();
    assert.equal(run.requests.length, 2);
    run.requests[1].resolve([event('Next week', nextDate)]);
    await run.tick();
    assert.equal(run.card._days[0].events.length, 1);
    assert.equal(run.timeouts.size, 1);
    assert.notEqual(run.timeouts.keys().next().value, oldTimer);
});

test('empty or unavailable calendars complete and keep the regular refresh timer', async () => {
    for (const calendars of [[], [{}, { entity: 'calendar.missing' }]]) {
        const run = setup(calendars);
        run.card.hass.states = {};
        await run.card._updateEvents();
        assert.equal(run.requests.length, 0);
        assert.equal(run.card._days.length, 7);
        assert.equal(run.card._days[0].events.length, 0);
        assert.equal(run.card._loader.style.display, 'none');
        assert.equal(run.timeouts.size, 1);
    }
});
