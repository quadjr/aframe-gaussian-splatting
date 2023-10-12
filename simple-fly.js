AFRAME.registerComponent('simple-fly', {
    schema: {
        speed: { type: 'number', default: 0.1 }
    },
    init: function () {
        this.rightController = null;
        this.isFlying = false;

        const controllers = document.querySelectorAll('a-entity[xr-controller]');
        if (controllers.length >= 2) {
            this.rightController = controllers[1];

            // Listen for the buttondown event on the controller.
            this.rightController.addEventListener('buttondown', (event) => {
                this.startFlying(event);
            });

            // Listen for the buttonup event on the controller.
            this.rightController.addEventListener('buttonup', () => {
                this.stopFlying();
            });
        } else {
            console.log('No second controller found.');
        }
    },
    tick: function () {
        if (this.isFlying) {
            this.fly();
        }
    },
    startFlying: function (event) {
        this.isFlying = true;
        this.flyDirection = new THREE.Vector3();

        // Use the controller's forward direction for flight.
        this.rightController.object3D.getWorldDirection(this.flyDirection);
    },
    stopFlying: function () {
        this.isFlying = false;
    },
    fly: function () {
        if (this.rightController && this.flyDirection) {
            const direction = new THREE.Vector3().copy(this.flyDirection);
            direction.multiplyScalar(this.data.speed);
            this.el.object3D.position.add(direction);
        }
    }
});
