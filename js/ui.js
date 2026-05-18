(function (SILBOT) {
  const { CHANNEL_COUNT } = SILBOT.Config;

  function setup(simulator, stats) {
    const checkboxes = Array.from({ length: CHANNEL_COUNT }, (_, i) =>
      document.getElementById(`chk-${i}`),
    );
    const btnExecute = document.getElementById('btn-execute');
    const btnAll = document.getElementById('btn-all');

    function pushSelected() {
      const indices = checkboxes.flatMap((cb, i) => (cb.checked ? [i] : []));
      if (!simulator.pushChannels(indices)) return;
      stats.stepEl.innerText = simulator.stepCounter;
      stats.countEl.innerText = simulator.agents.length;
    }

    function pushAll() {
      checkboxes.forEach((cb) => {
        cb.checked = true;
      });
      pushSelected();
    }

    btnExecute.addEventListener('click', pushSelected);
    btnAll.addEventListener('click', pushAll);

    function refresh() {
      const moving = !simulator.isIdle();
      btnExecute.disabled = moving;
      btnAll.disabled = moving;
    }

    return { refresh };
  }

  SILBOT.UI = { setup };
})(window.SILBOT);
