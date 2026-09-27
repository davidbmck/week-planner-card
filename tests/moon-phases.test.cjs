const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings } = require('luxon');

const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const phases = source.slice(source.indexOf('const MOON_PHASES'), source.indexOf('export class WeekPlannerCard'));
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');
const context = { DateTime, LitElement: class {
    requestUpdate() { this.updates = (this.updates || 0) + 1; }
}, styles: {} };
vm.runInNewContext(phases + cardClass, context);
const Card = context.WeekPlannerCard;

function indicators(card, date) {
    return Array.from(card._getMoonIndicatorsByDate().get(date) || [], indicator => indicator.phase);
}

test('moon timestamps use the browser date, ignore missing sources, and recover on HA changes', () => {
    const previousZone = Settings.defaultZone;
    Settings.defaultZone = 'Australia/Melbourne';
    try {
        const card = new Card();
        card._moonPhases = { fullMoon: {
            enabled: true, previousEntity: 'sensor.previous', nextEntity: 'sensor.next',
        } };
        card.hass = { states: {
            'sensor.previous': { state: 'unavailable' },
            'sensor.next': { state: '2026-09-27T15:30:00Z' },
        } };
        assert.deepEqual(indicators(card, '2026-09-28'), ['full-moon']);
        assert.deepEqual(indicators(card, '2026-09-27'), []);
        assert.equal(card.updates, 1);
        card.hass = { states: {
            'sensor.previous': { state: 'unknown' },
            'sensor.next': { state: '2026-09-27T15:30:00Z' },
        } };
        assert.equal(card.updates, 2);
        card.hass = { states: {
            'sensor.previous': { state: '' },
            'sensor.next': { state: 'invalid' },
        } };
        assert.deepEqual(indicators(card, '2026-09-28'), []);
        card.hass = { states: {
            'sensor.previous': { state: '2026-09-27T15:30:00Z' },
        } };
        assert.deepEqual(indicators(card, '2026-09-28'), ['full-moon']);
    } finally {
        Settings.defaultZone = previousZone;
    }
});

test('same instant is deduplicated while distinct phases can share a day', () => {
    const card = new Card();
    card._moonPhases = {
        newMoon: { enabled: true, previousEntity: 'sensor.a', nextEntity: 'sensor.b' },
        firstQuarter: { enabled: true, nextEntity: 'sensor.c' },
        lastQuarter: { enabled: false, nextEntity: 'sensor.d' },
    };
    card.hass = { states: {
        'sensor.a': { state: '2026-09-28T10:00:00+10:00' },
        'sensor.b': { state: '2026-09-28T00:00:00Z' },
        'sensor.c': { state: '2026-09-28T11:00:00+10:00' },
        'sensor.d': { state: '2026-09-28T12:00:00+10:00' },
    } };
    assert.deepEqual(indicators(card, '2026-09-28'), ['new-moon', 'first-quarter']);
    assert.equal(card._getMoonIndicatorsByDate().get('2026-09-28')[0].instant,
        DateTime.fromISO('2026-09-28T00:00:00Z').toMillis());
});

test('different instants of the same phase on one local date remain distinct', () => {
    const previousZone = Settings.defaultZone;
    Settings.defaultZone = 'Australia/Melbourne';
    try {
        const card = new Card();
        card._moonPhases = { fullMoon: {
            enabled: true, previousEntity: 'sensor.previous', nextEntity: 'sensor.next',
        } };
        card.hass = { states: {
            'sensor.previous': { state: '2026-09-28T01:00:00+10:00' },
            'sensor.next': { state: '2026-09-28T23:00:00+10:00' },
        } };
        const occurrences = card._getMoonIndicatorsByDate().get('2026-09-28');
        assert.deepEqual(Array.from(occurrences, occurrence => occurrence.phase), ['full-moon', 'full-moon']);
        assert.deepEqual(Array.from(occurrences, occurrence => occurrence.instant), [
            DateTime.fromISO('2026-09-28T01:00:00+10:00').toMillis(),
            DateTime.fromISO('2026-09-28T23:00:00+10:00').toMillis(),
        ]);
    } finally {
        Settings.defaultZone = previousZone;
    }
});
