(function () {
  var stage = document.getElementById('stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var cur = 0;

  function fit() {
    var s = Math.min(window.innerWidth / 1280, window.innerHeight / 720);
    stage.style.transform = 'translate(-50%,-50%) scale(' + s + ')';
  }
  window.addEventListener('resize', fit); fit();

  var voteUrl = new URL('vote.html', location.href);
  voteUrl.search = '?room=' + encodeURIComponent(ROOM);
  voteUrl.hash = '';

  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides[cur].classList.remove('active');
    cur = i;
    var s = slides[cur];
    s.classList.add('active');
    document.getElementById('count').textContent = (cur + 1) + ' / ' + slides.length;
    document.querySelector('#progress span').style.width = ((cur + 1) / slides.length * 100) + '%';
    document.querySelector('#notes p').textContent = s.getAttribute('data-notes') || '';
    if (location.hash !== '#' + (cur + 1)) history.replaceState(null, '', '#' + (cur + 1));
    var poll = s.querySelector('.poll');
    if (poll) openPoll(poll.getAttribute('data-poll')); else lastOpen = null;
  }
  function next() { go(cur + 1); }
  function prev() { go(cur - 1); }

  document.getElementById('next').onclick = next;
  document.getElementById('prev').onclick = prev;
  var notes = document.getElementById('notes');
  function toggleNotes() { notes.hidden = !notes.hidden; }
  document.getElementById('notesBtn').onclick = toggleNotes;
  function toggleFs() {
    if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || function () {}).call(document.documentElement); }
    else { document.exitFullscreen(); }
  }
  document.getElementById('fsBtn').onclick = toggleFs;

  document.addEventListener('keydown', function (e) {
    if (e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && e.target === document.body)) { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); prev(); }
    else if (e.key === 'n' || e.key === 'N') toggleNotes();
    else if (e.key === 'f' || e.key === 'F') toggleFs();
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(slides.length - 1);
  });
  var tx = null;
  document.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; tx = null;
    if (Math.abs(dx) > 60) { dx < 0 ? next() : prev(); }
  });

  // interactive bits
  document.querySelectorAll('.tl-item').forEach(function (b) {
    b.onclick = function () { b.setAttribute('aria-expanded', b.getAttribute('aria-expanded') === 'true' ? 'false' : 'true'); };
  });
  document.querySelectorAll('.flip,.tip').forEach(function (b) {
    b.onclick = function () { b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true'); };
  });

  // ---- live polls (ntfy.sh) ----
  var votes = {}; // poll -> {voter: option}
  Object.keys(POLLS).forEach(function (p) { votes[p] = {}; });

  document.querySelectorAll('.poll').forEach(function (el) {
    var qr = qrcode(0, 'M'); qr.addData(voteUrl.href); qr.make();
    el.querySelector('.qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 0, alt: 'QR code: open the voting page' });
    el.querySelector('.vurl').textContent = voteUrl.href.replace(/^https?:\/\//, '');
    var p = el.getAttribute('data-poll');
    var rv = el.querySelector('.reveal');
    if (rv) rv.onclick = function () {
      el.classList.toggle('revealed');
      el.querySelector('.bar[data-o="' + POLLS[p].correct + '"]').classList.add('correct');
      rv.textContent = el.classList.contains('revealed') ? 'Hide answer' : 'Reveal answer';
    };
    el.querySelector('.reset').onclick = function () {
      if (confirm('Clear all votes for this question?')) publish({ t: 'reset', p: p });
    };
  });

  function publish(obj) {
    obj.at = Date.now();
    return fetch(NTFY + '/' + ROOM, { method: 'POST', body: JSON.stringify(obj) }).catch(function () {});
  }
  var lastOpen = null;
  function openPoll(p) {
    if (lastOpen === p) return;
    lastOpen = p;
    publish({ t: 'open', p: p });
  }

  function render(p) {
    var el = document.querySelector('.poll[data-poll="' + p + '"]');
    if (!el) return;
    var counts = POLLS[p].opts.map(function () { return 0; });
    var v = votes[p], n = 0;
    Object.keys(v).forEach(function (k) { if (counts[v[k]] !== undefined) { counts[v[k]]++; n++; } });
    var max = Math.max.apply(null, counts.concat([1]));
    counts.forEach(function (c, i) {
      var bar = el.querySelector('.bar[data-o="' + i + '"]');
      bar.querySelector('.fill').style.width = (c / max * 100) + '%';
      bar.querySelector('.bc').textContent = c;
    });
    el.querySelector('.total b').textContent = n;
  }

  function handle(msg) {
    var d; try { d = JSON.parse(msg); } catch (e) { return; }
    if (!d || !votes[d.p]) return;
    if (d.t === 'vote' && typeof d.v === 'string' && d.o >= 0 && d.o < POLLS[d.p].opts.length) { votes[d.p][d.v] = d.o; render(d.p); }
    else if (d.t === 'reset') { votes[d.p] = {}; render(d.p); }
  }
  function setLive(on) {
    document.querySelectorAll('.live').forEach(function (l) {
      l.classList.toggle('on', on);
      l.querySelector('.ls').textContent = on ? 'Live' : 'Reconnecting…';
    });
  }
  function connect() {
    Object.keys(votes).forEach(function (p) { votes[p] = {}; });
    var es = new EventSource(NTFY + '/' + ROOM + '/sse?since=all');
    es.onopen = function () { setLive(true); };
    es.onmessage = function (e) {
      var j; try { j = JSON.parse(e.data); } catch (x) { return; }
      if (j.event === 'message') handle(j.message);
    };
    es.onerror = function () {
      setLive(false);
      if (es.readyState === 2) { setTimeout(connect, 3000); }
    };
  }
  connect();

  window.addEventListener('hashchange', function () { var h = parseInt(location.hash.slice(1), 10); if (!isNaN(h) && h - 1 !== cur) go(h - 1); });
  var start = parseInt((location.hash || '').slice(1), 10);
  slides[0].classList.remove('active');
  go(isNaN(start) ? 0 : start - 1);
})();
