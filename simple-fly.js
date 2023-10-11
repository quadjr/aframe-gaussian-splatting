AFRAME.registerComponent('simple-fly', {
    schema: {
        speed: { type: 'number', default: 0.1 },
    },
    init: function () {
        this.isFlying = false;
        this.rightController = null;

        // Register a reference to the right Oculus Touch controller.
        this.rightController = document.querySelector('[oculus-touch-controls]:not([hand="left"])');

        if (!this.rightController) {
            console.error('No right Oculus Touch controller found.');
            return;
        }

        // Listen to the "gripdown" and "gripup" events to start and stop flying.
        this.rightController.addEventListener('gripdown', () => {
            this.startFlying();
        });

        this.rightController.addEventListener('gripup', () => {
            this.stopFlying();
        });
    },
    tick: function () {
        if (this.isFlying) {
            this.fly();
        }
    },
    startFlying: function () {
        this.isFlying = true;
    },
    stopFlying: function () {
        this.isFlying = false;
    },
    fly: function () {
        if (this.rightController) {
            const direction = new THREE.Vector3();
            this.rightController.object3D.getWorldDirection(direction);

            // Normalize the direction and multiply by the speed.
            direction.normalize().multiplyScalar(this.data.speed);

            // Apply the direction to the entity's position.
            this.el.object3D.position.add(direction);
        }
    },
});
