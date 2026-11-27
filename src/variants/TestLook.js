import { Color } from 'three/webgpu'
import { uniform, vec3, mix, pow, abs, dot, normalView, positionViewDirection } from 'three/tsl'
import bloomPass from './bloomPass.js'

//Experimental look, loaded only with ?test. The live site never imports this file
//A halo of light instead of gold: a glowing tube, still revealed by the preloader sweep, with bloom spilling over the page
//To drop it: delete src/variants/ and the `test` lines in main.js
export default class TestLook {
    constructor(stage, halo, settings) {
        this.stage = stage
        this.halo = halo
        this.settings = settings
        this.coreColor = uniform(new Color())
        this.edgeColor = uniform(new Color())
        this.falloff = uniform(1)
        this.glow = uniform(1)
    }

    setup() {
        const { material, reveal } = this.halo

        //Like a neon tube: the core colour where the tube faces you, warming to the edge colour toward its silhouette
        const facing = abs(dot(normalView, positionViewDirection))
        const tube = mix(this.edgeColor, this.coreColor, pow(facing, this.falloff))
        const light = this.halo.sweep(reveal.progress)
        material.colorNode = vec3(0)
        material.emissiveNode = tube.mul(this.glow).mul(light.covered).add(reveal.edgeColor.mul(reveal.edgeIntensity).mul(light.edge))
        material.needsUpdate = true

        this.bloom = bloomPass(this.stage)
        this.refresh()
    }

    refresh() {
        const { background, coreColor, edgeColor, falloff, glowIntensity, bloomStrength, bloomRadius, bloomThreshold } = this.settings
        document.documentElement.style.background = document.body.style.background = background
        this.coreColor.value.set(coreColor)
        this.edgeColor.value.set(edgeColor)
        this.falloff.value = falloff
        this.glow.value = glowIntensity
        this.bloom.strength.value = bloomStrength
        this.bloom.radius.value = bloomRadius
        this.bloom.threshold.value = bloomThreshold
    }
}
