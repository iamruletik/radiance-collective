//Where the cloud puffs sit. The bank is a horizontally repeating strip, `period` wide in viewport heights, drifting left forever

export const PUFF_COUNT = 24

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))

//Seeded random, the same seed always grows the same clouds
const random = seed => () => {
    seed = seed + 0x6D2B79F5 | 0
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
}

export const periodFor = aspect => 1.6 * aspect

const scaleFor = aspect => clamp(aspect / 2.2, 0.55, 1.35)

//Puffs at time `tau`: mostly a low bank with occasional tall heads, each wandering, bobbing and swelling on its own slow cycle
export const puffsAt = ({ seed, wander }, aspect, tau, heightScale = 1) => {
    const next = random(seed * 7919 + 11)
    const scale = scaleFor(aspect), period = periodFor(aspect)

    return Array.from({ length: PUFF_COUNT }, (_, index) => {
        const tower = next() < 0.2
        const x = (index + 0.5 + (next() - 0.5) * 0.7) / PUFF_COUNT
        const radius = (tower ? 0.15 + 0.06 * next() : 0.12 + 0.06 * next()) * scale
        const y = tower ? 0.06 + 0.12 * next() : -0.05 + 0.08 * next()
        const z = (next() - 0.5) * 0.24, phase = next() * Math.PI * 2

        return {
            x: x * period + Math.sin(tau * 0.045 + phase) * 0.025 * scale * wander,
            y: y * heightScale + Math.sin(tau * 0.06 + phase * 1.7) * 0.018 * wander * heightScale,
            z: z + Math.sin(tau * 0.05 + phase * 2.3) * 0.04 * wander,
            radius: radius * heightScale * (1 + 0.07 * wander * Math.sin(tau * 0.08 + phase * 3.1))
        }
    })
}

//Scales puff heights so the average cloud top lands at `cloudHeight`, a fraction of the footer
export const fitHeightScale = (settings, aspect) => {
    const puffs = puffsAt(settings, aspect, 0), period = periodFor(aspect), samples = 256
    let sum = 0

    for (let index = 0; index < samples; index++) {
        const x = (index + 0.5) / samples * period
        let top = 0
        for (const puff of puffs) {
            const offset = x - puff.x - period * Math.round((x - puff.x) / period)
            if (Math.abs(offset) < puff.radius) top = Math.max(top, puff.y + Math.sqrt(puff.radius ** 2 - offset ** 2))
        }
        sum += top
    }

    return clamp(settings.cloudHeight / (sum / samples + 0.03), 0.3, 4) //+0.03 for the typical lift of surface lumps
}

//Highest a cloud can reach, above it the march skips straight to sky
export const cloudTopFor = puffs => Math.max(...puffs.map(puff => puff.y + puff.radius * 1.2)) + 0.15
