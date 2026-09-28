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
        const page = await browser.newPage();
        await page.goto(`http://127.0.0.1:${server.address().port}/checks/editor-selects.html`);
        await page.waitForFunction(() => window.ready);
        const result = await page.evaluate(async () => {
            const fields = ['startingDay', 'multiDayMode'];
            const initial = fields.map(name => {
                const select = editor.shadowRoot.querySelector(`ha-select[name="${name}"]`);
                return { value: select.value, options: select.options, children: select.children.length };
            });
            const changes = [];
            editor.addEventListener('config-changed', event => changes.push(event.detail.config));
            editor.shadowRoot.querySelector('ha-select[name="startingDay"]')
                .dispatchEvent(new CustomEvent('selected', { detail: { value: 'tuesday' } }));
            editor.shadowRoot.querySelector('ha-select[name="multiDayMode"]')
                .dispatchEvent(new CustomEvent('selected', { detail: { value: 'single' } }));
            await editor.updateComplete;
            const selected = fields.map(name => editor.shadowRoot.querySelector(`ha-select[name="${name}"]`).value);
            editor.shadowRoot.querySelector('ha-select[name="startingDay"]')
                .dispatchEvent(new CustomEvent('selected', { detail: { value: undefined } }));
            await editor.updateComplete;
            return { initial, selected, changes, final: editor._config,
                cleared: editor.shadowRoot.querySelector('ha-select[name="startingDay"]').value };
        });
        assert.deepEqual(result.initial.map(field => field.value), ['monday', 'multiple']);
        assert.ok(result.initial.every(field => field.options.length >= 3 && field.children === 0));
        assert.deepEqual(result.selected, ['tuesday', 'single']);
        assert.equal(result.changes[0].startingDay, 'tuesday');
        assert.equal(result.changes[1].multiDayMode, 'single');
        assert.equal(result.final.startingDay, undefined);
        assert.equal(result.final.multiDayMode, 'single');
        assert.equal(result.cleared, '');
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
