// Geometry is measured by the card; keep the allocation policy independent of the DOM.
export function dayPriority(offset) {
    if (offset === 0 || offset === 1) return 2;
    return offset >= 2 && offset < 7 ? 1 : 0;
}

export function allocateRows(rows, available) {
    const levels = [0, 0, 0];
    const capped = [false, false, false];
    const presentations = rows.flat()[0]?.sizes.length ?? 1;
    const sizes = minimum => rows.map(row => Math.max(0, ...row.map(day => {
        const size = day.sizes[levels[day.priority]];
        return minimum && capped[day.priority] ? size.minimum : size.height;
    })));
    const total = values => values.reduce((sum, value) => sum + value, 0);
    const fits = () => total(sizes(true)) <= available;

    // Reclaim low-priority space before changing today's/tomorrow's presentation.
    // Each tier first tightens spacing, then abbreviates, then permits overflow.
    for (let priority = 0; priority < 3 && !fits(); priority++) {
        for (let level = 1; level < presentations && !fits(); level++) levels[priority] = level;
        if (!fits()) capped[priority] = true;
    }
    if (!fits()) return { tooSmall: true };

    const heights = sizes(true);
    let remaining = available - total(heights);
    // Restore as much of the capped content as fits, with the same date priority.
    for (let priority = 2; priority >= 0 && remaining > 0; priority--) {
        const needs = rows.map((row, index) => Math.max(0, ...row
            .filter(day => day.priority === priority)
            .map(day => day.sizes[levels[priority]].height - heights[index])));
        const wanted = total(needs);
        const fraction = wanted ? Math.min(1, remaining / wanted) : 0;
        needs.forEach((need, index) => { heights[index] += need * fraction; });
        remaining -= wanted * fraction;
    }
    // Share spare room equally after satisfying the date priorities. The outer
    // height is fixed, so leave the breathing space inside rows, not below them.
    const extra = rows.length ? remaining / rows.length : 0;
    heights.forEach((height, index) => { heights[index] = height + extra; });
    // A busy day can force its tier to compact, but quieter neighbours should use
    // the room already allocated to their row. Restore full detail independently.
    const densities = rows.map((row, index) => row.map(day => {
        const full = day.sizes.findIndex(size => size.height <= heights[index]);
        return full === -1 ? levels[day.priority] : full;
    }));
    return { heights, densities, tooSmall: false };
}

export function fitEvents(heights, available, indicatorHeight, total) {
    const sum = heights.reduce((value, height) => value + height, 0);
    if (heights.length === total && sum <= available) return heights.length;
    let used = indicatorHeight;
    let count = 0;
    for (const height of heights) {
        if (used + height > available) break;
        used += height;
        count++;
    }
    return count;
}
