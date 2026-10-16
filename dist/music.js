/* Background soundtrack with browser-permitted autoplay and a remembered pause choice. */
(() => {
 'use strict';
 const player = document.getElementById('music-player');
 const audio = document.getElementById('music-audio');
 const toggle = document.getElementById('music-toggle');
 const canvas = document.getElementById('music-wave');
 const message = document.getElementById('music-message');
 const select = document.getElementById('music-track');
 const volume = document.getElementById('music-volume');
 const output = document.getElementById('music-volume-value');
 const playIcon = toggle.querySelector('.music-play');
 const pauseIcon = toggle.querySelector('.music-pause');
 const tracks = [
  'music/chill-twilight-waves.mp3',
  'music/lazy-lagoon-dreams.mp3',
  'music/ornave-lofi-vinyl-teapot-553356.mp3',
  'music/lofi-chill.mp3'
 ];
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 const pen = canvas.getContext('2d');
 let context, analyser, bins, gain, source, frame = 0, playing = false, wanted = false;
 let attempt = 0, chosen = Math.floor(Math.random() * tracks.length), remaining = [], autoplay = true;
 select.value = String(chosen);
 try {
  const saved = localStorage.getItem('bali-petrol:music-volume');
  if (saved !== null && Number.isFinite(Number(saved))) volume.value = String(Math.max(0, Math.min(100, Number(saved))));
  autoplay = localStorage.getItem('bali-petrol:music-enabled') !== '0';
 } catch { /* Playback still works when browser storage is unavailable. */ }

 function setVolume() {
  const level = Number(volume.value) / 100;
  if (gain) { gain.gain.value = level; audio.volume = 1; }
  else audio.volume = level;
  output.value = `${volume.value}%`;
  volume.setAttribute('aria-valuetext', output.value);
 }
 setVolume();

 function draw() {
  frame = 0;
  if (!pen) return;
  pen.clearRect(0, 0, canvas.width, canvas.height);
  const animate = playing && !document.hidden && !reducedMotion.matches && analyser;
  if (animate) analyser.getByteFrequencyData(bins);
  pen.fillStyle = playing ? '#fafcf9' : '#a7b9b7';
  for (let i = 0; i < 48; i++) {
   const bin = Math.floor(Math.pow(i / 48, 1.3) * (bins?.length || 0) * .7);
   const height = animate ? Math.max(3, Math.min(56, bins[bin] / 255 * 70)) : 3;
   pen.fillRect(i * 4.7, (64 - height) / 2, 2, height);
  }
  if (animate) frame = requestAnimationFrame(draw);
 }
 function redraw() { cancelAnimationFrame(frame); draw(); }
 function showState(state) {
  playing = state === 'playing';
  player.dataset.state = state;
  playIcon.toggleAttribute('hidden', wanted);
  pauseIcon.toggleAttribute('hidden', !wanted);
  toggle.setAttribute('aria-pressed', String(wanted));
  const name = select.selectedOptions[0].textContent;
  const label = wanted ? (playing ? 'Pause relaxing music' : 'Cancel loading music') : 'Play relaxing music';
  toggle.setAttribute('aria-label', label);
  toggle.title = `${label} · ${name}`;
  redraw();
 }
 function fail() {
  wanted = false;
  attempt++;
  audio.pause();
  message.textContent = 'Music couldn’t load. Tap Play to retry.';
  message.hidden = false;
  showState('error');
 }
 function prepareAudio(automatic) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (AudioContext && !context) {
   try {
    context = new AudioContext();
    // A suspended Web Audio graph can silence otherwise permitted media playback.
    // Autoplay uses native audio in that case; a later Play gesture enables the graph.
    if (automatic && context.state !== 'running') {
     void context.close().catch(() => {});
     context = null;
     return;
    }
    source = context.createMediaElementSource(audio);
    gain = context.createGain();
    source.connect(gain);
    gain.connect(context.destination);
    // The visualizer is optional; keep audio connected even if it is unavailable.
    try {
     analyser = context.createAnalyser();
     analyser.fftSize = 256;
     analyser.smoothingTimeConstant = .75;
     source.connect(analyser);
     bins = new Uint8Array(analyser.frequencyBinCount);
    } catch { analyser = null; }
    setVolume();
   } catch { /* Native audio remains the fallback on older browsers. */ }
  }
  return context?.resume();
 }
 function setTrack() {
  audio.src = tracks[chosen];
  audio.load();
 }
 async function play(automatic = false) {
  wanted = true;
  const request = ++attempt;
  message.hidden = true;
  showState('loading');
  try {
   const ready = prepareAudio(automatic);
   if (!audio.getAttribute('src') || audio.error) setTrack();
   // Manual Play stays within its user gesture; automatic playback follows browser policy.
   await Promise.all([ready, audio.play()]);
  } catch (error) {
   if (request !== attempt || !wanted) return;
   if (error?.name === 'NotAllowedError') {
    pause();
    message.textContent = 'Tap Play to start the music.';
    message.hidden = false;
    showState('blocked');
   } else fail();
  }
 }
 function pause() {
  wanted = false;
  attempt++;
  audio.pause();
  showState('paused');
 }
 toggle.addEventListener('click', () => {
  const enabled = !wanted;
  try { localStorage.setItem('bali-petrol:music-enabled', enabled ? '1' : '0'); } catch {}
  if (enabled) void play(); else pause();
 });
 audio.addEventListener('playing', () => {
  if (!wanted) { audio.pause(); return; }
  message.hidden = true;
  showState('playing');
 });
 audio.addEventListener('waiting', () => { if (wanted) showState('loading'); });
 audio.addEventListener('pause', () => { if (audio.paused && !audio.ended) { wanted = false; showState('paused'); } });
 audio.addEventListener('error', () => { if (wanted) fail(); });
 audio.addEventListener('ended', () => {
  if (!wanted) return;
  if (!remaining.length) remaining = tracks.map((_, i) => i).filter(i => i !== chosen);
  chosen = remaining.splice(Math.floor(Math.random() * remaining.length), 1)[0];
  select.value = String(chosen);
  setTrack();
  void play(true);
 });
 select.addEventListener('change', () => {
  const resume = wanted;
  pause();
  chosen = Number(select.value);
  remaining = [];
  // Paused selection must not start downloading another song.
  audio.removeAttribute('src');
  audio.load();
  message.hidden = true;
  showState('paused');
  if (resume) void play();
 });
 volume.addEventListener('input', () => {
  setVolume();
  try { localStorage.setItem('bali-petrol:music-volume', volume.value); } catch {}
 });
 document.addEventListener('visibilitychange', redraw);
 reducedMotion.addEventListener?.('change', redraw);
 window.addEventListener('pagehide', pause);
 player.hidden = false;
 showState('paused');
 if (autoplay) void play(true);
})();
