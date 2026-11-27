import Lenis from 'lenis'
import { Core } from '@unseenco/taxi'
import settings from './settings.json'
import Stage from './core/Stage.js'
import Preloader from './core/Preloader.js'
import Halo from './webgl/Halo.js'
import HaloTimeline from './webgl/HaloTimeline.js'
import HaloSlider from './webgl/HaloSlider.js'
import Fade from './transitions/Fade.js'
import Showreel from './components/Showreel.js'
import Awards from './webgl/Awards.js'
import Clients from './components/Clients.js'
import Intro from './components/Intro.js'

history.scrollRestoration = 'manual'

//Dev only, delete at release. Loads before modules so stored tweaks apply from the first frame
const debug = new URLSearchParams(location.search).has('debug') ? new (await import('./core/Debug.js')).default(settings) : null

//Experimental look, ?test only. Loaded before anything renders. Delete this, the `test` lines below and src/variants/ to drop it
const variantQuery = new URLSearchParams(location.search)
const SolarLook = variantQuery.has('var2') ? (await import('./variants/SolarLook.js')).default : null
const ResinLook = !SolarLook && variantQuery.has('var1') ? (await import('./variants/ResinLook.js')).default : null
const TestLook = !SolarLook && !ResinLook && variantQuery.has('test') ? (await import('./variants/TestLook.js')).default : null

const stage = new Stage(document.querySelector('canvas.webgl'), settings.stage)
await stage.setup()

//Driven by the stage loop so WebGL always reads this frame's scroll
const lenis = new Lenis(settings.scroll)
const scroll = {
    update: (delta, elapsed) => lenis.raf(elapsed * 1000),
    refresh: () => Object.assign(lenis.options, settings.scroll)
}
const getScroll = () => lenis.scroll / stage.height

const halo = new Halo(SolarLook ? { ...settings.halo, matcap: null, tube: settings.halo.tube * SolarLook.tubeScale } : settings.halo)
halo.setup()
stage.scene.add(halo.mesh)

const test = TestLook ? new TestLook(stage, halo, settings.test) : null
test?.setup()
const resin = ResinLook ? new ResinLook(stage, halo) : null
resin?.setup()

const haloTimeline = new HaloTimeline(halo, settings.haloTimeline, stage, getScroll)
const getSectionScroll = section => getScroll() - (haloTimeline.sections[section] ?? 0) //Viewports since a [data-halo-section] reached the top
const haloSlider = new HaloSlider(halo, settings.haloSlider, stage, () => getSectionScroll(settings.haloSlider.section))
const solar = SolarLook ? new SolarLook(stage, halo, haloSlider) : null
solar?.setup()
const preloader = new Preloader(halo, settings.preloader)
haloTimeline.setup()
haloSlider.setup()
preloader.setup()

//Everything the site needs before it shows
preloader.wait(halo.loaded)
preloader.wait(haloSlider.preload())
preloader.wait(document.fonts.ready.then(() => haloTimeline.measure())) //Fonts shift the layout the halo measures

stage.add(scroll, haloTimeline, preloader)
if (resin) stage.add(resin)
if (solar) stage.add(solar)
debug?.setup({ stage, scroll, preloader, halo, haloTimeline, haloSlider, test })

lenis.stop()
preloader.play().then(() => lenis.start())

//Pages, keyed by data-page: the halo timeline they play and the WebGL modules they run. Unlisted pages get the halo in the header
const PAGES = {
    home: { timeline: 'home', modules: [haloSlider] }
}
const DEFAULT_PAGE = { timeline: 'header', modules: [] }

//DOM components, mounted per page from <section data-component="name">, each gets the element and this context
const COMPONENTS = { intro: Intro, showreel: Showreel, clients: Clients, awards: Awards }
const context = { stage, solar, halo, haloTimeline, preloader, getScroll, settings }

//The header lives outside the pages, so its intro mounts once
new Intro(document.querySelector('.header'), context).setup()

let pageModules = [], components = []
const showPage = (content) => {
    const page = PAGES[content.dataset.page] ?? DEFAULT_PAGE
    stage.remove(...pageModules)
    pageModules.forEach(module => module.hide?.())
    pageModules = page.modules
    stage.add(...pageModules)
    haloTimeline.play(page.timeline)

    components.forEach(component => component.destroy())
    components = [...content.querySelectorAll('[data-component]')]
        .filter(element => COMPONENTS[element.dataset.component])
        .map(element => new COMPONENTS[element.dataset.component](element, context))
    components.forEach(component => component.setup())
    haloTimeline.measure()
}

//Router
const router = new Core({ transitions: { default: Fade } })

router.on('NAVIGATE_OUT', () => lenis.stop())
router.on('NAVIGATE_IN', ({ to }) => {
    lenis.scrollTo(0, { immediate: true, force: true })
    showPage(to.content)
})
router.on('NAVIGATE_END', () => lenis.start())

showPage(document.querySelector('[data-page]'))
