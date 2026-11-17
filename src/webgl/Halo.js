import { Mesh, BufferGeometry, TorusGeometry, MeshMatcapNodeMaterial, TextureLoader, DataTexture, Color, Vector2, SRGBColorSpace, RedFormat, LinearFilter, LinearMipmapLinearFilter } from 'three/webgpu'
import { uniform, positionLocal, uv, vec2, vec3, vec4, atan, abs, floor, fract, mix, step, PI, time, smoothstep, mx_noise_float, materialColor, texture, normalMap } from 'three/tsl'

//Smooth (B-spline bicubic) texture read from four bilinear taps. Plain bilinear height steps once per texel, which shows as facets up close
const cubicWeights = t => {
    const cube = vec4(1, 2, 3, 4).sub(t).pow(3)
    const x = cube.x, y = cube.y.sub(cube.x.mul(4)), z = cube.z.sub(cube.y.mul(4)).add(cube.x.mul(6))
    return vec4(x, y, z, x.add(y).add(z).negate().add(6)).div(6)
}

const bicubic = (map, coordinate, size) => {
    const texel = coordinate.mul(size).sub(0.5), base = floor(texel), local = fract(texel)
    const weightsX = cubicWeights(local.x), weightsY = cubicWeights(local.y)
    const sums = vec4(weightsX.x.add(weightsX.y), weightsX.z.add(weightsX.w), weightsY.x.add(weightsY.y), weightsY.z.add(weightsY.w))
    const offsets = vec4(base.x.sub(0.5), base.x.add(1.5), base.y.sub(0.5), base.y.add(1.5))
        .add(vec4(weightsX.y, weightsX.w, weightsY.y, weightsY.w).div(sums)).div(vec4(size.x, size.x, size.y, size.y))
    const tap = (x, y) => texture(map, vec2(x, y)).r
    const blendX = sums.x.div(sums.x.add(sums.y)), blendY = sums.z.div(sums.z.add(sums.w))
    return mix(mix(tap(offsets.y, offsets.w), tap(offsets.x, offsets.w), blendX), mix(tap(offsets.y, offsets.z), tap(offsets.x, offsets.z), blendX), blendY)
}
import reliefUrl from '/assets/normals/heightmap-example.jpg'
import { bevelHeight } from './bevel.js'

//Only URLs are bundled, so just the chosen matcap downloads. The rest in /backup stay for the designer to compare
const MATCAPS = Object.fromEntries(
    Object.entries(import.meta.glob('/assets/matcap/**/*.png', { query: '?url', import: 'default', eager: true }))
        .map(([path, url]) => [path.split('/').pop().replace('.png', ''), url])
)
export const matcapNames = Object.keys(MATCAPS)

//The gold ring: generated torus, matcap, and two sweeps across it: black to gold (preloader), and the text relief burning in (slider)
export default class Halo {
    constructor(settings) {
        this.settings = settings
        this.loader = new TextureLoader()
        this.material = new MeshMatcapNodeMaterial()
        this.mesh = new Mesh(new BufferGeometry(), this.material)
        this.radius = uniform(1)
        this.reveal = {
            progress: uniform(0),
            edgeColor: uniform(new Color()),
            edgeIntensity: uniform(0),
            edgeWidth: uniform(0),
            edgeSoftness: uniform(0),
            noiseScale: uniform(0),
            noiseSpeed: uniform(0),
            noiseStrength: uniform(0)
        }
        this.relief = {
            progress: uniform(0),
            strength: uniform(0),
            center: uniform(0),
            span: uniform(1),
            band: uniform(1),
            size: uniform(new Vector2(1, 1)),
            texel: uniform(new Vector2())
        }
    }

    //The shape is generated, so the silhouette renders at once. `loaded` resolves when the textures arrive and the relief is built
    setup() {
        const relief = this.loader.loadAsync(reliefUrl).then(({ image }) => {
            this.reliefImage = image
            this.bevelRelief()
            this.setupRelief()
            this.fitRelief()
        })
        this.loaded = Promise.all([relief, this.loadMatcap(this.settings.matcap)])
        this.setupShading()
        this.refresh()
    }

    setupShading() {
        const { edgeColor, edgeIntensity, edgeWidth, edgeSoftness, noiseScale, noiseSpeed, noiseStrength } = this.reveal

        //Sweep field: 0 on one side of the ring, 1 on the other, roughened by noise
        const point = positionLocal.div(this.radius)
        const noise = mx_noise_float(point.mul(noiseScale).add(time.mul(noiseSpeed)), 0.5, 0.5)
        const field = abs(atan(point.y, point.x)).div(PI).add(noise.mul(noiseStrength))
        const margin = edgeWidth.add(edgeSoftness)
        this.sweep = progress => {
            const front = progress.mul(noiseStrength.add(1).add(margin.mul(2))).sub(margin) //Starts before the field and ends past it, so 0 is none and 1 all
            return { covered: smoothstep(front.sub(edgeSoftness), front, field).oneMinus(), edge: smoothstep(0, edgeWidth, abs(field.sub(front))).oneMinus() }
        }

        //Black where the gold sweep hasn't passed, a molten glow on its front
        const gold = this.sweep(this.reveal.progress)
        this.material.colorNode = materialColor.mul(gold.covered)
        this.material.emissiveNode = edgeColor.mul(edgeIntensity).mul(gold.edge)
    }

    //Text relief, once round the ring at `center`, as a normal map from neighbouring samples of the bevelled heightmap:
    //smooth at any zoom, unlike bump mapping's per-pixel derivatives. Built once the heightmap is in, so it compiles during the preloader
    setupRelief() {
        const { strength, center, span, band, size, texel } = this.relief
        const around = fract(uv().x.sub(center).add(0.5)).sub(0.5).div(span).add(0.5) //0..1 across the text, wrapping round the ring
        //The torus inner side sits at v = 0.5, the band centers there. Flipped: the bevelled pixels run top-down, textures read bottom-up
        const reliefUV = vec2(around, uv().y.sub(0.5).div(band).add(0.5).oneMinus())
        const height = shift => bicubic(this.reliefTexture, reliefUV.add(shift), size)
        const slope = vec2(height(vec2(texel.x, 0)).sub(height(vec2(texel.x.negate(), 0))), height(vec2(0, texel.y)).sub(height(vec2(0, texel.y.negate()))))
        const onText = step(0, around).mul(step(around, 1))
        const engraved = this.sweep(this.relief.progress).covered.mul(onText)
        this.material.normalNode = normalMap(vec3(slope.mul(strength).mul(engraved).negate(), 1).mul(0.5).add(0.5))
        this.material.needsUpdate = true
    }

    refresh() {
        const { matcap, color, radius, tube, radialSegments, tubularSegments } = this.settings

        this.mesh.geometry.dispose()
        this.mesh.geometry = new TorusGeometry(radius, tube, radialSegments, tubularSegments)
        this.radius.value = radius
        this.material.color.set(color)
        if (matcap != this.matcapName) this.loadMatcap(matcap)

        if (!this.reliefImage) return
        if (this.settings.reliefBevel != this.reliefBevel) this.bevelRelief()
        this.fitRelief()
    }

    //Helpers
    //The heightmap's hard edges blurred into ramps, same texture rewritten when the bevel changes
    bevelRelief() {
        const { data, width, height } = bevelHeight(this.reliefImage, this.settings.reliefBevel)
        if (this.reliefTexture) this.reliefTexture.image.data.set(data)
        else this.reliefTexture = Object.assign(new DataTexture(data, width, height, RedFormat), { magFilter: LinearFilter, minFilter: LinearMipmapLinearFilter, generateMipmaps: true })
        this.reliefTexture.needsUpdate = true
        this.reliefBevel = this.settings.reliefBevel
    }

    //Band is the share of the tube the text covers. Its width round the ring follows from the image's aspect, so it never stretches
    fitRelief() {
        const { radius, tube, relief, reliefScale, reliefSoftness, reliefCenter, reliefBand } = this.settings
        const { width, height } = this.reliefImage
        this.relief.strength.value = reliefScale * (relief == 'dent' ? -1 : 1) //Negative strength inverts the relief
        this.relief.center.value = reliefCenter
        this.relief.band.value = reliefBand
        this.relief.span.value = width / height * reliefBand * tube / (radius - tube) //Inner side's circumference vs the tube's, both × 2π
        this.relief.size.value.set(width, height)
        this.relief.texel.value.set(reliefSoftness / width, reliefSoftness / height) //Slope sampled this many texels apart
    }

    //The texture exists at once so the shader compiles once, its image fills in on arrival
    loadTexture(url) {
        let texture
        const loaded = new Promise((resolve, reject) => { texture = this.loader.load(url, resolve, undefined, reject) })
        return { texture, loaded }
    }

    loadMatcap(name) {
        const { texture, loaded } = this.loadTexture(MATCAPS[name])
        texture.colorSpace = SRGBColorSpace
        this.material.matcap?.dispose()
        this.material.matcap = texture
        this.material.needsUpdate = true
        this.matcapName = name
        return loaded
    }

    destroy() {
        this.mesh.removeFromParent()
        this.mesh.geometry.dispose()
        this.material.matcap?.dispose()
        this.reliefTexture?.dispose()
        this.material.dispose()
    }
}
