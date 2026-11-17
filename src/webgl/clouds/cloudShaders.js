import { Fn, Loop, If, Break, Continue, Discard, float, int, vec2, vec3, vec4, uv, screenCoordinate, fract, dot, floor, mod, sqrt, min, max, abs, length, exp, pow, mix, smoothstep, normalize, texture, texture3D, mx_noise_float, sRGBTransferEOTF } from 'three/tsl'
import { PUFF_COUNT } from './cloudLayout.js'

//Radiance clouds as TSL passes, so one source runs on WebGPU and WebGL2
//Distances are baked into 3D textures remapped to 0..1 over SDF_RANGE, SIGMA is the cloud's light extinction
export const SDF_RANGE = 0.3
const SIGMA = 70
const MAX_STEPS = 200

const NEIGHBOURS = { start: int(-1), end: int(1), condition: '<=' }

//Pass uv runs top to bottom, the clouds think bottom to top
const upright = () => vec2(uv().x, uv().y.oneMinus())
const sampleUpright = (map, point) => texture(map, vec2(point.x, point.y.oneMinus())).level(0)

//Shared Helpers
//Interleaved gradient noise: per-pixel jitter that hides banding and step artifacts
const pixelNoise = Fn(([pixel]) => fract(fract(dot(pixel, vec2(0.06711056, 0.00583715))).mul(52.9829189)), { pixel: 'vec2', return: 'float' })

const hash33 = Fn(([seed]) => {
    const point = fract(seed.mul(vec3(0.1031, 0.1030, 0.0973))).toVar()
    point.addAssign(dot(point, point.yxz.add(33.33)))
    return fract(point.xxy.add(point.yxx).mul(point.zyx))
}, { seed: 'vec3', return: 'vec3' })

const smoothMin = Fn(([a, b, k]) => {
    const blend = max(k.sub(abs(a.sub(b))), 0).div(k)
    return min(a, b).sub(blend.mul(blend).mul(k).mul(0.25))
}, { a: 'float', b: 'float', k: 'float', return: 'float' })

//Henyey-Greenstein phase: how much light scatters toward the viewer at a given angle
const phaseHG = (cosine, g) => float(1 - g * g).div(pow(float(1 + g * g).sub(cosine.mul(2 * g)), 1.5).mul(12.566))

//Noise Volume: tileable 64³. R, B, A: low-frequency value noise for warp and swell. G: Worley fbm for edge erosion
const worley = Fn(([point, cells]) => {
    const scaled = point.mul(cells), cell = floor(scaled), nearest = float(9).toVar()
    Loop(NEIGHBOURS, NEIGHBOURS, NEIGHBOURS, ({ i, j, k }) => {
        const neighbour = cell.add(vec3(i, j, k))
        const offset = scaled.sub(neighbour.add(hash33(mod(neighbour, cells).add(cells.mul(7)))))
        nearest.assign(min(nearest, dot(offset, offset)))
    })
    return min(1, sqrt(nearest))
}, { point: 'vec3', cells: 'float', return: 'float' })

const valueNoise = Fn(([point, cells, seed]) => {
    const scaled = point.mul(cells), cell = floor(scaled), local = fract(scaled)
    const blend = local.mul(local).mul(local.mul(-2).add(3))
    const corner = (x, y, z) => hash33(mod(cell.add(vec3(x, y, z)), cells).add(cells.mul(13)).add(seed)).x
    return mix(
        mix(mix(corner(0, 0, 0), corner(1, 0, 0), blend.x), mix(corner(0, 1, 0), corner(1, 1, 0), blend.x), blend.y),
        mix(mix(corner(0, 0, 1), corner(1, 0, 1), blend.x), mix(corner(0, 1, 1), corner(1, 1, 1), blend.x), blend.y),
        blend.z
    )
}, { point: 'vec3', cells: 'float', seed: 'float', return: 'float' })

const lowNoise = (point, seed) => valueNoise(point, 4, seed).mul(0.6).add(valueNoise(point, 8, seed).mul(0.4))

export const noiseBake = ({ slice, size }) => Fn(() => {
    const point = vec3(uv(), slice.add(0.5).div(size))
    const erosion = worley(point, 8).mul(0.625).add(worley(point, 16).mul(0.375)).oneMinus()
    return vec4(lowNoise(point, 0), erosion.sub(0.45).mul(1.6).add(0.5).clamp(), lowNoise(point, 51), lowNoise(point, 97))
})()

//Shape Volume: distance to the cloud bank plus light baked toward the key light, once per keyframe instead of per pixel per frame
export const shapeBake = ({ slice, depth, puffs, period, tau, seedOffset, keyLight }) => {
    //Worley F1, periodic in x over cellsX cells so the strip tiles seamlessly
    const periodicWorley = Fn(([point, cellsX]) => {
        const cell = floor(point), nearest = float(9).toVar()
        Loop(NEIGHBOURS, NEIGHBOURS, NEIGHBOURS, ({ i, j, k }) => {
            const neighbour = cell.add(vec3(i, j, k))
            const offset = point.sub(neighbour).sub(hash33(vec3(mod(neighbour.x, cellsX), neighbour.yz).add(0.37)))
            nearest.assign(min(nearest, dot(offset, offset)))
        })
        return sqrt(nearest)
    }, { point: 'vec3', cellsX: 'float', return: 'float' })

    const octave = (point, size, offset) => {
        const cellsX = max(1, floor(period.div(size).add(0.5)))
        return periodicWorley(point.div(vec3(period.div(cellsX), size, size)).add(offset), cellsX).sub(0.55)
    }

    const rise = vec3(0.12, -1, 0.25).mul(tau).add(seedOffset)

    //Puffs blended into a low base layer, plus the big billow octave
    const coarseShape = Fn(([point]) => {
        const distance = max(point.y.sub(0.05), abs(point.z).sub(0.22)).toVar()
        Loop(PUFF_COUNT, ({ i }) => {
            const puff = puffs.element(i)
            const offset = point.sub(puff.xyz)
            const wrapped = vec3(offset.x.sub(period.mul(floor(offset.x.div(period).add(0.5)))), offset.yz) //Wrapped distance: seamless repeat
            distance.assign(smoothMin(distance, length(wrapped).sub(puff.w), 0.12))
        })
        return distance.add(octave(point, 0.13, rise.mul(0.035)).mul(0.117))
    }) //Inlined: functions with a fixed layout can't read uniforms like the puffs array

    const densityOf = distance => smoothstep(-0.025, 0.008, distance).oneMinus()

    return Fn(() => {
        const point = vec3(uv().x.mul(period), uv().y.mul(1.3).sub(0.1), slice.add(0.5).div(depth).sub(0.5))
        const distance = coarseShape(point)
            .add(octave(point, 0.045, rise.mul(0.07).add(17)).mul(0.036))
            .add(octave(point, 0.02, rise.mul(0.12).add(31)).mul(0.012))

        //Optical depth toward the key light, then multiple-scattering octaves (Wrenninge 2015)
        const opticalDepth = float(0).toVar(), stepLength = float(0.012).toVar(), lightPoint = vec3(point).toVar()
        Loop(6, () => {
            lightPoint.addAssign(keyLight.mul(stepLength))
            opticalDepth.addAssign(densityOf(coarseShape(lightPoint)).mul(stepLength))
            stepLength.mulAssign(1.75)
        })
        opticalDepth.mulAssign(SIGMA * 0.6)
        const energy = exp(opticalDepth.negate()).add(exp(opticalDepth.mul(-0.25)).mul(0.6)).add(exp(opticalDepth.mul(-0.06)).mul(0.35))

        return vec4(distance.div(SDF_RANGE).add(0.5).clamp(), energy.mul(0.5).clamp(), 0, 1)
    })()
}

//March: one ray per cloud pixel through the cross-faded shape volumes, warped and eroded by the noise volume
export const cloudMarch = ({ volumes, weight, noise, aspect, time, frame, sun, sunGain, boil, back, shadow, period, scroll, steps, cloudTop }) => {
    const sampleShape = Fn(([point]) => {
        const coordinate = vec3(point.x.div(period), point.y.add(0.1).div(1.3), point.z.add(0.5))
        const value = mix(texture3D(volumes[0], coordinate).level(0).rg, texture3D(volumes[1], coordinate).level(0).rg, weight)
        return vec2(value.x.sub(0.5).mul(SDF_RANGE), value.y.mul(2)) //Distance, baked light
    })

    return Fn(() => {
        const position = upright()
        const result = vec4(0).toVar()

        If(position.y.lessThan(cloudTop), () => {
            const worldX = position.x.mul(aspect).add(scroll)
            const stepSize = float(0.288).div(steps)
            const t = stepSize.mul(fract(pixelNoise(screenCoordinate.xy).add(frame.mul(0.618034)))).toVar()
            const transmittance = float(1).toVar(), light = vec3(0).toVar()

            const sunWorld = vec3(sun.x.mul(aspect).add(scroll), sun.y, -0.7)
            const keyDirection = normalize(mix(vec3(0.25, 1, 0.35), vec3(0.1, 0.5, -1), back))
            const keyPhase = back.mul(1.3).mul(phaseHG(keyDirection.z.negate(), 0.6)).div(phaseHG(float(1), 0.6)).add(1)
            const ambientLow = mix(vec3(0.16, 0.32, 0.68), vec3(0.06, 0.14, 0.38), shadow)
            const ambientHigh = mix(vec3(0.55, 0.68, 0.9), vec3(0.3, 0.42, 0.66), shadow)
            const drift = vec3(0.012, -0.01, 0.008).mul(time)

            Loop(MAX_STEPS, () => {
                If(t.greaterThan(1).or(transmittance.lessThan(0.01)), () => { Break() })
                const point = vec3(worldX, position.y, float(0.5).sub(t))

                //Empty-space skip: far from any cloud, jump by the distance
                const coarse = sampleShape(point)
                If(coarse.x.greaterThan(boil.mul(0.03).add(0.04)), () => {
                    t.addAssign(coarse.x.sub(0.03).sub(boil.mul(0.025)))
                    Continue()
                })

                //Boil warp and swell from one noise fetch
                const warp = texture3D(noise, point.mul(0.8).add(drift)).level(0)
                const warped = point.add(warp.rba.sub(0.5).mul(boil.mul(0.045)))
                const shape = sampleShape(warped)
                const surface = shape.x.add(warp.b.sub(0.5).mul(boil.mul(0.02))).toVar()
                If(surface.lessThan(0.03), () => {
                    surface.addAssign(float(0.5).sub(texture3D(noise, warped.mul(5).add(vec3(-0.01, -0.025, 0.006).mul(time))).level(0).g).mul(0.011))
                })

                const density = smoothstep(-0.025, 0.008, surface).oneMinus()
                If(density.greaterThan(0.002), () => {
                    const ambient = sampleShape(point.add(vec3(0, 0.08, 0.04))).x.mul(8).add(0.5).clamp()
                    //Silver lining: only the thin fringe at the surface lets the sun through, phase normalised so it can't blow out
                    const fringe = density.oneMinus().mul(smoothstep(-0.03, 0, surface))
                    const nearSun = exp(length(point.xy.sub(sunWorld.xy)).mul(-6))
                    const sunPhase = phaseHG(normalize(sunWorld.sub(point)).z.negate(), 0.8).div(phaseHG(float(1), 0.8))
                    const scattered = vec3(1, 0.98, 0.95).mul(shape.y.mul(0.55).mul(keyPhase))
                        .add(mix(ambientLow, ambientHigh, ambient).mul(0.6))
                        .add(vec3(1, 0.85, 0.62).mul(fringe.mul(sunPhase).mul(nearSun).mul(sunGain).mul(1.4)))
                    const stepTransmittance = exp(density.mul(-SIGMA).mul(stepSize))
                    light.addAssign(scattered.mul(transmittance).mul(stepTransmittance.oneMinus()))
                    transmittance.mulAssign(stepTransmittance)
                })

                t.addAssign(stepSize)
            })

            const alpha = transmittance.oneMinus()
            result.assign(vec4(exp(light.div(max(alpha, 1e-4)).mul(-2)).oneMinus().mul(alpha), alpha))
        })

        return result
    })()
}

//Rays: faint radial glow through cloud gaps plus art-directed beams, at half resolution
export const cloudRays = ({ cloud, sun, aspect, sunGain, time, beams, glow }) => Fn(() => {
    const position = upright()
    const cloudAlpha = point => sampleUpright(cloud, point).a
    const sunMask = point => {
        const radius = length(point.sub(sun).mul(vec2(aspect, 1)))
        return exp(radius.mul(radius).mul(-140)).add(exp(radius.mul(-14)).mul(0.2))
    }

    const glowSum = float(0).toVar()
    If(glow.greaterThan(0), () => {
        const delta = position.sub(sun).mul(0.9 / 24)
        const point = position.sub(delta.mul(pixelNoise(screenCoordinate.xy))).toVar()
        const decay = float(1).toVar()
        Loop(24, () => {
            point.subAssign(delta)
            glowSum.addAssign(sunMask(point).mul(cloudAlpha(point).oneMinus()).mul(decay))
            decay.mulAssign(0.94)
        })
    })

    const offset = position.sub(sun).mul(vec2(aspect, 1))
    const radius = length(offset), direction = offset.div(max(radius, 1e-4))
    const noise = (point) => mx_noise_float(point, 0.5, 0.5)
    const angular = noise(direction.mul(2.5).add(vec2(0.045, -0.035).mul(time))).mul(0.55)
        .add(noise(direction.mul(6).add(vec2(-0.06, 0.05).mul(time)).add(11)).mul(0.3))
        .add(noise(direction.mul(14).add(vec2(0.09, 0.05).mul(time)).add(23)).mul(0.15))

    //Gaps in the cloud next to the sun open the beams up
    const gap = float(0).toVar()
    Loop(5, ({ i }) => gap.addAssign(cloudAlpha(sun.add(direction.mul(vec2(aspect.reciprocal(), 1)).mul(float(i).add(1).mul(0.015)))).oneMinus()))

    const beam = pow(smoothstep(0.4, 0.72, angular), 2)
        .mul(noise(direction.mul(45).add(5)).mul(0.35).add(0.65))
        .mul(mix(0.3, 1, smoothstep(0.05, 0.55, gap.div(5))))
        .mul(mix(0.35, 1, smoothstep(-0.5, 0.4, direction.y).oneMinus()))
    const falloff = smoothstep(0.015, 0.1, radius).mul(exp(radius.mul(-1.5)))
    const dust = noise(direction.mul(9).add(radius.mul(9).sub(time.mul(0.3)))).mul(0.18).add(0.82)

    return vec4(vec3(glowSum.mul(0.04).add(beam.mul(falloff).mul(dust).mul(beams).mul(1.1)).mul(sunGain)), 1)
})()

//Composite: sky, sun, clouds upsampled edge-aware, rays screen-blended. Drawn over the scene where the footer is on screen
export const cloudComposite = ({ cloud, rays, sun, aspect, sunGain, texel, footerTop }) => Fn(() => {
    const screen = upright()
    const footerY = screen.y.add(footerTop) //0 at the footer's bottom, 1 at its top
    Discard(footerY.greaterThan(1))
    const point = vec2(screen.x, footerY)

    const color = mix(vec3(0.93, 0.95, 0.98), vec3(1), smoothstep(0, 0.9, footerY)).toVar()
    const sunDistance = length(point.sub(sun).mul(vec2(aspect, 1)))
    color.addAssign(vec3(1, 0.93, 0.82).mul(exp(sunDistance.mul(sunDistance).mul(-160)).mul(sunGain).mul(0.45)))

    //Low-res cloud upsampled with taps weighted by similarity to the centre, smooth without smearing the silhouette
    const center = sampleUpright(cloud, point)
    const sum = vec4(center).toVar(), weights = float(1).toVar()
    for (const [x, y] of [[-0.75, -0.75], [0.75, -0.75], [-0.75, 0.75], [0.75, 0.75]]) {
        const tap = sampleUpright(cloud, point.add(vec2(x, y).mul(texel)))
        const weight = exp(abs(tap.a.sub(center.a)).mul(-6).sub(length(tap.rgb.sub(center.rgb)).mul(5)))
        sum.addAssign(tap.mul(weight))
        weights.addAssign(weight)
    }
    const clouds = sum.div(weights)
    color.assign(color.mul(clouds.a.oneMinus()).add(clouds.rgb))

    const glow = sampleUpright(rays, point).rgb.mul(vec3(1, 0.92, 0.8)).clamp()
    color.assign(color.oneMinus().mul(glow.oneMinus()).oneMinus()) //Screen blend
    color.addAssign(pixelNoise(screenCoordinate.xy).sub(0.5).div(255)) //Dither

    return vec4(sRGBTransferEOTF(color.clamp()), 1) //Colours are authored for the screen, undo the renderer's sRGB output conversion
})()
