const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings, Info } = require('luxon');

// Exercise the real card's refresh flow without Parcel's CSS/image imports or a DOM.
const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');

function setup(subscribe, calendarResponse) {
    const timeouts = new Map();
    const warnings = [];
    let nextId = 0;
    const timers = {
        setInterval: () => { throw new Error('Calendar refresh must not poll'); },
        setTimeout: callback => { timeouts.set(++nextId, callback); return nextId; },
        clearTimeout: id => timeouts.delete(id),
    };
    const context = {
        LitElement: class {}, styles: {}, DateTime, LuxonSettings: Settings, LuxonInfo: Info,
        window: timers, clearTimeout: timers.clearTimeout,
        console: { warn: (...args) => warnings.push(args) },
    };
    vm.runInNewContext(cardClass, context);
    const card = new context.WeekPlannerCard();
    card.setConfig({
        calendars: [{ entity: 'calendar.test' }],
        weather: { entity: 'weather.test', showTemperature: true, roundTemperature: true },
    });
    card._loader = { style: {} };
    let requests = 0;
    card.hass = {
        states: { 'calendar.test': {}, 'weather.test': {} },
        connection: { subscribeMessage: subscribe },
        callApi: () => {
            requests++;
            return calendarResponse ? calendarResponse() : Promise.resolve([{
                summary: 'Calendar event',
                start: { dateTime: DateTime.now().startOf('day').plus({ hours: 12 }).toISO() },
                end: { dateTime: DateTime.now().startOf('day').plus({ hours: 13 }).toISO() },
            }]);
        },
        formatEntityAttributeValue: (_state, attribute, value) => value ?? attribute,
        formatEntityState: (_state, value) => value,
    };
    return {
        card, warnings, requests: () => requests,
        finishRefresh: async () => {
            await new Promise(resolve => setImmediate(resolve));
        },
        nextRefresh: () => {
            assert.equal(timeouts.size, 1, 'a later calendar refresh must be scheduled');
            const [id, callback] = timeouts.entries().next().value;
            timeouts.delete(id);
            callback();
        },
    };
}

for (const [name, subscribe, warningCount] of [
    ['subscription resolves but never emits', () => Promise.resolve(() => {}), 0],
    ['subscription setup never resolves', () => new Promise(() => {}), 0],
    ['subscription setup rejects', () => Promise.reject(new Error('offline')), 1],
    ['subscription setup throws', () => { throw new Error('offline'); }, 1],
]) {
    test(`calendar keeps refreshing when weather ${name}`, async () => {
        const run = setup(subscribe);
        run.card._updateEvents();
        await run.finishRefresh();
        assert.equal(run.card._refreshing, false);
        assert.equal(run.card._loader.style.display, 'none');
        assert.equal(run.card._days[0].events.length, 1);
        assert.equal(run.warnings.length, warningCount);
        run.nextRefresh();
        await run.finishRefresh();
        assert.equal(run.requests(), 2);
        assert.equal(run.card._refreshing, false);
        assert.equal(run.card._days[0].events.length, 1);
    });
}

function forecast(temperature) {
    return { forecast: [{
        datetime: DateTime.now().startOf('day').toISO(), condition: 'sunny',
        temperature, templow: 10.2,
    }] };
}

test('late and subsequent forecasts display without waiting for the next calendar refresh', async () => {
    let emit;
    let subscription;
    const run = setup((callback, options) => {
        emit = callback;
        subscription = options;
        return Promise.resolve(() => {});
    });
    run.card._updateEvents();
    await run.finishRefresh();
    const eventKey = run.card._days[0].events[0];
    assert.equal(subscription.forecast_type, 'daily');
    assert.equal(subscription.entity_id, 'weather.test');
    emit(forecast(21.7));
    assert.equal(run.card._days[0].weather.temperature, 22);
    assert.equal(run.card._days[0].weather.state, 'sunny');
    emit(forecast(18.1));
    assert.equal(run.card._days[0].weather.temperature, 18);
    assert.equal(run.card._days[0].events[0], eventKey);
    assert.equal(run.requests(), 1);
    assert.equal(run.card._refreshing, false);
});

test('forecast received during calendar load displays when that load completes', async () => {
    let emit;
    let resolveCalendar;
    const run = setup((callback, options) => {
        emit = callback;
        assert.equal(options.forecast_type, 'twice_daily');
        return Promise.resolve(() => {});
    }, () => new Promise(resolve => { resolveCalendar = resolve; }));
    run.card._weather.useTwiceDaily = true;
    run.card._updateEvents();
    emit(forecast(21.7));
    assert.equal(run.card._refreshing, true, 'weather must not complete the calendar refresh');
    assert.equal(run.card._days, undefined, 'do not render an incomplete calendar refresh');
    resolveCalendar([]);
    await run.finishRefresh();
    assert.equal(run.card._refreshing, false);
    assert.equal(run.card._days[0].weather.temperature, 22);
    run.nextRefresh();
    assert.equal(run.requests(), 2);
});
