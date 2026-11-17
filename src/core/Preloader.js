import { animate } from 'motion'

const TAU = Math.PI * 2
const delay = seconds => new Promise(resolve => setTimeout(resolve, seconds * 1000))

//Holds the halo as a spinning black silhouette until everything passed to wait() has loaded, then sweeps it to gold
//<html> carries .is-loading until the sweep ends, for DOM intro styles
export default class Preloader {
    constructor(halo, settings) {
        this.halo = halo
        this.settings = settings
        this.tasks = []
        this.spin = 0
        this.spinning = false
        this.revealing = new Promise(resolve => this.startRevealing = resolve) //Resolves as the gold sweep starts, for intro animations
    }

    //The hook: anything the site needs before it shows. Failures are logged, never block the reveal
    wait(task) {
        this.tasks.push(Promise.resolve(task).catch(error => console.error('Preloader task failed', error)))
        return task
    }

    setup() { this.refresh() }

    refresh() {
        const { reveal } = this.halo
        for (const [key, value] of Object.entries(this.settings.shader)) {
            reveal[key].value.isColor ? reveal[key].value.set(value) : reveal[key].value = value
        }
    }

    //Animation
    async play() {
        const { minSilhouette, startScale, scaleDuration, revealDuration, spinSettleTurns } = this.settings
        const { mesh, reveal } = this.halo

        document.documentElement.classList.add('is-loading')
        reveal.progress.value = 0
        mesh.scale.setScalar(startScale)
        this.spinning = true

        await Promise.all([...this.tasks, delay(minSilhouette)])

        this.spinning = false
        this.startRevealing()
        const settledSpin = (Math.ceil(this.spin / TAU) + spinSettleTurns) * TAU //Ends on a whole turn so the scroll timeline takes over seamlessly
        animate(mesh.scale, { x: 1, y: 1, z: 1 }, { duration: scaleDuration, ease: 'backOut' })
        animate(this, { spin: settledSpin }, { duration: revealDuration, ease: 'easeOut' })
        await animate(reveal.progress, { value: 1 }, { duration: revealDuration, ease: 'easeInOut' })

        this.spin = 0
        document.documentElement.classList.remove('is-loading')
    }

    //Runs after the halo timeline, adding the preloader spin on top of its pose
    update(delta) {
        if (this.spinning) this.spin += this.settings.spinSpeed * delta
        this.halo.mesh.rotation.x += this.spin
    }

    destroy() { document.documentElement.classList.remove('is-loading') }
}
