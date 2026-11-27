export default class SolarBackground {
    setup() {
        this.canvas = document.createElement('canvas')
        this.canvas.className = 'solar-background'
        this.canvas.setAttribute('aria-hidden', 'true')
        document.body.prepend(this.canvas)
        let gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, powerPreference: 'low-power' })
        if (!gl) return
        this.gl = gl
        let vertex = `#version 300 es
        void main() {
            vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
            gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
        }`
        let fragment = `#version 300 es
        precision highp float;
        uniform vec2 resolution;
        uniform vec2 page;
        out vec4 pixel;
        float pool(vec2 p, vec2 center, vec2 spread) {
            vec2 delta = (p - center) / spread;
            return exp(-dot(delta, delta));
        }
        void main() {
            vec2 uv = gl_FragCoord.xy / resolution;
            vec2 p = vec2(uv.x, page.x + (1.0 - uv.y) * page.y);
            vec3 sky = vec3(12.0, 23.0, 32.0);
            sky += vec3(30., 51., 56.) * pool(p, vec2(.90,.09), vec2(.88,.13));
            sky += vec3(60., 29., 25.) * pool(p, vec2(.10,.33), vec2(.79,.14));
            sky += vec3(24., 44., 52.) * pool(p, vec2(.82,.54), vec2(.96,.14));
            sky += vec3(53., 25., 24.) * pool(p, vec2(.24,.77), vec2(.84,.12));
            sky += vec3(21., 42., 48.) * pool(p, vec2(.90,.97), vec2(.94,.13));
            float threshold = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715))));
            pixel = vec4(floor(sky + threshold) / 255.0, 1.0);
        }`
        let program = gl.createProgram()
        for (let [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
            let shader = gl.createShader(type)
            gl.shaderSource(shader, source)
            gl.compileShader(shader)
            gl.attachShader(program, shader)
            gl.deleteShader(shader)
        }
        gl.linkProgram(program)
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.warn('Solar background shader:', gl.getProgramInfoLog(program))
            this.canvas.remove()
            return
        }
        gl.useProgram(program)
        this.resolution = gl.getUniformLocation(program, 'resolution')
        this.page = gl.getUniformLocation(program, 'page')
        this.ready = true
        this.update()
    }

    update() {
        if (!this.ready) return
        let height = this.canvas.clientHeight
        let width = Math.round(this.canvas.clientWidth * devicePixelRatio)
        let pixelsHigh = Math.round(height * devicePixelRatio)
        let pageHeight = Math.max(document.documentElement.scrollHeight, height, 1)
        let scroll = window.scrollY
        if (this.canvas.width === width && this.canvas.height === pixelsHigh &&
            this.scroll === scroll && this.pageHeight === pageHeight) return
        let gl = this.gl
        if (this.canvas.width !== width || this.canvas.height !== pixelsHigh) {
            this.canvas.width = width
            this.canvas.height = pixelsHigh
            gl.viewport(0, 0, width, pixelsHigh)
        }
        this.scroll = scroll
        this.pageHeight = pageHeight
        gl.uniform2f(this.resolution, width, pixelsHigh)
        gl.uniform2f(this.page, scroll / pageHeight, height / pageHeight)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
}
