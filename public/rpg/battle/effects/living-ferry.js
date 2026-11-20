// The backdrop is a 512 x 184 painting. Its CSS stretches to a minimum width
// of 265% of the stage height, then center-crops. Keep the two transparent
// passes on that same pixel grid so the sluice, river and willows stay attached.
const MAP_WIDTH = 512;
const MAP_HEIGHT = 184;
const TAU = Math.PI * 2;
const rounded = Math.round;
const wave = Math.sin;

function pixels(ctx, color, x, y, w, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(rounded(x), rounded(y), Math.max(1, rounded(w)), Math.max(1, rounded(h)));
}

function polygon(ctx, points, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  points.forEach(([x,y], i) => {
    if (i === 0) ctx.moveTo(rounded(x), rounded(y));
    else ctx.lineTo(rounded(x), rounded(y));
  });
  ctx.closePath();
  ctx.fill();
}

function ink(ctx, points, color, weight = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = weight;
  ctx.beginPath();
  points.forEach(([x,y], i) => {
    if (i === 0) ctx.moveTo(rounded(x) + .5, rounded(y) + .5);
    else ctx.lineTo(rounded(x) + .5, rounded(y) + .5);
  });
  ctx.stroke();
}

function halo(ctx, x, y, radius, color) {
  const light = ctx.createRadialGradient(x,y,0,x,y,radius);
  light.addColorStop(0, color);
  light.addColorStop(1, 'rgba(255,208,117,0)');
  ctx.fillStyle = light;
  ctx.fillRect(x-radius,y-radius,radius*2,radius*2);
}

function haze(ctx, t, mode) {
  // The glow stops at the far bank. Soft, broken horizontal mist sits between
  // the rear mountain silhouette and the darker band nearest the water.
  ctx.save();
  ctx.beginPath();
  ctx.rect(100,0,286,91);
  ctx.clip();
  const glow = mode === 'camp' ? 'rgba(193,219,226,.14)' :
    mode === 'surge' ? 'rgba(210,219,211,.10)' : 'rgba(255,221,152,.18)';
  halo(ctx,240,44,76,glow);
  ctx.restore();
  const veils = [[106,86,54],[212,82,79],[294,88,66],[351,79,45]];
  for (let n=0; n<veils.length; n++) {
    const [x,y,length] = veils[n];
    const drift = wave(t*.085+n)*6;
    for (let j=0; j<5; j++) {
      const left = rounded(x-length*.5+drift+j*2+wave(n+j*.6+t*.17)*3);
      const extent = length-Math.abs(2-j)*7;
      const bank = ctx.createLinearGradient(left,0,left+extent,0);
      bank.addColorStop(0,'rgba(202,220,193,0)');
      bank.addColorStop(.40, j===2?'rgba(216,225,195,.30)':'rgba(202,216,187,.17)');
      bank.addColorStop(.63,'rgba(204,217,186,.15)');
      bank.addColorStop(1,'rgba(204,217,186,0)');
      ctx.fillStyle=bank;
      ctx.fillRect(left,y+j,extent,1);
    }
  }
}

function herons(ctx,t) {
  // Silhouettes travel in one flock with slightly staggered wing beats and
  // leave the sky empty for part of the loop. Their V opens into the light.
  const across=(t*.024+.42)%1;
  if(across>.88) return;
  ctx.globalAlpha=Math.min(1,across*9,(.88-across)*11)*.77;
  const leader=97+across*330;
  for(let i=0;i<3;i++){
    const x=leader-i*9, y=38+wave(across*4)*4+i%2*3;
    const flap=wave(t*(2.7-i*.1)+i*1.4)>.2?-2:0;
    ink(ctx,[[x-4,y+flap],[x-2,y],[x,y+1],[x+2,y-1],[x+4,y-2+flap*.4]],'#64786d');
    if(i===0) pixels(ctx,'#d3c99d',x+1,y,2);
  }
  ctx.globalAlpha=1;
}

function lamps(ctx,t) {
  for(const [x,y,size] of [[58,49,.82],[76,76,1],[462,52,.95]]){
    ctx.save();
    ctx.translate(x,y);
    ctx.scale(size,size);
    const glow=.27+.035*wave(t*1.55+x);
    halo(ctx,0,1,12,'rgba(255,197,102,'+glow+')');
    // Curved bamboo cage, paper centre, bronze cap and a short silk tassel.
    polygon(ctx,[[-4,-3],[-2,-4],[2,-4],[4,-2],[4,1],[2,4],[-2,4],[-4,2]],'#9d6545');
    pixels(ctx,'#cd8550',-3,-2,6,4);
    pixels(ctx,'#e7aa62',-2,-3,4,6);
    pixels(ctx,'#ffe19a',-1,-2,2,4);
    pixels(ctx,'#6d6347',-3,-4,6);
    pixels(ctx,'#755c40',-2,3,4);
    ink(ctx,[[0,4],[0,6],[wave(t*.85+x)*1.8,8]],'#ae8054');
    ctx.restore();
  }
}

function river(ctx, t, mode, emphasis) {
  const surge = mode === 'surge', open = mode === 'open';
  const sun = mode === 'camp' ? .55 : surge ? .68 : 1;
  const glints = mode === 'camp' ? ['#c1d9da','#93b8c6','#839eae'] :
    surge ? ['#e5dcb2','#c1c6a4','#96b7aa'] : ['#fff1bc','#e3c992','#a2bba0'];
  // The real sun is at x=240. Narrow strokes from the far bank open toward
  // the viewer; separated dark strokes create the trough between two crests.
  for (let i=0; i<72; i++) {
    const n=(i*19)%39, depth=n/38;
    const y=92+n, seed=i*2.399963;
    const spread=3+depth*36;
    const x=240+wave(seed*1.7)*spread+wave(t*.60+seed)*(.6+depth*2.5);
    const shimmer=.5+.5*wave(seed+t*(surge?1.65:1.03));
    if (shimmer<.23) continue;
    const width=(1.2+depth*5.5)*(.38+shimmer*.7);
    ctx.globalAlpha=sun*emphasis*(.27+shimmer*.59);
    pixels(ctx,i%6===0 ? glints[0] : i%3 ? glints[1] : glints[2],x,y,width);
    if (i%4===0) pixels(ctx,'#577f78',x+2,y+1,width+2);
  }
  ctx.globalAlpha=emphasis;
  // The streams accelerate in the second phase. Flow and little standing
  // waves follow the riverbed, while the yellow reflection stays sunward.
  const count=surge?39:open?20:12;
  for (let i=0;i<count;i++) {
    const y=96+(i*13)%35;
    const cycle=(t*(surge?12:4.5)+i*27.19)%48;
    const bank=63+(i*37)%356;
    const x=bank+cycle;
    const strength=Math.sin(Math.PI*cycle/48);
    ctx.globalAlpha=emphasis*strength*(surge ? .82 : .5);
    const length=(surge?10:5)+i%7;
    pixels(ctx,'#39716e',x,y+1,length+2);
    ink(ctx,[[x-3,y+1],[x,y],[x+length*.67,y],[x+length,y-1]],surge?'#c1d1ae':'#a9c3a5');
    if(surge && i%3===0) pixels(ctx,'#efe2b0',x+length-3,y-1,3);
  }
  ctx.globalAlpha=1;
}

function gate(ctx, t) {
  // Water emerges from the open slots between the painted upright bars and
  // disappears behind the top rail of the jetty.
  for (let i=0;i<6;i++) {
    const x=451+i*5;
    pixels(ctx,'rgba(80,156,149,.70)',x,98+i%3,3,32-i%3);
    const fall=(t*18+i*4.8)%14;
    for(let j=0;j<2;j++) {
      const y=98+j*13+fall;
      if(y<129) pixels(ctx,i%2?'#c6d9bd':'#95bfb1',x+1,y,1,Math.min(6,129-y));
    }
    const spread=.5+.5*wave(t*3.2+i);
    pixels(ctx,'#dfe3c4',x-1,129-spread*2,2+spread*3);
    pixels(ctx,'#89b5ac',x-2,131-spread,5);
  }
}

// Draw the returning reed ferry into a tiny reusable atlas. Only the oar and
// ferryman's hands vary; the canopy seams and its window remain readable.
function boatAtlas(doc) {
  const atlas=doc.createElement('canvas');
  atlas.width=80*6; atlas.height=34;
  const ctx=atlas.getContext('2d');
  if(!ctx) return atlas;
  for(let frame=0;frame<6;frame++){
    ctx.save();ctx.translate(frame*80,0);
    const rhythm=wave(frame*TAU/6);
    // Bow points left, cabin roof follows the bamboo hoops.
    polygon(ctx,[[3,18],[12,21],[27,22],[63,21],[72,18],[76,17],[72,24],[62,27],[25,28],[13,26],[8,23]],'#293f3c');
    polygon(ctx,[[7,20],[17,23],[62,23],[73,20],[67,24],[58,25],[25,26],[14,24]],'#805c42');
    ink(ctx,[[7,20],[16,22],[28,23],[58,23],[71,20]],'#d0a270');
    pixels(ctx,'#302f2a',15,22,5,1);
    pixels(ctx,'#e0be7d',35,24,16,1);
    pixels(ctx,'#495345',24,17,35,5);
    polygon(ctx,[[24,19],[26,10],[30,6],[34,5],[48,5],[54,8],[57,15],[57,20]],'#373e34');
    polygon(ctx,[[25,16],[28,10],[32,7],[46,6],[51,8],[54,11],[55,16]],'#697358');
    ink(ctx,[[26,14],[29,9],[33,7],[46,7],[52,9]],'#baaa75');
    for(const x of [34,41,48]) ink(ctx,[[x-4,16],[x-3,11],[x-1,8],[x+1,7]],'#414c3e');
    ink(ctx,[[25,17],[56,17],[57,19]],'#c6aa74');
    pixels(ctx,'#30433c',27,18,26,3);
    pixels(ctx,'#a28b5c',31,18,2,4);
    pixels(ctx,'#c29f63',46,18,1,3);
    // Lantern beneath the eaves and its red cord.
    pixels(ctx,'#625037',24,15,1,4);
    pixels(ctx,'#c57746',22,17,3,3);
    pixels(ctx,'#f7c270',23,17,1,2);
    const lean=rounded(rhythm);
    polygon(ctx,[[59+lean,12],[62+lean,12],[64,18],[63,21],[57,21],[58,17]],'#365352');
    pixels(ctx,'#b4ad78',59+lean,13,1,4);
    pixels(ctx,'#bc8b62',60+lean,10,3,3);
    polygon(ctx,[[56+lean,10],[60+lean,7],[62+lean,7],[65+lean,10]],'#dec08a');
    pixels(ctx,'#4f4b3b',56+lean,11,9);
    const end=68+rhythm*8, y=29+wave(frame*TAU/6+.8)*2;
    ink(ctx,[[56,10-rhythm],[61,16],[end,y]],'#544b38',1.8);
    ink(ctx,[[56,10-rhythm],[61,16],[end,y]],'#c0a471');
    pixels(ctx,'#e2b184',61,15,2,2);
    pixels(ctx,'#846749',end-1,y-1,2,3);
    ctx.restore();
  }
  return atlas;
}

function ferry(ctx, atlas, t, sinceOpen) {
  // Start in the visible channel and tie up by the far landing. No reset or
  // teleport occurs when a player lingers on the victory screen.
  const x=rounded(290-128*(1-Math.exp(-sinceOpen/28)));
  const y=98+rounded(wave(t*.9)*.55);
  const pose=Math.floor(t*2.6)%6;
  ctx.save();
  for(let j=0;j<6;j++){
    const shift=rounded(wave(t*1.8+j*1.9)*(1+j*.28));
    ctx.globalAlpha=.31-j*.038;
    ctx.drawImage(atlas,pose*80,26-j*3,80,1,x+shift,y+27+j,80,1);
  }
  ctx.restore();
  ctx.drawImage(atlas,pose*80,0,80,34,x,y,80,34);
  for(let i=0;i<4;i++){
    const drift=(t*4+i*3.1)%14;
    ctx.globalAlpha=(1-drift/14)*.76;
    pixels(ctx,'#c7ceaa',x+70+drift,y+24+i%3,3+i%2);
  }
  ctx.globalAlpha=1;
}

function branches(ctx, t, wind, strength) {
  // Accent strands extend the painted canopies. A small number of dark
  // near-plane fronds supplies depth while leaving the two actors unobscured.
  const hanging=[[4,10,30],[13,15,39],[22,13,30],[37,15,31],[52,15,25],[68,13,27],
    [84,14,20],[99,17,21],[445,18,22],[459,19,28],[474,18,25],[482,13,34],[500,14,38],[510,9,30]];
  ctx.globalAlpha=strength;
  for(let i=0;i<hanging.length;i++) {
    const [x,y,length]=hanging[i];
    const bend=4+2.7*wave(t*.72+i*.52)*wind;
    for(let j=1;j<=6;j++){
      const u=j/6, last=(j-1)/6;
      const px=x+bend*u*u+wave(i+u*4)*1.5, py=y+length*u;
      const prevX=x+bend*last*last+wave(i+last*4)*1.5;
      ink(ctx,[[prevX,y+length*last],[px,py]],'#527453');
      const side=(j+i)%2?1:-1;
      polygon(ctx,[[px,py-2],[px+side*2,py],[px+side*2.6,py+3],[px+side*.4,py+2]],
        (j+i)%5===0?'#99a66b':(j+i)%2?'#667f52':'#395e46');
    }
  }
  ctx.globalAlpha=1;
}

function leaves(ctx, t, wind, strength) {
  // Individual leaves release from their canopy, turn edge-on, then fall out
  // over the river. Staggered lifetimes leave air between these larger shapes.
  for(let i=0;i<4;i++){
    const phase=(t*(i%2 ? .036 : .047)+i*.271)%1;
    if(phase>.79) continue;
    const u=phase/.79, left=i%2===0;
    const x=(left?49:461)+(left?1:-1) * (38*u+u*u*67)*wind+wave(u*8+i*1.8)*6;
    const y=18+u*98+wave(u*12+i)*3;
    const flip=Math.cos(u*TAU*2+i), side=(flip<0?-1:1);
    ctx.globalAlpha=strength*Math.min(1,u*9,(1-u)*8);
    if(Math.abs(flip)<.30) ink(ctx,[[x,y],[x+side*3,y+1]],'#b3ab72');
    else {
      polygon(ctx,[[x-3,y-1],[x+side*3,y-2],[x+4,y],[x+side,y+2]],'#788858');
      pixels(ctx,'#dbbc78',x,y,2);
    }
  }
  ctx.globalAlpha=1;
}

function reeds(ctx,t,edge,side,wind) {
  // Near-bank reeds appear from below the boardwalk. Place their roots a
  // little outside the camera crop, as they are near the player's viewpoint.
  const blades=[[1,21,7],[5,14,5],[9,23,8],[13,13,-4],[16,16,6],[21,9,-4],[25,12,4],[29,7,4]];
  for(let i=0;i<blades.length;i++){
    const [offset,height,tilt]=blades[i];
    const x=edge+side*offset;
    const tip=x+side*(tilt+wave(t*.85+i*.6)*wind*1.3);
    polygon(ctx,[[x-2,184],[x+side*2,178],[tip,184-height],[x+side*3,177],[x+3,184]],
      i%2?'#294f46':'#355c48');
    if(i===2||i===5) ink(ctx,[[x,183],[tip,185-height]],'#778052');
  }
}

function firelight(ctx,x,y,t) {
  halo(ctx,x,y,15+wave(t*2.3)*1.2,'rgba(255,175,76,.21)');
  for(let i=0;i<3;i++) {
    const lift=(t*.31+i/3)%1;
    ctx.globalAlpha=.75*Math.sin(lift*Math.PI);
    pixels(ctx,i%2?'#ffd999':'#ed9e63',x+wave(t*1.1+i*2)*1.4+lift*3,y-lift*14,1);
  }
  ctx.globalAlpha=1;
}

export function createLivingFerry(backCanvas, frontCanvas, {reducedMotion=false} = {}) {
  const doc=backCanvas.ownerDocument, win=doc.defaultView;
  const back=backCanvas.getContext('2d'), front=frontCanvas.getContext('2d');
  const atlas=boatAtlas(doc);
  let reduced=Boolean(reducedMotion), combat=false, story='ferry', age=0, storyAge=0;
  let width=0, offset=0, fireX=0, fireY=0, active=true, visible=true, timer=null, lastTick=null;

  function paint() {
    if(!width || !back || !front) return;
    const t=reduced?4:age;
    const wind=story==='surge'?1.8:1;
    for(const ctx of [back,front]){
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,width,MAP_HEIGHT);
      ctx.translate(-offset,0);
      ctx.imageSmoothingEnabled=false;
    }
    const quiet = combat ? .72 : 1;
    haze(back,t,story);
    herons(back,t);
    river(back,t,story,quiet);
    if(story==='open'){gate(back,t);ferry(back,atlas,t,reduced?8:storyAge);}
    lamps(back,t);
    const branchLight = story === 'camp' ? .44 : story === 'surge' ? .65 : .92;
    branches(front,t,wind,branchLight*quiet);
    leaves(front,t,wind,quiet);
    reeds(front,t,offset,1,wind);
    reeds(front,t,offset+width,-1,wind);
    if(story==='camp') firelight(front,fireX,fireY,t);
  }

  let enabled = true;
  function stop() {
    if(timer!==null) win.clearTimeout(timer);
    timer=null; lastTick=null;
  }
  function tick(){
    timer=null;
    if(!enabled || !active || reduced || !visible || doc.hidden || !width) return;
    const now=win.performance.now();
    if(lastTick!==null){
      const delta=Math.min(.3,(now-lastTick)/1000);
      age+=delta; storyAge+=delta;
    }
    lastTick=now;
    paint();
    timer=win.setTimeout(tick,combat?125:84);
  }
  function refresh() {
    stop();
    if(!enabled||!active||!visible||doc.hidden||!width) return;
    paint();
    if(!reduced) {
      lastTick=win.performance.now();
      timer=win.setTimeout(tick, combat ? 125 : 84);
    }
  }
  function resize() {
    // CSS transforms (including camera shake) must not resample the map grid.
    const w=backCanvas.clientWidth, h=backCanvas.clientHeight;
    if(!w||!h) {width=0;stop();return;}
    width=Math.max(1,Math.min(MAP_WIDTH,rounded(MAP_WIDTH*w / Math.max(w,h*2.65))));
    offset=rounded((MAP_WIDTH-width)/2);
    // The 60 x 43 camp illustration uses CSS object-fit: contain with the
    // hearth at source pixel (47, 31). Keep its embers over the fire on phones.
    const campScale=Math.min(w*.24/60,h*.32/43);
    fireX=offset+width*.68+17*campScale*width/w;
    fireY=MAP_HEIGHT*.86-12*campScale*MAP_HEIGHT/h;
    for(const node of [backCanvas,frontCanvas]) {
      if(node.width!==width) node.width=width;
      if(node.height!==MAP_HEIGHT) node.height=MAP_HEIGHT;
    }
    refresh();
  }
  const resizeObserver=new win.ResizeObserver(resize);
  resizeObserver.observe(backCanvas);
  const visibilityObserver=win.IntersectionObserver ? new win.IntersectionObserver(([entry])=>{
    visible=entry.isIntersecting;refresh();
  }) : null;
  visibilityObserver?.observe(backCanvas);
  doc.addEventListener('visibilitychange',refresh);
  resize();
  return {
    setPreferences(next={}) {
      if(next.reducedMotion===undefined||Boolean(next.reducedMotion)===reduced) return;
      reduced=Boolean(next.reducedMotion);refresh();
    },
    setEnabled(next) {
      if(enabled === next) return;
      enabled = next; refresh();
    },
    setCombat(next) {
      if(combat===Boolean(next)) return;
      combat=Boolean(next);refresh();
    },
    setStory(next) {
      if(next===story || !['ferry','surge','open','camp'].includes(next)) return;
      story=next;storyAge=0;refresh();
    },
    destroy() {
      active=false;stop();
      resizeObserver.disconnect();visibilityObserver?.disconnect();
      doc.removeEventListener('visibilitychange',refresh);
      for(const ctx of [back,front]) {
        if(!ctx) continue;
        ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,MAP_HEIGHT);
      }
    },
  };
}
