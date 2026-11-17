import { defineConfig } from 'vite'
import { globSync, readFileSync } from 'node:fs'

//Shared markup: <!-- include: src/partials/header.html --> in any page is replaced by that file
const partials = {
    name: 'partials',
    transformIndexHtml: html => html.replace(/<!-- include: (.+?) -->/g, (_, path) => readFileSync(path, 'utf8')),
    handleHotUpdate({ file, server }) {
        if (file.includes('/partials/')) server.ws.send({ type: 'full-reload' })
    }
}

//Every root .html file is a page
export default defineConfig({
    plugins: [partials],
    build: { rolldownOptions: { input: globSync('*.html') } }
})
