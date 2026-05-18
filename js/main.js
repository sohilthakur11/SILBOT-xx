(function (SILBOT) {
  const { CHANNEL_COUNT } = SILBOT.Config;
  const { buildCavityMap, pickActiveChannels } = SILBOT.Lattice;
  const { createScene } = SILBOT.SceneSetup;
  const { buildStructure } = SILBOT.Structure;

  function init() {
    const container = document.getElementById('canvas-container');
    const { scene, camera, renderer, controls } = createScene(container);

    const { cavityMap, entryNodes } = buildCavityMap();
    const activeChannels = pickActiveChannels(entryNodes, CHANNEL_COUNT);

    const simulator = new SILBOT.Simulator({ scene, cavityMap, activeChannels });
    buildStructure(scene, cavityMap, simulator.sphereGeo);

    const ui = SILBOT.UI.setup(simulator, {
      stepEl: document.getElementById('sim-step'),
      countEl: document.getElementById('agent-count'),
    });

    const clock = new THREE.Clock();
    function frame() {
      requestAnimationFrame(frame);
      simulator.update(clock.getDelta());
      ui.refresh();
      controls.update();
      renderer.render(scene, camera);
    }
    frame();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window.SILBOT);
