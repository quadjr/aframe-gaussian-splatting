AFRAME.registerComponent('simple-fly', {
    schema: {
        speed: { type: 'number', default: 0.1 }
    },
    init: function () {
        this.controller = null;
        this.isFlying = false;

        this.el.addEventListener('loaded', () => {
            const xrSession = this.el.sceneEl.xrSession;
            if (xrSession) {
                const inputSources = xrSession.inputSources;
                if (inputSources.length > 1) {
                    this.controller = inputSources[1].gamepad; // Assuming you are using the first controller
                    this.isFlying = true;
                }
            } else {
                console.log('No XR session found.');
            }
        });
    },
    tick: function () {
        if (this.controller && this.isFlying) {
            this.fly();
        }
    },
    fly: function () {
        const controller = this.controller;
        const orientation = controller.pose.orientation;
        if (orientation) {
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(orientation);
            direction.multiplyScalar(this.data.speed);
            this.el.object3D.position.add(direction);
        }
    }
});
