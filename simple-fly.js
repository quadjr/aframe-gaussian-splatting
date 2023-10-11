AFRAME.registerComponent(simple-fly, {
  schema {
    speed { default 0.1 },
  },
  init function () {
    this.rightController = null;
    this.isFlying = false;
    
     Find and store the right controller.
    const controllers = this.el.sceneEl.querySelectorAll([hand-controls]);
    controllers.forEach(controller = {
      if (controller.getAttribute(hand-controls).hand === right) {
        this.rightController = controller;
      }
    });
    
     Add an event listener to start flying when any button is pressed.
    this.el.addEventListener(abuttondown, this.startFlying.bind(this));
    this.el.addEventListener(bbuttondown, this.startFlying.bind(this));
     Add an event listener to stop flying when any button is released.
    this.el.addEventListener(abuttonup, this.stopFlying.bind(this));
    this.el.addEventListener(bbuttonup, this.stopFlying.bind(this));
  },
  tick function () {
    if (this.isFlying) {
      this.fly();
    }
  },
  startFlying function () {
    this.isFlying = true;
  },
  stopFlying function () {
    this.isFlying = false;
  },
  fly function () {
    if (this.rightController) {
      const direction = new THREE.Vector3();
      this.rightController.object3D.getWorldDirection(direction);
      direction.multiplyScalar(this.data.speed);
      this.el.object3D.position.add(direction);
    }
  }
});
