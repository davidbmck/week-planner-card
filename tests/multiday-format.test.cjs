const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { DateTime, Settings, Info } = require('luxon');

const source = fs.readFileSync(path.join(__dirname, '../src/card.js'), 'utf8');
const cardClass = source.slice(source.indexOf('export class WeekPlannerCard'))
    .replace('export class WeekPlannerCard', 'globalThis.WeekPlannerCard = class WeekPlannerCard');
const context = {
    DateTime, LuxonSettings: Settings, LuxonInfo: Info, styles: {},
    LitElement: class {},
    html: (strings, ...values) => strings.reduce((result, part, index) =>
        result + part + (values[index] ?? ''), ''),
};
vm.runInNewContext(cardClass, context);

const event = {
    multiDay: true,
    originalStart: DateTime.fromISO('2026-09-28T09:15:00'),
    originalEnd: DateTime.fromISO('2026-09-30T17:45:00'),
};

for (const mode of ['single', 'multiple']) {
    test(`multiDayTimeFormat controls ${mode} mode and keeps its fallback`, () => {
        const card = new context.WeekPlannerCard();
        card.setConfig({ calendars: [], multiDayMode: mode, multiDayTimeFormat: 'dd/MM HH:mm' });
        assert.equal(card._renderEventTime(event).replace(/\s+/g, ' ').trim(),
            '28/09 09:15 - 30/09 17:45');

        card.setConfig({ calendars: [], multiDayMode: mode });
        assert.equal(card._renderEventTime(event).replace(/\s+/g, ' ').trim(),
            '28 Sep 09:15 - 30 Sep 17:45');
    });
}
