const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings, Info } = require('luxon');

const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
};

function setup() {
    const timers = new Map();
    const listeners = new Map();
    const requests = [];
    const subscriptions = [];
    let nextId = 0;
    const document = new EventTarget();
    document.visibilityState = 'visible';
    const connection = {
        connected: true,
        addEventListener: (type, callback) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(callback);
        },
        removeEventListener: (type, callback) => listeners.get(type)?.delete(callback),
        subscribeMessage: (emit, message, options) => {
            const pending = deferred();
            const subscription = { ...pending, emit, message, options, unsubscribed: 0 };
            subscription.finish = () => pending.resolve(() => { subscription.unsubscribed++; });
            subscriptions.push(subscription);
            return pending.promise;
        },
    };
    const hass = {
        connection, states: { 'calendar.one': {}, 'weather.one': {} },
        callApi: () => { const request = deferred(); requests.push(request); return request.promise; },
        formatEntityAttributeValue: (_state, attribute, value) => value ?? attribute,
        formatEntityState: (_state, value) => value,
    };
    const timerApi = {
        setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId; },
        clearTimeout: id => timers.delete(id),
    };
    const context = {
        LitElement: class { isConnected = false; connectedCallback() {} disconnectedCallback() {} },
        styles: {}, DateTime, LuxonSettings: Settings, LuxonInfo: Info,
        document, window: timerApi, clearTimeout: timerApi.clearTimeout, console,
    };
    vm.runInNewContext(cardClass, context);
    const config = { calendars: [{ entity: 'calendar.one' }], weather: 'weather.one', updateInterval: 7 };
    return {
        timers, listeners, requests, subscriptions, hass, document,
        create: (options = config) => {
            const card = new context.WeekPlannerCard();
            card._loader = { style: {} };
            if (options) { card.setConfig(JSON.parse(JSON.stringify(options))); card.hass = hass; }
            return card;
        },
        connect: card => { card.isConnected = true; card.connectedCallback(); },
        disconnect: card => { card.isConnected = false; card.disconnectedCallback(); },
        network: connected => {
            connection.connected = connected;
            for (const listener of listeners.get(connected ? 'ready' : 'disconnected') ?? []) listener();
        },
    };
}

const events = title => [{ summary: title,
    start: { dateTime: DateTime.now().startOf('day').plus({ hours: 12 }).toISO() },
    end: { dateTime: DateTime.now().startOf('day').plus({ hours: 13 }).toISO() },
}];
const titles = card => Array.from(card._days ?? [], day => Array.from(day.events, key => card._calendarEvents[key].summary)).flat();

test('detach cancels initialization, and reattach starts normal refresh', async () => {
    const run = setup();
    const card = run.create(null);
    run.connect(card);
    assert.equal(run.timers.size, 1);
    run.disconnect(card);
    assert.equal(run.timers.size, 0);
    card.setConfig({ calendars: [{ entity: 'calendar.one' }] });
    card.hass = run.hass;
    run.connect(card);
    run.requests[0].resolve(events('Ready'));
    await tick();
    assert.deepEqual(titles(card), ['Ready']);
    run.disconnect(card);
    assert.equal(run.timers.size, 0);
});

test('navigation cleans pending/active subscriptions and ignores obsolete calendar and weather callbacks', async () => {
    const run = setup();
    const card = run.create();
    run.connect(card);
    run.requests[0].resolve(events('Keep'));
    await tick();
    const refresh = card._updateEvents();
    assert.equal(run.subscriptions.length, 1, 'pending weather setup must not duplicate');
    run.disconnect(card);
    assert.equal(run.timers.size, 0, 'clear request deadline and refresh timer immediately');
    assert.equal(run.listeners.get('ready').size, 0);
    run.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(run.requests.length, 2, 'detached cards must not refresh');
    run.connect(card);
    run.subscriptions[0].finish();
    run.subscriptions[0].emit({ forecast: [] });
    run.requests[1].resolve(events('Obsolete'));
    await refresh;
    await tick();
    assert.equal(run.subscriptions[0].unsubscribed, 1, 'late setup must unsubscribe');
    assert.deepEqual(titles(card), ['Keep']);
    assert.equal(card._refreshing, true, 'old completion cannot finish the new request');
    assert.equal(card._weatherForecast, null);
    run.subscriptions[1].finish();
    run.requests[2].resolve(events('Returned'));
    await tick();
    await card._subscribeToWeatherForecast();
    assert.equal(run.subscriptions.length, 2, 'active subscription must not duplicate without a forecast');
    run.disconnect(card);
    assert.equal(run.subscriptions[1].unsubscribed, 1);
    assert.equal(run.timers.size, 0);
});

test('socket reconnect and visibility recovery resume refresh while retaining displayed events', async () => {
    const run = setup();
    const card = run.create();
    run.connect(card);
    run.requests[0].resolve(events('Keep'));
    run.subscriptions[0].finish();
    await tick();
    assert.equal(run.subscriptions[0].options.resubscribe, false, 'card owns reconnect subscription setup');
    run.network(false);
    assert.equal(run.timers.size, 0);
    assert.equal(run.subscriptions[0].unsubscribed, 1);
    assert.deepEqual(titles(card), ['Keep']);
    run.network(true);
    run.requests[1].reject({ error: 'HTTP 404' });
    await tick();
    assert.deepEqual(titles(card), ['Keep']);
    card._updateEvents(); // Simulate a request still pending when a sleeping tab returns.
    run.document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(run.subscriptions.length, 2);
    run.requests[3].resolve(events('Recovered'));
    await tick();
    assert.deepEqual(titles(card), ['Recovered']);
    assert.equal(run.timers.size, 1);
    run.disconnect(card);
});

test('replacement cards restore data before a transient 404 and replace it on success, including empty results', async () => {
    const run = setup();
    const original = run.create();
    run.connect(original);
    run.requests.at(-1).resolve(events('Keep'));
    await tick();
    const differentConfig = run.create({ calendars: [{ entity: 'calendar.one', filter: 'Keep' }] });
    run.connect(differentConfig);
    run.requests.at(-1).reject({ error: 'HTTP 404' });
    await tick();
    assert.deepEqual(titles(differentConfig), [], 'do not restore another configuration');
    run.disconnect(differentConfig);
    run.network(false);
    run.disconnect(original);
    const replacement = run.create();
    run.connect(replacement);
    assert.deepEqual(titles(replacement), ['Keep'], 'restore even while HA is offline');
    run.network(true);
    run.requests.at(-1).reject({ error: 'HTTP 404' });
    await tick();
    assert.deepEqual(titles(replacement), ['Keep']);
    replacement.setConfig(JSON.parse(JSON.stringify(replacement._config)));
    delete run.hass.states['calendar.one'];
    await replacement._updateEvents();
    assert.deepEqual(titles(replacement), ['Keep'], 'equivalent HA config reload preserves per-calendar cache');
    run.hass.states['calendar.one'] = {};
    const refresh = replacement._updateEvents();
    run.requests.at(-1).resolve(events('Recovered'));
    await refresh;
    assert.deepEqual(titles(replacement), ['Recovered']);
    const empty = replacement._updateEvents();
    run.requests.at(-1).resolve([]);
    await empty;
    run.disconnect(replacement);
    const afterEmpty = run.create();
    run.connect(afterEmpty);
    run.requests.at(-1).reject({ error: 'HTTP 404' });
    await tick();
    assert.deepEqual(titles(afterEmpty), [], 'a successful empty response supersedes retained events');
    run.disconnect(afterEmpty);
});
