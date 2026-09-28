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
        await page.goto(`http://127.0.0.1:${server.address().port}/checks/editor-text-fields.html`);
        await page.waitForFunction(() => window.ready);
        const result = await page.evaluate(async () => {
            const names = ['height', 'eventBackground', 'texts.today', 'updateInterval'];
            const fields = names.map(name => {
                const field = editor.shadowRoot.querySelector(`input[name="${name}"]`);
                return { type: field.type, visible: field.getBoundingClientRect().height > 0,
                    label: field.closest('label').innerText, value: field.value };
            });
            const changes = [];
            editor.addEventListener('config-changed', event => changes.push(event.detail.config));
            const set = (name, value) => {
                const field = editor.shadowRoot.querySelector(`input[name="${name}"]`);
                field.value = value;
                field.dispatchEvent(new Event('input', { bubbles: true }));
            };
            set('height', '480');
            set('texts.today', 'This day');
            set('updateInterval', '30');
            await editor.updateComplete;
            return { fields, changes, config: editor._config,
                rendered: editor.shadowRoot.querySelector('input[name="texts.today"]').value };
        });
        assert.ok(result.fields.every(field => field.visible && field.label));
        assert.equal(result.fields[0].type, 'number');
        assert.equal(result.fields[0].value, '400');
        assert.equal(result.fields[2].value, 'Now');
        assert.equal(result.config.height, '480');
        assert.equal(result.config.texts.today, 'This day');
        assert.equal(result.config.updateInterval, '30');
        assert.equal(result.rendered, 'This day');
        assert.equal(result.changes.length, 3);
    } finally {
        await browser.close();
        server.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
