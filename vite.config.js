import { defineConfig } from 'vite'
import { globSync, readFileSync, writeFileSync } from 'node:fs'

//Shared markup: <!-- include: src/partials/header.html --> in any page is replaced by that file
const partials = {
    name: 'partials',
    transformIndexHtml: html => html.replace(/<!-- include: (.+?) -->/g, (_, path) => readFileSync(path, 'utf8')),
    handleHotUpdate({ file, server }) {
        if (file.includes('/partials/')) server.ws.send({ type: 'full-reload' })
    }
}

//Dev only: the debug panel's Save As Default posts its settings here, written over src/settings.json
const saveSettings = {
    name: 'save-settings',
    apply: 'serve',
    configureServer(server) {
        server.middlewares.use('/__save-settings', (request, response) => {
            if (request.method != 'POST') return response.writeHead(405).end()
            let body = ''
            request.on('data', chunk => body += chunk)
            request.on('end', () => {
                try { writeFileSync('src/settings.json', JSON.stringify(JSON.parse(body), null, 2) + '\n'); response.end('ok') }
                catch (error) { response.writeHead(400).end(error.message) }
            })
        })
    }
}

//Every root .html file is a page
export default defineConfig({
    plugins: [partials, saveSettings],
    build: { rolldownOptions: { input: globSync('*.html') } }
})
