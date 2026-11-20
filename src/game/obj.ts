// Minimální OBJ parser pro model stíhačky (v/vt/f, polygony → trojúhelníky)
export interface ObjMesh { positions: number[]; uvs: number[]; indices: number[] }

export function parseObj(text: string): ObjMesh {
  const v: number[][] = [], vt: number[][] = [];
  const out: ObjMesh = { positions: [], uvs: [], indices: [] };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('v ')) v.push(line.split(/\s+/).slice(1).map(Number));
    else if (line.startsWith('vt ')) vt.push(line.split(/\s+/).slice(1).map(Number));
    else if (line.startsWith('f ')) {
      const idx = line.split(/\s+/).slice(1).map((p) => {
        const [a, b] = p.split('/');
        const pv = v[Number(a) - 1], tv = b ? vt[Number(b) - 1] : [0, 0];
        out.positions.push(pv[0], pv[1], pv[2]);
        out.uvs.push(tv[0], tv[1]);
        return out.positions.length / 3 - 1;
      });
      for (let i = 1; i + 1 < idx.length; i++) out.indices.push(idx[0], idx[i], idx[i + 1]);
    }
  }
  return out;
}
