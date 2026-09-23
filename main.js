import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { animate } from 'motion'
import { Pane } from 'tweakpane'
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import HEIGHTMAP_URL from './assets/normals/heightmap-example.jpg'

const BACKGROUND_COLOR = 0xFFFFFF
const DEBUG = new Pane()
DEBUG.registerPlugin(EssentialsPlugin)
const FPS = DEBUG.addBlade({
    view: 'fpsgraph',
    label: 'FPS',
    rows: 2,
})

const CANVAS = document.querySelector('canvas.webgl')
const SIZES = {
    width: window.innerWidth,
    height: window.innerHeight
}

//Renderer
//Some browsers expose navigator.gpu but return null from getContext('webgpu'), which crashes on the first render instead of falling back to WebGL2
const checkWebGPUSupport = async () => {
    try {
        const adapter = await navigator.gpu?.requestAdapter()
        if (!adapter) return false
        return document.createElement('canvas').getContext('webgpu') !== null
    } catch (error) {
        return false
    }
}

const RENDERER = new WebGPURenderer({ canvas: CANVAS, forceWebGL: !(await checkWebGPUSupport()), powerPreference: "high-performance", alpha: true, antialias: true })
await RENDERER.init() //WebGPURenderer needs to resolve its backend (WebGPU, or WebGL2 fallback) before first use
RENDERER.setSize(window.innerWidth, window.innerHeight)
RENDERER.setPixelRatio(window.devicePixelRatio)
RENDERER.setClearColor(0xffffff, 0)
RENDERER.setSize(SIZES.width, SIZES.height)
//RENDERER.toneMapping = THREE.LinearToneMapping
RENDERER.outputColorSpace = THREE.SRGBColorSpace

//Clock
const TIMER = new THREE.Timer()
TIMER.connect(document)

//Scene
const SCENE = new THREE.Scene()

//Three Point Lighting
const KEY_LIGHT = new THREE.DirectionalLight(0xffffff, 3)
KEY_LIGHT.position.set(50, 75, 50)
SCENE.add(KEY_LIGHT)

const FILL_LIGHT = new THREE.DirectionalLight(0xffffff, 1)
FILL_LIGHT.position.set(-50, 25, 50)
SCENE.add(FILL_LIGHT)

const RIM_LIGHT = new THREE.DirectionalLight(0xffffff, 2)
RIM_LIGHT.position.set(0, 50, -75)
SCENE.add(RIM_LIGHT)


//Texture Loader
const LOADER = new THREE.TextureLoader()

//Camera
const CAMERA = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight) // FOV vertical angle, aspect ratio with/height
CAMERA.position.set(0, 100, 0)
CAMERA.up.set(0, 0, -1) //Straight-down view makes default (0,1,0) up parallel to view direction, a lookAt() singularity - this avoids it
SCENE.add(CAMERA)

//Cursor Parallax
const PARALLAX_STRENGTH = 2 //Max look-target offset in world units, keep small
const PARALLAX_DAMPING = 0.05 //Lerp factor per frame, lower = lazier follow
const MOUSE = { x: 0, y: 0 }
const LOOK_TARGET = new THREE.Vector3()

window.addEventListener('mousemove', (event) => {
    MOUSE.x = (event.clientX / window.innerWidth) * 2 - 1
    MOUSE.y = (event.clientY / window.innerHeight) * 2 - 1
})

//PARAMS
let PARAMS = {
    color: 0xffffff,
    material: 'Matcap',
    radius: 20,
    tube: 3,
    radialSegments: 64,
    tubularSegments: 100,
    matcapBumpScale: 1,
    bumpMode: 'Dent'
}

//Torus Model
const GEOMETRY = new THREE.TorusGeometry( PARAMS.radius, PARAMS.tube, PARAMS.radialSegments, PARAMS.tubularSegments )
const MATCAP_FILES = import.meta.glob('/assets/matcap/*.png', { eager: true, import: 'default' });
const MATCAP_PATHS = Object.values(MATCAP_FILES)

const MATCAP_TEXTURES = await Promise.all(
  MATCAP_PATHS.map(path => LOADER.loadAsync(path))
)

//Change Geometry
const GEOMETRY_DEBUG = DEBUG.addFolder({ title: 'Geometry' })

const rebuildGeometry = () => {
    const newGeometry = new THREE.TorusGeometry(
        PARAMS.radius,
        PARAMS.tube,
        PARAMS.radialSegments,
        PARAMS.tubularSegments
    )
    HALO.geometry.dispose()
    HALO.geometry = newGeometry
}

GEOMETRY_DEBUG.addBinding(PARAMS, 'radius', { min: 1, max: 50, step: 0.5 })
    .on('change', (ev) => { if (ev.last) rebuildGeometry() })

GEOMETRY_DEBUG.addBinding(PARAMS, 'tube', { min: 0.1, max: 15, step: 0.1 })
    .on('change', (ev) => { if (ev.last) rebuildGeometry() })

GEOMETRY_DEBUG.addBinding(PARAMS, 'radialSegments', { min: 3, max: 128, step: 1 })
    .on('change', (ev) => { if (ev.last) rebuildGeometry() })

GEOMETRY_DEBUG.addBinding(PARAMS, 'tubularSegments', { min: 3, max: 200, step: 1 })
    .on('change', (ev) => { if (ev.last) rebuildGeometry() })


MATCAP_TEXTURES[0].colorSpace = THREE.SRGBColorSpace

const MATCAP = new THREE.MeshMatcapMaterial({ matcap: MATCAP_TEXTURES[0], color: PARAMS.color })
MATCAP.matcapIndex = 0

const STANDARD_PARAMS = {
    color: 0xffc800,
    metalness: 1,
    roughness: 0.15,
    bumpScale: 1
}

const STANDARD = new THREE.MeshStandardMaterial({})
STANDARD.color.set(STANDARD_PARAMS.color)
STANDARD.metalness = STANDARD_PARAMS.metalness
STANDARD.roughness = STANDARD_PARAMS.roughness

//Bump Map (Inner Side Of Torus)
const BUMP_REPEAT_X = 6 //How many times the text repeats around the ring
const BUMP_REPEAT_Y = 3 //Higher = thinner text band around the tube, keep above 1 so text stays on the inner side only
const BUMP_TEXTURE = await LOADER.loadAsync(HEIGHTMAP_URL)
BUMP_TEXTURE.wrapS = THREE.RepeatWrapping
BUMP_TEXTURE.repeat.set(BUMP_REPEAT_X, BUMP_REPEAT_Y)
BUMP_TEXTURE.offset.set(0, 0.5 * (1 - BUMP_REPEAT_Y)) //TorusGeometry inner side sits at v = 0.5, this centers the text band there

const updateBumpScale = () => {
    const bumpDirection = PARAMS.bumpMode == 'Dent' ? -1 : 1 //Negative bumpScale inverts the relief
    MATCAP.bumpScale = PARAMS.matcapBumpScale * bumpDirection
    STANDARD.bumpScale = STANDARD_PARAMS.bumpScale * bumpDirection
}

MATCAP.bumpMap = BUMP_TEXTURE
STANDARD.bumpMap = BUMP_TEXTURE
updateBumpScale()

DEBUG.addBinding(PARAMS, 'bumpMode', {
    label: 'Text Relief',
    options: {
        'Dent': 'Dent',
        'Embossed': 'Embossed'
    }
}).on('change', updateBumpScale)

const HALO = new THREE.Mesh( GEOMETRY, MATCAP )
SCENE.add(HALO)


//Standard Material
const STANDARD_DEBUG = DEBUG.addFolder({title: 'Physical Material'})
STANDARD_DEBUG.hidden = true

STANDARD_DEBUG.addBinding(STANDARD_PARAMS, 'color', {
  view: 'color',
  label: 'Base Color'
}).on('change', (ev) => {
    STANDARD.color.set(STANDARD_PARAMS.color)
})

STANDARD_DEBUG.addBinding(STANDARD_PARAMS, 'metalness', {
  min: 0,
  max: 1,
  step: 0.01
}).on('change', (ev) => {
    STANDARD.metalness = STANDARD_PARAMS.metalness
})

STANDARD_DEBUG.addBinding(STANDARD_PARAMS, 'roughness', {
  min: 0,
  max: 1,
  step: 0.01
}).on('change', (ev) => {
    STANDARD.roughness = STANDARD_PARAMS.roughness
})

STANDARD_DEBUG.addBinding(STANDARD_PARAMS, 'bumpScale', {
  min: 0,
  max: 10,
  step: 0.1,
  label: 'Bump Scale'
}).on('change', updateBumpScale)

//HDRI Environment Maps (Standard Material only, lazy-loaded to avoid blocking startup)
const HDR_LOADER = new HDRLoader()
const HDRI_FILES = import.meta.glob('/assets/hdri/*.hdr', { query: '?url', import: 'default' })
const HDRI_PATHS = Object.keys(HDRI_FILES)
const HDRI_TEXTURE_CACHE = {}

const loadHdriTexture = async (index) => {
    if (HDRI_TEXTURE_CACHE[index]) return HDRI_TEXTURE_CACHE[index]

    const path = await HDRI_FILES[HDRI_PATHS[index]]()
    const texture = await HDR_LOADER.loadAsync(path)
    texture.mapping = THREE.EquirectangularReflectionMapping

    HDRI_TEXTURE_CACHE[index] = texture
    return texture
}

STANDARD.envMap = await loadHdriTexture(0)
STANDARD.envMapIndex = 0

STANDARD_DEBUG.addBinding(STANDARD, 'envMapIndex', {
  options: Object.fromEntries(
    HDRI_PATHS.map((path, index) => [path.split('/').pop().replace('.hdr', ''), index])
  ),
  label: 'Environment'
}).on('change', async (ev) => {
    STANDARD.envMap = await loadHdriTexture(ev.value)
    STANDARD.needsUpdate = true
})

//MATCAP SETTINGS
const MATCAP_DEBUG = DEBUG.addFolder({ title: 'Matcap Material'})
MATCAP_DEBUG.hidden = false

MATCAP_DEBUG.addBinding(PARAMS, 'color', {
  view: 'color',
  label: 'Base Color'
}).on('change', (ev) => {
    console.log(PARAMS.color.toString(16))
    MATCAP.color.set(PARAMS.color)
})

MATCAP_DEBUG.addBinding(MATCAP, 'matcapIndex', {
  options: Object.fromEntries(
    MATCAP_PATHS.map((path, index) => [path.split('/').pop().replace('.png', ''), index])
  ),
  label: 'Texture'
}).on('change', (ev) => {
    MATCAP_TEXTURES[ev.value].colorSpace = THREE.SRGBColorSpace
    MATCAP.matcap = MATCAP_TEXTURES[ev.value]
    MATCAP.needsUpdate = true
})

MATCAP_DEBUG.addBinding(PARAMS, 'matcapBumpScale', {
  min: 0,
  max: 10,
  step: 0.1,
  label: 'Bump Scale'
}).on('change', updateBumpScale)

//CHANGE MATERIAL
DEBUG.addBinding(PARAMS, 'material', {
    index: 1,
    label: 'Gold Type',
    options: {
        'Physical' : 'Physical',
        'Matcap' : 'Matcap'
    }
}).on('change', (ev) => {
    STANDARD_DEBUG.hidden = ev.value !== 'Physical'
    MATCAP_DEBUG.hidden = ev.value !== 'Matcap'

    if (ev.value == 'Physical') {
        HALO.material = STANDARD
    }

    if (ev.value == 'Matcap') {
        HALO.material = MATCAP
    }
})


//Scroll Scrub
const IDLE_AMPLITUDE = 0.12 //Radians, how far the idle wave tilts the ring on X
const IDLE_PERIOD = 3 //Seconds for one swing in a single direction
const SCROLL_CATCH_UP_SPEED = 3 //How fast the animation catches up to the real scroll position, per second, lower = lazier trailing

//Poses the ring moves between, first guesses - tune them live in the Poses folder of Tweakpane
const POSES = {
    rest: { rotationX: Math.PI / 8, positionY: 0, positionZ: 0 }, //Starts tilted 45 degrees on X
    near: { rotationX: 0.1, positionY: 85, positionZ: 10 }, //Close to camera and pushed down the screen so only the top of the ring shows, like an arch
    logo: { rotationX: Math.PI / 4, positionY: -80, positionZ: -115 } //Small and far at the top like a header logo
}

//Timeline in viewport heights of scroll. Each keyframe holds a pose and the total full X flips done so far
//Values between two keyframes are interpolated, so a short gap between keyframes makes a fast move
//The idle wave is added on top of whatever the timeline says, so it never stops and scroll moves continue from the current idle tilt
const TIMELINE = [
    { scroll: 0, pose: 'rest', spinTurns: 0 },
    { scroll: 0.25, pose: 'rest', spinTurns: 0 },
    { scroll: 0.75, pose: 'rest', spinTurns: 1 }, //First spin, middle of the first 100vh - a longer scroll range makes it slower
    { scroll: 2.7, pose: 'near', spinTurns: 2 }, //Moves closer to the camera
    { scroll: 3.2, pose: 'near', spinTurns: 2 }, //Holds for 50vh
    { scroll: 4.0, pose: 'logo', spinTurns: 2 } //Moves back and up to the header
]

const POSE = { rotationX: 0, positionY: 0, positionZ: 0, spin: 0, idleWave: 0 } //Written by applyTimelineAtScroll() every frame, idleWave is looped by Motion

const SCROLL_SPACER = document.querySelector('.scroll_spacer')
SCROLL_SPACER.style.height = `${(TIMELINE[TIMELINE.length - 1].scroll + 1) * 100}vh` //Scroll length follows the timeline, plus the one viewport height a page can never scroll past

let smoothedScroll = window.scrollY / window.innerHeight

const applyTimelineAtScroll = (scrolledViewports) => {
    let segmentStart = TIMELINE[0]
    let segmentEnd = TIMELINE[0]

    for (let index = 0; index < TIMELINE.length - 1; index++) {
        if (scrolledViewports < TIMELINE[index].scroll) break
        segmentStart = TIMELINE[index]
        segmentEnd = TIMELINE[index + 1]
    }

    const segmentLength = segmentEnd.scroll - segmentStart.scroll
    const linearProgress = segmentLength > 0 ? THREE.MathUtils.clamp((scrolledViewports - segmentStart.scroll) / segmentLength, 0, 1) : 1
    const easedProgress = THREE.MathUtils.smootherstep(linearProgress, 0, 1)

    const startPose = POSES[segmentStart.pose]
    const endPose = POSES[segmentEnd.pose]

    POSE.rotationX = THREE.MathUtils.lerp(startPose.rotationX, endPose.rotationX, easedProgress)
    POSE.positionY = THREE.MathUtils.lerp(startPose.positionY, endPose.positionY, easedProgress)
    POSE.positionZ = THREE.MathUtils.lerp(startPose.positionZ, endPose.positionZ, easedProgress)
    POSE.spin = THREE.MathUtils.lerp(segmentStart.spinTurns, segmentEnd.spinTurns, easedProgress) * Math.PI * 2
}

animate(POSE, { idleWave: [-1, 1] }, { duration: IDLE_PERIOD, repeat: Infinity, repeatType: 'mirror', ease: 'easeInOut' })

//Pose Tuning
const POSES_DEBUG = DEBUG.addFolder({ title: 'Poses', expanded: false })

Object.entries(POSES).forEach(([poseName, pose]) => {
    const poseFolder = POSES_DEBUG.addFolder({ title: poseName, expanded: false })
    poseFolder.addBinding(pose, 'rotationX', { min: -Math.PI, max: Math.PI, step: 0.01 })
    poseFolder.addBinding(pose, 'positionY', { min: -200, max: 95, step: 1 })
    poseFolder.addBinding(pose, 'positionZ', { min: -200, max: 200, step: 1 })
})

//Animation Loop Function
const tick = () => {
    FPS.begin()

    TIMER.update()
    const FRAME_SECONDS = TIMER.getDelta() //Seconds since the last frame, keeps the scroll catch-up the same speed on any refresh rate

    //Cursor Parallax
    LOOK_TARGET.x = THREE.MathUtils.lerp(LOOK_TARGET.x, MOUSE.x * PARALLAX_STRENGTH, PARALLAX_DAMPING)
    LOOK_TARGET.z = THREE.MathUtils.lerp(LOOK_TARGET.z, MOUSE.y * PARALLAX_STRENGTH, PARALLAX_DAMPING)
    CAMERA.lookAt(LOOK_TARGET)


    //Scroll Scrub
    smoothedScroll = THREE.MathUtils.damp(smoothedScroll, window.scrollY / window.innerHeight, SCROLL_CATCH_UP_SPEED, FRAME_SECONDS)
    applyTimelineAtScroll(smoothedScroll)

    HALO.rotation.x = POSE.rotationX + POSE.spin + POSE.idleWave * IDLE_AMPLITUDE
    HALO.position.set(0, POSE.positionY, POSE.positionZ)

    //Render Function
    RENDERER.render(SCENE, CAMERA) //by default all objects will appear at center of the scene in 0 0 0 coordinates, meaning camera will be at the center too

    FPS.end()
}

RENDERER.setAnimationLoop(tick) //Replaces requestAnimationFrame - WebGPURenderer drives its own frame loop since rendering is async



//Resize Function
window.addEventListener('resize', () => {

    //Update Sizes
    SIZES.width = window.innerWidth
    SIZES.height = window.innerHeight

    //Update Camera
    CAMERA.aspect = SIZES.width / SIZES.height
    CAMERA.updateProjectionMatrix() // Update Camera

    RENDERER.setSize(SIZES.width, SIZES.height) //Update Renderer - Better put here so user when moving windows from screen to screen would recieve better expirience

})
