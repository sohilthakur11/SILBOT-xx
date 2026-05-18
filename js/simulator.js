(function (SILBOT) {
  const { BLOCK, SPHERE_RADIUS } = SILBOT.Config;
  const { key } = SILBOT.Lattice;

  const CHAIN_SHIFTS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]];
  const TARGET_SHIFTS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  class Simulator {
    constructor({ scene, cavityMap, activeChannels }) {
      this.scene = scene;
      this.cavityMap = cavityMap;
      this.activeChannels = activeChannels;
      this.agents = [];
      this.occupancyMap = new Map();
      this.stepCounter = 0;
      this.sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 16, 16);
    }

    isIdle() {
      return this.agents.every((a) => a.isIdle());
    }

    walkChain(startX, startY, startZ, dirZ) {
      const chain = [];
      let x = startX;
      let y = startY;
      let z = startZ;
      while (true) {
        const agent = this.occupancyMap.get(key(x, y, z));
        if (!agent) break;
        chain.push(agent);
        z += dirZ;
        if (this.cavityMap.has(key(x, y, z))) continue;
        const shift = CHAIN_SHIFTS.find(([dx, dy]) =>
          this.cavityMap.has(key(x + dx, y + dy, z)),
        );
        if (!shift) break;
        x += shift[0];
        y += shift[1];
      }
      return chain;
    }

    findTargetSlot(x, y, z) {
      if (this.cavityMap.has(key(x, y, z))) return { x, y, z };
      for (const [dx, dy] of TARGET_SHIFTS) {
        if (this.cavityMap.has(key(x + dx, y + dy, z))) {
          return { x: x + dx, y: y + dy, z };
        }
      }
      return null;
    }

    /**
     * Walks the chain of agents along dirZ from the given coordinate and books
     * an expansion for each, returning true if the move is feasible. Target
     * slots are reserved in the occupancy map up-front so concurrent chains
     * cannot converge on the same node.
     */
    tryPushChain(startX, startY, startZ, dirZ) {
      const chain = this.walkChain(startX, startY, startZ, dirZ);
      if (chain.length === 0) return true;

      const last = chain[chain.length - 1];
      let targetX = last.x;
      let targetY = last.y;
      let targetZ = last.z + dirZ;

      if (targetZ >= BLOCK.depth) {
        const exiting = chain.pop();
        this.removeAgent(exiting);
        if (chain.length === 0) return true;
        targetZ = last.z;
      }

      const slot = this.findTargetSlot(targetX, targetY, targetZ);
      if (!slot || this.occupancyMap.has(key(slot.x, slot.y, slot.z))) return false;

      for (let i = chain.length - 1; i >= 0; i--) {
        const agent = chain[i];
        if (i === chain.length - 1) {
          agent.beginExpansion(slot.x, slot.y, slot.z);
        } else {
          const lead = chain[i + 1];
          agent.beginExpansion(lead.x, lead.y, lead.z);
        }
        this.occupancyMap.set(key(agent.targetX, agent.targetY, agent.targetZ), agent);
      }
      return true;
    }

    spawnOrPush(channelIndex) {
      const node = this.activeChannels[channelIndex];
      if (!node) return false;
      const spawnKey = key(node.x, node.y, node.z);
      const wasOccupied = this.occupancyMap.has(spawnKey);

      if (!this.tryPushChain(node.x, node.y, node.z, 1)) return false;
      if (wasOccupied) return true;

      const agent = new SILBOT.Agent({
        x: node.x,
        y: node.y,
        z: node.z,
        channelIndex,
        sphereGeo: this.sphereGeo,
        scene: this.scene,
        occupancyMap: this.occupancyMap,
      });
      this.occupancyMap.set(spawnKey, agent);
      this.agents.push(agent);
      return true;
    }

    removeAgent(agent) {
      this.occupancyMap.delete(key(agent.x, agent.y, agent.z));
      agent.dispose();
      this.agents = this.agents.filter((a) => a !== agent);
    }

    pushChannels(indices) {
      if (!this.isIdle()) return false;
      let pushed = false;
      for (const i of indices) {
        if (this.spawnOrPush(i)) pushed = true;
      }
      if (pushed) this.stepCounter++;
      return pushed;
    }

    update(deltaTime) {
      this.agents.forEach((a) => a.update(deltaTime));
    }
  }

  SILBOT.Simulator = Simulator;
})(window.SILBOT);
