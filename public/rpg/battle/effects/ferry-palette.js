// Re-light the original map at tile resolution. Glass, sun, wood and foliage
// have separate ramps, so lanterns retain their warmth during the storm.
const atlasUrl = new URL('../art/willow-ferry.png', import.meta.url).href;
const palettes = {
  ferry: { air:['#152f36','#455e62','#9eab99','#efc995','#fff1bd'],
    lake:['#13363e','#2e6368','#69a39a','#c9cba2','#ffe5ab'], wood:['#211e28','#58443c','#a97653','#dcb580','#ffdeb0'] },
  surge: { air:['#192639','#38465e','#77849a','#abb1bd','#e6d8c3'],
    lake:['#10293b','#244f65','#48818a','#a2bbb3','#e5d7b5'], wood:['#231f2b','#4c3d40','#886951','#c7a27a','#edc997'] },
  camp: { air:['#112331','#273750','#4a5b79','#7787a1','#d5d9d9'],
    lake:['#102333','#1b3950','#35596b','#738995','#bec5ba'], wood:['#1b202c','#3b3739','#6b5547','#96785d','#cdb38b'] },
  open: { air:['#213a3e','#4e7477','#a2b5a7','#f4cc8f','#fff0b7'],
    lake:['#16393f','#397873','#84b8a0','#ddd9a1','#ffebac'], wood:['#2c2730','#73503b','#b98755','#e2ba80','#ffdeb0'] },
};
const stops = [20, 75, 131, 183, 236];
const clamp = v => Math.min(1,Math.max(0,v));
const mix = (a,b,t) => a+(b-a)*t;
const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16));

function ramp(colors) {
  const points = colors.map(rgb);
  return Array.from({length:256}, (_,level) => {
    let step = 0;
    while(step < stops.length-2 && level>stops[step+1]) step++;
    const t=clamp((level-stops[step])/(stops[step+1]-stops[step]));
    return points[step].map((channel,i)=>mix(channel,points[step+1][i],t));
  });
}

let source;
const plates = new Map();
function sourceImage() {
  if (!source) {
    const im = new Image();
    im.src = atlasUrl;
    source = im.decode().then(() => {
      const surface = document.createElement('canvas');
      surface.width = im.naturalWidth; surface.height = im.naturalHeight;
      const ctx = surface.getContext('2d', {willReadFrequently:true});
      ctx.drawImage(im,0,0);
      return ctx.getImageData(0,0,surface.width,surface.height);
    }).catch(error => { source=undefined; throw error; });
  }
  return source;
}

function grade(image, story) {
  if (plates.has(story)) return plates.get(story);
  const palette = palettes[story];
  const sky = ramp(palette.air), water = ramp(palette.lake), timber = ramp(palette.wood);
  const {width,height,data} = image;
  const plate = new ImageData(width,height);
  const out = plate.data;
  for (let i=0;i<data.length;i+=4) {
    const p=i/4, x=p%width, y=Math.floor(p/width);
    const r=data[i], g=data[i+1], b=data[i+2];
    const level=Math.round(.24*r+.56*g+.2*b);
    const bridge=y>132 && y<168;
    const warm=r>g+9 && g>b+6;
    const lamp=y<60 && (x<85 || x>444) && r>g+29;
    const sun=y<74 && x>203 && x<274 && r>g+10 && r>195;
    const base=warm && !sun ? timber[level] : y>=95 && !bridge ? water[level] : sky[level];
    const preserve=lamp ? .91 : story==='ferry' ? .40 : story==='open' ? .31 : story==='surge' ? .17 : .09;
    let red=mix(base[0],r,preserve), green=mix(base[1],g,preserve), blue=mix(base[2],b,preserve);
    if (sun && story==='camp') {
      red=mix(red,218,.48); green=mix(green,225,.48); blue=mix(blue,220,.48);
    }
    // Warm light around the low sun tapers into cool material shadows.
    if ((story==='ferry'||story==='open') && y<124) {
      const halo=clamp(1-Math.abs(x-237)/175)*clamp(1-Math.abs(y-53)/92)*clamp((level-80)/94);
      red+=halo*20; green+=halo*4; blue-=halo*7;
    }
    out[i]=red; out[i+1]=green; out[i+2]=blue; out[i+3]=255;
  }
  plates.set(story,plate);
  return plate;
}

export function createFerryPalette(backdrop, onPlate) {
  const layers = Array.from({length:2}, () => {
    const surface = document.createElement('canvas');
    surface.className='rpg-ferry-plate';
    surface.setAttribute('aria-hidden','true');
    backdrop.append(surface);
    return surface;
  });
  let selected='', visible=0, alive=true;
  return {
    setStory(story) {
      if (selected===story || !palettes[story]) return;
      selected=story;
      sourceImage().then(image=>{
        if (!alive || selected!==story) return;
        const target=layers[1-visible], next=grade(image,story);
        target.width=image.width; target.height=image.height;
        target.getContext('2d').putImageData(next,0,0);
        layers[visible].classList.remove('rpg-ferry-plate-visible');
        target.classList.add('rpg-ferry-plate-visible');
        onPlate?.(target);
        visible=1-visible;
      }).catch(()=> { /* The original background also supports the whole battle. */ });
    },
    destroy() { alive=false; layers.forEach(layer=>layer.remove()); },
  };
}
