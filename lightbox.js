// ============================================================
// Lightbox — fullscreen photo viewer.
// Triggers: any element with [data-lightbox="<group-slug>"].
// Group: all triggers sharing the same data-lightbox slug get
//        navigated together via prev/next/swipe.
// Per-trigger attributes:
//   data-src         — large image URL (falls back to the inner <img>'s src)
//   data-caption     — caption text (falls back to data-project-title on ancestor, then alt)
//   data-gallery-href — if present, the "View full gallery →" link target
// ============================================================
(function () {
  const triggers = document.querySelectorAll('[data-lightbox]');
  if (!triggers.length) return;

  // Group triggers by their data-lightbox slug.
  const groups = new Map();
  triggers.forEach((el) => {
    const slug = el.getAttribute('data-lightbox');
    if (!groups.has(slug)) groups.set(slug, []);
    groups.get(slug).push(el);
  });

  // Build lightbox DOM once.
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.setAttribute('role', 'dialog');
  lb.setAttribute('aria-modal', 'true');
  lb.setAttribute('aria-label', 'Photo viewer');
  lb.innerHTML = `
    <div class="lb-backdrop" data-lb-close></div>
    <button class="lb-close" type="button" aria-label="Close (Esc)" data-lb-close>&#10005;</button>
    <button class="lb-prev" type="button" aria-label="Previous photo (left arrow)">&#8249;</button>
    <div class="lb-stage">
      <img class="lb-image" alt="" />
    </div>
    <button class="lb-next" type="button" aria-label="Next photo (right arrow)">&#8250;</button>
    <div class="lb-caption">
      <span class="lb-counter"></span>
      <span class="lb-title"></span>
      <a class="lb-fullgallery" href="">View full gallery &rarr;</a>
    </div>
  `;
  document.body.appendChild(lb);

  const imgEl = lb.querySelector('.lb-image');
  const prevBtn = lb.querySelector('.lb-prev');
  const nextBtn = lb.querySelector('.lb-next');
  const counterEl = lb.querySelector('.lb-counter');
  const titleEl = lb.querySelector('.lb-title');
  const galleryLinkEl = lb.querySelector('.lb-fullgallery');

  let currentSet = [];
  let currentIndex = 0;

  function srcFor(el) {
    return (
      el.getAttribute('data-src') ||
      el.querySelector('img')?.getAttribute('src') ||
      el.getAttribute('href') ||
      ''
    );
  }

  function captionFor(el) {
    const explicit = el.getAttribute('data-caption');
    if (explicit) return explicit;
    const parentTitle = el.closest('[data-project-title]')?.getAttribute('data-project-title');
    if (parentTitle) return parentTitle;
    const innerImgAlt = el.querySelector('img')?.getAttribute('alt');
    return innerImgAlt || '';
  }

  function galleryHrefFor(el) {
    return el.getAttribute('data-gallery-href') || '';
  }

  function render() {
    if (!currentSet.length) return;
    const el = currentSet[currentIndex];
    imgEl.classList.add('is-loading');
    imgEl.src = srcFor(el);
    imgEl.alt = captionFor(el);
    imgEl.onload = () => imgEl.classList.remove('is-loading');

    counterEl.textContent = `${currentIndex + 1} / ${currentSet.length}`;
    titleEl.textContent = captionFor(el);

    const galleryHref = galleryHrefFor(el);
    if (galleryHref) {
      galleryLinkEl.href = galleryHref;
      galleryLinkEl.classList.remove('is-hidden');
    } else {
      galleryLinkEl.classList.add('is-hidden');
    }

    prevBtn.disabled = currentSet.length <= 1;
    nextBtn.disabled = currentSet.length <= 1;
  }

  function open(slug, startEl) {
    currentSet = groups.get(slug) || [];
    if (!currentSet.length) return;
    currentIndex = Math.max(0, currentSet.indexOf(startEl));
    render();
    document.body.classList.add('lb-locked');
    lb.classList.add('is-open');
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.classList.remove('lb-locked');
    imgEl.src = '';
  }

  function step(delta) {
    if (!currentSet.length) return;
    currentIndex = (currentIndex + delta + currentSet.length) % currentSet.length;
    render();
  }

  // Wire trigger clicks.
  triggers.forEach((el) => {
    el.addEventListener('click', (e) => {
      e.preventDefault();
      open(el.getAttribute('data-lightbox'), el);
    });
  });

  // Wire lightbox controls.
  lb.addEventListener('click', (e) => {
    if (e.target.matches('[data-lb-close]')) close();
  });
  prevBtn.addEventListener('click', () => step(-1));
  nextBtn.addEventListener('click', () => step(1));

  // Keyboard.
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('is-open')) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });

  // Touch swipe.
  let touchStartX = null;
  let touchStartY = null;
  const stage = lb.querySelector('.lb-stage');
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  stage.addEventListener('touchend', (e) => {
    if (touchStartX === null) return;
    const dx = (e.changedTouches[0]?.clientX ?? touchStartX) - touchStartX;
    const dy = (e.changedTouches[0]?.clientY ?? touchStartY) - touchStartY;
    touchStartX = null;
    touchStartY = null;
    // Only treat as horizontal swipe if x movement clearly dominates.
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    step(dx < 0 ? 1 : -1);
  }, { passive: true });
})();
