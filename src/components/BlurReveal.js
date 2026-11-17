import { animate, stagger } from 'motion'

const EASE_OUT = [0.215, 0.61, 0.355, 1] //power3.out
const EASE_IN = [0.55, 0.055, 0.675, 0.19] //power3.in

//The site's text reveal, ported from needvision's SplitBlurReveal onto Motion
//Lines come from the markup, each [data-line] is a mask its text rises out of while the whole block un-blurs
//Leaving, lines rise out the top and the blur comes back. Lines always enter from below, even right after leaving
export default class BlurReveal {
    constructor(element, settings) {
        this.element = element
        this.settings = settings
        this.animations = []
        this.lines = [...element.querySelectorAll('[data-line]')].map(line => {
            const text = document.createElement('span')
            text.className = 'reveal-line'
            text.append(...line.childNodes)
            line.append(text)
            return text
        })
    }

    //`rise` is how far below its mask a line waits, in % of its height: it must clear the mask's bleed
    //CSS keeps [data-reveal] hidden until this runs, so text never flashes before JS
    setup() {
        const { rise, blur } = this.settings
        this.lines.forEach(line => line.style.transform = `translateY(${rise}%)`)
        this.element.style.filter = `blur(${blur}px)`
        this.element.classList.add('reveal-ready')
    }

    //Animation
    playIn(delay = 0) {
        const { rise, blur, duration, stagger: gap } = this.settings
        const animations = this.play(
            { transform: [`translateY(${rise}%)`, 'translateY(0%)'] },
            { filter: [`blur(${blur}px)`, 'blur(0px)'] },
            { duration, gap, delay, ease: EASE_OUT }
        )
        //A leftover filter keeps the layer expensive, drop it unless a newer play took over
        Promise.all(animations).then(() => { if (animations == this.animations) this.element.style.filter = 'none' })
    }

    playOut() {
        const { rise, blur, outDuration, outStagger } = this.settings
        this.play(
            { transform: `translateY(${-rise}%)` },
            { filter: `blur(${blur}px)` },
            { duration: outDuration, gap: outStagger, ease: EASE_IN }
        )
    }

    play(lines, block, { duration, gap, delay = 0, ease }) {
        this.stop()
        this.animations = [
            animate(this.lines, lines, { duration, ease, delay: stagger(gap, { startDelay: delay }) }),
            animate(this.element, block, { duration, ease, delay })
        ]
        return this.animations
    }

    stop() { this.animations.forEach(animation => animation.stop()) }

    destroy() {
        this.stop()
        this.element.style.removeProperty('filter')
    }
}
