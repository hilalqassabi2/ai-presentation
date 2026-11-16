(function () {
  var room = new URLSearchParams(location.search).get('room') || ROOM;
  var box = document.getElementById('box');
  var store = {};
  try { store = JSON.parse(localStorage.getItem('aiVotes') || '{}'); } catch (e) {}
  function save() { try { localStorage.setItem('aiVotes', JSON.stringify(store)); } catch (e) {} }
  var me = store.me;
  if (!me) { me = store.me = Math.random().toString(36).slice(2) + Date.now().toString(36); save(); }

  var current = null, resets = {}, ready = false, sending = false;
  function key(p) { return p + ':' + (resets[p] || 0); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function render() {
    box.innerHTML = '';
    if (!current) { box.appendChild(el('p', 'wait', 'Please wait for the first question…')); return; }
    var poll = POLLS[current];
    var mine = store[key(current)];
    box.appendChild(el('p', 'q', poll.q));
    var list = el('div', 'opts');
    poll.opts.forEach(function (o, i) {
      var b = el('button', 'opt' + (mine === i ? ' chosen' : ''));
      b.type = 'button';
      b.appendChild(el('span', 'dot c' + i));
      b.appendChild(el('span', '', o));
      b.disabled = sending;
      b.onclick = function () { vote(i); };
      list.appendChild(b);
    });
    box.appendChild(list);
    if (mine !== undefined) {
      box.appendChild(el('p', 'thanks', 'Thank you! Your answer is on the screen.'));
      box.appendChild(el('p', 'small', 'You can tap another answer to change it.'));
    }
  }

  function vote(i) {
    var p = current;
    sending = true; render();
    fetch(NTFY + '/' + room, { method: 'POST', body: JSON.stringify({ t: 'vote', p: p, o: i, v: me, at: Date.now() }) })
      .then(function (r) { if (!r.ok) throw new Error(r.status); store[key(p)] = i; save(); })
      .catch(function () { alert('Sorry, your vote was not sent. Please try again.'); })
      .then(function () { sending = false; render(); });
  }

  function handle(msg) {
    var d; try { d = JSON.parse(msg); } catch (e) { return; }
    if (!d || !POLLS[d.p]) return;
    if (d.t === 'open') { current = d.p; if (ready) render(); }
    else if (d.t === 'reset') { resets[d.p] = (resets[d.p] || 0) + 1; if (ready && d.p === current) render(); }
  }

  var es = new EventSource(NTFY + '/' + room + '/sse?since=all');
  es.onopen = function () { setTimeout(function () { ready = true; render(); }, 400); };
  es.onmessage = function (e) {
    var j; try { j = JSON.parse(e.data); } catch (x) { return; }
    if (j.event === 'message') handle(j.message);
  };
  es.onerror = function () { if (!current) { box.innerHTML = ''; box.appendChild(el('p', 'wait', 'Connecting… please check your internet.')); } };
})();
