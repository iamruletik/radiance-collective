import * as THREE from 'three'

//Ring of curved panels sharing the torus axis and radius, stacked on top of the ring along that axis
//Parented to the halo so it follows its position, tilt and spin. The camera sits inside it in the near pose
export default class HaloSlider {
    constructor(parent, config) {
        this.parent = parent
        this.config = config
        this.group = new THREE.Group()
        this.panels = []
        this.panelColors = []
        this.autoRotation = 0
        this.visibility = 0
    }

    setup() {
        if (!this.parent) return

        this.panelColors = Array.from({ length: this.config.panelCount }, () => new THREE.Color(Math.random(), Math.random(), Math.random()))
        this.buildPanels()
        this.group.visible = false
        this.parent.add(this.group)
    }

    //Helpers
    buildPanels() {
        const { panelCount, panelGapAngle, segmentsPerPanel, radius, tube, height, offset } = this.config
        if (panelCount < 1) return

        let panelAngle = (Math.PI * 2) / panelCount
        let panelArc = Math.max(panelAngle - panelGapAngle, 0.01)

        for (let index = 0; index < panelCount; index++) {
            let geometry = new THREE.CylinderGeometry(radius, radius, height, segmentsPerPanel, 1, true, index * panelAngle + panelGapAngle / 2, panelArc)
            geometry.rotateX(Math.PI / 2) //CylinderGeometry stands on Y, the torus axis is Z

            let material = new THREE.MeshBasicMaterial({
                color: this.panelColors[index] ?? new THREE.Color(Math.random(), Math.random(), Math.random()),
                side: THREE.DoubleSide,
                transparent: true,
                opacity: this.visibility
            })

            let panel = new THREE.Mesh(geometry, material)
            this.panels.push(panel)
            this.group.add(panel)
        }

        this.group.position.z = -(tube + offset + height / 2) //Negative local Z is screen-up in the near pose, so the band sits on top of the ring
    }

    clearPanels() {
        this.panels.forEach((panel) => {
            panel.geometry?.dispose()
            panel.material?.dispose()
            this.group.remove(panel)
        })
        this.panels = []
    }

    rebuild(radius = this.config.radius, tube = this.config.tube) {
        this.config.radius = radius
        this.config.tube = tube
        this.clearPanels()
        this.buildPanels()
    }

    //Animation
    update(frameSeconds, scrolledViewports) {
        const { fadeIn, fadeOut, autoRotateSpeed, scrollRotation } = this.config

        let fadeInProgress = THREE.MathUtils.smootherstep(scrolledViewports, fadeIn.start, fadeIn.end)
        let fadeOutProgress = THREE.MathUtils.smootherstep(scrolledViewports, fadeOut.start, fadeOut.end)
        this.visibility = fadeInProgress * (1 - fadeOutProgress)

        this.group.visible = this.visibility > 0.001
        if (!this.group.visible) return

        this.autoRotation += autoRotateSpeed * frameSeconds
        this.group.rotation.z = this.autoRotation + scrolledViewports * scrollRotation

        this.panels.forEach((panel) => { panel.material.opacity = this.visibility })
    }

    destroy() {
        this.clearPanels()
        this.parent?.remove(this.group)
    }
}
