import { MathUtils, Vector2, Vector3 } from 'three/webgpu'
import { abs, color, cos, dot, sin, time, vec2, max, mix, modelViewMatrix, normalize, positionGeometry, positionLocal,
    normalView, positionViewDirection, smoothstep, uniform, vec3, vec4 } from 'three/tsl'
import SolarBackground from './SolarBackground.js'
import bloomPass from './bloomPass.js'

const ORBIT_SECONDS = 24
const ORBIT_GAIN = 0.38
const POINTER_RESPONSE = 7

export default class SolarLook {
    static tubeScale = 0.26

    constructor(stage, halo, slider) {
        this.stage = stage
        this.halo = halo
        this.slider = slider
        this.thickness = uniform(1)
        this.source = new Vector3()
        this.center = new Vector3()
        this.sample = new Vector3()
        this.direction = uniform(new Vector2(0, -1))
        this.angle = -Math.PI / 2
    }

    setup() {
        document.documentElement.classList.add('solar-look')
        this.spill = document.createElement('div')
        this.spill.className = 'solar-spill'
        this.spill.setAttribute('aria-hidden', 'true')
        document.body.append(this.spill)
        this.background = new SolarBackground()
        this.background.setup()
        let { material, radius, reveal } = this.halo
        let spine = vec3(normalize(positionGeometry.xy).mul(radius), 0)
        material.positionNode = spine.add(positionGeometry.sub(spine).mul(this.thickness))
        let radial = normalize(positionLocal.xy)
        let center = modelViewMatrix.mul(vec4(radial.mul(radius), 0, 1)).xyz
        let origin = modelViewMatrix.mul(vec4(0, 0, 0, 1)).xyz
        let projected = center.xy.div(max(center.z.negate(), 0.001)).sub(origin.xy.div(max(origin.z.negate(), 0.001)))
        let alignment = dot(projected.div(max(projected.length(), 0.0001)), this.direction)
        let flare = smoothstep(0.12, 1, alignment).pow(1.5)
        let phase = time.mul(2 * Math.PI / ORBIT_SECONDS)
        let orbit = smoothstep(-0.65, 1, dot(radial, vec2(cos(phase), sin(phase))))
        let facing = abs(dot(normalView, positionViewDirection))
        let sweep = this.halo.sweep(reveal.progress)
        let centerColor = mix(color('#ff987d'), color('#fff2c2'), flare)
        let edgeColor = mix(color('#ff724e'), color('#ffb184'), flare)
        let solarColor = mix(centerColor, edgeColor, smoothstep(0, 0.85, facing.oneMinus()))
        let rim = smoothstep(0.08, 0.42, facing).oneMinus()
        let rimColor = mix(color('#c75d43'), color('#e99065'), flare)
        let emission = mix(solarColor, rimColor, rim).mul(flare.mul(2.8).add(1.65).add(orbit.mul(ORBIT_GAIN)))
        material.colorNode = vec3(0)
        material.emissiveNode = emission.mul(facing.mul(0.15).add(0.85)).mul(sweep.covered)
            .add(reveal.edgeColor.mul(reveal.edgeIntensity).mul(sweep.edge))
        material.needsUpdate = true
        let glow = bloomPass(this.stage, true)
        glow.strength.value = 0.54
        glow.radius.value = 0.78
        glow.threshold.value = 0.68
    }

    update(delta) {
        this.background.update()
        let { pointer, camera } = this.stage
        let target = pointer.mouse && Math.hypot(pointer.x, pointer.y) > 0.02
            ? Math.atan2(-pointer.y, pointer.x * camera.aspect) : -Math.PI / 2
        let difference = target - this.angle
        this.angle += MathUtils.damp(0, Math.atan2(Math.sin(difference), Math.cos(difference)), POINTER_RESPONSE, delta)
        this.direction.value.set(Math.cos(this.angle), Math.sin(this.angle))
        this.thickness.value = 1 + 1.4 * (this.slider.visibility || 0)
        this.updateSpill(camera)
    }

    updateSpill(camera) {
        let { mesh, radius, reveal } = this.halo
        mesh.updateWorldMatrix(true, false)
        camera.updateMatrixWorld()
        this.center.setFromMatrixPosition(mesh.matrixWorld).project(camera)
        let best = -Infinity
        let samples = 64
        for (let index = 0; index < samples; index++) {
            let angle = index * Math.PI * 2 / samples
            this.sample.set(Math.cos(angle) * radius.value, Math.sin(angle) * radius.value, 0)
                .applyMatrix4(mesh.matrixWorld).project(camera)
            if (Math.abs(this.sample.z) > 1) continue
            let x = (this.sample.x - this.center.x) * camera.aspect
            let y = this.sample.y - this.center.y
            let score = (this.direction.value.x * x + this.direction.value.y * y) / Math.max(Math.hypot(x, y), 0.0001)
            if (score > best) {
                best = score
                this.source.copy(this.sample)
            }
        }
        this.spill.style.opacity = best > -Infinity ? reveal.progress.value : 0
        let x = (1 + this.source.x) * this.stage.canvas.clientWidth / 2
        let y = (1 - this.source.y) * this.stage.height / 2
        this.spill.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`
    }
}
