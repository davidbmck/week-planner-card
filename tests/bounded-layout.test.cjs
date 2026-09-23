const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/bounded-layout.js'), 'utf8')
    .replaceAll('export function', 'function'), context);
const { allocateRows, dayPriority, fitEvents } = context;
const day = (priority, heights, minimum = 20) => ({ priority,
    sizes: heights.map(height => ({ height, minimum })) });

test('date priorities use a rolling seven-day window', () => {
    assert.deepEqual([-2, -1, 0, 1, 2, 6, 7, 20].map(dayPriority), [0, 0, 2, 2, 1, 1, 0, 0]);
});

test('a quiet view keeps normal presentation and shares spare space equally', () => {
    const result = allocateRows([[day(0, [50, 40, 30])], [day(2, [80, 60, 40])]], 300);
    assert.deepEqual(Array.from(result.densities.flat()), [0, 0]);
    assert.deepEqual(Array.from(result.heights), [135, 165]);
});

test('past/distant rows compact before nearby dates, with unequal row heights', () => {
    const result = allocateRows([[day(0, [100, 80, 40])], [day(1, [100, 80, 40])], [day(2, [120, 90, 50])]], 260);
    assert.deepEqual(Array.from(result.densities.flat()), [2, 0, 0]);
    assert.deepEqual(Array.from(result.heights), [40, 100, 120]);
});

test('low-priority overflow is used before compacting today/tomorrow', () => {
    const result = allocateRows([[day(0, [150, 120, 80])], [day(2, [150, 100, 50])]], 190);
    assert.deepEqual(Array.from(result.densities.flat()), [2, 0]);
    assert.deepEqual(Array.from(result.heights), [40, 150]);
});

test('today and tomorrow in different rows both retain full detail when possible', () => {
    const result = allocateRows([[day(0, [100, 80, 60])], [day(2, [100, 80, 40])], [day(2, [120, 80, 40])]], 240);
    assert.deepEqual(Array.from(result.heights), [20, 100, 120]);
    assert.equal(result.densities[1][0], 0);
    assert.equal(result.densities[2][0], 0);
});

test('a shared row cannot donate height needed by its higher-priority day', () => {
    const result = allocateRows([[day(0, [180, 100, 40]), day(2, [140, 100, 60])]], 110);
    assert.equal(result.densities[0][1], 1);
    assert.equal(result.heights[0], 110);
});

test('quiet dates regain full detail even when a busy date in their tier compacts', () => {
    const result = allocateRows([[day(0, [200, 120, 60]), day(0, [50, 40, 20]), day(2, [100, 80, 60])]], 120);
    assert.deepEqual(Array.from(result.densities[0]), [1, 0, 0]);
});

test('spare room shared between rows restores a quieter row to normal presentation', () => {
    const result = allocateRows([[day(0, [300, 200, 50])], [day(0, [75, 60, 30])]], 180);
    assert.deepEqual(Array.from(result.heights), [100, 80]);
    assert.deepEqual(Array.from(result.densities.flat()), [2, 0]);
});

test('extreme density stays within budget and reports impossible headings', () => {
    const rows = [[day(0, [400, 300, 200])], [day(1, [400, 300, 200])], [day(2, [400, 300, 200])]];
    const result = allocateRows(rows, 100);
    assert.ok(result.heights.reduce((a, b) => a + b) <= 100);
    assert.equal(result.heights[2], 60);
    assert.equal(allocateRows(rows, 59).tooSmall, true);
});

test('overflow counts reserve their own height and never show a partial event', () => {
    assert.equal(fitEvents([40, 40, 40], 120, 20, 3), 3);
    assert.equal(fitEvents([40, 40, 40], 119, 20, 3), 2);
    assert.equal(fitEvents([100], 80, 20, 1), 0);
    assert.equal(fitEvents([40, 40], 80, 20, 5), 1);
    assert.equal(fitEvents([], 20, 20, 5), 0);
});
