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
  const closeBtn = lb.querySelector('.lb-close');

  let currentSet = [];
  let currentIndex = 0;
  // The trigger that opened the lightbox — focus returns here on close so
  // keyboard/screen-reader users don't get dumped at the top of the page.
  let openerEl = null;

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

    // Warm the browser cache for the neighbours so arrow/swipe nav doesn't
    // stall on a fresh ~1MB fetch. Skip when there's nothing to move to.
    if (currentSet.length > 1) {
      const nextEl = currentSet[(currentIndex + 1) % currentSet.length];
      const prevEl = currentSet[(currentIndex - 1 + currentSet.length) % currentSet.length];
      new Image().src = srcFor(nextEl);
      new Image().src = srcFor(prevEl);
    }
  }

  function open(slug, startEl) {
    currentSet = groups.get(slug) || [];
    if (!currentSet.length) return;
    openerEl = startEl;
    currentIndex = Math.max(0, currentSet.indexOf(startEl));
    render();
    document.body.classList.add('lb-locked');
    lb.classList.add('is-open');
    // Move focus into the dialog so the focus trap has somewhere to start
    // and Esc/Tab reach the keydown handler.
    closeBtn.focus();
  }

  function close() {
    lb.classList.remove('is-open');
    document.body.classList.remove('lb-locked');
    imgEl.src = '';
    // Return focus to the photo the user came from, if it's still around.
    if (openerEl && document.contains(openerEl)) openerEl.focus();
    openerEl = null;
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
    else if (e.key === 'Tab') {
      // Trap Tab inside the dialog so aria-modal="true" is honest — collect
      // the currently-visible controls and wrap focus at the ends. The
      // gallery link drops out of the cycle when it's hidden.
      const focusables = [closeBtn, prevBtn, nextBtn].filter((b) => !b.disabled);
      if (!galleryLinkEl.classList.contains('is-hidden')) focusables.push(galleryLinkEl);
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
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
