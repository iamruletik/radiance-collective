import { WebGPURenderer, Scene, PerspectiveCamera, Vector3, Timer, MathUtils } from 'three/webgpu'

//Some browsers expose navigator.gpu but return null from getContext('webgpu'), which crashes on first render instead of falling back to WebGL2
const supportsWebGPU = async () => {
    try { return !!(await navigator.gpu?.requestAdapter()) && !!document.createElement('canvas').getContext('webgpu') }
    catch { return false }
}

//The one canvas: renderer, camera, frame loop. Modules added here get update(delta, elapsed) every frame,
//optionally renderBackground(renderer) to draw behind the scene, and resize()
export default class Stage {
    constructor(canvas, settings) {
        this.canvas = canvas
        this.settings = settings
        this.scene = new Scene()
        this.camera = new PerspectiveCamera()
        this.camera.up.set(0, 0, -1) //Looking straight down makes the default up parallel to the view, a lookAt() singularity
        this.timer = new Timer()
        this.modules = new Set()
        this.pointer = { x: 0, y: 0 }
        this.lookTarget = new Vector3()
    }

    async setup() {
        this.renderer = new WebGPURenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance', forceWebGL: !(await supportsWebGPU()) })
        await this.renderer.init() //Resolves the backend before first render
        this.renderer.autoClear = false //Cleared once per frame in update(), so backgrounds can draw before the scene
        this.backend = this.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2'
        this.timer.connect(document)
        this.refresh()
        addEventListener('resize', this.resize)
        addEventListener('pointermove', this.pointermove)
        this.renderer.setAnimationLoop(this.update)
    }

    add(...modules) { modules.forEach(module => this.modules.add(module)) }
    remove(...modules) { modules.forEach(module => this.modules.delete(module)) }

    refresh() {
        this.camera.fov = this.settings.fov
        this.camera.position.set(0, this.settings.cameraHeight, 0)
        this.resize()
    }

    //Sized from the canvas, not innerHeight, so mobile URL bars don't resize the scene
    resize = () => {
        const { clientWidth: width, clientHeight: height } = this.canvas
        this.height = height
        this.camera.aspect = width / height
        this.camera.updateProjectionMatrix()
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.settings.maxPixelRatio))
        this.renderer.setSize(width, height, false)
        this.modules.forEach(module => module.resize?.())
    }

    //-1..1 across the screen, y down. `mouse` tells hover effects a real cursor is there, not a touch
    pointermove = ({ clientX, clientY, pointerType }) => {
        this.pointer.x = clientX / innerWidth * 2 - 1
        this.pointer.y = clientY / innerHeight * 2 - 1
        this.pointer.mouse = pointerType == 'mouse'
    }

    update = (time) => {
        this.timer.update(time)
        const delta = this.timer.getDelta(), elapsed = this.timer.getElapsed()
        const { parallaxStrength, parallaxSmoothing } = this.settings

        this.lookTarget.x = MathUtils.damp(this.lookTarget.x, this.pointer.x * parallaxStrength, parallaxSmoothing, delta)
        this.lookTarget.z = MathUtils.damp(this.lookTarget.z, this.pointer.y * parallaxStrength, parallaxSmoothing, delta)
        this.camera.lookAt(this.lookTarget)

        this.modules.forEach(module => module.update(delta, elapsed))
        this.renderer.clear()
        this.modules.forEach(module => module.renderBackground?.(this.renderer))
        this.renderer.render(this.scene, this.camera)

        //Fades in once the first frame is on screen instead of popping in, see .webgl in base.css
        if (!this.shown) requestAnimationFrame(() => this.canvas.classList.add('is-visible'))
        this.shown = true
    }

    destroy() {
        this.renderer.setAnimationLoop(null)
        removeEventListener('resize', this.resize)
        removeEventListener('pointermove', this.pointermove)
        this.timer.dispose()
        this.renderer.dispose()
    }
}
