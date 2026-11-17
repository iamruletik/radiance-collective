import { Group, Mesh, PlaneGeometry, MeshBasicNodeMaterial, TextureLoader, SRGBColorSpace, DoubleSide, Vector2, Matrix4, Raycaster, MathUtils } from 'three/webgpu'
import { uniform, uv, vec3, cos, sin, positionLocal, texture } from 'three/tsl'

const { smootherstep, damp, clamp, inverseLerp } = MathUtils
const TAU = Math.PI * 2

//Slide images in file-name order, reused round the ring when there are more panels than images
const SLIDES = Object.entries(import.meta.glob('/assets/images/slider/*.{jpg,png,webp}', { query: '?url', import: 'default', eager: true }))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url)

//Ring of curved image panels sharing the halo's axis and radius, stacked on top of the ring along that axis
//Parented to the halo so it follows its position and tilt. The camera sits inside it in the near pose
//Scroll turns it exactly once between fading in and fading out, so every slide passes. Hovering a slide widens it, the rest make room
//It also drives the halo's text relief, burning it in as the slider arrives
export default class HaloSlider {
    constructor(halo, settings, stage, getScroll) {
        this.halo = halo
        this.settings = settings
        this.stage = stage
        this.getScroll = getScroll
        this.loader = new TextureLoader()
        this.group = new Group()
        this.raycaster = new Raycaster()
        this.toLocal = new Matrix4()
        this.pointer = new Vector2()
        this.textures = []
        this.panels = []
        this.hovered = -1
        this.focus = 0
        this.shift = 0
    }

    //Textures exist at once so panels can be built, images fill in on arrival
    setup() {
        const loads = SLIDES.map(url => new Promise((resolve, reject) => {
            const map = this.loader.load(url, resolve, undefined, reject)
            map.colorSpace = SRGBColorSpace
            this.textures.push(map)
        }))
        this.loaded = Promise.all(loads).then(() => this.panels.forEach(panel => this.fit(panel)))
        this.halo.mesh.add(this.group)
        this.refresh()
        this.hide()
    }

    //For the preloader: images downloaded, uploaded to the GPU and the panels compiled, so the slider's first frame has nothing left to do
    async preload() {
        const { renderer, camera, scene } = this.stage
        await this.loaded
        this.textures.forEach(map => renderer.initTexture(map))
        this.panels.forEach(panel => panel.mesh.material.opacity = 0)
        this.group.visible = true
        await renderer.compileAsync(this.group, camera, scene)
        this.group.visible = false
    }

    refresh() {
        const { panelCount, height, offset } = this.settings
        this.clear()
        this.panels = Array.from({ length: panelCount }, (_, index) => this.createPanel(this.textures[index % this.textures.length]))
        this.group.position.z = -(this.halo.settings.tube + offset + height / 2) //Negative local Z is screen-up in the near pose, so the band sits on top of the ring
        this.layout(0)
    }

    //Helpers
    //A flat strip bent onto the ring in the vertex shader, so its arc and crop can change every frame without new geometry
    createPanel(map) {
        const { radius } = this.halo.settings
        const { height, panelSegments } = this.settings
        const panel = { map, start: uniform(0), arc: uniform(0), uvScale: uniform(new Vector2(1, 1)), uvOffset: uniform(new Vector2()), weight: 1 }

        const material = new MeshBasicNodeMaterial({ side: DoubleSide, transparent: true })
        const angle = panel.start.add(uv().x.mul(panel.arc))
        material.positionNode = vec3(cos(angle).mul(radius), sin(angle).mul(radius), positionLocal.y.mul(height))
        material.colorNode = texture(map, uv().mul(panel.uvScale).add(panel.uvOffset))

        panel.mesh = new Mesh(new PlaneGeometry(1, 1, panelSegments, 1), material)
        panel.mesh.frustumCulled = false //Its bounds are the flat strip's, not the bent one's
        this.group.add(panel.mesh)
        return panel
    }

    //Shares the circle by weight. The hovered panel eases wider, the rest narrower, and the focused panel's centre stays put
    layout(delta) {
        const { panelGap, expand, expandSmoothing } = this.settings
        this.panels.forEach((panel, index) => panel.weight = delta ? damp(panel.weight, index == this.hovered ? expand : 1, expandSmoothing, delta) : 1)

        const total = this.panels.reduce((sum, panel) => sum + panel.weight, 0)
        const shares = this.panels.map(panel => panel.weight / total * TAU)
        const starts = shares.map((share, index) => shares.slice(0, index).reduce((sum, value) => sum + value, 0))

        //Eased too: snapping it when the hover moves to a neighbour is what made the band lurch
        const shift = (this.focus + 0.5) / this.panels.length * TAU - (starts[this.focus] + shares[this.focus] / 2)
        this.shift = delta ? damp(this.shift, shift, expandSmoothing, delta) : shift

        this.panels.forEach((panel, index) => {
            panel.start.value = starts[index] + this.shift + panelGap / 2
            panel.arc.value = Math.max(shares[index] - panelGap, 0.01)
            this.fit(panel)
        })
    }

    //Crops the image like object-fit: cover on the panel's current arc. Seen from inside the ring images can come out mirrored, flipX / flipY correct it
    fit(panel) {
        const { height, flipX, flipY } = this.settings
        const panelAspect = this.halo.settings.radius * panel.arc.value / height
        const imageAspect = panel.map.image ? panel.map.image.width / panel.map.image.height : panelAspect
        const visibleX = Math.min(1, panelAspect / imageAspect), visibleY = Math.min(1, imageAspect / panelAspect)
        panel.uvScale.value.set(flipX ? -visibleX : visibleX, flipY ? -visibleY : visibleY)
        panel.uvOffset.value.set((1 + (flipX ? visibleX : -visibleX)) / 2, (1 + (flipY ? visibleY : -visibleY)) / 2)
    }

    //Which panel the mouse is over: the pointer ray against the band's cylinder, in the band's own space
    pick() {
        const { pointer, camera } = this.stage
        if (!pointer.mouse) return -1

        this.raycaster.setFromCamera(this.pointer.set(pointer.x, -pointer.y), camera)
        const { origin, direction } = this.raycaster.ray.applyMatrix4(this.toLocal.copy(this.group.matrixWorld).invert())
        const { radius } = this.halo.settings
        const a = direction.x ** 2 + direction.y ** 2
        const b = 2 * (origin.x * direction.x + origin.y * direction.y)
        const root = Math.sqrt(b * b - 4 * a * (origin.x ** 2 + origin.y ** 2 - radius ** 2))

        for (const distance of [(-b - root) / (2 * a), (-b + root) / (2 * a)]) {
            if (!(distance > 0) || Math.abs(origin.z + direction.z * distance) > this.settings.height / 2) continue
            const angle = Math.atan2(origin.y + direction.y * distance, origin.x + direction.x * distance)
            return this.panels.findIndex(panel => ((angle - panel.start.value) % TAU + TAU) % TAU < panel.arc.value)
        }
        return -1
    }

    setHovered(index) {
        if (index == this.hovered) return
        this.hovered = index
        if (index >= 0) this.focus = index
        document.body.style.cursor = index >= 0 ? 'pointer' : ''
    }

    clear() {
        this.group.children.forEach(panel => { panel.geometry.dispose(); panel.material.dispose() })
        this.group.clear()
    }

    //Animation
    update(delta) {
        const { fadeIn, fadeOut, reliefIn } = this.settings
        const scroll = this.getScroll()
        this.halo.relief.progress.value = smootherstep(scroll, reliefIn.start, reliefIn.end)

        const visibility = smootherstep(scroll, fadeIn.start, fadeIn.end) * (1 - smootherstep(scroll, fadeOut.start, fadeOut.end))
        this.group.visible = visibility > 0.001
        if (!this.group.visible) return this.setHovered(-1)

        this.group.rotation.z = clamp(inverseLerp(fadeIn.end, fadeOut.start, scroll), 0, 1) * TAU //One full turn while fully shown
        this.setHovered(this.pick())
        this.layout(delta)
        this.panels.forEach(panel => panel.mesh.material.opacity = visibility)
    }

    hide() {
        this.group.visible = false
        this.setHovered(-1)
    }

    destroy() {
        this.hide()
        this.clear()
        this.textures.forEach(map => map.dispose())
        this.group.removeFromParent()
    }
}
