import { RenderTarget, RenderTarget3D, QuadMesh, NodeMaterial, Vector2, Vector3, Vector4, LinearFilter, RepeatWrapping, ClampToEdgeWrapping, RGFormat, MathUtils } from 'three/webgpu'
import { uniform, uniformArray } from 'three/tsl'
import { PUFF_COUNT, periodFor, puffsAt, fitHeightScale, cloudTopFor } from './cloudLayout.js'
import { noiseBake, shapeBake, cloudMarch, cloudRays, cloudComposite } from './cloudShaders.js'

const NOISE_SIZE = 64
const SHAPE_SIZE = [320, 112, 48]
const REBUILD_DELAY = 0.25 //Seconds after the last resize before the shapes re-bake

//Always repeats along x, the cloud strip is endless
const volumeTarget = (width, height, depth, format, wrapYZ) => {
    const target = new RenderTarget3D(width, height, depth, { depthBuffer: false, format })
    Object.assign(target.texture, { minFilter: LinearFilter, magFilter: LinearFilter, wrapS: RepeatWrapping, wrapT: wrapYZ, wrapR: wrapYZ })
    return target
}

const pass = fragmentNode => {
    const quad = new QuadMesh(new NodeMaterial())
    quad.material.fragmentNode = fragmentNode
    return quad
}

//Seeded offset into the billow noise, so each seed grows a different bank
const seedOffset = seed => {
    const random = MathUtils.seededRandom
    random(seed)
    return new Vector3(random() * 100, random() * 100, random() * 100)
}

//Footer sky: raymarched clouds drifting left with light breaking through, drawn over the scene wherever the footer is on screen
//Two shape volumes cross-fade between keyframes. When a fade ends, the faded-out one bakes the next shape a few slices per frame
//Everything runs only while the footer is visible. `setup()` compiles and bakes up front, so pass it to the preloader
export default class Clouds {
    constructor(stage, settings, footer) {
        this.stage = stage
        this.settings = settings
        this.footer = footer
        this.noise = volumeTarget(NOISE_SIZE, NOISE_SIZE, NOISE_SIZE, undefined, RepeatWrapping)
        this.volumes = [0, 1].map(() => volumeTarget(...SHAPE_SIZE, RGFormat, ClampToEdgeWrapping))
        this.cloudTarget = new RenderTarget(1, 1, { depthBuffer: false })
        this.raysTarget = new RenderTarget(1, 1, { depthBuffer: false })
        this.uniforms = {
            slice: uniform(0), puffs: uniformArray(Array.from({ length: PUFF_COUNT }, () => new Vector4())),
            tau: uniform(0), seedOffset: uniform(new Vector3()), keyLight: uniform(new Vector3()),
            period: uniform(1), aspect: uniform(0), cloudTop: uniform(1), weight: uniform(0),
            time: uniform(0), frame: uniform(0), scroll: uniform(0), sun: uniform(new Vector2()), sunGain: uniform(1),
            boil: uniform(1), back: uniform(0), shadow: uniform(0), steps: uniform(48), beams: uniform(1), glow: uniform(1),
            texel: uniform(new Vector2()), footerTop: uniform(0)
        }
        this.ready = false
        this.visible = false
        this.time = 0
        this.frame = 0
        this.keyframe = 0
        this.clock = 0
        this.pendingTime = 0
        this.job = null
    }

    async setup() {
        const uniforms = this.uniforms
        this.bakeNoise = pass(noiseBake({ ...uniforms, size: NOISE_SIZE }))
        this.bakeShape = pass(shapeBake({ ...uniforms, depth: SHAPE_SIZE[2] }))
        this.march = pass(cloudMarch({ ...uniforms, volumes: this.volumes.map(volume => volume.texture), noise: this.noise.texture }))
        this.rays = pass(cloudRays({ ...uniforms, cloud: this.cloudTarget.texture }))
        this.composite = pass(cloudComposite({ ...uniforms, cloud: this.cloudTarget.texture, rays: this.raysTarget.texture }))
        Object.assign(this.composite.material, { depthTest: false, depthWrite: false })

        //Compiled against the target each pass draws into, so nothing compiles on the frame the footer appears
        const { renderer } = this.stage
        for (const [quad, target] of [[this.bakeNoise, this.noise], [this.bakeShape, this.volumes[0]], [this.march, this.cloudTarget], [this.rays, this.raysTarget], [this.composite, null]]) {
            renderer.setRenderTarget(target)
            await renderer.compileAsync(quad, quad.camera)
        }
        renderer.setRenderTarget(null)

        this.bakeSlices(this.bakeNoise, this.noise, 0, NOISE_SIZE)
        this.resize()
        this.rebuild()
        this.ready = true
    }

    refresh() {
        if (!this.ready) return
        this.resize()
        if (this.shapeKey != this.getShapeKey()) this.rebuild()
    }

    resize() {
        const size = this.stage.renderer.getDrawingBufferSize(new Vector2())
        const cloudWidth = Math.max(2, Math.round(size.x * this.settings.bufferScale)), cloudHeight = Math.max(2, Math.round(size.y * this.settings.bufferScale))
        this.cloudTarget.setSize(cloudWidth, cloudHeight)
        this.raysTarget.setSize(Math.max(1, size.x >> 1), Math.max(1, size.y >> 1))
        this.uniforms.texel.value.set(1 / cloudWidth, 1 / cloudHeight)

        const aspect = size.x / size.y
        if (aspect == this.uniforms.aspect.value) return
        this.uniforms.aspect.value = aspect
        clearTimeout(this.rebuildTimer)
        if (this.ready) this.rebuildTimer = setTimeout(() => this.rebuild(), REBUILD_DELAY * 1000)
    }

    //Helpers
    getShapeKey() {
        const { seed, wander, cloudHeight, back } = this.settings
        return [seed, wander, cloudHeight, back, this.uniforms.aspect.value].join()
    }

    //Fresh shapes for the current aspect and settings, both keyframe volumes baked in full
    rebuild() {
        const aspect = this.uniforms.aspect.value
        this.heightScale = fitHeightScale(this.settings, aspect)
        this.uniforms.period.value = periodFor(aspect)
        this.uniforms.cloudTop.value = cloudTopFor(puffsAt(this.settings, aspect, 0, this.heightScale))
        this.keyframe = 0
        this.clock = 0
        this.job = null
        this.bakeKeyframe({ volume: 0, tau: 0, slice: 0 }, Infinity)
        this.bakeKeyframe({ volume: 1, tau: this.settings.keyframeSeconds, slice: 0 }, Infinity)
        this.shapeKey = this.getShapeKey()
    }

    //Bakes up to `count` slices of a keyframe, returns true once its volume is complete
    bakeKeyframe(job, count) {
        const { seed, back } = this.settings
        const { puffs, tau, keyLight } = this.uniforms
        puffsAt(this.settings, this.uniforms.aspect.value, job.tau, this.heightScale).forEach((puff, index) => puffs.array[index].set(puff.x, puff.y, puff.z, puff.radius))
        tau.value = job.tau
        this.uniforms.seedOffset.value.copy(seedOffset(seed))
        keyLight.value.lerpVectors(new Vector3(0.25, 1, 0.35), new Vector3(0.1, 0.5, -1), back).normalize() //Matches the march's key light

        const end = Math.min(job.slice + count, SHAPE_SIZE[2])
        this.bakeSlices(this.bakeShape, this.volumes[job.volume], job.slice, end)
        job.slice = end
        return end == SHAPE_SIZE[2]
    }

    bakeSlices(quad, target, start, end) {
        const { renderer } = this.stage
        for (let slice = start; slice < end; slice++) {
            this.uniforms.slice.value = slice
            renderer.setRenderTarget(target, slice)
            quad.render(renderer)
        }
        renderer.setRenderTarget(null)
    }

    stepKeyframes(delta) {
        const { keyframeSeconds, slicesPerFrame } = this.settings
        if (this.job) {
            if (this.bakeKeyframe(this.job, slicesPerFrame)) {
                this.job = null
                this.keyframe++
                this.clock = 0
            }
            return
        }
        this.clock += delta
        if (this.clock >= keyframeSeconds) this.job = { volume: this.keyframe % 2, tau: (this.keyframe + 2) * keyframeSeconds, slice: 0 }
    }

    //Animation
    update(delta) {
        if (!this.ready) return
        const { top, height } = this.footer.getBoundingClientRect()
        this.visible = top < this.stage.height && top + height > 0
        if (!this.visible) return

        const { speed, drift, pulse, sunX, cloudHeight, glow, keyframeSeconds } = this.settings
        const uniforms = this.uniforms
        const animation = delta * speed
        this.time += animation
        this.pendingTime += animation
        uniforms.scroll.value += animation * drift * 0.035 //Leftward drift, viewport heights per second

        //The light breathes: slow drift and swell of the sun behind the clouds
        uniforms.sun.value.set(
            sunX + Math.sin(this.time * 0.11) * 0.012 * pulse,
            MathUtils.clamp(cloudHeight, 0.15, 0.85) + Math.sin(this.time * 0.083 + 1.3) * 0.008 * pulse
        )
        uniforms.sunGain.value = 1 + (0.12 * Math.sin(this.time * 0.37) + 0.05 * Math.sin(this.time * 1.13)) * pulse

        const fade = this.job ? 1 : MathUtils.smoothstep(this.clock, 0, keyframeSeconds)
        uniforms.weight.value = this.keyframe % 2 ? 1 - fade : fade
        uniforms.time.value = this.time
        uniforms.footerTop.value = top / height
        uniforms.glow.value = glow ? 1 : 0
        for (const key of ['boil', 'back', 'shadow', 'steps', 'beams']) uniforms[key].value = this.settings[key]
    }

    //Clouds re-march every Nth frame, rays and composite every frame. Drawn behind the scene so the halo stays in front
    renderBackground(renderer) {
        if (!this.visible) return

        if (this.frame % this.settings.cloudEvery == 0) {
            this.stepKeyframes(this.pendingTime)
            this.pendingTime = 0
            this.uniforms.frame.value = this.frame % 64
            renderer.setRenderTarget(this.cloudTarget)
            this.march.render(renderer)
        }
        this.frame++

        renderer.setRenderTarget(this.raysTarget)
        this.rays.render(renderer)
        renderer.setRenderTarget(null)
        this.composite.render(renderer)
    }

    destroy() {
        clearTimeout(this.rebuildTimer)
        for (const target of [this.noise, ...this.volumes, this.cloudTarget, this.raysTarget]) target.dispose()
        for (const quad of [this.bakeNoise, this.bakeShape, this.march, this.rays, this.composite]) quad?.material.dispose()
    }
}
