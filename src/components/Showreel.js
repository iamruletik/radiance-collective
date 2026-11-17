//Full-viewport showreel. Muted and inline so browsers allow autoplay, plays only while on screen
export default class Showreel {
    constructor(element) {
        this.video = element.querySelector('video')
        this.observer = new IntersectionObserver(this.toggle)
    }

    setup() { if (this.video) this.observer.observe(this.video) }

    //play() rejects when autoplay is blocked (iOS Low Power Mode), the poster frame stays then
    toggle = ([entry]) => entry.isIntersecting ? this.video.play().catch(() => {}) : this.video.pause()

    destroy() {
        this.observer.disconnect()
        this.video?.pause()
    }
}
