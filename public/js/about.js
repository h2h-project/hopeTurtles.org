(() => {
  const aboutVideo = document.querySelector('.about-hero__video');
  if (!aboutVideo) {
    return;
  }

  const holdFinalFrame = () => {
    window.requestAnimationFrame(() => {
      try {
        aboutVideo.pause();
        const duration = Number.isFinite(aboutVideo.duration) ? aboutVideo.duration : null;
        if (duration) {
          aboutVideo.currentTime = duration;
        }
      } catch (error) {
        // Swallow errors from attempting to manipulate the media element in unsupported browsers.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[about] Unable to hold video at final frame.', error);
        }
      }
    });
  };

  aboutVideo.loop = false;
  aboutVideo.removeAttribute('loop');

  aboutVideo.addEventListener('ended', holdFinalFrame);
})();

(() => {
  const canvas = document.getElementById('about-materials-chart');
  const dataEl = document.getElementById('about-materials-data');
  if (!canvas || !dataEl || typeof Chart === 'undefined') {
    return;
  }

  let materials;
  try {
    materials = JSON.parse(dataEl.textContent);
  } catch (error) {
    console.warn('[about] Unable to parse materials breakdown data.', error);
    return;
  }

  const colors = ['#017919', '#8a5a2b', '#8c8c8c', '#f2b705', '#3b6fb0', '#c0392b'];

  new Chart(canvas.getContext('2d'), {
    type: 'pie',
    data: {
      labels: materials.map((item) => item.label),
      datasets: [
        {
          data: materials.map((item) => item.pct),
          backgroundColor: colors.slice(0, materials.length),
          borderColor: '#ffffff',
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'bottom',
        },
        tooltip: {
          callbacks: {
            label(context) {
              const item = materials[context.dataIndex];
              return [`${item.label}: ${item.pct}%`, item.examples];
            },
          },
        },
      },
    },
  });
})();
