import { Mesh, MeshBasicNodeMaterial, PlaneGeometry } from 'three/webgpu'
import { abs, color, cos, dot, exp, max, mix, normalView, positionLocal, positionViewDirection, sin, smoothstep, time, uv, vec3 } from 'three/tsl'
import bloomPass from './bloomPass.js'

const DRIFT_SPEED = 0.22
const SPILL_OPACITY = 0.25

export default class ResinLook {
    constructor(stage, halo) {
        this.stage = stage
        this.halo = halo
    }

    setup() {
        let { material, reveal } = this.halo
        let phase = time.mul(DRIFT_SPEED)
        let palette = (x, y) => {
            let field = x.mul(0.54).add(y.mul(0.28)).add(sin(phase).mul(0.55))
            let cool = mix(color('#87cbd6'), color('#f2bb9e'), smoothstep(-0.7, 0.1, field))
            let warm = mix(color('#ffd574'), color('#ff7154'), smoothstep(0.18, 0.85, field))
            return mix(cool, warm, smoothstep(-0.12, 0.36, field))
        }
        let point = positionLocal.div(this.halo.radius)
        let sweep = this.halo.sweep(reveal.progress)
        let facing = abs(dot(normalView, positionViewDirection))
        let resin = palette(point.x, point.y.add(normalView.y.mul(0.4)))
        let diffuse = mix(resin, color('#f3daca'), facing.oneMinus().mul(0.20))
        material.colorNode = vec3(0)
        material.emissiveNode = diffuse.mul(facing.mul(0.35).add(0.82)).mul(sweep.covered)
            .add(reveal.edgeColor.mul(reveal.edgeIntensity).mul(sweep.edge))
        material.needsUpdate = true

        let coordinates = uv().sub(0.5).mul(2)
        let spillMaterial = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false })
        spillMaterial.colorNode = palette(coordinates.x, cos(phase).mul(0.12).sub(0.5))
        spillMaterial.opacityNode = exp(dot(coordinates, coordinates).mul(-4))
            .mul(smoothstep(0, 0.18, max(abs(coordinates.x), abs(coordinates.y)).oneMinus()))
            .mul(reveal.progress).mul(SPILL_OPACITY)
        this.spill = new Mesh(new PlaneGeometry(1, 1), spillMaterial)
        this.stage.scene.add(this.spill)
        let glow = bloomPass(this.stage)
        glow.strength.value = 0.19
        glow.radius.value = 0.48
        glow.threshold.value = 0.78
        document.documentElement.style.backgroundColor = '#b6b4b8'
        document.body.style.background = 'linear-gradient(105deg, #aabcc2, #b8b6ba 53%, #c1b0b4) fixed'
        this.update()
    }

    update() {
        let { mesh, radius } = this.halo
        let width = radius.value * mesh.scale.x
        this.spill.position.copy(mesh.position)
        this.spill.quaternion.copy(this.stage.camera.quaternion)
        this.spill.translateY(-width * (Math.abs(Math.sin(mesh.rotation.x)) + 0.16))
        this.spill.translateZ(-width * 1.2)
        this.spill.scale.set(width * 3.4, width * 0.82, 1)
    }
}

