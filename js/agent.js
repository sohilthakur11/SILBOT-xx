(function (SILBOT) {
  const { AGENT_SPEED, COLORS } = SILBOT.Config;
  const { gridToWorld, key, easeInOutCubic } = SILBOT.Lattice;

  const State = Object.freeze({
    CONTRACTED: 'CONTRACTED', EXPANDING: 'EXPANDING', CONTRACTING: 'CONTRACTING', SOLIDIFIED: 'SOLIDIFIED'
  });

  class Agent {
    constructor({ x, y, z, color, sphereGeo, scene, simulator }) {
      this.x = x; this.y = y; this.z = z;
      this.sourceX = x; this.sourceY = y; this.sourceZ = z;
      this.targetX = x; this.targetY = y; this.targetZ = z;
      
      this.state = State.CONTRACTED;
      this.progress = 0;
      this.simulator = simulator;
      this.scene = scene;

      this.material = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.3 });
      this.mesh = new THREE.Mesh(sphereGeo, this.material);
      this.group = new THREE.Group();
      this.group.add(this.mesh);
      this.group.position.copy(gridToWorld(x, y, z));
      scene.add(this.group);
    }

    isIdle() { return this.state === State.CONTRACTED; }

    pushTo(targetX, targetY, targetZ) {
      if (this.state !== State.CONTRACTED) return false;
      
      this.targetX = targetX; this.targetY = targetY; this.targetZ = targetZ;
      this.sourceX = this.x; this.sourceY = this.y; this.sourceZ = this.z;
      this.progress = 0;
      this.triggerExpansion();
      return true;
    }

    triggerExpansion() {
      this.state = State.EXPANDING;
      
      const targetKey = key(this.targetX, this.targetY, this.targetZ);
      const existingOccupant = this.simulator.occupancyMap.get(targetKey);

      if (existingOccupant && existingOccupant !== this) {
          const nextStep = this.simulator.findNextStepTowardsEmpty(existingOccupant.x, existingOccupant.y, existingOccupant.z);
          if (nextStep) {
              existingOccupant.pushTo(nextStep.x, nextStep.y, nextStep.z);
          } else {
              // CRITICAL STALL FIX: If the next particle has nowhere to go, cleanly halt the wave
              // instead of overwriting it and breaking the system.
              this.state = State.CONTRACTED;
              this.progress = 0;
              return;
          }
      }

      const oldKey = key(this.x, this.y, this.z);
      if (this.simulator.occupancyMap.get(oldKey) === this) {
        this.simulator.occupancyMap.delete(oldKey);
      }
      
      this.x = this.targetX; this.y = this.targetY; this.z = this.targetZ;
      this.simulator.occupancyMap.set(targetKey, this);
    }

    solidify() {
      this.state = State.SOLIDIFIED;
      this.material.color.setHex(COLORS.wall);
      this.material.roughness = 0.9;
      this.material.metalness = 0.1;
      this.mesh.scale.set(1, 1, 1);
      this.group.position.copy(gridToWorld(this.x, this.y, this.z));
    }

    update(deltaTime) {
      if (this.state === State.SOLIDIFIED) return;
      this.advancePhase(deltaTime);
      this.renderPose();
    }

    advancePhase(deltaTime) {
      if (this.state === State.CONTRACTED) return;
      
      this.progress += deltaTime * AGENT_SPEED * 2.0; 
      if (this.progress < 1.0) return;

      this.progress = 0;
      
      if (this.state === State.EXPANDING) {
        this.state = State.CONTRACTING;
      } else if (this.state === State.CONTRACTING) {
        this.state = State.CONTRACTED;
      }
    }

    renderPose() {
      const start = gridToWorld(this.sourceX, this.sourceY, this.sourceZ);
      const end = gridToWorld(this.targetX, this.targetY, this.targetZ);
      const distance = start.distanceTo(end);
      const eased = easeInOutCubic(this.progress);

      if (this.state === State.EXPANDING) {
        this.stretch(start, end, eased * 0.5, eased, distance);
      } else if (this.state === State.CONTRACTING) {
        this.stretch(start, end, 0.5 + eased * 0.5, 1 - eased, distance);
      } else { 
        const pos = gridToWorld(this.x, this.y, this.z);
        this.group.position.copy(pos);
        this.mesh.scale.set(1, 1, 1);
        this.group.rotation.set(0, 0, 0);
      }
    }

    stretch(start, end, lerpT, stretchT, distance) {
      const pos = new THREE.Vector3().lerpVectors(start, end, lerpT);
      this.group.position.copy(pos);
      if (distance > 0.01) this.group.lookAt(end);
      const stretchZ = 1 + distance * stretchT;
      const squeezeXY = 1 - stretchT * 0.15;
      this.mesh.scale.set(squeezeXY, squeezeXY, stretchZ);
    }
  }

  SILBOT.Agent = Agent;
  SILBOT.AgentState = State;
})(window.SILBOT);