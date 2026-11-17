import BlurReveal from './BlurReveal.js'

//Blur-reveals every [data-reveal] block inside the element, cascading in DOM order
//First load: as the preloader's gold sweep starts. After that, as soon as it mounts
export default class Intro {
    constructor(element, { preloader, settings }) {
        this.preloader = preloader
        this.settings = settings.reveal
        this.reveals = [...element.querySelectorAll('[data-reveal]')].map(block => new BlurReveal(block, settings.reveal))
        this.destroyed = false
    }

    async setup() {
        this.reveals.forEach(reveal => reveal.setup())
        await this.preloader.revealing
        if (this.destroyed) return
        this.reveals.forEach((reveal, index) => reveal.playIn(index * this.settings.cascade))
    }

    destroy() {
        this.destroyed = true
        this.reveals.forEach(reveal => reveal.destroy())
    }
}
