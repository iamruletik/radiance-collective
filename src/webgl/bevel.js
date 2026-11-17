//Turns a hard-edged mask into a smooth height ramp, so a relief rounds off at letter edges instead of stepping like a cliff
//Three box blurs approximate a Gaussian. Red channel in, one byte per pixel out. Runs once on load, a few ms for a 2000px image

//Running-sum box blur along each row, edges clamped
const blurRows = (values, width, height, radius) => {
    const result = new Float32Array(values.length), size = radius * 2 + 1
    for (let y = 0; y < height; y++) {
        const row = y * width
        let sum = 0
        for (let x = -radius; x <= radius; x++) sum += values[row + Math.min(Math.max(x, 0), width - 1)]
        for (let x = 0; x < width; x++) {
            result[row + x] = sum / size
            sum += values[row + Math.min(x + radius + 1, width - 1)] - values[row + Math.max(x - radius, 0)]
        }
    }
    return result
}

const transpose = (values, width, height) => {
    const result = new Float32Array(values.length)
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) result[x * height + y] = values[y * width + x]
    return result
}

export const bevelHeight = (image, radius) => {
    const { width, height } = image
    const context = new OffscreenCanvas(width, height).getContext('2d', { willReadFrequently: true })
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, width, height).data

    let values = Float32Array.from({ length: width * height }, (_, index) => pixels[index * 4])
    const blur = Math.max(0, Math.round(radius))
    for (let pass = 0; pass < 3 && blur > 0; pass++) {
        values = blurRows(values, width, height, blur) //Horizontal
        values = transpose(blurRows(transpose(values, width, height), height, width, blur), height, width) //Vertical
    }

    return { data: Uint8Array.from(values, value => Math.round(value)), width, height }
}
