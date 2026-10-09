import assert from 'node:assert/strict';

// Attribute order is immaterial. Numeric drawing tolerance remains 1e-6 pixels.
export function canonicalSvg(svg, eventId) {
  assert.match(svg, /^<svg[\s>]/);
  const normalized = svg.replace(/<([A-Za-z][\w:-]*)([^<>]*)>/g, (_, tag, attributes) => {
    const pairs = [...attributes.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, key, value]) => {
      if (key === 'style') {
        value = value.split(';').map(x => x.trim()).filter(Boolean).sort().join(';');
      } else if (/^(x|y|x1|x2|y1|y2|cx|cy|rx|ry|r|width|height|stroke-width|d|points|transform|viewBox)$/.test(key)) {
        value = value.replace(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g,
          number => String(Math.round(Number(number) * 1e6) / 1e6));
      }
      return `${key}="${value}"`;
    }).sort();
    return `<${tag}${pairs.length ? ' ' + pairs.join(' ') : ''}>`;
  }).replace(/>\s+</g, '><').trim();
  return eventId === 'minx' ? canonicalMegaminxFaces(normalized) : normalized;
}

function cross(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function hull(points) {
  const sorted = points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const half = list => {
    const result = [];
    for (const point of list) {
      while (result.length >= 2 && cross(result.at(-2), result.at(-1), point) <= 1e-4) result.pop();
      result.push(point);
    }
    return result;
  };
  return half(sorted).slice(0, -1).concat(half([...sorted].reverse()).slice(0, -1));
}

// Convex-face interiors must not overlap. Shared black borders are permitted.
// The tolerance is only the existing numeric coordinate rounding tolerance.
function separated(a, b) {
  for (const polygon of [a, b]) {
    for (let i = 0; i < polygon.length; i++) {
      const p = polygon[i], q = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (!length) continue;
      const normal = [(q[1] - p[1]) / length, (p[0] - q[0]) / length];
      const project = points => points.map(v => v[0] * normal[0] + v[1] * normal[1]);
      const pa = project(a), pb = project(b);
      if (Math.max(...pa) <= Math.min(...pb) + 2e-6 || Math.max(...pb) <= Math.min(...pa) + 2e-6) return true;
    }
  }
  return false;
}

function canonicalMegaminxFaces(svg) {
  // Upstream MegaminxPuzzle.drawMinx traverses HashMap<Face, Path>.keySet().
  // Enum identity hashes make complete face order differ across runtimes.
  // Normalize only those disjoint face groups, never general SVG paint order.
  const match = svg.match(/^(<svg[^>]*><g[^>]*>)([\s\S]*)(<\/g><\/svg>)$/);
  assert.ok(match, 'Unexpected Megaminx SVG structure');
  const tokens = match[2].match(/<path\b[^>]*><\/path>|<text\b[^>]*>[\s\S]*?<\/text>/g) ?? [];
  assert.equal(tokens.join(''), match[2], 'Unexpected Megaminx drawing element');
  const groups = [];
  let current;
  for (const token of tokens) {
    if (token.startsWith('<path')) {
      if (!current || current.paths === 11) {
        current = {paths: 0, elements: [], points: []};
        groups.push(current);
      }
      assert.match(token, /stroke="#000000"/, 'Face borders must share the same opaque black stroke');
      assert.match(token, /fill="#[a-fA-F0-9]{6}"/, 'Faces must have opaque sticker fills');
      assert.doesNotMatch(token, /(?:opacity|transform|filter|mask|clip-path|style)=/, 'Unexpected per-sticker painting modifier');
      const d = token.match(/\bd="([^"]+)"/)?.[1];
      assert.ok(d && /^[MLZ\s\d.eE+-]+$/.test(d), 'Only upstream straight-sided Megaminx sticker paths are expected');
      const coordinates = [...d.matchAll(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g)].map(x => Number(x[0]));
      assert.equal(coordinates.length % 2, 0);
      for (let i = 0; i < coordinates.length; i += 2) current.points.push([coordinates[i], coordinates[i + 1]]);
      current.paths++;
    } else {
      assert.equal(current?.paths, 11, 'Face label appeared before all stickers');
    }
    current.elements.push(token);
  }
  assert.equal(groups.length, 12, 'Megaminx must draw all twelve faces');
  for (const group of groups) {
    assert.equal(group.paths, 11, 'Every Megaminx face must draw eleven stickers');
    group.hull = hull(group.points);
    assert.equal(group.hull.length, 5, 'Megaminx face must be a convex pentagon');
    group.content = group.elements.join('');
    group.key = group.elements[0].match(/\bd="([^"]+)"/)[1];
  }
  assert.equal(new Set(groups.map(x => x.key)).size, 12, 'Duplicate Megaminx face position');
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++) {
      assert.ok(separated(groups[i].hull, groups[j].hull), 'Cannot normalize overlapping Megaminx faces');
    }
  }
  return match[1] + groups.sort((a, b) => a.key.localeCompare(b.key)).map(x => x.content).join('') + match[3];
}
