(function (SILBOT) {
  const { CHANNEL_COLORS, AGENT_SPEED } = SILBOT.Config;
  const { gridToWorld, key, easeInOutCubic } = SILBOT.Lattice;

  const State = Object.freeze({
    CONTRACTED: 'CONTRACTED',
    EXPANDING: 'EXPANDING',
    CONTRACTING: 'CONTRACTING',
  });

  class Agent {
    constructor({ x, y, z, channelIndex, sphereGeo, scene, occupancyMap }) {
      this.x = x;
      this.y = y;
      this.z = z;
      this.targetX = x;
      this.targetY = y;
      this.targetZ = z;
      this.state = State.CONTRACTED;
      this.progress = 0;
      this.occupancyMap = occupancyMap;
      this.scene = scene;

      this.material = new THREE.MeshStandardMaterial({
        color: CHANNEL_COLORS[channelIndex],
        roughness: 0.2,
        metalness: 0.3,
      });
      this.mesh = new THREE.Mesh(sphereGeo, this.material);
      this.group = new THREE.Group();
      this.group.add(this.mesh);
      this.group.position.copy(gridToWorld(x, y, z));
      scene.add(this.group);
    }

    isIdle() {
      return this.state === State.CONTRACTED;
    }

    beginExpansion(targetX, targetY, targetZ) {
      this.state = State.EXPANDING;
      this.targetX = targetX;
      this.targetY = targetY;
      this.targetZ = targetZ;
      this.progress = 0;
    }

    update(deltaTime) {
      this.advancePhase(deltaTime);
      this.renderPose();
    }

    advancePhase(deltaTime) {
      if (this.state === State.CONTRACTED) return;
      this.progress += deltaTime * AGENT_SPEED;
      if (this.progress < 1.0) return;

      this.progress = 0;
      if (this.state === State.EXPANDING) {
        this.state = State.CONTRACTING;
        this.occupancyMap.delete(key(this.x, this.y, this.z));
        this.x = this.targetX;
        this.y = this.targetY;
        this.z = this.targetZ;
        this.occupancyMap.set(key(this.x, this.y, this.z), this);
      } else {
        this.state = State.CONTRACTED;
      }
    }

    renderPose() {
      const start = gridToWorld(this.x, this.y, this.z);
      const end = gridToWorld(this.targetX, this.targetY, this.targetZ);
      const distance = start.distanceTo(end);
      const eased = easeInOutCubic(this.progress);

      if (this.state === State.EXPANDING) {
        this.stretch(start, end, eased * 0.5, eased, distance);
      } else if (this.state === State.CONTRACTING) {
        this.stretch(start, end, 0.5 + eased * 0.5, 1 - eased, distance);
      } else {
        this.group.position.copy(start);
        this.mesh.scale.set(1, 1, 1);
        this.group.rotation.set(0, 0, 0);
      }
    }

    stretch(start, end, lerpT, stretchT, distance) {
      const pos = new THREE.Vector3().lerpVectors(start, end, lerpT);
      this.group.position.copy(pos);
      this.group.lookAt(end);
      const stretchZ = 1 + distance * stretchT;
      const squeezeXY = 1 - stretchT * 0.15;
      this.mesh.scale.set(squeezeXY, squeezeXY, stretchZ);
    }

    dispose() {
      this.scene.remove(this.group);
      this.material.dispose();
    }
  }

  SILBOT.Agent = Agent;
  SILBOT.AgentState = State;
})(window.SILBOT);
