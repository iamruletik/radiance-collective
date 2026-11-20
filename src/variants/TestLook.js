import { QuadMesh, NodeMaterial, Color, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three/webgpu'
import { pass, uniform, vec3, vec4, max, min, mix, pow, abs, dot, normalView, positionViewDirection } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

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
        const { renderer, scene, camera } = this.stage
        const { material, reveal } = this.halo

        //Like a neon tube: the core colour where the tube faces you, warming to the edge colour toward its silhouette
        const facing = abs(dot(normalView, positionViewDirection))
        const tube = mix(this.edgeColor, this.coreColor, pow(facing, this.falloff))
        const light = this.halo.sweep(reveal.progress)
        material.colorNode = vec3(0)
        material.emissiveNode = tube.mul(this.glow).mul(light.covered).add(reveal.edgeColor.mul(reveal.edgeIntensity).mul(light.edge))
        material.needsUpdate = true

        //Scene into a texture, bloom added back, drawn over whatever is already on the canvas (the clouds)
        const scenePass = pass(scene, camera).getTextureNode()
        this.bloom = bloom(scenePass)

        //The canvas sits on the page with premultiplied alpha, so light needs coverage to show there:
        //glow at alpha = its brightest channel lands on the page as a screen blend, ring and glow clamped to stay valid
        const glowAlpha = min(max(this.bloom.r, max(this.bloom.g, this.bloom.b)), 1)
        const alpha = scenePass.a.add(glowAlpha.mul(scenePass.a.oneMinus()))
        const color = min(scenePass.rgb.mul(scenePass.a).add(this.bloom.rgb), vec3(alpha))

        this.output = new QuadMesh(new NodeMaterial())
        this.output.material.fragmentNode = vec4(color, alpha)
        Object.assign(this.output.material, {
            transparent: true, depthTest: false, depthWrite: false,
            blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor //Premultiplied by hand above
        })
        this.stage.renderScene = () => this.output.render(renderer)

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
