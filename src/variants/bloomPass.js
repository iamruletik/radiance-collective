import { QuadMesh, NodeMaterial, CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three/webgpu'
import { dot, floor, fract, screenCoordinate, vec2, pass, vec3, vec4, max, min } from 'three/tsl'
import { bloom } from 'three/addons/tsl/display/BloomNode.js'

export default function bloomPass(stage, dither = false) {
    let { renderer, scene, camera } = stage
    //Scene into a texture, bloom added back, drawn over whatever is already on the canvas (the clouds)
    const scenePass = pass(scene, camera).getTextureNode()
    let glow = bloom(scenePass)

    //The canvas sits on the page with premultiplied alpha, so light needs coverage to show there:
    //glow at alpha = its brightest channel lands on the page as a screen blend, ring and glow clamped to stay valid
    const glowAlpha = min(max(glow.r, max(glow.g, glow.b)), 1)
    const alpha = scenePass.a.add(glowAlpha.mul(scenePass.a.oneMinus()))
    const color = min(scenePass.rgb.mul(scenePass.a).add(glow.rgb), vec3(alpha))

    let output = new QuadMesh(new NodeMaterial())
    let composite = vec4(color, alpha)
    if (dither) {
        // Round premultiplied colour and coverage together at the output pixel.
        let threshold = fract(fract(dot(floor(screenCoordinate.xy), vec2(0.06711056, 0.00583715))).mul(52.9829189))
        composite = floor(composite.mul(255).add(threshold)).div(255)
    }
    output.material.fragmentNode = composite
    Object.assign(output.material, {
        transparent: true, depthTest: false, depthWrite: false,
        blending: CustomBlending, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor //Premultiplied by hand above
    })
    stage.renderScene = () => output.render(renderer)
    return glow
}
