import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
const out = 'public/matching/vendor';
await mkdir(out, { recursive: true });
const parts = {
  three:
    'AmbientLight,BoxGeometry,BufferGeometry,CanvasTexture,Color,CylinderGeometry,DirectionalLight,Euler,Float32BufferAttribute,Fog,Group,HemisphereLight,InstancedMesh,Line,LineBasicMaterial,LineSegments,Matrix4,Mesh,MeshBasicMaterial,MeshStandardMaterial,PerspectiveCamera,PlaneGeometry,Quaternion,Scene,SphereGeometry,SRGBColorSpace,DoubleSide,TorusGeometry,Vector2,Vector3,WebGLRenderer',
  'cannon-es': 'Body,Box,ContactMaterial,Material,Quaternion,Sphere,Vec3,World',
};
for (const [name, api] of Object.entries(parts)) {
  const stem = name === 'three' ? name : 'cannon';
  await build({
    stdin: { contents: 'export {' + api + '} from "' + name + '";', resolveDir: process.cwd() },
    bundle: true,
    format: 'esm',
    minify: true,
    outdir: out,
    entryNames: stem,
    outExtension: { '.js': '.mjs' },
    legalComments: 'eof',
    target: 'es2020',
  });
  await copyFile('node_modules/' + name + '/LICENSE', out + '/' + stem + '-LICENSE');
}
