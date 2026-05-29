(function (SILBOT) {
  const { SPHERE_RADIUS, CHANNEL_COLORS, BLOCK } = SILBOT.Config;
  const { key, gridToWorld } = SILBOT.Lattice;

  // The order here is strictly Down -> Horizontal -> Up. 
  // This natively creates gravity without requiring full map scans.
  const MOVES = [
      [0, -1, 0], [0, -1, 1], [0, -1, -1], [1, -1, 0], [-1, -1, 0], 
      [0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], 
      [0, 1, 0], [0, 1, 1], [0, 1, -1], [1, 1, 0], [-1, 1, 0] 
  ];

  class Simulator {
    constructor({ scene, cavityMap }) {
      this.scene = scene;
      this.cavityMap = cavityMap;
      this.agents = [];
      this.occupancyMap = new Map();
      this.wallMap = new Set();
      this.funnels = [];
      this.funnelMeshes = []; 
      this.isAutoFilling = false;
      this.spawnTimer = 0;
      this.solidifyCheckIndex = 0; 
      this.solidifiedCount = 0;
      this.structureMesh = null;
      this.logger = () => {}; 
      this.sphereGeo = new THREE.SphereGeometry(SPHERE_RADIUS, 16, 16);

      this.funnelGeo = new THREE.ConeGeometry(0.8, 1.5, 16);
      this.funnelGeo.rotateX(Math.PI);
      this.funnelMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    }

    setLogger(loggerFunc) {
      this.logger = loggerFunc;
    }

    get isPipelineIdle() {
        return this.agents.every(a => a.isIdle());
    }

    placeFunnelAtNode(node) {
      if (this.funnels.some(f => f.x === node.x && f.z === node.z)) return;
      this.funnels.push(node);
      const funnelMesh = new THREE.Mesh(this.funnelGeo, this.funnelMat);
      const funnelPos = gridToWorld(node.x, node.y, node.z);
      funnelMesh.position.set(funnelPos.x, funnelPos.y + 1.5, funnelPos.z);
      this.scene.add(funnelMesh);
      this.funnelMeshes.push(funnelMesh);

      this.logger(`Funnel placed at Grid(${node.x}, ${node.y}, ${node.z})`);
    }

    removeFunnels() {
      this.funnelMeshes.forEach(mesh => this.scene.remove(mesh));
      this.funnelMeshes = [];
      this.funnels = [];
      this.logger("All funnels removed.");
    }

    toggleAutoFill(state) {
      this.isAutoFilling = state;
    }

    createAgentAt(x, y, z) {
      const agentKey = key(x, y, z);
      const color = CHANNEL_COLORS[Math.floor(Math.random() * CHANNEL_COLORS.length)];
      const agent = new SILBOT.Agent({
        x, y, z, color,
        sphereGeo: this.sphereGeo, scene: this.scene, simulator: this
      });
      this.occupancyMap.set(agentKey, agent);
      this.agents.push(agent);
      return agent;
    }

    hasAnyEmptySpace(startX, startY, startZ) {
      const startKey = key(startX, startY, startZ);
      const queue = [startKey];
      const visited = new Set([startKey]);

      while (queue.length > 0) {
        const currKey = queue.shift();

        if (currKey !== startKey && this.cavityMap.has(currKey) && !this.wallMap.has(currKey) && !this.occupancyMap.has(currKey)) {
            return true; 
        }

        const [cx, cy, cz] = currKey.split(',').map(Number);
        for (const [dx, dy, dz] of MOVES) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          const nKey = key(nx, ny, nz);

          const inBoundsX = nx >= 0 && nx <= BLOCK.width;
          const inBoundsZ = nz >= 0 && nz <= BLOCK.depth;
          const isAir = ny >= BLOCK.height && inBoundsX && inBoundsZ; 
          
          if ((this.cavityMap.has(nKey) || isAir) && !this.wallMap.has(nKey) && !visited.has(nKey)) {
              visited.add(nKey);
              queue.push(nKey);
          }
        }
      }
      return false;
    }

    // LAG FIX: This now strictly breaks immediately upon finding the first empty space.
    findNextStepTowardsEmpty(startX, startY, startZ) {
      const startKey = key(startX, startY, startZ);
      const queue = [startKey];
      const visited = new Set([startKey]);
      const parentMap = new Map(); 
      
      let bestTargetKey = null;

      while (queue.length > 0) {
        const currKey = queue.shift();

        if (currKey !== startKey && this.cavityMap.has(currKey) && !this.wallMap.has(currKey) && !this.occupancyMap.has(currKey)) {
            bestTargetKey = currKey;
            break; // FAST GREEDY EXIT: Stops processing instantly, completely eliminating lag
        }

        const [cx, cy, cz] = currKey.split(',').map(Number);
        for (const [dx, dy, dz] of MOVES) {
          const nx = cx + dx, ny = cy + dy, nz = cz + dz;
          const nKey = key(nx, ny, nz);

          const inBoundsX = nx >= 0 && nx <= BLOCK.width;
          const inBoundsZ = nz >= 0 && nz <= BLOCK.depth;
          const isAir = ny >= BLOCK.height && inBoundsX && inBoundsZ;
          
          if ((this.cavityMap.has(nKey) || isAir) && !this.wallMap.has(nKey) && !visited.has(nKey)) {
              visited.add(nKey);
              parentMap.set(nKey, currKey); 
              queue.push(nKey);
          }
        }
      }

      if (bestTargetKey) {
          let step = bestTargetKey;
          while (parentMap.get(step) !== startKey) {
              step = parentMap.get(step);
          }
          const [sx, sy, sz] = step.split(',').map(Number);
          return {x: sx, y: sy, z: sz};
      }
      return null;
    }

    canMoveFurther(agent) {
      return this.findNextStepTowardsEmpty(agent.x, agent.y, agent.z) !== null;
    }

    injectParticle(funnelNode) {
      // OVERLAP FIX: Force particles to strictly spawn in the free Air layer 
      // directly above the rigid structure. They will walk across the roof into the hole.
      const spawnY = BLOCK.height;
      const feedY = BLOCK.height + 1;
      const feedKey = key(funnelNode.x, feedY, funnelNode.z);
      
      if (this.wallMap.has(feedKey) || this.occupancyMap.has(feedKey)) return;

      const nextStep = this.findNextStepTowardsEmpty(funnelNode.x, feedY, funnelNode.z);
      if (!nextStep) return;

      const agent = this.createAgentAt(funnelNode.x, feedY, funnelNode.z);
      if (!agent) return;

      agent.pushTo(funnelNode.x, spawnY, funnelNode.z);
    }

    makeSolid(agent) {
      agent.solidify();
      const agentKey = key(agent.x, agent.y, agent.z);
      this.cavityMap.delete(agentKey);
      this.wallMap.add(agentKey);
      for (const [nodeKey, occupant] of this.occupancyMap) {
        if (occupant === agent) this.occupancyMap.delete(nodeKey);
      }
      this.agents = this.agents.filter(a => a !== agent);
      this.solidifiedCount++;

      if (this.solidifiedCount % 10 === 0) {
          this.logger(`Milestone: ${this.solidifiedCount} particles packed.`);
      }
    }

    update(deltaTime) {
      if (this.isAutoFilling && this.funnels.length > 0) {
        if (this.isPipelineIdle) {
            this.spawnTimer += deltaTime;
            if (this.spawnTimer >= 0.05) { 
              this.spawnTimer = 0;
              this.funnels.forEach(f => this.injectParticle(f));
            }
        }
      }

      [...this.agents].forEach((a) => {
         a.update(deltaTime);
      });

      if (this.agents.length > 0) {
          for (let i = 0; i < 2; i++) {
              if (this.agents.length === 0) break;
              this.solidifyCheckIndex = (this.solidifyCheckIndex + 1) % this.agents.length;
              const a = this.agents[this.solidifyCheckIndex];
              
              if (a && a.isIdle() && !this.hasAnyEmptySpace(a.x, a.y, a.z)) {
                  this.makeSolid(a);
              }
          }
      }
    }
  }

  SILBOT.Simulator = Simulator;
})(window.SILBOT);