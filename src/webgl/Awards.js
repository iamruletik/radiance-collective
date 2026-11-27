import {
    AmbientLight, CanvasTexture, CatmullRomCurve3, CubicBezierCurve3, DirectionalLight, DoubleSide, Group, InstancedMesh, MathUtils, Mesh, MeshBasicMaterial,
    MeshStandardMaterial, PlaneGeometry, PointLight, SphereGeometry, SRGBColorSpace, TextureLoader, TubeGeometry, Vector3
} from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import leafUrl from '/assets/images/leaf-texture-01.png'

import leafNormalUrl from '/assets/images/leaf-texture-01-normal.png'

const DRUM_SCALE = 1.2
const LAUREL_INSET = 20
const LAUREL_SCALE = 1.12
const PATH_SCALE = 0.09
const LAUREL_DROP = 3.4
const LAUREL_DEPTH = 26
const POINTER_BEND = 0.055
const POINTER_RESPONSE = 9
const POINTER_BRANCH_SHARE = 0.12
const BRANCH_SWAY = 0.009
const SHADOW_WIDTH = 68
const SHADOW_SOFTNESS = 3
const LEAF_COUNT = 32
const BUD_SITES = new Set([4, 8, 12, 16, 20, 24])
const LEAF_OUTLINE_SEGMENTS = 40
const LAUREL_SEED = 7823
const STEM_INTERVALS = 15
const STEM_WANDER = 0.38
const FONT_SIZE = 6.4
const ROW_PITCH = 7.1
const REPEATS = 2
const TEXT_DENSITY = 24
const COMPOSITION_WIDTH = 132
const SCENE_DEPTH = 4000
const STEM_BASE_RADIUS = 0.46
const STEM_TIP_RADIUS = 0.08

export default class Awards {
    constructor(element, { stage, solar, haloTimeline, getScroll }) {
        this.element = element
        this.stage = stage
        this.solar = solar
        this.timeline = haloTimeline
        this.getScroll = getScroll
        this.group = new Group()
        this.drum = new Group()
        this.drum.scale.setScalar(DRUM_SCALE)
        this.group.add(this.drum)
        this.group.visible = false
        this.leaves = []
        this.pointerBendX = 0
        this.pointerBendY = 0
        this.textures = []
        this.velocity = 0
    }

    setup() {
        this.stage.scene.add(this.group)
        this.stage.add(this)
        this.resize()
        this.buildLaurels()
        document.fonts.load('500 64px "Helvetica Now Display"').catch(() => {}).then(() => {
            if (this.destroyed) return
            this.buildDrum()
            this.group.position.copy(this.stage.camera.position)
            this.group.quaternion.copy(this.stage.camera.quaternion)
            this.group.translateZ(-SCENE_DEPTH)
            this.group.visible = true
            this.stage.renderer.compileAsync(this.stage.scene, this.stage.camera).catch(error => console.warn('Awards shader preparation failed', error))
            this.group.visible = false
        })
    }

    resize() {
        let rootRem = parseFloat(getComputedStyle(document.documentElement).fontSize)
        this.pixelScale = Math.min(rootRem, this.stage.canvas.clientWidth / COMPOSITION_WIDTH, this.stage.height / 48)
    }

    buildDrum() {
        let labels = [...this.element.querySelectorAll('li')]
        let step = 2 * Math.PI / (labels.length * REPEATS)
        let radius = ROW_PITCH / step
        let ink = getComputedStyle(this.element).color
        labels.forEach((label, index) => {
            let canvas = document.createElement('canvas')
            canvas.width = 1536
            canvas.height = Math.ceil(ROW_PITCH * TEXT_DENSITY)
            let context = canvas.getContext('2d')
            context.font = '500 ' + FONT_SIZE * TEXT_DENSITY + 'px "Helvetica Now Display", sans-serif'
            context.textAlign = 'center'
            context.textBaseline = 'middle'
            context.fillStyle = ink
            context.fillText(label.textContent, canvas.width / 2, canvas.height / 2)
            let texture = new CanvasTexture(canvas)
            texture.colorSpace = SRGBColorSpace
            // Preserve horizontal stroke detail as the drum compresses each row vertically.
            texture.anisotropy = this.stage.renderer.getMaxAnisotropy()
            this.textures.push(texture)
            let material = new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
            let geometry = new PlaneGeometry(canvas.width / TEXT_DENSITY, ROW_PITCH, 1, 12)
            let positions = geometry.attributes.position
            for (let vertex = 0; vertex < positions.count; vertex++) {
                let angle = positions.getY(vertex) / radius
                positions.setY(vertex, radius * Math.sin(angle))
                positions.setZ(vertex, radius * Math.cos(angle))
            }
            geometry.computeBoundingSphere()
            for (let repeat = 0; repeat < REPEATS; repeat++) {
                let row = new Mesh(geometry, material)
                row.rotation.x = (index + repeat * labels.length - 3) * step
                this.drum.add(row)
            }
        })
    }

    buildLaurels() {
        let loader = new TextureLoader()
        let blade = new PlaneGeometry(0, 0, 6, LEAF_OUTLINE_SEGMENTS)
        let texture = loader.load(leafUrl, loaded => {
            if (!this.destroyed) this.shapeLeaf(blade, loaded.image)
        })
        let normalMap = loader.load(leafNormalUrl)
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = normalMap.anisotropy = this.stage.renderer.getMaxAnisotropy()
        this.textures.push(texture, normalMap)
        let foliage = new MeshStandardMaterial({ map: texture, normalMap, roughness: 0.62,
            side: DoubleSide })
        let bark = new MeshStandardMaterial({ color: 0x78674c, roughness: 0.85 })
        let budMaterial = new MeshStandardMaterial({ color: 0x82864b, roughness: 0.6 })
        let budGeometry = new SphereGeometry(0.42, 10, 8)
        if (this.solar) {
            this.solarLight = new PointLight(0xffa27a)
            this.group.add(this.solarLight)
        }
        this.keyLight = new DirectionalLight(0xfff1db, 2.2)
        this.keyLight.position.set(-45, 55, 85)
        this.keyLight.castShadow = true
        this.keyLight.shadow.mapSize.set(1024, 1024)
        this.keyLight.shadow.radius = SHADOW_SOFTNESS
        this.keyLight.shadow.bias = -0.00025
        this.group.add(this.keyLight, this.keyLight.target, new AmbientLight(0xe8efff, 0.68))

        let seed
        let random = () => {
            seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
            return seed / 4294967296
        }
        for (let side of [-1, 1]) {
            seed = LAUREL_SEED
            let laurel = new Group()
            laurel.scale.x = side
            this.group.add(laurel)
            let growth = new Group()
            growth.position.set(31, -20, 0)
            growth.scale.setScalar(LAUREL_SCALE)
            laurel.add(growth)
            let branches = new Group()
            branches.position.copy(growth.position).negate()
            growth.add(branches)
            let stems = [], buds = [], blades = []
            let pathPoint = (x, y, depth = 0) => new Vector3(
                growth.position.x + (357.053 - x) * PATH_SCALE,
                growth.position.y + (433.124 - y) * PATH_SCALE, depth)
            let guide = new CubicBezierCurve3(pathPoint(357.053, 433.124), pathPoint(136.551, 475.624, 0.6),
                pathPoint(-63.9478, 329.124, -0.6), pathPoint(20.0553, 0.124023))
            let knots = guide.getSpacedPoints(STEM_INTERVALS)
            for (let index = 1; index < STEM_INTERVALS; index++) {
                let progress = index / STEM_INTERVALS
                let tangent = guide.getTangentAt(progress)
                let amplitude = STEM_WANDER * Math.sin(Math.PI * progress)
                let lateral = amplitude * (2 * random() - 1)
                knots[index].x -= tangent.y * lateral
                knots[index].y += tangent.x * lateral
                knots[index].z += amplitude * (2 * random() - 1)
            }
            let branch = new CatmullRomCurve3(knots)
            seed = LAUREL_SEED
            stems.push(this.stemGeometry(branch, STEM_BASE_RADIUS, STEM_TIP_RADIUS, 48))
            for (let index = 0; index < LEAF_COUNT; index++) {
                let terminal = index === LEAF_COUNT - 1
                let fraction = (index + 0.2 + random() * 0.5) / LEAF_COUNT
                let progress = terminal ? 1 : fraction * 0.95
                let tangent = branch.getTangentAt(progress)
                let lateral = new Vector3(-tangent.y, tangent.x, 0).normalize()
                let around = new Vector3().crossVectors(tangent, lateral)
                let lane = index % 2 === 0 ? 1 : -1
                let azimuth = (lane > 0 ? 0 : Math.PI) + (random() - 0.5) * 1.9
                let radial = lateral.multiplyScalar(Math.cos(azimuth)).addScaledVector(around, Math.sin(azimuth))
                let root = branch.getPointAt(progress).addScaledVector(radial, MathUtils.lerp(STEM_BASE_RADIUS, STEM_TIP_RADIUS, progress))
                let spread = terminal ? 0 : MathUtils.lerp(1.65, 0.24, progress) * (0.65 + random() * 0.65)
                let reach = terminal ? 0.25 : 0.48 + random() * 1.6
                let tip = root.clone().addScaledVector(radial, spread).addScaledVector(tangent, reach)
                let exit = tangent.clone().addScaledVector(radial, terminal ? 0 : MathUtils.lerp(0.65, 0.16, progress)).normalize()
                let lengthToTip = root.distanceTo(tip)
                let bend = root.clone().lerp(tip, 0.4 + random() * 0.12)
                    .addScaledVector(radial, lengthToTip * (random() - 0.4) * 0.45)
                bend.z += lengthToTip * (random() - 0.5) * 0.28
                let shoulder = tip.clone().addScaledVector(exit, -lengthToTip * (0.18 + random() * 0.12))
                let twig = new CatmullRomCurve3([root, bend, shoulder, tip])
                stems.push(this.stemGeometry(twig, 0.09 + random() * 0.09, 0.055, 6))
                if (BUD_SITES.has(index)) {
                    let bud = new Mesh(budGeometry, budMaterial)
                    bud.position.copy(tip)
                    bud.scale.setScalar(0.72 + random() * 0.52)
                    buds.push(bud)
                    continue
                }
                let leaf = new Mesh(blade, foliage)
                leaf.position.copy(tip)
                let heading = twig.getTangentAt(1)
                let angle = Math.atan2(-heading.x, heading.y)
                leaf.rotation.order = 'ZXY'
                leaf.rotation.set(Math.asin(heading.z), (random() - 0.5) * 0.9, angle)
                let length = MathUtils.lerp(10.7, 7.3, progress) * (0.85 + 0.3 * random())
                leaf.scale.set(length * MathUtils.lerp(1.45, 0.88, progress), length, length)
                blades.push(leaf)
                leaf.userData = { angle, phase: azimuth }
            }
            this.addLitMesh(branches, new Mesh(mergeGeometries(stems), bark))
            stems.forEach(geometry => geometry.dispose())
            for (let objects of [buds, blades]) {
                let batch = new InstancedMesh(objects[0].geometry, objects[0].material, objects.length)
                objects.forEach((object, index) => {
                    object.updateMatrix()
                    batch.setMatrixAt(index, object.matrix)
                })
                batch.frustumCulled = false
                this.addLitMesh(branches, batch)
                if (objects === blades) this.leaves.push({ batch, blades, growth, laurel, side })
            }
        }
    }

    shapeLeaf(geometry, image) {
        let canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        let context = canvas.getContext('2d')
        context.drawImage(image, 0, 0)
        let pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let outline = []
        for (let y = 0; y < image.height; y++) {
            let left = image.width, right = -1
            for (let x = 0; x < image.width; x++) {
                if (pixels[(y * image.width + x) * 4 + 3] < 245) continue
                left = Math.min(left, x)
                right = x
            }
            if (right >= left) outline.push({ y, left, right })
        }
        if (!outline.length) return
        let base = outline.at(-1)
        let center = (base.left + base.right) / 2
        let { position, uv } = geometry.attributes
        for (let vertex = 0; vertex < position.count; vertex++) {
            let across = uv.getX(vertex)
            let row = outline[Math.round((1 - uv.getY(vertex)) * (outline.length - 1))]
            let x = MathUtils.lerp(row.left, row.right, across)
            let along = (base.y - row.y) / image.height
            let depth = 0.14 * along * along - 0.19 * Math.abs(across - 0.5) * Math.sin(Math.PI * along)
            position.setXYZ(vertex, (x - center) / image.width, along - 0.01, depth)
            // Sample inside the opaque blade to keep pale border pixels out of mip levels.
            let inset = Math.min(5, (row.right - row.left) / 2)
            uv.setXY(vertex, (MathUtils.lerp(row.left + inset, row.right - inset, across) + 0.5) / image.width,
                1 - (row.y + 0.5) / image.height)
        }
        position.needsUpdate = uv.needsUpdate = true
        geometry.computeVertexNormals()
        geometry.computeBoundingSphere()
    }

    addLitMesh(parent, mesh) {
        mesh.castShadow = mesh.receiveShadow = true
        parent.add(mesh)
    }

    stemGeometry(curve, baseRadius, tipRadius, segments) {
        let geometry = new TubeGeometry(curve, segments, baseRadius, 8, false)
        let { position, normal, uv } = geometry.attributes
        for (let vertex = 0; vertex < position.count; vertex++) {
            let offset = (tipRadius - baseRadius) * uv.getX(vertex)
            position.setXYZ(vertex, position.getX(vertex) + normal.getX(vertex) * offset,
                position.getY(vertex) + normal.getY(vertex) * offset, position.getZ(vertex) + normal.getZ(vertex) * offset)
        }
        let indices = Array.from(geometry.index.array)
        let radialSegments = geometry.parameters.radialSegments
        let lastRing = segments * (radialSegments + 1)
        for (let edge = 1; edge < radialSegments - 1; edge++) {
            indices.push(0, edge, edge + 1, lastRing, lastRing + edge + 1, lastRing + edge)
        }
        geometry.setIndex(indices)
        return geometry
    }

    update(delta) {
        let progress = this.getScroll() - this.timeline.sections.awards
        this.group.visible = progress > -1 && progress < 3
        let travel = progress - (this.previous ?? progress)
        this.previous = progress
        if (!this.group.visible) return
        let camera = this.stage.camera
        let viewportHeight = 2 * SCENE_DEPTH * Math.tan(MathUtils.degToRad(camera.fov / 2))
        this.group.position.copy(camera.position)
        this.group.quaternion.copy(camera.quaternion)
        this.group.translateZ(-SCENE_DEPTH)
        let offset = Math.min(progress, 0) + Math.max(progress - 2, 0)
        this.group.translateY(offset * viewportHeight)
        this.group.scale.setScalar(viewportHeight * this.pixelScale / this.stage.height)
        let scale = this.group.scale.x
        if (this.solarLight) {
            let depth = LAUREL_DEPTH + 10
            let halfHeight = (1 - depth * scale / SCENE_DEPTH) * viewportHeight / (2 * scale)
            this.solarLight.position.set(this.solar.source.x * camera.aspect * halfHeight,
                this.solar.source.y * halfHeight - offset * viewportHeight / scale, depth)
            this.solarLight.intensity = 1800 * scale * scale * this.solar.halo.reveal.progress.value
        }
        if (scale !== this.shadowScale) {
            this.shadowScale = scale
            let width = scale * SHADOW_WIDTH
            Object.assign(this.keyLight.shadow.camera, { left: -width, right: width, top: width, bottom: -width,
                near: scale, far: scale * 200 })
            this.keyLight.shadow.camera.updateProjectionMatrix()
        }
        this.drum.rotation.x = -progress * Math.PI
        this.velocity = MathUtils.damp(this.velocity, MathUtils.clamp(travel / Math.max(delta, 0.001), -2, 2), 9, delta)
        let pointer = this.stage.pointer
        this.pointerBendX = MathUtils.damp(this.pointerBendX, pointer.mouse ? pointer.x * POINTER_BEND : 0, POINTER_RESPONSE, delta)
        this.pointerBendY = MathUtils.damp(this.pointerBendY, pointer.mouse ? pointer.y * POINTER_BEND : 0, POINTER_RESPONSE, delta)
        for (let { batch, blades, growth, laurel, side } of this.leaves) {
            // Compensate perspective so the foreground branches keep their screen-space alignment.
            let perspectiveScale = 1 - LAUREL_DEPTH * scale / SCENE_DEPTH
            laurel.scale.set(side * perspectiveScale, perspectiveScale, perspectiveScale)
            laurel.position.set(-side * LAUREL_INSET * perspectiveScale, -LAUREL_DROP * perspectiveScale, LAUREL_DEPTH)
            growth.rotation.z = this.velocity * BRANCH_SWAY - side * this.pointerBendX * POINTER_BRANCH_SHARE
            growth.rotation.x = this.pointerBendY * POINTER_BRANCH_SHARE
            blades.forEach((leaf, index) => {
                let { angle, phase } = leaf.userData
                let pointerBend = -side * this.pointerBendX * Math.cos(angle) + this.pointerBendY * Math.sin(angle)
                leaf.rotation.z = angle + pointerBend + this.velocity * 0.035 * Math.sin(progress * 8 + phase)
                leaf.updateMatrix()
                batch.setMatrixAt(index, leaf.matrix)
            })
            batch.instanceMatrix.needsUpdate = true
        }
    }

    destroy() {
        this.destroyed = true
        this.stage.remove(this)
        this.group.removeFromParent()
        this.keyLight?.dispose()
        let resources = new Set(this.textures)
        this.group.traverse(node => {
            if (node.isInstancedMesh) node.dispose()
            if (node.isMesh) { resources.add(node.geometry); resources.add(node.material) }
        })
        resources.forEach(resource => resource.dispose())
    }
}
