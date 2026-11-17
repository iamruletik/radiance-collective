import { Pane } from 'tweakpane'
import * as Essentials from '@tweakpane/plugin-essentials'
import { matcapNames } from '../webgl/Halo.js'

//Dev and designer tooling, loaded only with ?debug and deleted at release
//Every value in settings.json gets a control automatically. Tweaks persist in localStorage, Export saves them as the new settings.json

//Website sections as tabs, each listing its settings.json keys
const SECTIONS = {
    Global: ['stage', 'scroll', 'transition', 'reveal'],
    Preloader: ['preloader'],
    Home: ['halo', 'haloTimeline', 'clients', 'haloSlider'],
    Footer: ['clouds']
}

//Slider ranges and dropdowns by setting name, anything unlisted gets Tweakpane's default input
const CONTROLS = {
    fov: { min: 20, max: 120, step: 1 },
    cameraHeight: { min: 10, max: 300, step: 1 },
    maxPixelRatio: { min: 0.5, max: 3, step: 0.25 },
    parallaxStrength: { min: 0, max: 20, step: 0.1 },
    parallaxSmoothing: { min: 0.1, max: 20, step: 0.1 },
    lerp: { min: 0.01, max: 1, step: 0.01 },
    wheelMultiplier: { min: 0.1, max: 5, step: 0.1 },
    touchMultiplier: { min: 0.1, max: 5, step: 0.1 },
    minSilhouette: { min: 0, max: 6, step: 0.1 },
    spinSpeed: { min: 0, max: 10, step: 0.1 },
    spinSettleTurns: { min: 0, max: 5, step: 1 },
    startScale: { min: 0, max: 2, step: 0.01 },
    scaleDuration: { min: 0, max: 5, step: 0.05 },
    revealDuration: { min: 0.1, max: 10, step: 0.1 },
    edgeIntensity: { min: 0, max: 5, step: 0.05 },
    edgeWidth: { min: 0, max: 0.5, step: 0.005 },
    edgeSoftness: { min: 0.001, max: 0.5, step: 0.005 },
    noiseScale: { min: 0, max: 20, step: 0.1 },
    noiseSpeed: { min: 0, max: 5, step: 0.05 },
    noiseStrength: { min: 0, max: 1, step: 0.01 },
    bufferScale: { options: { '25%': 0.25, '33%': 0.33, '50%': 0.5, '75%': 0.75, '100%': 1 } },
    steps: { options: { Coarse: 24, Normal: 48, Fine: 96 } },
    cloudEvery: { min: 1, max: 4, step: 1 },
    keyframeSeconds: { min: 2, max: 10, step: 0.1 },
    slicesPerFrame: { min: 1, max: 16, step: 1 },
    seed: { min: 1, max: 99999, step: 1 },
    speed: { min: 0, max: 4, step: 0.05 },
    drift: { min: 0, max: 4, step: 0.05 },
    boil: { min: 0, max: 3, step: 0.05 },
    wander: { min: 0, max: 3, step: 0.05 },
    pulse: { min: 0, max: 3, step: 0.05 },
    beams: { min: 0, max: 2.5, step: 0.05 },
    cloudHeight: { min: 0.12, max: 0.8, step: 0.01 },
    back: { min: 0, max: 1, step: 0.01 },
    shadow: { min: 0, max: 1, step: 0.01 },
    sunX: { min: 0, max: 1, step: 0.01 },
    duration: { min: 0, max: 2, step: 0.05 },
    ease: { options: ['linear', 'easeIn', 'easeOut', 'easeInOut', 'circIn', 'circOut', 'backIn', 'backOut'].map(name => ({ text: name, value: name })) },
    matcap: { options: matcapNames.map(name => ({ text: name, value: name })) },
    radius: { min: 1, max: 50, step: 0.5 },
    tube: { min: 0.1, max: 15, step: 0.1 },
    radialSegments: { min: 3, max: 128, step: 1 },
    tubularSegments: { min: 3, max: 256, step: 1 },
    relief: { options: { Dent: 'dent', Embossed: 'embossed' } },
    reliefScale: { min: 0, max: 20, step: 0.1 },
    reliefBevel: { min: 0, max: 40, step: 1 },
    reliefCenter: { min: 0, max: 1, step: 0.005 },
    reliefBand: { min: 0.05, max: 1, step: 0.005 },
    smoothing: { min: 0.5, max: 30, step: 0.5 },
    idleAmplitude: { min: 0, max: 1, step: 0.01 },
    idlePeriod: { min: 0.5, max: 10, step: 0.1 },
    rotationX: { min: -Math.PI, max: Math.PI, step: 0.01 },
    positionY: { min: -200, max: 95, step: 1 },
    positionZ: { min: -200, max: 200, step: 1 },
    scroll: { min: 0, max: 25, step: 0.05 },
    easing: { options: { Smooth: 'smooth', Linear: 'linear' } },
    showAt: { min: 0, max: 0.5, step: 0.01 },
    hideAt: { min: 0.5, max: 1, step: 0.01 },
    rise: { min: 100, max: 250, step: 5 },
    blur: { min: 0, max: 40, step: 1 },
    stagger: { min: 0, max: 0.3, step: 0.01 },
    outDuration: { min: 0, max: 2, step: 0.05 },
    outStagger: { min: 0, max: 0.3, step: 0.01 },
    cascade: { min: 0, max: 0.5, step: 0.01 },
    spinTurns: { min: 0, max: 5, step: 0.25 },
    panelCount: { min: 1, max: 32, step: 1 },
    panelGap: { min: 0, max: 0.5, step: 0.01 },
    panelSegments: { min: 1, max: 32, step: 1 },
    height: { min: 1, max: 40, step: 0.5 },
    offset: { min: -10, max: 20, step: 0.1 },
    expand: { min: 1, max: 3, step: 0.05 },
    expandSmoothing: { min: 1, max: 30, step: 0.5 },
    reliefSoftness: { min: 0.5, max: 6, step: 0.1 },
    start: { min: 0, max: 25, step: 0.05 },
    end: { min: 0, max: 25, step: 0.05 }
}

const STORAGE_KEY = 'radiance-settings'

const humanize = key => isNaN(key) ? key.replace(/([A-Z])/g, ' $1').replace(/^./, letter => letter.toUpperCase()) : `#${+key + 1}`

//Copies values in place so bindings stay attached, skipping keys that no longer exist
//and lists whose length changed, which would otherwise land old entries on new slots
const merge = (target, source) => {
    for (const key in source) {
        if (!(key in target)) continue
        if (Array.isArray(target[key]) && target[key].length != source[key]?.length) continue
        typeof source[key] == 'object' ? merge(target[key], source[key]) : target[key] = source[key]
    }
}

export default class Debug {
    constructor(settings) {
        this.settings = settings
        try { merge(settings, JSON.parse(localStorage.getItem(STORAGE_KEY))) } catch {}
    }

    setup(modules) {
        this.modules = modules
        this.pane = new Pane({ title: 'Radiance' })
        this.pane.registerPlugin(Essentials)
        Object.assign(this.pane.element.parentElement.style, { position: 'fixed', zIndex: 10 }) //Tweakpane defaults to absolute, which scrolls away

        this.fps = this.pane.addBlade({ view: 'fpsgraph', label: 'FPS', rows: 2 })
        this.pane.addBinding(modules.stage, 'backend', { readonly: true, label: 'Backend' })
        this.pane.addButton({ title: 'Replay Preloader' }).on('click', () => modules.preloader.play())
        modules.stage.add(this)

        const file = this.pane.addFolder({ title: 'Settings File', expanded: false })
        file.addButton({ title: 'Export' }).on('click', () => this.exportFile())
        file.addButton({ title: 'Import' }).on('click', () => this.importFile())
        file.addButton({ title: 'Reset To Saved' }).on('click', () => { localStorage.removeItem(STORAGE_KEY); location.reload() })

        const options = { pose: { options: Object.keys(this.settings.haloTimeline.poses).map(name => ({ text: name, value: name })) } }
        const tabs = this.pane.addTab({ pages: Object.keys(SECTIONS).map(title => ({ title })) })
        Object.values(SECTIONS).forEach((keys, index) => keys.forEach(key => this.addControls(tabs.pages[index], key, this.settings[key], options)))
    }

    //Helpers
    addControls(parent, key, values, options) {
        const folder = parent.addFolder({ title: humanize(key), expanded: false })
        for (const name in values) {
            if (typeof values[name] == 'object') this.addControls(folder, name, values[name], options)
            else folder.addBinding(values, name, { label: humanize(name), ...CONTROLS[name], ...options[name] }).on('change', ({ last }) => last && this.apply())
        }
    }

    apply() {
        Object.values(this.modules).forEach(module => module.refresh?.())
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)) } catch {}
    }

    exportFile() {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(new Blob([JSON.stringify(this.settings, null, 2)], { type: 'application/json' }))
        link.download = 'settings.json'
        link.click()
        setTimeout(() => URL.revokeObjectURL(link.href)) //Safari cancels the download if revoked synchronously
    }

    importFile() {
        const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
        input.onchange = async () => {
            try { merge(this.settings, JSON.parse(await input.files[0].text())) }
            catch (error) { return console.error('Invalid settings file', error) }
            this.pane.refresh()
            this.apply()
        }
        input.click()
    }

    //Counts frames for the FPS graph
    update() {
        this.fps.begin()
        this.fps.end()
    }

    destroy() {
        this.modules.stage.remove(this)
        this.pane.dispose()
    }
}
