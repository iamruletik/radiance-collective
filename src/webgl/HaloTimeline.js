import { MathUtils } from 'three/webgpu'

const { lerp, damp, clamp, inverseLerp, smootherstep, degToRad } = MathUtils

//Where a box sits on screen when it is the halo's turn: page content as if unscrolled,
//inside a sticky element as it sits once stuck, inside a fixed element as it is
const screenTop = (element, box) => {
    for (let node = element; node; node = node.parentElement) {
        const { position, top } = getComputedStyle(node)
        if (position == 'fixed') return box.top
        if (position == 'sticky') return box.top - node.getBoundingClientRect().top + parseFloat(top)
    }
    return box.top + scrollY
}

//Scroll choreography of the halo. Each timeline is a list of keyframes at scroll positions in viewport heights,
//holding a pose and the full X spins done so far. The ring eases toward the playing timeline, so switching pages glides instead of jumping
//An idle swing is added on top, so the ring never stops
//A keyframe with a `section` counts its scroll from where that [data-halo-section] starts, `easing: "linear"` moves evenly instead of easing
//A pose with an `anchor` fits the ring inside the [data-halo-anchor] box of that name, as if it were an element in it
export default class HaloTimeline {
    constructor(halo, settings, stage, getScroll) {
        this.halo = halo
        this.settings = settings
        this.stage = stage
        this.getScroll = getScroll
        this.timeline = 'home'
        this.pose = null
        this.sections = {}
        this.keyframes = {}
        this.anchored = {}
    }

    setup() { this.measure() }

    play(timeline) {
        this.timeline = timeline
        this.measure()
    }

    refresh() { this.measure() }

    resize() { this.measure() }

    //Rotation the timeline puts the ring at, `scroll` viewports into a section
    rotationAt(section, scroll) { return this.sample((this.sections[section] ?? 0) + scroll).rotationX }

    //First and last scroll, in viewports into a section, of the keyframes holding a pose
    range(section, pose) {
        const scrolls = Object.values(this.settings.timelines).flat()
            .filter(keyframe => keyframe.section == section && keyframe.pose == pose)
            .map(keyframe => keyframe.scroll)
        return [Math.min(...scrolls), Math.max(...scrolls)]
    }

    //Helpers
    //Reads the page: section starts, keyframes in absolute scroll, anchored poses
    measure() {
        const { height } = this.stage
        this.sections = Object.fromEntries([...document.querySelectorAll('[data-halo-section]')]
            .map(section => [section.dataset.haloSection, (section.getBoundingClientRect().top + scrollY) / height]))
        this.keyframes = Object.fromEntries(Object.entries(this.settings.timelines)
            .map(([name, keyframes]) => [name, keyframes.map(keyframe => ({ ...keyframe, scroll: keyframe.scroll + (this.sections[keyframe.section] ?? 0) }))]))

        //Temporary until real content after the timeline defines the page length
        document.documentElement.style.setProperty('--halo-timeline-length', this.keyframes.home.at(-1).scroll + 1)
        this.anchorPoses()
    }

    //Solves distance and screen offset so the ring fits inside its box, centred on it
    anchorPoses() {
        const { radius, tube } = this.halo.settings
        const { camera, height: viewportHeight } = this.stage
        const halfView = Math.tan(degToRad(camera.fov) / 2)

        for (const [name, pose] of Object.entries(this.settings.poses)) {
            const element = pose.anchor && document.querySelector(`[data-halo-anchor="${pose.anchor}"]`)
            const box = element?.getBoundingClientRect()
            if (!box?.height || !box.width) continue

            const ringWidth = 2 * (radius + tube)
            const ringHeight = ringWidth * Math.abs(Math.sin(pose.rotationX)) + 2 * tube * Math.abs(Math.cos(pose.rotationX)) //Tilted torus seen from above
            const distance = Math.max(ringWidth / box.width, ringHeight / box.height) * viewportHeight / (2 * halfView)
            const centerY = (screenTop(element, box) + box.height / 2) / viewportHeight * 2 - 1 //-1 top, 1 bottom of the screen

            this.anchored[name] = {
                rotationX: pose.rotationX,
                positionY: camera.position.y - distance,
                positionZ: centerY * distance * halfView //Screen down is +Z with the camera's up set to -Z
            }
        }
    }

    sample(scroll) {
        const { poses } = this.settings
        const keyframes = this.keyframes[this.timeline]
        const index = Math.max(keyframes.findLastIndex(keyframe => keyframe.scroll <= scroll), 0)
        const from = keyframes[index], to = keyframes[index + 1] ?? from
        const progress = to.easing == 'linear' ? clamp(inverseLerp(from.scroll, to.scroll, scroll), 0, 1) : smootherstep(scroll, from.scroll, to.scroll)
        const start = this.anchored[from.pose] ?? poses[from.pose], end = this.anchored[to.pose] ?? poses[to.pose]

        return {
            rotationX: lerp(start.rotationX, end.rotationX, progress) + lerp(from.spinTurns, to.spinTurns, progress) * Math.PI * 2,
            positionY: lerp(start.positionY, end.positionY, progress),
            positionZ: lerp(start.positionZ, end.positionZ, progress)
        }
    }

    //Animation
    update(delta, elapsed) {
        const { smoothing, idleAmplitude, idlePeriod } = this.settings
        const target = this.sample(this.getScroll())

        this.pose ??= target
        for (const key in target) this.pose[key] = damp(this.pose[key], target[key], smoothing, delta)

        this.halo.mesh.rotation.x = this.pose.rotationX + Math.sin(elapsed * Math.PI / idlePeriod) * idleAmplitude
        this.halo.mesh.position.set(0, this.pose.positionY, this.pose.positionZ)
    }

    destroy() { document.documentElement.style.removeProperty('--halo-timeline-length') }
}
