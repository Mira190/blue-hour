// handset.js: a part of the game cut out of game.js (tools/cut.js; docs/SEAMS.md, "The cut of game.js").
// `g` is the rest of the game, by name. What this part asks of it:
//   $, H, base, bringCar, cancelRide, clockT, destinations, eta, fmtSec, life, myCar, on, orderRide, player, ride,
//   rideCar, touch
// and what it gives back:
//   phone, phoneRender, phoneShow, rideMapFrame, rideOn
'use strict';
window.OEGameHandset = function (g) {
  // ------------------------------------------------------------ the phone (N): order a ride, bring your car
  const phone = { el: g.$('#g-phone'), body: g.$('#gph-body'), map: g.$('#gph-map'), view: 'home', acts: [], at: 0, fresh: true };
  const rideOn = () => g.ride && g.ride.phase !== 'leaving';
  function phoneShow(view) {
    if (view === false) { phone.el.hidden = true; return; }
    phone.view = view || (rideOn() ? 'ride' : 'home');
    phone.el.hidden = false;
    phone.fresh = true;
    phoneRender();
  }
  // the ride on the phone's map: the route still to drive (to the pick-up, or on the way to where
  // you're going), the car, the pick-up, you, and where you're going
  function rideMapFrame() {
    const o = g.ride, st = o.drv.st, P = o.drv.path, i = P.pos(st.s, {}).i;
    const inside = g.player.mode === 'ride' && g.player.vehicle === o, toGo = o.phase === 'coming' || o.phase === 'driving';
    const route = toGo ? [[st.x, st.y]].concat(P.pts.slice(i + 1)) : null;
    const dest = o.dest ? { x: o.dest.at[0], y: o.dest.at[1] } : null;
    if (!phone.draw) phone.draw = g.H.rideMap(phone.map, g.base); // (the base map is drawn further down)
    phone.draw({ route, car: { x: st.x, y: st.y, h: st.h }, pickup: inside || o.phase === 'arrived' ? null : o.pickup,
      you: inside ? null : { x: g.player.x, y: g.player.y, h: g.player.h }, dest: inside || o.phase === 'arrived' ? dest : null, reset: phone.fresh });
    phone.fresh = false;
  }
  function phoneRender() {
    const acts = [], item = (text, note, act) => { acts.push(act); return `<button data-k="${acts.length - 1}"><kbd>${acts.length}</kbd><span><b>${text}</b>${note ? `<span class="note">${note}</span>` : ''}</span></button>`; };
    let html = '';
    phone.map.hidden = !(phone.view === 'ride' && rideOn());
    if (phone.view === 'home') {
      g.$('#gph-title').textContent = 'Phone';
      html = (phone.note && g.clockT - phone.noteT < 8 ? `<p class="note">${phone.note}</p>` : '') // (why the ride just ordered isn't coming)
        + `<div class="list">${item('Order a ride', rideOn() ? `${g.ride.name} is ${g.ride.phase === 'coming' ? 'on the way' : g.ride.phase === 'waiting' ? 'waiting for you' : 'taking you'}` : 'A car to wherever you say, here in half a minute', () => phoneShow(rideOn() ? 'ride' : 'where'))}`
        + `${g.myCar ? item('Bring my car', `It's ${Math.round(Math.hypot(g.myCar.D.st.x - g.player.x, g.myCar.D.st.y - g.player.y))} m away`, () => { g.bringCar(); phoneShow(false); }) : ''}${g.life && g.life.phone ? g.life.phone.home(item, phoneShow) : ''}</div>`
        + `<p class="note">Or raise your hand at the kerb (${g.touch ? '<b>Hail a taxi</b>' : '<kbd>Y</kbd>'}) and a taxi will pull in.</p>`;
    } else if (phone.view === 'where') {
      g.$('#gph-title').textContent = 'Ride · where to?';
      const list = g.destinations(g.player.x, g.player.y);
      html = `<div class="list">${list.map(d => item(d.name, d.note, () => phoneShow(g.orderRide(d) ? 'ride' : 'home'))).join('')}</div>`
        + `<div class="row"><button class="btn" data-back>Back</button></div>`;
    } else if (g.life && g.life.phone && g.life.phone.view(phone.view)) { // the hub's own pages (phone.js)
      g.$('#gph-title').textContent = g.life.phone.title(phone.view);
      html = g.life.phone.render(phone.view);
    } else {
      const o = rideOn() ? g.ride : null;
      g.$('#gph-title').textContent = o ? (o.kind === 'taxi' ? 'Taxi' : 'Your ride') : 'Ride';
      if (o) {
        const st = o.drv.st, t = g.eta(o), walk = Math.hypot(o.pickup.x - g.player.x, o.pickup.y - g.player.y), near = Math.hypot(st.x - g.player.x, st.y - g.player.y);
        const inside = g.player.mode === 'ride' && g.player.vehicle === o;
        let big, line, k;
        if (o.phase === 'coming') { big = t < 4 ? 'Now' : g.fmtSec(Math.ceil(t)); line = t < 4 ? `${o.name} is arriving` : `${o.name} is on the way`; k = 1 - t / Math.max(1, o.T0); }
        else if (o.phase === 'waiting' || o.phase === 'boarding') { big = near < 12 ? 'Here' : 'Arrived'; line = near < 12 ? `${o.name} is beside you` : `${o.name} is waiting at the pick-up, ${Math.round(near)} m away`; k = 1; }
        else if (o.phase === 'asking') { big = '–'; line = 'Tell the driver where to'; k = 0; }
        else if (o.phase === 'driving') { big = g.fmtSec(Math.ceil(t)); line = `to ${o.dest.name} · ${(o.drv.remaining() / 1000).toFixed(1)} km`; k = st.s / Math.max(1, o.drv.path.len); }
        else { big = 'Arrived'; line = o.dest ? o.dest.name : ''; k = 1; }
        const stop = o.phase === 'coming' || o.phase === 'waiting' || o.phase === 'boarding'
          ? `<span class="pk"></span><span>Pick-up${walk > 20 && !inside ? ` · ${Math.round(walk)} m walk` : ''}</span>` : '';
        const to = o.dest ? `<span class="ds"></span><span>${o.dest.name}</span>` : o.kind === 'taxi' && !inside ? '<span class="ds"></span><span>Tell the driver when you get in</span>' : '';
        html = `<div class="gph-eta"><b class="num">${big}</b><span>${line}</span></div>`
          + `<div class="gph-bar" style="--k:${Math.max(0.02, Math.min(1, k)).toFixed(3)}"><i></i></div>`
          + `<div class="gph-driver"><span class="av" style="--c:${o.hex}">${o.name[0]}</span><span class="who"><b>${o.name} <span class="rt">★ ${o.rating}</span></b><span class="note">${g.rideCar(o)[0].toUpperCase()}${g.rideCar(o).slice(1)}</span></span><span class="gph-plate mono">${o.plate}</span></div>`
          + (stop || to ? `<div class="gph-trip">${stop}${to}</div>` : '')
          + `<div class="list">${g.player.mode === 'foot' && o.phase !== 'boarding' ? item('Cancel the ride', '', () => { g.cancelRide(); phoneShow('home'); }) : ''}</div>`;
      } else html = '<p class="note">No ride booked.</p>';
      html += `<div class="row"><button class="btn" data-back>Back</button></div>`;
    }
    phone.acts = acts;
    phone.body.innerHTML = html;
  }
  g.on(g.$('#gph-body'), 'click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-back')) phoneShow('home');
    else if (phone.acts[+b.dataset.k]) phone.acts[+b.dataset.k]();
  });
  g.on(g.$('#gph-close'), 'click', () => phoneShow(false));
  g.on(g.$('#g-phone-btn'), 'click', () => phoneShow(phone.el.hidden ? undefined : false));
  return { phone, phoneRender, phoneShow, rideMapFrame, rideOn };
};
