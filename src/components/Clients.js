import BlurReveal from './BlurReveal.js'

//"Who we work with": a sticky stage the halo spins over. Every half-turn opens the hole once, and one text block shows through each opening
//Reads the ring's real rotation, so text stays in sync with what's on screen at any scroll speed or direction
//Timing comes from the halo's `clients` keyframes: the first is where spinning starts, the last where it ends. Give them half a turn per block
export default class Clients {
    constructor(element, { stage, halo, haloTimeline, getScroll, settings }) {
        this.element = element
        this.stage = stage
        this.mesh = halo.mesh
        this.haloTimeline = haloTimeline
        this.getScroll = getScroll
        this.settings = settings.clients
        this.reveals = [...element.querySelectorAll('[data-reveal]')].map(block => new BlurReveal(block, settings.reveal))
        this.active = -1
    }

    setup() {
        this.reveals.forEach(reveal => reveal.setup())
        this.stage.add(this)
    }

    //Animation
    update() {
        const { showAt, hideAt } = this.settings
        const [start, end] = this.haloTimeline.range('clients', 'clients')
        this.element.style.setProperty('--clients-length', end + 1) //Stuck until spinning ends, plus the viewport the stage itself fills

        const sectionScroll = this.getScroll() - (this.haloTimeline.sections.clients ?? 0)
        const turns = (this.mesh.rotation.x - this.haloTimeline.rotationAt('clients', start)) / Math.PI //Half-turns since spinning began
        const index = Math.floor(turns), opening = turns - index //0 closed, 0.5 fully open, 1 closed again

        const spinning = sectionScroll >= start && sectionScroll <= end
        const active = spinning && this.reveals[index] && opening >= showAt && opening <= hideAt ? index : -1
        if (active == this.active) return

        this.reveals[this.active]?.playOut()
        this.reveals[active]?.playIn()
        this.active = active
    }

    destroy() {
        this.stage.remove(this)
        this.element.style.removeProperty('--clients-length')
        this.reveals.forEach(reveal => reveal.destroy())
    }
}
