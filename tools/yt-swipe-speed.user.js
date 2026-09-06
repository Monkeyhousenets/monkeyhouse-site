// ==UserScript==
// @name         YouTube Swipe Playback Speed
// @namespace    https://www.monkeyhousenets.com/
// @version      1.0.0
// @description  Swipe right on the video to speed up, swipe left to slow down. Shows the new speed on screen. Works on m.youtube.com and www.youtube.com.
// @author       Monkeyhouse
// @match        https://m.youtube.com/*
// @match        https://www.youtube.com/*
// @match        https://youtube.com/*
// @match        https://www.youtube-nocookie.com/*
// @run-at       document-start
// @grant        none
// @downloadURL  https://raw.githubusercontent.com/Monkeyhousenets/monkeyhouse-site/claude/youtube-swipe-playback-speed-uys0mu/tools/yt-swipe-speed.user.js
// @updateURL    https://raw.githubusercontent.com/Monkeyhousenets/monkeyhouse-site/claude/youtube-swipe-playback-speed-uys0mu/tools/yt-swipe-speed.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------- Settings you can tweak ----------
  var STEP = 0.25;            // speed change per swipe
  var MIN_SPEED = 0.25;
  var MAX_SPEED = 4;
  var SWIPE_MIN_PX = 60;      // how far (px) a finger must travel to count as a swipe
  var SWIPE_MAX_MS = 700;     // swipe must finish within this many ms
  var REMEMBER_SPEED = true;  // keep the chosen speed for the next video too
  var TOAST_MS = 900;
  // --------------------------------------------

  var PLAYER_SEL = '#movie_player, .html5-video-player, #player, #player-container-id, #player-container, .player-container, ytm-player, ytd-player';
  var STORE_KEY = 'mh-yt-swipe-speed';

  var currentSpeed = 1;
  try {
    var saved = parseFloat(localStorage.getItem(STORE_KEY));
    if (REMEMBER_SPEED && saved >= MIN_SPEED && saved <= MAX_SPEED) currentSpeed = saved;
  } catch (e) {}

  var applying = false;

  function clamp(v) {
    v = Math.round(v / STEP) * STEP;
    return Math.min(MAX_SPEED, Math.max(MIN_SPEED, v));
  }

  function getVideo(fromEl) {
    var root = (fromEl && fromEl.closest && fromEl.closest(PLAYER_SEL)) || document;
    return root.querySelector('video') || document.querySelector('video');
  }

  function setSpeed(video, speed) {
    currentSpeed = clamp(speed);
    applying = true;
    try { video.playbackRate = currentSpeed; } catch (e) {}
    applying = false;
    if (REMEMBER_SPEED) {
      try { localStorage.setItem(STORE_KEY, String(currentSpeed)); } catch (e) {}
    }
    showToast(video, currentSpeed);
  }

  // ---------- On-screen speed badge ----------
  var toast, toastTimer;
  function showToast(video, speed) {
    var host = document.fullscreenElement
      || (video.closest && video.closest(PLAYER_SEL))
      || document.body;
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mh-speed-toast';
      toast.style.cssText = [
        'position:absolute', 'top:12%', 'left:50%', 'transform:translateX(-50%)',
        'padding:10px 18px', 'border-radius:999px',
        'background:rgba(0,0,0,.75)', 'color:#fff',
        'font:600 20px/1 system-ui,Roboto,Arial,sans-serif',
        'letter-spacing:.5px', 'z-index:2147483647', 'pointer-events:none',
        'transition:opacity .2s', 'opacity:0'
      ].join(';');
    }
    if (toast.parentNode !== host) {
      if (host !== document.body && getComputedStyle(host).position === 'static') {
        host.style.position = 'relative';
      }
      if (host === document.body) toast.style.position = 'fixed';
      host.appendChild(toast);
    }
    var label = (Math.round(speed * 100) / 100) + '\u00d7';
    if (speed === MAX_SPEED) label += ' (max)';
    if (speed === MIN_SPEED) label += ' (min)';
    toast.textContent = label;
    toast.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.style.opacity = '0'; }, TOAST_MS);
  }

  // ---------- Gesture detection ----------
  var start = null;

  function onTouchStart(e) {
    if (e.touches.length !== 1) { start = null; return; }
    var t = e.target;
    if (!t || !t.closest || !t.closest(PLAYER_SEL)) { start = null; return; }
    // Ignore swipes that begin on the progress bar / control strip
    if (t.closest('.ytp-progress-bar-container, .ytp-chrome-bottom, .player-controls-bottom, ytm-progress-bar, .ytp-chrome-top')) { start = null; return; }
    start = { x: e.touches[0].clientX, y: e.touches[0].clientY, time: Date.now(), target: t };
  }

  function onTouchEnd(e) {
    if (!start) return;
    var s = start; start = null;
    var touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    var dx = touch.clientX - s.x;
    var dy = touch.clientY - s.y;
    if (Date.now() - s.time > SWIPE_MAX_MS) return;
    if (Math.abs(dx) < SWIPE_MIN_PX) return;
    if (Math.abs(dx) < Math.abs(dy) * 1.5) return; // mostly vertical: leave it to YouTube

    var video = getVideo(s.target);
    if (!video) return;
    var base = clamp(video.playbackRate || currentSpeed);
    setSpeed(video, base + (dx > 0 ? STEP : -STEP));
    // Stop YouTube from treating the finger lift as a tap on the player.
    e.stopPropagation();
  }

  function onTouchCancel() { start = null; }

  document.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });
  document.addEventListener('touchend', onTouchEnd, { capture: true, passive: true });
  document.addEventListener('touchcancel', onTouchCancel, { capture: true, passive: true });

  // ---------- Keep the speed across videos ----------
  // YouTube resets playbackRate to 1 when a new video loads. Re-apply ours.
  if (REMEMBER_SPEED) {
    document.addEventListener('ratechange', function (e) {
      var v = e.target;
      if (!v || v.tagName !== 'VIDEO' || applying) return;
      // User changed speed via YouTube's own menu: adopt it.
      if (v.playbackRate !== currentSpeed && v.playbackRate !== 1) {
        currentSpeed = clamp(v.playbackRate);
        try { localStorage.setItem(STORE_KEY, String(currentSpeed)); } catch (e2) {}
      }
    }, true);

    document.addEventListener('loadedmetadata', function (e) {
      var v = e.target;
      if (!v || v.tagName !== 'VIDEO') return;
      if (currentSpeed !== 1 && v.playbackRate !== currentSpeed) {
        applying = true;
        try { v.playbackRate = currentSpeed; } catch (e2) {}
        applying = false;
      }
    }, true);
  }
})();
