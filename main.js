import * as THREE from 'three'
import { Pane } from 'tweakpane'
import * as EssentialsPlugin from '@tweakpane/plugin-essentials'

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
const RENDERER = new THREE.WebGLRenderer({ canvas: CANVAS, powerPreference: "high-performance", encoding: THREE.sRGBEncoding, alpha: true })
RENDERER.setSize(window.innerWidth, window.innerHeight)
RENDERER.setPixelRatio(window.devicePixelRatio)
RENDERER.shadowMap.enabled = true
RENDERER.shadowMap.type = THREE.PCFShadowMap
RENDERER.toneMapping = THREE.ACESFilmicToneMapping
RENDERER.setClearColor(0x000000, 0)
RENDERER.setSize(SIZES.width, SIZES.height)

//Clock
const TIMER = new THREE.Timer()
TIMER.connect(document)

//Scene
const SCENE = new THREE.Scene()

//Camera
const CAMERA = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight) // FOV vertical angle, aspect ratio with/height
CAMERA.position.set(0, 75, 0)
SCENE.add(CAMERA)

//Texture Loader
const LOADER = new THREE.TextureLoader()

//Torus Model
const GEOMETRY = new THREE.TorusGeometry( 20, 3, 64, 100 )
let MATCAP_TEXTURES = {
    goldA: await LOADER.loadAsync('/assets/matcap/matcap-gold.png'),
    goldB: await LOADER.loadAsync('/assets/matcap/matcap-gold-2.png'),
}
const MATCAP = new THREE.MeshMatcapMaterial({ matcap: MATCAP_TEXTURES.goldB })
MATCAP.currentMatCapName = 'goldB'

const HALO = new THREE.Mesh( GEOMETRY, MATCAP )
SCENE.add(HALO)

DEBUG.addBinding(MATCAP, 'currentMatCapName', {
  options: {
    'Gold 1': 'goldA',
    'Gold 2': 'goldB',
  },
  label: 'Texture'
}).on('change', (ev) => {
    MATCAP.matcap = MATCAP_TEXTURES[ev.value]
    MATCAP.needsUpdate = true
})


//Animation Loop Function
const tick = () => {
    FPS.begin()

    console.log(TIMER.getDelta())
    CAMERA.lookAt(new THREE.Vector3()) //Empty Vector3 method resul in 0 0 0  Vector, basically center of the scene


    HALO.rotation.x += 0.01
    HALO.rotation.z += 0.01

    //Render Function
    RENDERER.render(SCENE, CAMERA);//by default all objects will appear at center of the scene in 0 0 0 coordinates, meaning camera will be at the center too

    //Request next frame
    FPS.end()
    window.requestAnimationFrame(tick) // requestAnimationFrame purpose is to call a function on the next frame, thus we will need to call this function each frame
}

tick()



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
